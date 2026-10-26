-- GeoPinder Arcade 문제 제보: Supabase SQL Editor에서 한 번 실행하세요.
-- 익명 사용자는 새 제보 INSERT와 pending/ 사진 업로드만 할 수 있습니다.
-- 제보 목록과 사진은 Supabase Studio(관리자)에서만 검토합니다.

create extension if not exists pgcrypto;

create table if not exists public.geopinder_question_submissions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  hint text not null check (char_length(trim(hint)) between 1 and 500),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  location_method text not null check (location_method in ('coordinates', 'map')),
  photo_storage_path text not null check (photo_storage_path like 'pending/%'),
  photo_file_name text not null check (char_length(trim(photo_file_name)) between 1 and 255),
  photo_content_type text not null check (photo_content_type in ('image/jpeg', 'image/png', 'image/webp')),
  photo_size_bytes integer not null check (photo_size_bytes between 1 and 10485760),
  contact_email text,
  source text not null default 'geopinder-arcade',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- 초기 버전 테이블을 이미 만든 경우에도 새 접수 필드를 추가합니다.
alter table public.geopinder_question_submissions
  add column if not exists title text,
  add column if not exists hint text,
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists location_method text,
  add column if not exists photo_storage_path text,
  add column if not exists photo_file_name text,
  add column if not exists photo_content_type text,
  add column if not exists photo_size_bytes integer,
  add column if not exists contact_email text,
  add column if not exists source text default 'geopinder-arcade',
  add column if not exists status text default 'pending';

alter table public.geopinder_question_submissions enable row level security;
grant insert on table public.geopinder_question_submissions to anon;

drop policy if exists "Anonymous can create question submissions" on public.geopinder_question_submissions;
create policy "Anonymous can create question submissions"
on public.geopinder_question_submissions
for insert
to anon
with check (
  char_length(trim(title)) between 1 and 120
  and char_length(trim(hint)) between 1 and 500
  and latitude between -90 and 90
  and longitude between -180 and 180
  and location_method in ('coordinates', 'map')
  and photo_storage_path like 'pending/%'
  and photo_content_type in ('image/jpeg', 'image/png', 'image/webp')
  and photo_size_bytes between 1 and 10485760
  and coalesce(status, 'pending') = 'pending'
);

-- 게임 문제 이미지 버킷과 분리된 비공개 검토용 버킷입니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-submissions',
  'question-submissions',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anonymous can upload pending question photos" on storage.objects;
create policy "Anonymous can upload pending question photos"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'question-submissions'
  and name like 'pending/%'
);

grant insert on table storage.objects to anon;

-- 의도적으로 SELECT, UPDATE, DELETE 정책을 만들지 않습니다.
-- 운영자는 Supabase Studio 또는 service_role 기반 관리자 도구에서 제보와 사진을 검토합니다.
