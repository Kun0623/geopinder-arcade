/*
 * GeoPinder 브라우저 설정 예시
 *
 * 1. 이 파일을 config.js로 복사합니다.
 * 2. Supabase 프로젝트 URL과 Anon Key를 입력합니다.
 * 3. config.js는 .gitignore 대상입니다. Anon Key 외의 비공개 키는 넣지 마세요.
 *
 * 순수 정적 Vercel 배포는 런타임 환경변수를 자동으로 브라우저에 주입하지 않습니다.
 * CI 빌드 단계를 추가하지 않는다면, 직접 입력한 공개 Anon Key를 별도 배포 구성으로 주입해야 합니다.
 */
window.GEOPINDER_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};
