-- Execute uma vez no SQL Editor do Supabase.
create table if not exists public.finance_entries (
 id text not null,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint finance_entries_pk primary key (user_id,id),
 constraint finance_entries_payload_object check (jsonb_typeof(payload)='object'),
 constraint finance_entries_payload_id check (payload->>'id'=id)
);
create index if not exists finance_entries_user_created_idx on public.finance_entries(user_id,created_at);
alter table public.finance_entries enable row level security;
revoke all on public.finance_entries from anon;
grant select,insert,update,delete on public.finance_entries to authenticated;
drop policy if exists "select_own" on public.finance_entries;
drop policy if exists "insert_own" on public.finance_entries;
drop policy if exists "update_own" on public.finance_entries;
drop policy if exists "delete_own" on public.finance_entries;
create policy "select_own" on public.finance_entries for select to authenticated using ((select auth.uid())=user_id);
create policy "insert_own" on public.finance_entries for insert to authenticated with check ((select auth.uid())=user_id);
create policy "update_own" on public.finance_entries for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "delete_own" on public.finance_entries for delete to authenticated using ((select auth.uid())=user_id);
