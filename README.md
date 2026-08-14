<p align="center">
  <img src="public/logo-symbol.png" alt="방방봐 로고" width="120" />
</p>

<h1 align="center">🏠 방방봐 (bangbangbwa)</h1>

<p align="center">
  <b>방을 방송으로 봐</b> — 공인중개사와 실시간 화상으로 매물을 확인하고,<br />
  체크리스트와 AI 하자 리포트로 기록을 남기는 비대면 부동산 투어 서비스
</p>

---

> **매물 한 번 보러 왕복 4시간, 사진과 다른 실물, 뭘 확인해야 할지 모르는 첫 계약.**
> 방방봐는 집 보는 방식을 "예약 → 라이브 투어 → 체크리스트 → AI 리포트" 네 단계로 바꿉니다.

## 📋 목차

- [프로젝트 개요](#-프로젝트-개요)
- [주요 기능](#-주요-기능)
- [서비스 화면](#-서비스-화면)
- [시스템 아키텍처](#-시스템-아키텍처)
- [핵심 기술](#-핵심-기술)
- [기술 스택](#-기술-스택)
- [개발 가이드](#-개발-가이드)
- [실행 방법](#-실행-방법)
- [팀 소개](#-팀-소개)

## 📌 프로젝트 개요

### 문제 정의

자취방 구하기의 3대 페인포인트에서 시작했습니다.

1. **왕복 4시간 발품** — 매물 하나 보려고 반나절을 씁니다
2. **사진과 다른 실물** — 도착해 보면 사진이 좋았을 뿐입니다
3. **처음 해보는 계약** — 곰팡이·수압·채광, 뭘 확인해야 할지 모릅니다

### 해결 방향

> "직접 가지 않아도, 놓치는 것 없이, 기록이 남게 집을 볼 수 있다면?"

```
예약 ──▶ 라이브 투어 ──▶ 체크리스트 ──▶ AI 하자 리포트
        (WebRTC 화상)     (실시간 기록)    (곰팡이 등 자동 탐지)
```

1. **예약**: 마음에 드는 매물에 라이브 투어를 예약
2. **라이브 투어**: 공인중개사와 1:1 WebRTC 화상으로 매물을 실시간 확인
3. **체크리스트**: 투어 중 확인 항목을 그 자리에서 기록
4. **AI 리포트**: 투어 영상 프레임을 AI가 분석해 곰팡이 등 하자를 탐지한 리포트 제공

### 프로젝트 정보

| 항목 | 내용 |
| --- | --- |
| 기간 | 2026.07 ~ 2026.08 (약 4주) |
| 팀 구성 | 6인 — FE 3 · BE 3 · AI 2 · 인프라 1 (겸임 포함) |
| 저장소 구조 | `frontend/` React SPA · `backend/` Spring Boot · `infra/` coturn 등 인프라 설정 |

## ✨ 주요 기능

1. **매물 탐색**: 검색 · 지역 · 가격 · 유형 필터, Kakao 지도 뷰(마커 클러스터링 · 커스텀 마커 9종 · 주변 편의시설), 저장(찜)
2. **라이브 투어 예약**: 매물 상세에서 원하는 시간에 투어 예약, 예약 현황 관리
3. **WebRTC 라이브 투어**: 공인중개사 ↔ 세입자 1:1 실시간 화상 연결, TURN 중계로 셀룰러·사내망에서도 연결 보장
4. **실시간 체크리스트**: 투어 중 확인 항목을 기록, 백엔드 API 연동으로 세션별 저장
5. **AI 하자 리포트**: 라이브 중 "곰팡이 의심 N건 감지" 실시간 배지, 종료 후 캡처 이미지 + 하자 유형 배지가 담긴 분석 리포트
6. **소셜 로그인 · 관리자**: 카카오 · 구글 OAuth2 로그인, 중개인 인증 심사 관리자 페이지

## 🖥 서비스 화면

<p align="center">
  <img src="public/img-webRTC.png" alt="WebRTC 라이브 투어 화면" width="720" />
</p>
<p align="center"><i>공인중개사와 1:1 화상으로 매물을 확인하는 라이브 투어</i></p>

| 화면 | 설명 |
| --- | --- |
| 랜딩 (`/`) | 히어로 쇼케이스(매물 카드 → 스크롤 시 투어 영상 재생), 풀페이지 스냅 + 섹션 도트 내비게이션 |
| 매물 목록 (`/properties`) | 검색 · 필터, 매물 카드 그리드, 지도 뷰(클러스터링 · 편의시설), 저장 토글 |
| 매물 상세 (`/properties/:id`) | 사진 캐러셀, 매물 정보, 주변 편의시설(지하철 · 편의점 · 빨래방), 라이브 투어 예약 |
| 라이브 투어 | WebRTC 실시간 화상, 체크리스트 기록, AI 하자 실시간 감지 배지 |
| 리포트 | 체크리스트 + AI 하자 탐지 결과(캡처 이미지 · 하자 유형)를 담은 투어 리포트 |

<!-- 랜딩 · 매물 목록 · 상세 · 체크리스트 · 리포트 스크린샷을 여기에 추가하세요 -->

## 🏗 시스템 아키텍처

```
클라이언트 (React SPA)
    │  HTTPS
    ▼
Nginx (TLS 종료 · Reverse Proxy, AWS EC2)
    ├── /        →  React 정적 파일 (Docker, 127.0.0.1:3000)
    └── /api/**  →  Spring Boot
                      ├── PostgreSQL / H2 (JPA)
                      ├── OAuth2 (카카오 · 구글)
                      └── WebSocket 시그널링 (OFFER / ANSWER / ICE_CANDIDATE)

중개사 ◀──── WebRTC P2P (영상 · 음성) ────▶ 세입자
    │             └─ P2P 불가 구간은 coturn TURN 중계
    │                (3478/udp·tcp, relay 49160-49200/udp, host 네트워크 모드)
    │
    └── 프레임 캡처 (1fps · 긴 변 960px · JPEG)
          ▼
        AI 하자 탐지 서버 (RunPod GPU + ngrok, YOLO 계열)
          └── bbox · 신뢰도 · 하자 유형(MOLD 등) 응답 → 리포트 생성
```

## 🧠 핵심 기술

### 1. WebRTC 라이브 투어 — "특정 네트워크에서 연결이 안 된다" (TURN 도입)

STUN만으로는 대칭 NAT · 방화벽 환경(셀룰러, 사내망)에서 P2P 경로를 뚫을 수 없어, coturn 4.6을 도커로 EC2에 올려 TURN 중계를 도입했습니다.

- relay 포트 범위(49160~49200/udp)를 도커 NAT로 매핑하면 성능이 떨어져 **coturn만 `network_mode: host`로 실행**
- TURN 서버가 VPC 내부 공격 통로가 되지 않도록 **내부 IP 대역 5종을 `denied-peer-ip`로 차단**, 세션당 대역폭 1.5Mbps 상한
- EC2 공인/사설 IP를 자동 감지해 `external-ip=`를 채우는 `setup.sh` — 인스턴스가 바뀌어도 재사용 가능
- 시그널링 2계통: 운영은 Spring WebSocket, 로컬 개발은 **Vite 플러그인으로 만든 미니 시그널링 서버** — 백엔드 없이도 프론트 개발 가능
- 상대 재입장 시 `RTCPeerConnection` 재생성, remoteDescription 설정 전 도착한 ICE 후보는 보관 후 flush

### 2. AI 하자 탐지 프레임 파이프라인 — "몇 프레임을, 어떤 해상도로 보낼 것인가"

AI 서버 담당자와 협의해 전송 기준을 확정했습니다.

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 전송 주기 | 1초당 1프레임 | 하자는 정적 대상 — 고fps 불필요, 서버 부하 최소화 |
| 해상도 | 긴 변 960px 다운스케일 | AI 모델 입력 크기에 맞춤 — 이상은 낭비, 이하는 정확도 손실 |
| 포맷 | JPEG 품질 0.85 | 용량 대비 화질 균형 |
| 캡처 위치 | **중개사(송출) 쪽에서만 캡처** | WebRTC 코덱 압축을 거치기 전 원본 화질 확보 |

- AI 입력 960px를 보장하기 위해 카메라는 `getUserMedia`로 1080p를 요청
- 이전 프레임 요청이 안 끝났으면 다음 프레임 스킵 — 느린 네트워크에서 요청이 밀려 쌓이는 것을 방지

### 3. Kakao 지도 — 겹치고 어긋나는 마커 풀기

- 동(洞) 단위 지오코딩으로 핀이 동 중심에 몰리던 구조를 **지도 핀 전용 API의 실좌표 기반**으로 전환, 좌표 없는 매물만 지오코딩 폴백
- 같은 건물 매물들이 한 점에 겹치는 문제는 **황금각(2.4 rad) 나선 분산**으로 해소 — 경도 이동량은 `cos(위도)` 보정
- 편의시설은 카테고리 코드 검색(지하철 `SW8` · 편의점 `CS2`), 코드가 없는 셀프빨래방은 키워드 검색으로 우회
- 지오코딩 결과를 모듈 레벨 캐시에 저장하고 실패 건만 재시도 허용 — API 쿼터 절약

### 4. OAuth2 소셜 로그인 — 리다이렉트 URI를 하드코딩하지 않는다

환경(로컬 포트 · 배포 도메인)마다 리다이렉트 URI 불일치로 에러가 반복되던 문제를, redirect_uri를 **`window.location.origin` 기반으로 런타임에 조립**하는 구조로 바꿔 원천 제거했습니다. OAuth 복귀 시 SPA 라우터 state 유실은 `sessionStorage` 복원으로, React StrictMode의 인가 코드 이중 사용은 ref 가드로 해결했습니다.

## 🛠 기술 스택

<p align="center">
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/TanStack_Query_5-FF4154?style=for-the-badge&logo=reactquery&logoColor=white" />
  <img src="https://img.shields.io/badge/Zustand-433E38?style=for-the-badge" />
  <br />
  <img src="https://img.shields.io/badge/Java_21-007396?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Spring_Boot-6DB33F?style=for-the-badge&logo=springboot&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white" />
  <img src="https://img.shields.io/badge/coturn-E95420?style=for-the-badge" />
  <br />
  <img src="https://img.shields.io/badge/AWS_EC2-FF9900?style=for-the-badge&logo=amazonec2&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=nginx&logoColor=white" />
  <img src="https://img.shields.io/badge/GitLab-FC6D26?style=for-the-badge&logo=gitlab&logoColor=white" />
  <img src="https://img.shields.io/badge/Jira-0052CC?style=for-the-badge&logo=jira&logoColor=white" />
  <img src="https://img.shields.io/badge/Figma-F24E1E?style=for-the-badge&logo=figma&logoColor=white" />
</p>

<details>
<summary><b>Frontend</b></summary>

- React 19 · TypeScript · Vite
- Tailwind CSS v4 · shadcn/ui · framer-motion · Swiper
- TanStack Query 5 (서버 상태) · Zustand (클라이언트 상태) · react-router 7
- WebRTC (브라우저 기본 API) · Kakao Maps API

</details>

<details>
<summary><b>Backend</b></summary>

- Java 21 · Spring Boot (Spring Security · OAuth2 · JPA)
- PostgreSQL / H2
- WebSocket 시그널링 서버

</details>

<details>
<summary><b>AI</b></summary>

- YOLO 계열 하자 탐지 모델 (곰팡이 · 벽지 손상)
- RunPod GPU 환경 + ngrok 터널

</details>

<details>
<summary><b>Infra</b></summary>

- AWS EC2 (Ubuntu) · Docker · docker compose
- Nginx (TLS 종료 · 리버스 프록시 · SPA 폴백)
- coturn 4.6 (TURN)

</details>

## 💻 개발 가이드

### 브랜치 전략

```
master (배포 · 제출)
  └── frontend / backend (파트 통합)
        ├── feat/*, feature/*   기능 개발
        └── fix/*               버그 수정
```

### 커밋 컨벤션

| 타입 | 설명 |
| --- | --- |
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 구조 개선 |
| `docs` | 문서 수정 |
| `chore` | 설정 · 빌드 등 기타 작업 |

### AI 협업 하네스

AI 생성 코드의 품질을 팀 차원에서 관리하기 위해 규칙 체계를 두었습니다.

- 규칙의 단일 진실 공급원은 `frontend/AGENTS.md` 하나 — `CLAUDE.md`는 `@AGENTS.md` 임포트 한 줄로 문서 불일치를 차단
- `frontend/.agents/rules/` 7종이 파일 경로(glob)별로 적용 — 상태 관리 · API 계층 · TypeScript · 접근성 · 보안 규칙
- "`pnpm lint` · `pnpm build`를 실제 실행할 것, 실행 못 했으면 성공이라 말하지 말 것" 등 AI의 거짓 보고를 막는 완료 조건 명시
- 외부 스킬은 `skills-lock.json`으로 출처 · 리비전 고정

## 🚀 실행 방법

### Frontend

```bash
git clone https://github.com/dfizae/bangbangbwa-service.git
cd bangbangbwa-service/frontend

# 환경 변수 설정 (.env.example 참고 — Kakao 키, TURN 계정 등)
cp .env.example .env

pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # 프로덕션 빌드
```

### Backend

```bash
cd bangbangbwa-service/backend
./gradlew bootRun
```

### TURN 서버 (배포 환경)

```bash
# EC2 공인/사설 IP를 감지해 turnserver.conf의 external-ip를 채움
bash infra/coturn/setup.sh

# 프론트 웹 + coturn 기동
cd frontend && docker compose up -d
```

> 이 저장소의 TURN 계정 등 시크릿 값은 플레이스홀더(`YOUR_TURN_CREDENTIAL` 등)로 치환되어 있습니다. `infra/coturn/turnserver.conf`의 `user=`와 `frontend/.env`의 TURN 계정은 반드시 같은 값으로 채워야 합니다. AI 하자 탐지는 별도 AI 서버가 함께 구동되어야 동작합니다.

## 👥 팀 소개

| 파트 | 팀원 |
| --- | --- |
| FE | 김재영([@dfizae](https://github.com/dfizae)), 박xx, 황xx |
| BE | 서xx, 윤xx, 최xx |
| AI | 박xx, 최xx |
| 인프라 | 황xx |

도움받은 자료들:

- [shadcn/ui](https://ui.shadcn.com/) — UI 컴포넌트
- [WebRTC samples](https://webrtc.github.io/samples/) — WebRTC 연결 · TURN 동작 테스트
- [Kakao Developers](https://developers.kakao.com/) — 소셜 로그인 · 지도 API
