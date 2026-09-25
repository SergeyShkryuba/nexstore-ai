/**
 * A real Postgres for testing `schema.sql`: PGlite (Postgres compiled to
 * WebAssembly) in-process, no Docker and no network, so it runs in CI.
 *
 * Supabase provides a few things the schema relies on; they are stubbed here
 * as closely as matters for the tests:
 *   - the `anon`, `authenticated` and `service_role` roles, with Supabase's
 *     default grants (every table and function in `public` is granted to all
 *     three, so a missing `revoke` shows up as a real hole), and
 *     `service_role` bypassing RLS;
 *   - `auth.users` and `auth.uid()`, which reads the caller's id the way
 *     PostgREST sets it (`request.jwt.claim.sub`);
 *   - `storage.buckets` / `storage.objects`, enough for the bucket and its
 *     policies to be created;
 *   - an `extensions` schema for pgvector.
 */
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const supabaseDir = path.resolve(__dirname, '..')
export const schemaSql = readFileSync(path.join(supabaseDir, 'schema.sql'), 'utf8')
export const seedSql = readFileSync(path.join(supabaseDir, 'seed.sql'), 'utf8')

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema extensions;
  grant usage on schema extensions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets,
    name text,
    owner uuid
  );
  alter table storage.objects enable row level security;
`

/** A fresh database with the schema (applied twice, to prove it re-runs) and the demo catalogue. */
export async function createDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector } })
  await db.exec(SUPABASE_STUBS)
  await db.exec(schemaSql)
  await db.exec(schemaSql)
  await db.exec(seedSql)
  return db
}

export type Caller =
  | { role: 'anon' }
  | { role: 'authenticated'; userId: string }
  | { role: 'service_role' }

/**
 * Runs `fn` as a PostgREST request would: under the caller's role, with RLS,
 * and with `auth.uid()` set for a signed-in user. Rolled back on error.
 */
export function as<T>(db: PGlite, caller: Caller, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${caller.role}`)
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      caller.role === 'authenticated' ? caller.userId : '',
    ])
    return fn(tx)
  })
}

/** A Supabase Auth user (the signup trigger gives it a profile). */
export async function createUser(db: PGlite, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [email],
  )
  return rows[0].id
}
