-- GeoPinder Arcade: 기존 익명 제보 정책을 정리하고 입력값 검증을 단일 정책으로 고정합니다.
-- 기존 테이블의 필수 location 컬럼은 애플리케이션이 좌표 문자열로 함께 전송합니다.

alter table public.geopinder_question_submissions enable row level security;
grant insert on table public.geopinder_question_submissions to anon;

drop policy if exists "Allow anonymous question submissions" on public.geopinder_question_submissions;
drop policy if exists "Anonymous can create question submissions" on public.geopinder_question_submissions;

create policy "Anonymous can create question submissions"
on public.geopinder_question_submissions
for insert
to anon
with check (
  char_length(trim(title)) between 1 and 120
  and char_length(trim(hint)) between 1 and 500
  and char_length(trim(location)) between 1 and 80
  and latitude between -90 and 90
  and longitude between -180 and 180
  and location_method in ('coordinates', 'map')
  and photo_storage_path like 'pending/%'
  and photo_content_type in ('image/jpeg', 'image/png', 'image/webp')
  and photo_size_bytes between 1 and 10485760
  and coalesce(status, 'pending') = 'pending'
);

-- 의도적으로 SELECT, UPDATE, DELETE 정책은 만들지 않습니다.
