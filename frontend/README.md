<p align="center">
  <img src="public/logo-symbol.png" alt="방방봐 로고" width="140" />
</p>

<h1 align="center">방방봐 — 방을 방송으로 봐</h1>

<p align="center">
  공인중개사와 실시간 화상으로 매물을 확인하고,<br />
  체크리스트와 AI 리포트로 기록을 남기는 비대면 부동산 투어 서비스
</p>

---

## 왜 만들었나

- 매물 한 번 보러 **왕복 4시간**
- **사진과 다른 실물**
- 뭘 확인해야 할지 모르는 **첫 계약**

이 세 가지 불편에서 시작했습니다. 방방봐는 **예약 → 라이브 투어 → 체크리스트 → 리포트** 네 단계로 집 보는 방식을 바꿉니다.

## 주요 화면

| 페이지                        | 설명                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| 랜딩 (`/`)                    | 히어로 쇼케이스(매물 카드 → 스크롤 시 투어 영상 재생), Bento 기능 소개, 이용 흐름 타임라인 |
| 매물 목록 (`/properties`)     | 검색·지역·가격·유형 필터, 매물 카드 그리드, 저장(찜) 토글                                  |
| 매물 상세 (`/properties/:id`) | 매물 정보, 저장·회의 예약 요청, 메모 작성·수정·삭제                                        |
| 로그인 (`/login`)             | 카카오·구글 소셜 로그인 (OAuth 연동 전 스텁)                                               |

## 기술 스택

- **React 19 + Vite + TypeScript** — SPA, react-router-dom
- **Tailwind CSS v4 + shadcn/ui** — CSS 변수 기반 디자인 토큰
- **테마** — 라이트(화이트) 기본 + 다크(slate) 토글, 시스템 선호 자동 감지
- **폰트** — IBM Plex Sans KR (Google Fonts)

## 시작하기

```bash
pnpm install
pnpm dev      # 개발 서버
pnpm build    # 프로덕션 빌드 (tsc -b && vite build)
```

## 프로젝트 구조

```
src/
├── pages/          # 랜딩·목록·상세·로그인
├── components/     # GlobalNav, PropertyCard, PropertyFilterBar + shadcn/ui
├── context/        # AuthContext(인증 스텁)
├── data/           # 매물 목데이터 15건
└── lib/            # 가격·평수 포맷 유틸
docs/frontend-spec.md   # 기능 명세서
design.pen              # Pencil 디자인 파일 (라이트 시안, 컴포넌트 보드)
```

## 디자인 원칙

- primary **블루 단일 포인트 컬러** (신뢰 톤), 텍스트·서피스는 slate 계열
- 섹션마다 다른 레이아웃 패턴 (3등분 균일 카드 지양 — Bento·타임라인·인라인 스트립)
- 아이콘은 lucide-react, 그림자는 shadow-sm (히어로 틴티드 섀도우만 예외)
- 상세 규칙은 [CLAUDE.md](CLAUDE.md) 참고

> 디자인 시안은 `design.pen`(Pencil)으로 관리합니다. 라이트/다크(zinc·slate) 3개 테마 버전이 들어 있으며, 최근 코드 변경분(히어로 영상, 로고)은 추후 동기화 예정입니다.
