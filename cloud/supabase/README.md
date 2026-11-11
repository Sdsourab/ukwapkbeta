# Cloud sync with your own Supabase project

> **Status: needs external configuration and has NOT been verified against a live project.** `schema.sql` was
> syntax-checked with a PostgreSQL parser and its behaviour mirrors the in-memory reference server that the sync tests
> run against, but it has never been executed on a real database. The app also has **no sign-in screen yet**, so users
> cannot enable sync from the UI. Treat this as the server half, ready for a developer to finish and verify.

## Setup
1. Create a project at supabase.com (free tier is fine for development).
2. **SQL editor → run `schema.sql`.** It is idempotent. It creates `ukw_records`, `ukw_ops`, `ukw_counters`, turns on
   row-level security, and defines `ukw_push(ops jsonb)` and `ukw_pull(since bigint, lim integer)`.
3. **Authentication → Providers:** enable Email (or the provider you prefer). Consider requiring email confirmation.
4. Note the **Project URL** and the **anon (public) key** (Settings → API). The anon key is *designed* to be public; row-level security is what protects data.
5. **Never** put the `service_role` key in any client, config file in this repo, or `.env` that is committed.
   A repository test fails if `service_role`, JWT-shaped strings or private keys appear in source or built assets.

## How it behaves
- Every row is owned by `auth.uid()`; policies allow a user to read and write only their own rows.
- Pushes are serialised per user with an advisory lock so `server_seq` order equals commit order (a puller can never skip a row that commits late).
- A write is accepted only if `base_seq` equals the row's current `server_seq`; otherwise the server answers `conflict` with its version and the client resolves it (last writer wins; note text is preserved as a conflict copy).
- Replaying an `op_id` returns the original answer and changes nothing (safe retries after a dropped response).
- Payloads over 1 MB are rejected; at most 500 operations per call.
- Device-only settings, binary attachments and the undo history are never uploaded.

## Using the transport in code
```ts
import { SyncEngine, SupabaseTransport } from '@ukw/sync-engine';
const transport = new SupabaseTransport({ url, anonKey, getAccessToken: () => session.access_token });
const engine = new SyncEngine(store, transport);
await store.enqueueAllForSync();   // first time only: queue existing local data
engine.startAuto();                // sync on change, on reconnect, and every minute
```
Still to build: sign-in/sign-up UI, token refresh and secure session storage, a sync status screen, and a "sign out and keep/remove local data" flow.

## Verifying a real deployment (do this before trusting it)
1. Create two test users, A and B. As A, push records; as B, confirm `select * from ukw_records` returns zero rows and that `ukw_pull` returns nothing (**row-level security**).
2. As B, try `ukw_push` with an op whose `id` matches one of A's rows: it must create B's own row and leave A's untouched.
3. As the anonymous role, call both functions: both must be refused.
4. Replay one `op_id` twice and confirm `server_seq` did not move.
5. Sync two devices of one user through an offline period and confirm convergence.

## Data removal
`delete from public.ukw_records where user_id = auth.uid();` removes a user's synced data. Deleting the auth user cascades to all three tables.
