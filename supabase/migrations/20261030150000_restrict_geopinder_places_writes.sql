-- GeoPinder: 랜드마크 문제 데이터는 관리자 작업으로만 변경합니다.
-- 브라우저에 공개된 anon key와 일반 authenticated 세션은 읽기만 허용합니다.

begin;

alter table public.geopinder_places enable row level security;

-- 기존에 이름이 다르게 생성된 공개/일반 쓰기 정책까지 제거합니다.
-- 관리자 운영은 Supabase Studio 또는 서버 측 service_role로 수행하며,
-- service_role은 RLS를 우회하므로 이 테이블에 쓰기 정책이 필요하지 않습니다.
do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'geopinder_places'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.geopinder_places', policy_name);
  end loop;
end
$$;

-- 게임은 랜드마크를 읽어야 하므로 공개 역할에는 SELECT만 남깁니다.
revoke all on table public.geopinder_places from anon, authenticated;
grant select on table public.geopinder_places to anon, authenticated;

drop policy if exists "Public can read landmark places" on public.geopinder_places;
create policy "Public can read landmark places"
on public.geopinder_places
for select
to anon, authenticated
using (true);

-- INSERT/UPDATE/DELETE/TRUNCATE 권한은 anon/authenticated에 부여하지 않습니다.
-- 따라서 개발자 도구로 REST 요청을 위조해도 랜드마크 힌트·좌표·이미지를 수정할 수 없습니다.

commit;
