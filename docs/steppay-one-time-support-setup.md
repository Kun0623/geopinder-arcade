# StepPay 단건 후원 설정 안내

GeoPinder Arcade의 후원 금액은 **5,000원 단건 결제**로 결정됐다. 게임은 사용자의 이름·이메일을 받은 뒤 Vercel 서버리스 API에 전달하고, API는 StepPay의 관리형 결제 페이지 URL을 발급한다. StepPay의 `Secret-Token`과 웹훅 검증 키는 브라우저·GitHub에 넣지 않고 Vercel의 암호화 환경변수에만 저장한다.

## StepPay 포털 준비

1. StepPay 포털에서 PG 연동을 완료한다. 관리형 결제는 사용 가능한 PG가 설정돼 있어야 실제 결제 URL을 만들 수 있다.
2. 상품 관리에서 `GeoPinder Arcade 5,000원 후원` 같은 단건 후원 상품을 만든다. 실물 배송이 없는 디지털/소프트웨어 성격의 상품으로 설정한다. 서버 연동과 제어된 checkout 테스트가 끝날 때까지는 **미게시**로 유지하고, 실제 판매 활성화는 별도 명시 승인 뒤에만 진행한다.
3. 이 상품에 `ONE_TIME` 유형의 5,000원 KRW 가격 플랜을 만든다. 세금, 환불, 판매자 정보 등 운영 정책은 사업자 설정에 맞춰 확인한다.
4. 상품의 `product_…` 코드와 5,000원 가격 플랜의 `price_…` 코드를 복사한다. 이 값들은 이후 서버의 주문 생성 payload에 사용된다.
5. 포털 설정의 인증키 관리에서 `Secret-Token`을 준비한다. 이 값은 Chat이나 GitHub에 보내지 않으며, Manus 보안 입력폼으로만 전달한 뒤 Vercel의 암호화 환경변수 `STEPPAY_SECRET_TOKEN`에 등록한다.
6. 선택적으로 웹훅 설정에서 검증 키를 준비한다. 주문 결과를 장기적으로 기록하거나 후원 혜택을 부여할 경우 Vercel 웹훅 endpoint에서 `Steppay-Signature`를 HMAC-SHA256으로 검증한다.

## 구현 범위

Vercel 서버리스 endpoint `POST /api/steppay/checkout`는 후원자의 이름과 이메일을 검증한 뒤 StepPay 고객을 만든다. 이어 `POST /api/v1/orders`로 단건 주문을 만들고, `GET /api/v1/orders/{orderCode}/pay`의 302 `Location`에서 관리형 결제 URL을 받아 브라우저에 돌려준다.

결제 완료 후 StepPay는 `successUrl`, `errorUrl`, `cancelUrl`로 리디렉션한다. 현재 게임은 후원에 따른 디지털 혜택을 부여하지 않으므로, 복귀 쿼리는 사용자 안내에만 사용하며 결제 성공을 권한으로 처리하지 않는다. 향후 후원 이력이나 혜택을 운영하려면 Vercel 웹훅 endpoint를 추가하고 `Steppay-Signature`와 주문의 `paymentDate`를 서버에서 검증해야 한다.

## Vercel 환경변수

Vercel Production에 아래 값을 **서버 전용 환경변수**로 설정한다. `.env.example`에는 자리표시자만 있으므로 실제 Secret-Token은 Chat이나 GitHub에 보내지 않는다.

- `STEPPAY_SECRET_TOKEN` — 비공개 입력폼에서만 전달
- `STEPPAY_PRODUCT_CODE` — StepPay의 `product_…` 상품 코드
- `STEPPAY_PRICE_CODE_5000` — StepPay의 5,000원 `price_…` 가격 플랜 코드
- 선택: `STEPPAY_WEBHOOK_SIGNING_KEY` — 후원 혜택/이력 기능을 추가할 때만 사용

## 공식 근거

- [StepPay 인증 가이드](https://docs.steppay.kr/docs/01_%EC%9D%B8%EC%A6%9D) — V1 API가 `Secret-Token` 헤더를 사용하며, 프론트엔드 노출 대신 백엔드 연동을 권장한다.
- [StepPay 주문 가이드](https://docs.steppay.kr/docs/05_%EC%A3%BC%EB%AC%B8) — 단건 주문은 `ONE_TIME`이며 주문 생성에 고객 정보와 상품·가격 플랜이 필요하다.
- [StepPay 관리형 결제 가이드](https://docs.steppay.kr/docs/07-1_Managed_%EA%B2%B0%EC%A0%9C) — 주문 코드로 결제 URL을 만들고 success/error/cancel URL로 결과를 되돌리는 흐름을 설명한다.
- [StepPay 웹훅 서명 검증](https://docs.steppay.kr/docs/08-1-3_Signature) — `Steppay-Signature`와 원문 payload를 HMAC-SHA256으로 검증하는 방법을 설명한다.
