-- GeoPinder Arcade 랭킹 국가 플래그
-- Vercel edge가 IP에서 판별한 ISO 3166-1 alpha-2 코드만 저장합니다.
-- 원 IP 주소는 저장하지 않습니다.

alter table if exists public.geopinder_rankings
  add column if not exists country_code text;

create index if not exists geopinder_rankings_score_country_idx
  on public.geopinder_rankings (score desc, country_code);

comment on column public.geopinder_rankings.country_code is
  'Nullable uppercase ISO 3166-1 alpha-2 country code derived by the Vercel edge; never an IP address.';
