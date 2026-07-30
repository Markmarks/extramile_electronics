-- Migration 010 — notifications & email suppressions (docs/06-BUILD-PROMPTS.md P8)
-- Guarantees exactly-one notification per (order, event, channel) even on retries.
-- Rollback: drop table notifications; drop table email_suppressions.

create table notifications (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  event text not null, -- order_confirmation|payment_receipt|dispatch|delivery|refund
  channel text not null default 'email', -- email|sms
  sent_at timestamptz not null default now(),
  unique (order_id, event, channel)
);
alter table notifications enable row level security; -- no policies: service_role only

create table email_suppressions (
  email text primary key,
  reason text,
  created_at timestamptz not null default now()
);
alter table email_suppressions enable row level security; -- no policies: service_role only
