-- Execute no SQL Editor do projeto Supabase existente.
-- Cria apenas objetos novos; não apaga tabelas nem contas anteriores.
create table if not exists public.finance_v2_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{"entries":[],"goals":[],"categories":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.finance_v2_data enable row level security;
revoke all on public.finance_v2_data from anon;
grant select, insert on public.finance_v2_data to authenticated;
-- Atualizações somente pela função com controle de revisão.
revoke update, delete on public.finance_v2_data from authenticated;
drop policy if exists "v2_select_own" on public.finance_v2_data;
create policy "v2_select_own" on public.finance_v2_data for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "v2_insert_own" on public.finance_v2_data;
create policy "v2_insert_own" on public.finance_v2_data for insert to authenticated with check ((select auth.uid()) = user_id);
create or replace function public.finance_v2_save(expected_revision bigint,new_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if jsonb_typeof(new_payload) <> 'object' or
     jsonb_typeof(new_payload->'entries') <> 'array' or
     jsonb_typeof(new_payload->'goals') <> 'array' or
     jsonb_typeof(new_payload->'categories') <> 'array' then
    raise exception 'Formato de dados inválido';
  end if;
  update public.finance_v2_data
  set payload=new_payload, revision=revision+1, updated_at=now()
  where user_id=auth.uid() and revision=expected_revision
  returning revision into next_revision;
  return next_revision; -- null = conflito de versão
end $$;
revoke all on function public.finance_v2_save(bigint,jsonb) from public, anon;
grant execute on function public.finance_v2_save(bigint,jsonb) to authenticated;
