begin;

alter table public.group_messages drop constraint if exists group_messages_type_check;
alter table public.group_messages add constraint group_messages_type_check
  check (type = any (array['text','image','video','voice','sticker']::text[]));

alter table public.channel_posts drop constraint if exists channel_posts_type_check;
alter table public.channel_posts add constraint channel_posts_type_check
  check (type = any (array['text','image','video']::text[]));

alter table public.stories drop constraint if exists stories_media_type_check;
alter table public.stories add constraint stories_media_type_check
  check (media_type = any (array['image','video','text']::text[]));

drop policy if exists channel_media_insert_auth on storage.objects;
create policy channel_media_insert_auth on storage.objects
for insert to authenticated
with check (
  bucket_id = 'channel-media'
  and exists (
    select 1 from public.channels ch
    where ch.id::text = (storage.foldername(name))[1]
      and auth.uid() = any(ch.admins)
  )
  and private.user_action_allowed(auth.uid(),'send_media')
);

drop policy if exists channel_media_select_auth on storage.objects;
create policy channel_media_select_auth on storage.objects
for select to authenticated
using (
  bucket_id = 'channel-media'
  and exists (
    select 1 from public.channels ch
    where ch.id::text = (storage.foldername(name))[1]
      and (ch.is_public = true or auth.uid() = any(ch.subscribers))
  )
);

drop policy if exists group_media_insert_auth on storage.objects;
create policy group_media_insert_auth on storage.objects
for insert to authenticated
with check (
  bucket_id = 'group-media'
  and exists (
    select 1 from public.groups g
    where g.id::text = (storage.foldername(name))[1]
      and auth.uid() = any(g.members)
  )
  and private.user_action_allowed(auth.uid(),'send_media')
);

drop policy if exists group_media_select_auth on storage.objects;
create policy group_media_select_auth on storage.objects
for select to authenticated
using (
  bucket_id = 'group-media'
  and exists (
    select 1 from public.groups g
    where g.id::text = (storage.foldername(name))[1]
      and auth.uid() = any(g.members)
  )
);

alter table public.group_messages drop constraint if exists group_messages_media_path_check;
alter table public.group_messages add constraint group_messages_media_path_check
  check (
    type not in ('image','video','voice')
    or left(coalesce(media_url,''), length('storage://group-media/' || group_id::text || '/')) = 'storage://group-media/' || group_id::text || '/'
  );

alter table public.channel_posts drop constraint if exists channel_posts_media_path_check;
alter table public.channel_posts add constraint channel_posts_media_path_check
  check (
    type not in ('image','video')
    or left(coalesce(media_url,''), length('storage://channel-media/' || channel_id::text || '/')) = 'storage://channel-media/' || channel_id::text || '/'
  );

commit;
