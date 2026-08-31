-- ثبت رویدادهای مدیریتی عمومی
create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_type text,
  target_id uuid,
  context_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_action_log enable row level security;

drop policy if exists "admin_action_log_admin_select" on public.admin_action_log;
create policy "admin_action_log_admin_select" on public.admin_action_log for select using (public.is_admin());

create or replace function public.admin_write_action_log(
  p_action text, p_target_type text default null, p_target_id uuid default null,
  p_context_id uuid default null, p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'فقط ادمین سامانه مجاز است'; end if;
  insert into public.admin_action_log(actor_id,action,target_type,target_id,context_id,details)
  values(auth.uid(),p_action,p_target_type,p_target_id,p_context_id,coalesce(p_details,'{}'::jsonb));
end;
$$;

create or replace function public.group_moderation_action(
  p_group_id uuid,
  p_target_uid uuid,
  p_action text,
  p_duration_minutes int default null,
  p_reason text default null,
  p_permissions jsonb default null,
  p_role text default null,
  p_delete_recent boolean default false
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_members uuid[];
  v_admins uuid[];
  v_until timestamptz;
begin
  if v_actor is null then raise exception 'ورود لازم است'; end if;
  if not public._is_group_manager(p_group_id, v_actor) then
    raise exception 'اجازه مدیریت این گروه را ندارید';
  end if;

  select owner_id, members, admins into v_owner, v_members, v_admins
  from public.groups where id = p_group_id for update;
  if v_owner is null then raise exception 'گروه پیدا نشد'; end if;
  if p_target_uid = v_owner and p_action in ('remove','ban','demote','restrict','mute') then
    raise exception 'مالک گروه قابل حذف یا محدودسازی نیست';
  end if;
  if p_target_uid = v_actor and p_action in ('remove','ban','demote') then
    raise exception 'برای انجام این عملیات روی خودتان مجاز نیستید';
  end if;

  if p_duration_minutes is not null and p_duration_minutes > 0 then
    v_until := now() + make_interval(mins => p_duration_minutes);
  else
    v_until := null;
  end if;

  if p_action = 'remove' then
    update public.groups set
      members = array_remove(members, p_target_uid),
      admins = array_remove(admins, p_target_uid)
    where id = p_group_id;
    delete from public.group_member_moderation where group_id = p_group_id and user_id = p_target_uid;

    if p_delete_recent then
      delete from public.group_messages
      where group_id = p_group_id
        and sender_id = p_target_uid
        and created_at > now() - interval '24 hours';
    end if;

  elsif p_action = 'ban' then
    update public.groups set
      members = array_remove(members, p_target_uid),
      admins = array_remove(admins, p_target_uid)
    where id = p_group_id;
    insert into public.group_member_moderation
      (group_id, user_id, role, banned_until, moderation_reason, updated_by)
    values
      (p_group_id, p_target_uid, 'member', coalesce(v_until, 'infinity'::timestamptz), p_reason, v_actor)
    on conflict (group_id, user_id) do update set
      banned_until = excluded.banned_until,
      moderation_reason = excluded.moderation_reason,
      updated_by = excluded.updated_by;

  elsif p_action = 'unban' then
    update public.group_member_moderation
    set banned_until = null, moderation_reason = null, updated_by = v_actor
    where group_id = p_group_id and user_id = p_target_uid;

  elsif p_action = 'mute' then
    insert into public.group_member_moderation
      (group_id, user_id, role, muted_until, moderation_reason, updated_by)
    values
      (p_group_id, p_target_uid, 'member', v_until, p_reason, v_actor)
    on conflict (group_id, user_id) do update set
      muted_until = excluded.muted_until,
      moderation_reason = excluded.moderation_reason,
      updated_by = excluded.updated_by;

  elsif p_action = 'unmute' then
    update public.group_member_moderation
    set muted_until = null, updated_by = v_actor
    where group_id = p_group_id and user_id = p_target_uid;

  elsif p_action = 'restrict' then
    insert into public.group_member_moderation
      (group_id, user_id, role, restricted_until, permissions, restriction_reason, updated_by)
    values
      (p_group_id, p_target_uid, 'member', v_until,
       coalesce(p_permissions, '{"send_messages":false}'::jsonb),
       p_reason, v_actor)
    on conflict (group_id, user_id) do update set
      restricted_until = excluded.restricted_until,
      permissions = excluded.permissions,
      restriction_reason = excluded.restriction_reason,
      updated_by = excluded.updated_by;

  elsif p_action = 'unrestrict' then
    update public.group_member_moderation
    set restricted_until = null, restriction_reason = null,
        permissions = jsonb_set(coalesce(permissions,'{}'::jsonb), '{send_messages}', 'true'::jsonb, true),
        updated_by = v_actor
    where group_id = p_group_id and user_id = p_target_uid;

  elsif p_action = 'promote' then
    if not (p_target_uid = any(v_members)) then
      raise exception 'عضو باید ابتدا عضو گروه باشد';
    end if;
    update public.groups set admins = case when p_target_uid = any(admins) then admins else admins || p_target_uid end
    where id = p_group_id;
    insert into public.group_member_moderation (group_id,user_id,role,updated_by)
    values (p_group_id,p_target_uid,coalesce(nullif(p_role,''),'admin'),v_actor)
    on conflict (group_id,user_id) do update set role=coalesce(nullif(p_role,''),'admin'), updated_by=v_actor;

  elsif p_action = 'demote' then
    update public.groups set admins = array_remove(admins, p_target_uid) where id = p_group_id;
    update public.group_member_moderation set role='member', updated_by=v_actor
    where group_id=p_group_id and user_id=p_target_uid;

  elsif p_action = 'set_role' then
    if p_role not in ('admin','moderator','helper','member') then
      raise exception 'سطح مدیریتی نامعتبر است';
    end if;
    if p_role in ('admin','moderator','helper') then
      update public.groups set admins = case when p_target_uid = any(admins) then admins else admins || p_target_uid end where id=p_group_id;
    elsif p_role='member' then
      update public.groups set admins = array_remove(admins,p_target_uid) where id=p_group_id;
    end if;
    insert into public.group_member_moderation (group_id,user_id,role,updated_by)
    values (p_group_id,p_target_uid,p_role,v_actor)
    on conflict (group_id,user_id) do update set role=excluded.role, updated_by=excluded.updated_by;

  elsif p_action = 'set_permissions' then
    insert into public.group_member_moderation (group_id,user_id,role,permissions,updated_by)
    values (p_group_id,p_target_uid,coalesce(nullif(p_role,''),'member'),coalesce(p_permissions,'{}'::jsonb),v_actor)
    on conflict (group_id,user_id) do update set
      permissions=excluded.permissions,
      updated_by=excluded.updated_by;

  else
    raise exception 'عملیات مدیریتی نامعتبر است';
  end if;

  insert into public.admin_action_log(actor_id, action, target_type, target_id, context_id, details)
  values (v_actor, 'group_' || p_action, 'group_member', p_target_uid, p_group_id,
          jsonb_build_object('duration_minutes', p_duration_minutes, 'reason', p_reason, 'role', p_role));
end;
$$;

-- جلوگیری سمت سرور از ارسال پیام وقتی کاربر در گروه محدود/بن شده است.
create or replace function public._guard_group_member_moderation()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
begin
  select * into r from public.group_member_moderation
  where group_id = new.group_id and user_id = new.sender_id;

  if r.banned_until is not null and r.banned_until > now() then
    raise exception 'GROUP_MEMBER_BANNED|%|%', r.banned_until, coalesce(r.moderation_reason,'دسترسی عضو به گروه مسدود شده است');
  end if;
  if r.restricted_until is not null and r.restricted_until > now() then
    if coalesce((r.permissions->>'send_messages')::boolean, false) = false then
      raise exception 'GROUP_MEMBER_RESTRICTED|%|%', r.restricted_until, coalesce(r.restriction_reason,'ارسال پیام برای شما محدود شده است');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_group_member_moderation on public.group_messages;
create trigger trg_guard_group_member_moderation
before insert on public.group_messages
for each row execute function public._guard_group_member_moderation();

-- جلوگیری سمت سرور از دور زدن Ban با افزودن دوباره عضو به آرایه members
create or replace function public._guard_banned_group_rejoin()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid;
  v_ban timestamptz;
begin
  if new.members is distinct from old.members then
    foreach v_uid in array coalesce(new.members,'{}'::uuid[]) loop
      if not (v_uid = any(coalesce(old.members,'{}'::uuid[]))) then
        select banned_until into v_ban from public.group_member_moderation
        where group_id=new.id and user_id=v_uid;
        if v_ban is not null and v_ban > now() then
          raise exception 'این کاربر هنوز در این گروه مسدود است';
        end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_banned_group_rejoin on public.groups;
create trigger trg_guard_banned_group_rejoin
before update on public.groups
for each row execute function public._guard_banned_group_rejoin();

-- گزارش‌ها: وضعیت، اولویت و صف بررسی
alter table public.reports add column if not exists status text not null default 'new';
alter table public.reports add column if not exists priority text not null default 'medium';
alter table public.reports add column if not exists category text not null default 'other';
alter table public.reports add column if not exists assigned_to uuid references auth.users(id);
alter table public.reports add column if not exists resolution_note text;
alter table public.reports add column if not exists resolved_at timestamptz;

create or replace function public.admin_update_report(
  p_report_id uuid,
  p_status text default null,
  p_priority text default null,
  p_category text default null,
  p_assigned_to uuid default null,
  p_resolution_note text default null
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'فقط ادمین سامانه مجاز است'; end if;
  if p_status is not null and p_status not in ('new','reviewing','resolved','dismissed','escalated') then raise exception 'وضعیت گزارش نامعتبر است'; end if;
  if p_priority is not null and p_priority not in ('low','medium','high','critical') then raise exception 'اولویت گزارش نامعتبر است'; end if;
  update public.reports set
    status = coalesce(p_status,status),
    priority = coalesce(p_priority,priority),
    category = coalesce(p_category,category),
    assigned_to = p_assigned_to,
    resolution_note = p_resolution_note,
    resolved_at = case when p_status in ('resolved','dismissed') then now() else resolved_at end
  where id = p_report_id;

  insert into public.admin_action_log(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'report_update', 'report', p_report_id,
          jsonb_build_object('status', p_status, 'priority', p_priority, 'category', p_category));
end;
$$;

