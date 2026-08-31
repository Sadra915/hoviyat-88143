-- HOVIYAT NEXT 007: security audit trail + generic action throttling
create table if not exists public.security_audit_log (
  id bigint generated always as identity primary key,
  uid uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  success boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.security_audit_log enable row level security;
create index if not exists idx_security_audit_uid_time on public.security_audit_log(uid,created_at desc);
create index if not exists idx_security_audit_action_time on public.security_audit_log(action,created_at desc);
drop policy if exists security_audit_select_own on public.security_audit_log;
create policy security_audit_select_own on public.security_audit_log for select using (auth.uid()=uid);

create or replace function public.write_security_audit(
  p_action text,p_target_type text default null,p_target_id text default null,
  p_success boolean default true,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public,extensions as $$
begin
  if auth.uid() is null then raise exception 'ورود لازم است'; end if;
  if p_action is null or length(trim(p_action))=0 or length(p_action)>80 then raise exception 'عملیات نامعتبر'; end if;
  insert into public.security_audit_log(uid,action,target_type,target_id,success,metadata)
  values(auth.uid(),left(trim(p_action),80),left(p_target_type,40),left(p_target_id,160),coalesce(p_success,true),coalesce(p_metadata,'{}'::jsonb));
end; $$;
revoke all on function public.write_security_audit(text,text,text,boolean,jsonb) from public;
grant execute on function public.write_security_audit(text,text,text,boolean,jsonb) to authenticated;

create or replace function public.check_action_rate(p_kind text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare uid0 uuid:=auth.uid(); c integer;
begin
  if uid0 is null then return false; end if;
  if p_limit<1 or p_window_seconds<1 then return false; end if;
  select count(*) into c from public._rate_events where uid=uid0 and kind=p_kind and created_at>now()-(p_window_seconds||' seconds')::interval;
  if c>=p_limit then return false; end if;
  insert into public._rate_events(uid,kind) values(uid0,p_kind);
  return true;
end; $$;
revoke all on function public.check_action_rate(text,integer,integer) from public;
grant execute on function public.check_action_rate(text,integer,integer) to authenticated;
