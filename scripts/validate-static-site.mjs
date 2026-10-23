import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');
const index = read('index.html');
const configExample = read('config.example.js');
const sitemap = read('sitemap.xml');
const robots = read('robots.txt');
const vercel = JSON.parse(read('vercel.json'));
const cspHeader = vercel.headers?.flatMap((rule) => rule.headers || []).find((header) => header.key?.toLowerCase() === 'content-security-policy')?.value || '';
const failures = [];
const beginSoloBody = index.match(/async function beginSolo\(\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*async function beginMultiplayer\(\)/)?.[1] || '';
const playSoundBody = index.match(/function playSound\(type\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function requireSupabase\(\)/)?.[1] || '';
const startGameMultiBody = index.match(/function startGameMulti\([^)]*\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*async function beginSolo\(\)/)?.[1] || '';
const forceSubmitBody = index.match(/function forceSubmit\(\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function submitGuess\(/)?.[1] || '';
const submitGuessBody = index.match(/function submitGuess\([^)]*\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function checkRoundComplete\(\)/)?.[1] || '';
const showRoundResultBody = index.match(/function showRoundResult\(\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function proceedToNextRound\(\)/)?.[1] || '';
const startTimerBody = index.match(/function startTimer\(\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function stopTimer\(\)/)?.[1] || '';
const saveRankingBody = index.match(/async function saveRanking\(\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function shareGame\(/)?.[1] || '';

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
expect(/closeModal\('waiting-modal'\)/.test(startGameMultiBody), '2P 라운드가 시작되면 호스트·게스트의 대기 모달을 닫아야 합니다.');
expect(/ROUND_SECONDS_BY_DIFFICULTY\s*=\s*Object\.freeze\(\{[\s\S]*easy:\s*null,[\s\S]*normal:\s*20,[\s\S]*hard:\s*10/.test(index), '초급·중급·고급의 제한 시간은 null·20·10초여야 합니다.');
expect(/roundSeconds === null/.test(startTimerBody) && /renderTimer\(null\)/.test(startTimerBody), '초급은 타이머 interval과 강제 제출 없이 TIME HUD를 숨겨야 합니다.');
expect((index.match(/class="diff-btn__name"/g) || []).length === 3 && (index.match(/class="diff-btn__meta"/g) || []).length === 3, '난이도 버튼은 이름과 시간 규칙을 분리한 일관된 2줄 구조여야 합니다.');
expect(/hud-top--timeless/.test(index) && /classList\.toggle\('hud-top--timeless'/.test(index), '초급은 빈 타이머 열 대신 timeless HUD 레이아웃을 사용해야 합니다.');
expect(!/lat:\s*-90/.test(forceSubmitBody) && /submitGuess\(\{ allowNoSelection: true \}\)/.test(forceSubmitBody), '시간 종료 미선택은 가짜 좌표 없이 no-selection 제출로 처리해야 합니다.');
expect(/allowNoSelection/.test(submitGuessBody) && /noGuess:\s*!currentPin/.test(submitGuessBody), '미선택 제출은 2P noGuess payload를 전송해야 합니다.');
expect(/NO PICK/.test(showRoundResultBody) && /선택 안 함/.test(showRoundResultBody), '미선택 결과는 NO PICK과 선택 안 함을 표시해야 합니다.');
expect(/class="globe-marker__icon"/.test(index) && /<svg[^>]*viewBox="0 0 48 56"/.test(index), '추측 위치에는 텍스트가 아닌 SVG 핀 마커가 필요합니다.');
expect(/<svg[^>]*viewBox="0 0 56 56"/.test(index), '정답 위치에는 텍스트가 아닌 SVG 타겟 마커가 필요합니다.');
expect(!/const icon = d\.type === 'guess' \? 'PIN' : 'TARGET';/.test(index), 'PIN/TARGET 문자열 마커가 남아 있습니다.');
expect(/YOUR_SUPABASE_ANON_KEY/.test(configExample), 'config.example.js에 Anon Key 안내가 없습니다.');
expect(!/service_role/i.test(index), 'index.html에 금지된 Supabase service role 문자열이 있습니다.');
expect(!/비밀코드/.test(index), 'index.html에 이전 비밀 문자열이 남아 있습니다.');
expect(/<urlset\b/i.test(sitemap), 'sitemap.xml 형식이 올바르지 않습니다.');
expect(/User-agent:\s*\*/i.test(robots) && /Allow:\s*\//i.test(robots), 'robots.txt 크롤링 정책이 없습니다.');
expect(Array.isArray(vercel.headers) && vercel.headers.length > 0, 'vercel.json 보안 헤더가 없습니다.');
expect(/connect-src[^;]*wss:\/\/\*\.supabase\.co/i.test(cspHeader), 'Supabase Realtime을 위해 CSP connect-src에 wss://*.supabase.co가 필요합니다.');
expect(/id="rematch-btn"/.test(index), '2P 게임 오버 화면에 한판 더하기 버튼이 필요합니다.');
expect(/id="rematch-panel"[^>]*hidden/.test(index) && /id="rematch-status"[^>]*aria-live="polite"/.test(index), '2P 재대결에는 안내와 라이브 상태를 가진 rematch 패널이 필요합니다.');
expect(/function setRematchStatus\(message, tone/.test(index), '재대결 대기·상대 준비·시작 상태를 갱신하는 함수가 필요합니다.');
expect(/let currentMatchId\s*=/.test(index) && /let gamePhase\s*=/.test(index), '재대결은 matchId와 gamePhase 상태를 관리해야 합니다.');
expect(/event:\s*'rematch_vote'/.test(index) && /event:\s*'rematch_start'/.test(index), '재대결에는 rematch_vote와 rematch_start Realtime 이벤트가 필요합니다.');
expect(/matchId:\s*currentMatchId/.test(index), '2P gameplay payload는 현재 matchId를 포함해야 합니다.');
expect(/if \(isMultiplayer\) \{[\s\S]*?랭킹 등록 완료[\s\S]*?return;/.test(saveRankingBody), '2P 랭킹 저장 후에는 페이지를 새로고침하지 않고 재대결 화면을 유지해야 합니다.');

if (failures.length) {
  console.error('Static validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Static validation passed: responsive UX, safe Supabase configuration, SEO baseline, and Vercel policy are present.');
