/*
 * Vercel 환경변수 또는 직접 입력
 *
 * 순수 정적 배포용 기본 구성입니다. Supabase를 사용하려면 Anon Key만 입력하세요.
 * service role 키, 데이터베이스 비밀번호, 개인 토큰은 절대 브라우저 파일에 넣지 마세요.
 */
window.GEOPINDER_CONFIG = {
  supabaseUrl: 'https://nkxpjjaqytbihqjofwhc.supabase.co',
  supabaseAnonKey: 'sb_publishable_-ipoeqw8_LszSLSsHGX2qA_j3GeCM4U',
  // AdSense 광고 단위 생성 후 숫자 슬롯 ID를 입력하면 게임 종료 광고 영역에 표시됩니다.
  adsenseAdSlot: '7001318690',
  // 문제 제보 사진을 비공개로 보관할 Supabase Storage 버킷입니다.
  questionSubmissionBucket: 'question-submissions'
};
