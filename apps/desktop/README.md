# ExtraMile Back-office (desktop)

Tauri v2 + Vite + React 19 back-office console (docs/07-DESKTOP-ADMIN.md).

## Prerequisites

- Rust toolchain (`rustup`) and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)
  (on Windows: WebView2 + MSVC build tools).
- pnpm (repo root).

## Develop

```bash
cp apps/desktop/.env.example apps/desktop/.env   # only VITE_SUPABASE_URL + anon key
pnpm --filter @extramile/desktop tauri dev
```

`pnpm --filter @extramile/desktop dev` runs just the Vite webview in a browser (auth falls
back to email/password; keychain + loopback OAuth are no-ops outside Tauri).

## Build

```bash
pnpm --filter @extramile/desktop tauri icon path/to/logo.png   # once, generates icons/
pnpm --filter @extramile/desktop tauri build                   # MSI + NSIS
```

## Security (docs/07 §5)

- Only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are compiled in. `service_role` and
  `PAYSTACK_SECRET_KEY` never appear here — CI greps the built bundle (test D-01).
- Refresh token → Windows Credential Manager (Rust `keyring`); access token in memory only.
- Google sign-in uses the **system browser** + a loopback listener on `localhost:1421`
  (Google blocks embedded webviews). Add that URL to Supabase → Redirect URLs.
- `withGlobalTauri: false`; devtools disabled in release; capabilities scoped in
  `src-tauri/capabilities/`.
