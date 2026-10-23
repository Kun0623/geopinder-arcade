# GeoPinder (Arcade Edition)

90년대 오락실의 네온과 CRT 스캔라인 감성을 입힌 웹 기반 3D 지리 퀴즈 게임입니다. Globe.gl 지구본에서 랜드마크의 위치를 선택하면 실제 위치와의 거리를 계산해 점수를 부여합니다. 1인 플레이, Supabase Realtime 기반 2인 대결, 글로벌 랭킹, 광고 대기 모달 UI를 포함합니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 프론트엔드 | HTML5, CSS3, Vanilla JavaScript |
| 3D 지구본 | [Globe.gl](https://globe.gl/) |
| 데이터·Realtime | [Supabase JS v2](https://supabase.com/docs/reference/javascript/introduction) |
| 폰트 | NeoDunggeunmo 웹폰트 |
| 배포 | Vercel Static Hosting |

## 아케이드 UX 특징

- `100dvh`와 iOS/Android safe-area를 함께 사용해 짧은 모바일 화면에서도 HUD와 하단 퀴즈 카드가 겹치지 않도록 구성했습니다.
- HUD, 퀴즈 패널, CRT 효과, 토스트, 모달을 독립적인 z-index 계층으로 분리했습니다.
- 키보드 포커스, `prefers-reduced-motion`, 터치 환경을 고려한 버튼 상태를 제공합니다.
- 모달은 `display` 토글이 아닌 opacity/visibility와 scale 전환을 사용해 자연스럽게 등장합니다.

## 로컬 실행

별도 패키지 설치나 빌드가 필요 없습니다.

```bash
python3 -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다.

정적 구조 검증은 다음 명령으로 실행합니다.

```bash
node scripts/validate-static-site.mjs
```

## Supabase 설정

1. `config.js`는 값이 비어 있는 채로 배포됩니다. 필요하면 `config.example.js`를 참고합니다.
2. `supabaseUrl`과 **Supabase Anon Key**만 입력합니다.
3. 실제 Anon Key를 포함한 `config.js`는 브라우저에서 공개되므로, Supabase의 `service_role` 키 또는 데이터베이스 비밀번호는 절대 브라우저 코드에 넣지 마세요.
4. Supabase에서 `geopinder_places`, `geopinder_rooms`, `geopinder_rankings` 테이블과 Realtime broadcast를 준비하고, 익명 사용자의 접근 범위에 맞는 RLS 정책을 설정합니다.

`geopinder_places` 레코드는 적어도 `img`, `hint`, `lat`, `lng` 필드를 가져야 하며, 한 게임을 위해 5개 이상의 문제가 필요합니다. `geopinder_rankings`는 `initials`, `score`를 사용합니다. 방 생성/조회 및 랭킹 입력을 공개할 경우에는 RLS에서 입력값 형식, 점수 조작, 오래된 방 정리 정책을 별도로 검토하세요.

> 순수 정적 Vercel 배포는 런타임 환경변수를 브라우저 JavaScript에 자동 주입하지 않습니다. Vercel의 환경변수만으로 Supabase 값을 클라이언트에 제공하려면 작은 빌드 주입 단계 또는 Serverless Function이 필요하며, 이는 ‘무빌드 정적 배포’ 제약과 양립하지 않습니다. 이 프로젝트는 값이 비어 있는 `config.js`로 안전하게 시작합니다. Anon Key는 공개 클라이언트 식별자이므로 RLS가 실제 보안 경계입니다.

## 배포

`vercel.json`은 빌드 명령 없이 정적 파일을 제공하고, 브라우저 기본 보안 헤더를 추가합니다. GitHub `main` 브랜치를 Vercel 프로젝트에 연결하면 이후 푸시마다 Production 배포가 갱신됩니다.

최초 배포에서 실제 Production URL이 확정된 다음 `index.html`의 canonical·Open Graph URL과 `sitemap.xml`의 `<loc>`을 그 URL로 고정해야 SEO 주소가 정확해집니다.

## StepPay 5,000원 단건 후원

게임의 `개발자 후원` 버튼은 이름·이메일·명시적 동의를 받은 뒤 같은 origin의 `POST /api/steppay/checkout`으로 요청합니다. Vercel Serverless Function은 StepPay 고객과 5,000원 단건 주문을 만들고, StepPay가 반환한 HTTPS 관리형 결제 페이지로만 연결합니다. 카드 정보는 게임 또는 Vercel 함수에서 수집·저장하지 않습니다.

Vercel Production 환경변수에 다음 **서버 전용** 값을 등록하세요. 실제 `STEPPAY_SECRET_TOKEN`은 GitHub, `config.js`, `index.html`, 브라우저 콘솔에 절대 넣지 마세요.

```text
STEPPAY_SECRET_TOKEN=<StepPay Secret-Token>
STEPPAY_PRODUCT_CODE=<product_...>
STEPPAY_PRICE_CODE_5000=<price_...>
```

`.env.example`에는 자리표시자만 있습니다. 설정 전 checkout endpoint는 의도적으로 `503`을 반환합니다. 배포 뒤 빈 JSON을 포함한 요청이 `400`으로 제어되는지 먼저 확인하고, StepPay 결제창이 실제로 열리는 테스트를 완료한 뒤에만 StepPay 상품을 미게시에서 판매중으로 변경하세요. 이 프로젝트는 후원 혜택을 부여하지 않으므로 반환 URL을 결제 성공 권한으로 신뢰하지 않습니다.

다음 테스트는 실제 StepPay를 호출하지 않고 고객·주문·결제 링크·동일 출처 검증 계약을 확인합니다.

```bash
node scripts/test-steppay-checkout.mjs
```

## 파일 구조

```text
.
├── index.html                    # 게임 UI, 스타일, 클라이언트 로직
├── config.js                     # 값이 비어 있는 기본 Supabase 공개 구성
├── config.example.js             # Supabase 공개 구성 예시
├── favicon.svg                   # GeoPinder 전용 파비콘
├── robots.txt / sitemap.xml      # 검색 노출 기본 파일
├── vercel.json                   # 정적 배포 및 보안 헤더
├── api/steppay/checkout.mjs       # 서버 전용 StepPay checkout endpoint
├── lib/steppay-checkout.mjs       # StepPay 요청·응답 검증 로직
├── .env.example                   # 서버 환경변수 자리표시자
└── scripts/validate-static-site.mjs
```

## 라이선스

별도 라이선스를 지정하지 않았습니다. 외부 CDN, Globe.gl, Supabase 및 사용한 지리 데이터의 각 라이선스와 이용 약관을 배포 전에 확인하세요.
