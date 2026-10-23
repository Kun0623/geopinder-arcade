import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');
const index = read('index.html');
const configExample = read('config.example.js');
const sitemap = read('sitemap.xml');
const robots = read('robots.txt');
const vercel = JSON.parse(read('vercel.json'));
const failures = [];
const beginSoloBody = index.match(/async function beginSolo\(\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*async function beginMultiplayer\(\)/)?.[1] || '';
const playSoundBody = index.match(/function playSound\(type\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function requireSupabase\(\)/)?.[1] || '';

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(existsSync(resolve(root, 'favicon.svg')), 'favicon.svg가 없습니다.');
expect(/<meta name="viewport"[^>]*viewport-fit=cover/i.test(index), '모바일 viewport-fit=cover가 없습니다.');
expect(/min-height:\s*100dvh/i.test(index), '100dvh 레이아웃이 없습니다.');
expect(/env\(safe-area-inset-bottom\)/i.test(index), '모바일 safe-area 하단 여백이 없습니다.');
expect(/@media \(max-width:\s*760px\)/i.test(index), '모바일 반응형 breakpoint가 없습니다.');
expect(/--z-hud:.*--z-panel:.*--z-toast:.*--z-modal:/is.test(index), 'HUD·패널·토스트·모달 z-index 계층이 없습니다.');
expect(/\.modal\.is-open/i.test(index), 'fade-in 모달 상태 클래스가 없습니다.');
expect(/prefers-reduced-motion/i.test(index), 'reduced-motion 대응이 없습니다.');
expect(/@media \(hover: hover\) and \(pointer: fine\)/i.test(index), '데스크탑 버튼 hover 처리 구간이 없습니다.');
expect(/<!-- Vercel 환경변수 또는 직접 입력 -->/.test(index), 'Supabase 구성 주석이 없습니다.');
expect(/window\.GEOPINDER_CONFIG/.test(index) && /supabaseAnonKey/.test(index), 'Supabase 공개 구성 방어 로직이 없습니다.');
expect(/<meta name="description"/i.test(index), 'SEO description이 없습니다.');
expect(/<meta property="og:title"/i.test(index) && /<meta name="twitter:card"/i.test(index), 'OG/Twitter 메타데이터가 없습니다.');
expect(/<h1>/i.test(index) && /<h2>/i.test(index), '의미 있는 H1/H2가 없습니다.');
expect(/Promise\.allSettled\(\[/.test(index), '하나의 지도 경계 요청 실패가 전체 지도를 막지 않도록 allSettled 처리가 필요합니다.');
expect(/const FALLBACK_QUESTIONS\s*=\s*\[/.test(index), 'Supabase 미구성 시 1P 테스트에 사용할 로컬 문제 풀이 없습니다.');
expect(/const data = await getQuestions\(\) \|\| FALLBACK_QUESTIONS;/.test(beginSoloBody), '1P 시작은 Supabase 데이터 실패 시 로컬 문제로 폴백해야 합니다.');
expect(!/requireSupabase\(\)/.test(beginSoloBody), '1P 시작이 Supabase 미구성만으로 차단되면 안 됩니다.');
expect(playSoundBody.indexOf('osc.start(now)') !== -1 && playSoundBody.indexOf('osc.start(now)') < playSoundBody.indexOf('osc.stop('), 'Web Audio oscillator는 stop() 전에 start()되어야 합니다.');
expect(/YOUR_SUPABASE_ANON_KEY/.test(configExample), 'config.example.js에 Anon Key 안내가 없습니다.');
expect(!/service_role/i.test(index), 'index.html에 금지된 Supabase service role 문자열이 있습니다.');
expect(!/비밀코드/.test(index), 'index.html에 이전 비밀 문자열이 남아 있습니다.');
expect(/<urlset\b/i.test(sitemap), 'sitemap.xml 형식이 올바르지 않습니다.');
expect(/User-agent:\s*\*/i.test(robots) && /Allow:\s*\//i.test(robots), 'robots.txt 크롤링 정책이 없습니다.');
expect(Array.isArray(vercel.headers) && vercel.headers.length > 0, 'vercel.json 보안 헤더가 없습니다.');

if (failures.length) {
  console.error('Static validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Static validation passed: responsive UX, safe Supabase configuration, SEO baseline, and Vercel policy are present.');
