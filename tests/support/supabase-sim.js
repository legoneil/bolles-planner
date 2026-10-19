// A local stand-in for Supabase, used by tests: a real Postgres (PGlite)
// with Supabase's auth.uid(), anon/authenticated roles and default grants,
// running this repo's supabase/*.sql. Queries run as the signed-in student,
// so row-level security is enforced exactly as it would be in production.

import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';

const SQL_FILES = ['schema.sql', 'friends.sql', 'push.sql'];

const BOOTSTRAP = `
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase grants new public tables and functions to these roles by default.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

// Pass as `uid` to act as the server (Supabase's service_role).
export const SERVICE = 'service';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (s) => {
  if (!IDENT.test(s)) throw new Error(`bad identifier ${s}`);
  return `"${s}"`;
};

export async function createSim(root = new URL('../../supabase/', import.meta.url)) {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  for (const f of SQL_FILES) await db.exec(readFileSync(new URL(f, root), 'utf8'));
  let n = 0;

  // Run fn(db) as `uid` (null = signed out), one at a time.
  let queue = Promise.resolve();
  const as = (uid, fn) => {
    const run = queue.then(async () => {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid === SERVICE ? '' : (uid ?? '')]);
      await db.exec(`set role ${uid === SERVICE ? 'service_role' : uid ? 'authenticated' : 'anon'}`);
      try {
        return await fn(db);
      } finally {
        await db.exec('reset role');
      }
    });
    queue = run.catch(() => {});
    return run;
  };

  async function createUser(email) {
    const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
    return id;
  }

  // PostgREST-style request: { table, action: select|update|upsert, columns, filters: [[op, col, val]], values, single }
  async function query(uid, { table, action, columns = '*', filters = [], values, single }) {
    try {
      return await as(uid, async () => {
        const params = [];
        const p = (v) => {
          params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
          return `$${params.length}`;
        };
        const where = filters.length
          ? ` where ${filters.map(([op, col, val]) => `${ident(col)} ${op === 'neq' ? '<>' : '='} ${p(val)}`).join(' and ')}`
          : '';
        const cols = columns === '*' ? '*' : columns.split(',').map((c) => ident(c.trim())).join(', ');
        let sql;
        if (action === 'select') sql = `select ${cols} from public.${ident(table)}${where}`;
        else if (action === 'update')
          sql = `update public.${ident(table)} set ${Object.entries(values).map(([k, v]) => `${ident(k)} = ${p(v)}`).join(', ')}${where}`;
        else if (action === 'upsert') {
          const keys = Object.keys(values);
          sql = `insert into public.${ident(table)} (${keys.map(ident).join(', ')}) values (${keys.map((k) => p(values[k])).join(', ')})
            on conflict (user_id) do update set ${keys.filter((k) => k !== 'user_id').map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;
        } else throw new Error(`unsupported action ${action}`);
        const { rows } = await db.query(sql, params);
        if (single) {
          if (rows.length > 1) return { data: null, error: { message: 'multiple rows' } };
          return { data: rows[0] ?? null, error: null };
        }
        return { data: action === 'select' ? rows : null, error: null };
      });
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }

  async function rpc(uid, name, args = {}) {
    try {
      return await as(uid, async () => {
        const keys = Object.keys(args);
        const call = `public.${ident(name)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
        const { rows, fields } = await db.query(`select * from ${call}`, keys.map((k) => args[k]));
        // Scalar functions come back as one column named after the function.
        if (fields.length === 1 && fields[0].name === name) return { data: rows[0]?.[name] ?? null, error: null };
        return { data: rows, error: null };
      });
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }

  // Raw SQL as a given user (for tests that probe privileges directly).
  const sqlAs = (uid, sql, params = []) => as(uid, (d) => d.query(sql, params));

  return { db, createUser, query, rpc, sqlAs };
}
