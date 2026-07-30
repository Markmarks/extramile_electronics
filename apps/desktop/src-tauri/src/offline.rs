// Offline cache + outbox (docs/07-DESKTOP-ADMIN.md §7).
// SQLite via bundled rusqlite. Reads are served from the cache; a safe subset of
// writes is queued in the outbox and replayed on reconnect (server dedupes on
// outbox_receipts.idempotency_key). cache_query is SELECT-only.
use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct Db(pub Mutex<Connection>);

const SCHEMA: &str = "
create table if not exists cache_kv (
  table_name text not null,
  id text not null,
  data text not null,
  primary key (table_name, id)
);
create table if not exists outbox (
  id integer primary key autoincrement,
  kind text not null,
  payload text not null,
  idempotency_key text not null unique,
  order_id text,
  attempts integer not null default 0,
  error text,
  status text not null default 'pending',
  created_at text not null default (datetime('now'))
);
";

// Writes permitted while offline (docs/07 §7). Enforced here AND in the UI.
const ALLOWED_KINDS: [&str; 4] = ["order_transition", "serial_capture", "stock_adjust", "walk_in_sale"];

pub fn init(app: &AppHandle) -> Result<Db, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("offline.sqlite3")).map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    Ok(Db(Mutex::new(conn)))
}

fn sqlite_to_json(v: rusqlite::types::Value) -> Value {
    use rusqlite::types::Value as V;
    match v {
        V::Null => Value::Null,
        V::Integer(i) => Value::from(i),
        V::Real(f) => Value::from(f),
        V::Text(s) => Value::from(s),
        V::Blob(_) => Value::Null,
    }
}

#[derive(Serialize)]
pub struct OutboxItem {
    id: i64,
    kind: String,
    payload: Value,
    idempotency_key: String,
    order_id: Option<String>,
    attempts: i64,
}

/// Upsert cached rows (each row must have a string `id`).
#[tauri::command]
pub fn cache_put(db: State<Db>, table: String, rows: Vec<Value>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut n = 0usize;
    for row in rows {
        let id = row
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or("row is missing a string id")?
            .to_string();
        let data = serde_json::to_string(&row).map_err(|e| e.to_string())?;
        conn.execute(
            "insert into cache_kv(table_name, id, data) values (?1, ?2, ?3)
             on conflict(table_name, id) do update set data = excluded.data",
            rusqlite::params![table, id, data],
        )
        .map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

/// Read-only, parameterless query over the cache. Rejects anything but a single SELECT.
#[tauri::command]
pub fn cache_query(db: State<Db>, sql: String) -> Result<Vec<Value>, String> {
    let head = sql.trim_start().to_lowercase();
    if !(head.starts_with("select") || head.starts_with("with")) {
        return Err("cache_query: only SELECT statements are allowed".into());
    }
    if sql.trim_end().trim_end_matches(';').contains(';') {
        return Err("cache_query: a single statement only".into());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt
        .query_map([], |row| {
            let mut obj = serde_json::Map::new();
            for (i, name) in cols.iter().enumerate() {
                let v: rusqlite::types::Value = row.get(i)?;
                obj.insert(name.clone(), sqlite_to_json(v));
            }
            Ok(Value::Object(obj))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn outbox_enqueue(
    db: State<Db>,
    kind: String,
    payload: Value,
    idempotency_key: String,
    order_id: Option<String>,
) -> Result<i64, String> {
    if !ALLOWED_KINDS.contains(&kind.as_str()) {
        return Err(format!("outbox: '{kind}' is not allowed offline"));
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let payload_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    conn.execute(
        "insert into outbox(kind, payload, idempotency_key, order_id) values (?1, ?2, ?3, ?4)
         on conflict(idempotency_key) do nothing",
        rusqlite::params![kind, payload_str, idempotency_key, order_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Pending items, ordered per order id then insertion (ordered replay, docs/07 §7).
#[tauri::command]
pub fn outbox_pending(db: State<Db>) -> Result<Vec<OutboxItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "select id, kind, payload, idempotency_key, order_id, attempts
             from outbox where status = 'pending' order by order_id, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let payload_str: String = row.get(2)?;
            Ok(OutboxItem {
                id: row.get(0)?,
                kind: row.get(1)?,
                payload: serde_json::from_str(&payload_str).unwrap_or(Value::Null),
                idempotency_key: row.get(3)?,
                order_id: row.get(4)?,
                attempts: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Mark an outbox item done, or record a failed attempt (for exponential backoff in the UI).
#[tauri::command]
pub fn outbox_mark(db: State<Db>, id: i64, ok: bool, error: Option<String>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    if ok {
        conn.execute("update outbox set status = 'done' where id = ?1", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "update outbox set attempts = attempts + 1, error = ?2 where id = ?1",
            rusqlite::params![id, error],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
