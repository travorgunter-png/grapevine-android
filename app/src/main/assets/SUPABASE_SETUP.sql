-- GRAPEVINE online content tables + secure chat insert policy
-- Run this AFTER the original GRAPEVINE Supabase SQL you already ran.

create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, settings)
values (1, '{"name":"GRAPEVINE","motto":"Code Today. Build Tomorrow. Inspire Forever.","description":"A software engineering group built around collaboration, innovation and practical technology.","email":"grapevine@example.com","phone":"+256 700 000 000","location":"Uganda"}'::jsonb)
on conflict (id) do nothing;

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('project','skill','gallery')),
  title text not null,
  description text not null default '',
  tags jsonb not null default '[]'::jsonb,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
alter table public.content_items enable row level security;

drop policy if exists "Public can view site settings" on public.site_settings;
create policy "Public can view site settings" on public.site_settings
for select to public using (true);

drop policy if exists "Admins can insert site settings" on public.site_settings;
create policy "Admins can insert site settings" on public.site_settings
for insert to authenticated with check (exists (select 1 from public.admins where user_id = (select auth.uid())));

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings" on public.site_settings
for update to authenticated
using (exists (select 1 from public.admins where user_id = (select auth.uid())))
with check (exists (select 1 from public.admins where user_id = (select auth.uid())));

drop policy if exists "Public can view content" on public.content_items;
create policy "Public can view content" on public.content_items
for select to public using (true);

drop policy if exists "Admins can insert content" on public.content_items;
create policy "Admins can insert content" on public.content_items
for insert to authenticated with check (exists (select 1 from public.admins where user_id = (select auth.uid())));

drop policy if exists "Admins can update content" on public.content_items;
create policy "Admins can update content" on public.content_items
for update to authenticated
using (exists (select 1 from public.admins where user_id = (select auth.uid())))
with check (exists (select 1 from public.admins where user_id = (select auth.uid())));

drop policy if exists "Admins can delete content" on public.content_items;
create policy "Admins can delete content" on public.content_items
for delete to authenticated
using (exists (select 1 from public.admins where user_id = (select auth.uid())));

-- Prevent an ordinary member from claiming to be an admin in chat.
drop policy if exists "Authenticated users can send chat messages" on public.chat_messages;
create policy "Members can send member chat messages" on public.chat_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and is_admin = false
);

drop policy if exists "Admins can send admin chat messages" on public.chat_messages;
create policy "Admins can send admin chat messages" on public.chat_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and is_admin = true
  and exists (select 1 from public.admins where user_id = (select auth.uid()))
);

create index if not exists content_items_kind_idx on public.content_items(kind);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);


-- Server-side protection: only an account listed in public.admins can change
-- a member's verification status. This prevents ordinary users from granting
-- themselves or others a verification badge by modifying the client app.
create or replace function public.protect_member_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verified is distinct from old.verified
     and not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Only GRAPEVINE administrators can change verification status';
  end if;
  if new.verified = true and new.verified_at is null then
    new.verified_at := now();
  elsif new.verified = false then
    new.verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_member_verification_trigger on public.profiles;
create trigger protect_member_verification_trigger
before update on public.profiles
for each row execute function public.protect_member_verification();


-- Required for member photo uploads.
-- The bucket is public for reading profile images, while uploads are restricted to GRAPEVINE admins.
insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view GRAPEVINE member photos" on storage.objects;
create policy "Public can view GRAPEVINE member photos"
on storage.objects for select
to public
using (bucket_id = 'member-photos');

drop policy if exists "Admins can upload GRAPEVINE member photos" on storage.objects;
create policy "Admins can upload GRAPEVINE member photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'member-photos'
  and exists (select 1 from public.admins where user_id = (select auth.uid()))
);

drop policy if exists "Admins can update GRAPEVINE member photos" on storage.objects;
create policy "Admins can update GRAPEVINE member photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'member-photos'
  and exists (select 1 from public.admins where user_id = (select auth.uid()))
)
with check (
  bucket_id = 'member-photos'
  and exists (select 1 from public.admins where user_id = (select auth.uid()))
);

drop policy if exists "Admins can delete GRAPEVINE member photos" on storage.objects;
create policy "Admins can delete GRAPEVINE member photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'member-photos'
  and exists (select 1 from public.admins where user_id = (select auth.uid()))
);

-- V17: gallery media approval/download support.
alter table public.content_items add column if not exists media_type text not null default 'image';
alter table public.content_items add column if not exists approved boolean not null default true;
alter table public.content_items add column if not exists uploaded_by uuid references auth.users(id);

create index if not exists content_items_gallery_approval_idx on public.content_items(kind, approved);

-- Public users can see normal content and approved gallery media. Pending gallery
-- uploads remain visible only to the uploader and administrators.
drop policy if exists "Public can view content" on public.content_items;
drop policy if exists "Public can view approved content" on public.content_items;
create policy "Public can view approved content" on public.content_items
for select to public using (
  kind <> 'gallery'
  or approved = true
  or uploaded_by = (select auth.uid())
  or exists (select 1 from public.admins where user_id = (select auth.uid()))
);

-- Authenticated members may submit gallery media. Administrators can create
-- already-approved gallery media; ordinary members must submit as pending.
drop policy if exists "Members can submit gallery content" on public.content_items;
create policy "Members can submit gallery content" on public.content_items
for insert to authenticated
with check (
  kind = 'gallery'
  and uploaded_by = (select auth.uid())
  and (
    approved = false
    or exists (select 1 from public.admins where user_id = (select auth.uid()))
  )
);

-- Administrators approve or edit gallery content. Members cannot approve their
-- own uploads.
drop policy if exists "Admins can update content" on public.content_items;
create policy "Admins can update content" on public.content_items
for update to authenticated
using (exists (select 1 from public.admins where user_id = (select auth.uid())))
with check (exists (select 1 from public.admins where user_id = (select auth.uid())));

-- Ensure authenticated members can read the shared chat and send only their
-- own non-admin messages.
drop policy if exists "Authenticated users can read chat messages" on public.chat_messages;
create policy "Authenticated users can read chat messages" on public.chat_messages
for select to authenticated using (true);

-- Gallery media uses its own bucket so profile-photo permissions stay unchanged.
insert into storage.buckets (id, name, public)
values ('gallery-media', 'gallery-media', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can upload gallery media" on storage.objects;
create policy "Authenticated users can upload gallery media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'gallery-media');

drop policy if exists "Public can view gallery media" on storage.objects;
create policy "Public can view gallery media"
on storage.objects for select
to public using (bucket_id = 'gallery-media');

drop policy if exists "Admins can update gallery media" on storage.objects;
create policy "Admins can update gallery media"
on storage.objects for update
to authenticated
using (bucket_id = 'gallery-media' and exists (select 1 from public.admins where user_id = (select auth.uid())))
with check (bucket_id = 'gallery-media' and exists (select 1 from public.admins where user_id = (select auth.uid())));

drop policy if exists "Admins can delete gallery media" on storage.objects;
create policy "Admins can delete gallery media"
on storage.objects for delete
to authenticated
using (bucket_id = 'gallery-media' and exists (select 1 from public.admins where user_id = (select auth.uid())));


-- V19: member-controlled download approval workflow.
-- A gallery item can be visible to members, but every member must request
-- permission before downloading it. Administrators approve/reject each request.
create table if not exists public.download_requests (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index if not exists download_requests_content_idx on public.download_requests(content_id);
create index if not exists download_requests_requester_idx on public.download_requests(requester_id);
create index if not exists download_requests_status_idx on public.download_requests(status);

alter table public.download_requests enable row level security;

drop policy if exists "Members can request gallery downloads" on public.download_requests;
create policy "Members can request gallery downloads"
on public.download_requests for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.content_items c
    where c.id = content_id and c.kind = 'gallery' and c.approved = true
  )
);

drop policy if exists "Members can view their download requests" on public.download_requests;
create policy "Members can view their download requests"
on public.download_requests for select
to authenticated
using (requester_id = (select auth.uid()));

drop policy if exists "Admins can view all download requests" on public.download_requests;
create policy "Admins can view all download requests"
on public.download_requests for select
to authenticated
using (exists (select 1 from public.admins where user_id = (select auth.uid())));

drop policy if exists "Admins can review download requests" on public.download_requests;
create policy "Admins can review download requests"
on public.download_requests for update
to authenticated
using (exists (select 1 from public.admins where user_id = (select auth.uid())))
with check (
  status in ('pending','approved','rejected')
  and exists (select 1 from public.admins where user_id = (select auth.uid()))
);

-- V23 reliability: allow gallery media up to 50 MB and keep the bucket public for approved media.
-- Large files are uploaded by the Android WebView through Supabase's resumable/TUS endpoint.
update storage.buckets
set public = true,
    file_size_limit = 52428800
where id = 'gallery-media';

-- V21 reliability: self-healing gallery bucket initializer.
-- The mobile app calls this function before an upload. It uses SECURITY DEFINER
-- only for the narrowly-scoped bucket creation and is executable by authenticated users.
create or replace function public.ensure_grapevine_gallery_bucket()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('gallery-media', 'gallery-media', true, 52428800)
  on conflict (id) do update set public = true, file_size_limit = 52428800;
  return jsonb_build_object('ok', true, 'bucket', 'gallery-media');
end;
$$;
revoke all on function public.ensure_grapevine_gallery_bucket() from public;
grant execute on function public.ensure_grapevine_gallery_bucket() to authenticated;

-- Make sure the gallery storage policies exist even if the migration was rerun.
drop policy if exists "Authenticated users can upload gallery media" on storage.objects;
create policy "Authenticated users can upload gallery media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'gallery-media' and (select auth.uid()) is not null);

drop policy if exists "Public can view gallery media" on storage.objects;
create policy "Public can view gallery media"
on storage.objects for select
to public using (bucket_id = 'gallery-media');
