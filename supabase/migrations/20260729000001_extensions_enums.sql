-- Migration 001 — extensions & enums (docs/02-DATA-MODEL.md §001)
-- Rollback: drop the types and extensions created below.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create type user_role      as enum ('customer', 'staff', 'admin');
create type product_cond   as enum ('new', 'open_box', 'refurbished');
create type order_status   as enum ('pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled', 'refunded', 'oversold');
create type payment_status as enum ('unpaid', 'processing', 'paid', 'failed', 'refunded', 'partially_refunded');
create type pay_provider   as enum ('paystack');
create type coupon_kind    as enum ('percent', 'fixed', 'free_shipping');
