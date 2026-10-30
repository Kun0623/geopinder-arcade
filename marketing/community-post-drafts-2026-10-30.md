# GeoPinder 커뮤니티 게시 초안

아래 글은 자동 게시용이 아니라 운영자가 각 커뮤니티의 최신 규칙을 확인한 뒤 직접 수정해 게시하는 초안입니다. 루리웹 인디게임 PC 게시판에는 현재 `홍보 게시물 금지` 공지가 노출되어 있으므로, 규칙이 허용되지 않으면 게시하지 않고 개발일지 형식도 사용하지 않습니다.

## 초안 A — 루리웹용 개발일지·피드백 요청

### 제목

`[개발일지] 3D 지구본 지리 퀴즈를 만들면서 모바일 조작감을 계속 고치는 중입니다`

### 본문

안녕하세요. 세계 랜드마크 위치를 맞히는 웹게임 **GeoPinder Arcade**를 만들고 있습니다.

사진과 힌트를 보고 3D 지구본을 돌린 뒤, 실제 위치라고 생각하는 지점에 핀을 찍는 방식입니다. 정답과 가까울수록 높은 점수를 받고, 초급은 시간 제한 없이 플레이할 수 있으며 중급은 20초, 고급은 10초 제한이 있습니다. 친구에게 방 링크를 보내 실시간 2P 대결도 할 수 있습니다.

처음에는 지구본을 확대했을 때 텍스처가 흐려지는 문제가 있었습니다. 그래서 고해상도 텍스처와 기기별 텍스처 선택, 과도한 줌을 막는 상한을 적용했습니다. 모바일에서는 화면 아래 문제 카드와 상단 HUD가 겹치지 않도록 safe-area와 `100dvh` 기준으로 레이아웃도 다시 조정했습니다.

문제 사진은 출처와 라이선스를 확인할 수 있도록 관리하고, 사용자가 새로운 랜드마크 문제를 좌표와 사진으로 제보할 수 있게 만들었습니다.

아직 완성도를 높이는 단계라 다음 세 가지를 실제로 확인받고 싶습니다.

1. 모바일에서 지구본을 돌리고 핀을 찍는 조작이 자연스러운가요?
2. 10초 제한은 재미있는 긴장감인가요, 아니면 너무 짧은가요?
3. 랜드마크 사진과 힌트만 보고 위치를 추측하는 난이도가 적당한가요?

설치 없이 브라우저에서 플레이할 수 있습니다.

플레이 링크: https://geopinder-arcade.vercel.app/?utm_source=ruliweb&utm_medium=community&utm_campaign=devlog_20261030

홍보만 하려는 글이라기보다 실제 플레이 피드백을 받고 개선하려는 글입니다. 규정에 맞지 않는 내용이면 게시하지 않겠습니다.

### 게시 전 체크

- 게시판 최신 공지에서 홍보·개발일지 허용 여부 확인
- 허용되지 않으면 게시하지 않기
- 이미지 1~2장 또는 짧은 플레이 GIF만 첨부
- 댓글에서 반복적으로 링크를 남기지 않기

## 초안 B — 인디게임 커뮤니티용 소개 글

### 제목

`친구와 바로 할 수 있는 무료 3D 세계 랜드마크 퀴즈 게임을 만들었습니다`

### 본문

설치 없이 바로 플레이할 수 있는 웹게임 **GeoPinder Arcade**를 공개했습니다.

게임 방식은 간단합니다. 랜드마크 사진과 힌트를 보고 3D 지구본을 돌려 위치를 찍습니다. 실제 정답과의 거리가 가까울수록 높은 점수를 받습니다. 혼자 기록을 세울 수도 있고, 친구에게 2P 초대 링크를 보내 같은 문제를 풀며 대결할 수도 있습니다.

이번 버전에서 특히 신경 쓴 부분은 다음과 같습니다.

- 초급: 시간 제한 없음
- 중급: 20초 제한
- 고급: 10초 제한
- 모바일 safe-area와 100dvh 대응
- 과도한 지구본 확대 방지
- 8K·4K 텍스처 자동 선택
- Wikimedia Commons 등 이미지 출처·라이선스 표시
- 사용자가 좌표와 사진을 포함해 새 문제를 제보하는 기능

처음에는 모바일에서 지구본을 확대하면 이미지가 흐려지고, 문제 카드가 화면을 가리는 문제가 있었습니다. 실제 플레이를 반복하면서 줌 상한, 모바일 HUD, 로딩·이미지 오류 fallback을 차례로 보완했습니다.

플레이 링크: https://geopinder-arcade.vercel.app/?utm_source=indie-community&utm_medium=community&utm_campaign=launch_feedback_20261030

플레이해 보신 분은 아래 중 하나만 알려주셔도 큰 도움이 됩니다.

- 첫 화면에서 게임 방법이 바로 이해되는지
- 지구본에서 위치를 찍는 조작이 편한지
- 랜드마크 문제의 난이도가 적당한지
- 2P 초대 링크와 대결 흐름이 자연스러운지

단순 홍보보다 실제 피드백을 받아 계속 개선하는 것을 목표로 하고 있습니다.

## 초안 C — Reddit 개발자 커뮤니티용 영문 개발기

### Title

`I built a browser-based 3D geography quiz and fixed mobile globe zoom blur`

### Body

I’m building **GeoPinder Arcade**, a free browser game where players identify world landmarks from an image and hint, rotate a 3D globe, and place a guess. The score is based on the distance from the correct location. It also has real-time 2-player matches through an invite link.

One of the first problems was mobile texture blur. A player could zoom too far into the globe and the texture became visibly soft. I addressed it with a high-resolution texture fallback, device-aware texture selection, a conservative minimum camera distance, and a mobile pixel-ratio cap.

I also reworked the mobile HUD around `100dvh` and safe-area insets because the timer, score, and question card were competing for the same space. The game now has three difficulty modes: no timer, 20 seconds, and 10 seconds.

I would especially appreciate feedback on:

- Is the globe interaction understandable without a tutorial?
- Does the 10-second mode feel tense or frustrating?
- Is the landmark hint strong enough to make the round solvable?

Play link: https://geopinder-arcade.vercel.app/?utm_source=reddit&utm_medium=community&utm_campaign=devlog_20261030

This is a development and UX feedback post rather than a launch advertisement. I’ll share what I learn from the feedback in a follow-up post.

## 댓글 대응 초안

**플레이 방법을 묻는 경우**

> 랜드마크 사진과 힌트를 본 뒤 지구본을 드래그해 위치를 찾고, 지구본을 클릭해 핀을 찍으면 됩니다. 정답과 가까울수록 점수가 높아집니다.

**모바일 조작이 어렵다는 경우**

> 알려주셔서 감사합니다. 사용 기기와 브라우저를 함께 알려주시면 지구본 드래그·핀 선택·문제 카드 중 어느 부분이 어려운지 재현해 보겠습니다.

**홍보 글이라는 지적을 받는 경우**

> 맞습니다. 해당 게시판의 자기홍보 규정을 먼저 확인했어야 합니다. 규정에 맞지 않으면 글을 삭제하고, 허용되는 피드백 채널에서만 공유하겠습니다.

**이미지 출처를 묻는 경우**

> 게임 내 문제 이미지는 출처와 라이선스를 확인해 관리하고 있습니다. 각 이미지의 원본과 저작자 정보도 함께 기록하고 있으며, 권리 확인이 되지 않는 이미지는 사용하지 않는 것을 원칙으로 하고 있습니다.
