# GeoPinder 카메라·수익화 공식 조사 메모

## Globe.gl 시작 시점

Globe.gl의 [`pointOfView`](https://globe.gl/#render-control)는 `{ lat, lng, altitude }`로 카메라 시점을 지정한다. `altitude`는 지표면 위의 지구본 반지름 단위 고도이며, `0`은 표면에 가깝고 기본값은 약 `2.5`이다. `controls()`는 내부 OrbitControls를 반환하며 `minDistance`와 `maxDistance`는 카메라와 지구 중심 target 간 거리다. 따라서 altitude와 minDistance의 단위를 혼동하지 않아야 한다.

안전한 근접 시작은 `getGlobeRadius()`로 반지름을 읽고, `minDistance`를 반지름보다 크게 두며, `pointOfView(..., 0)`로 즉시 적용해야 한다. 너무 낮은 altitude는 지표 텍스처만 보여 세계 위치를 찾는 게임의 맥락을 잃고 near-plane/depth 문제가 생길 수 있다.

공식 근거:

- [Globe.gl Render Control](https://globe.gl/#render-control) — `pointOfView`, `controls`, `onZoom`
- [Globe.gl Utility](https://globe.gl/#utility) — `getGlobeRadius`, `getCoords`
- [Globe.gl 초기화 구현](https://raw.githubusercontent.com/vasturiano/globe.gl/master/src/globe.js) — 초기 POV 및 OrbitControls 경계 구현
- [Three.js OrbitControls](https://threejs.org/docs/examples/en/controls/OrbitControls.html) — `minDistance`, `maxDistance` 정의

## Google AdSense

일반 수동 AdSense display unit은 결과 modal/overlay나 강제 대기 화면에 넣지 않는다. AdSense 코드는 부적절한 팝업 위치에 둘 수 없으며, 게임 캔버스와 광고는 최소 150px 이상 떨어뜨리는 것이 강력 권고된다. 광고를 위해 화면을 자동 갱신하거나, 콘텐츠 전 강제 대기식 pre-roll로 노출하면 안 된다.

정적 사이트의 안전한 기본안은 실제 콘텐츠가 있는 일반 문서 위치의 responsive display unit이다. AdSense console에서 발급된 전역 loader와 unit code를 그대로 사용하고, 공개 Publisher Client(`ca-pub-…`)와 display slot ID만 구성 값으로 주입한다. 게임 전환 전면/보상 광고가 제품 목표라면 일반 `<ins>`가 아니라 승인된 H5 Games Ads의 `adBreak()` API를 사용해야 한다.

EEA, 영국, 스위스 방문자가 있는 경우에는 Google EU User Consent Policy에 따른 CMP/동의와 개인정보처리방침이 필요하다.

공식 근거:

- [Create a display ad unit](https://support.google.com/adsense/answer/9274025?hl=en)
- [Where to place AdSense code](https://support.google.com/adsense/answer/9274516?hl=en)
- [Ad placement policies](https://support.google.com/adsense/answer/1346295?hl=en)
- [Game play pages](https://support.google.com/adsense/answer/2768340?hl=en)
- [AdSense Program policies](https://support.google.com/adsense/answer/48182?hl=en)
- [Ads on screens without publisher-content](https://support.google.com/publisherpolicies/answer/11112688?hl=en)
- [H5 Games Ads](https://support.google.com/adsense/answer/9959170?hl=en-GB)
- [Google EU User Consent Policy](https://www.google.com/about/company/user-consent-policy.html)

## Hosted donation checkout

이 정적 Vercel 배포에는 결제 secret/API key 또는 카드 입력을 두지 않는다. 사용자가 선택한 결제 제공자가 발급한 HTTPS hosted checkout/payment link를 새 탭으로 여는 방식만 사용한다. 실제 링크와 제공자 선택이 있어야 라이브 결제 연결을 완성할 수 있다.
