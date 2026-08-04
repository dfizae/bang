# 라이브 점검 화면(PAGE-12) 개선

대상: `/reservation/:slug`
브랜치: `feature/15-live` (기준 커밋 `80317db`)
최종 수정: 2026-07-22

1~6단계 완료. **B(브릿지)만 남았고, D는 결정 대기.**

---

# 여기서부터

## 0. 먼저 — 변경이 아직 커밋 안 됐다

```
M  src/App.tsx
M  src/components/ReservationChecklist.tsx
M  src/index.css
M  src/pages/ReservationLivePage.tsx
D  src/hooks/useSessionMemos.ts
?? src/hooks/useVideoAspect.ts
?? src/hooks/useSessionCaptures.ts
?? docs/live-session-redesign.md
```

`tsc --noEmit` · `eslint` · `prettier --check` 모두 통과 상태.

## 1. 남은 결정

|       | 항목                     | 막고 있는 것                                     | 누가 정하나    |
| ----- | ------------------------ | ------------------------------------------------ | -------------- |
| **B** | "지금 확인 중" 브릿지    | 시그널링 계약 변경 → **팀 협의 필요**            | 백엔드와 합의  |
| **D** | 체크리스트 공간별 그룹핑 | `ChecklistItem` 타입 + localStorage 마이그레이션 | 공간 목록 확정 |

**C(캡처)는 4단계에서 완료**했다. 다만 **저장 위치는 여전히 TBD** — 지금은 세션 동안만 objectURL로 들고 있고 페이지를 떠나면 사라진다. REPORT-01의 입력이 되려면 서버 업로드가 필요하다.

**B의 자리**: 중개사 패널을 제거했으므로(4단계) 브릿지를 넣을 때 데스크톱 컬럼을 다시 살려야 한다. `showPanel` 한 곳만 고치면 된다.

## 2. 결정과 무관하게 지금 할 수 있는 것

우선순위 순. 전부 독립적이라 아무거나 집어도 된다.

1. **전면·후면 카메라 전환** — 명세 "회의 화면 기능"에 있는데 미구현. `getUserMedia({video:{facingMode}})` 재취득 + `RTCRtpSender.replaceTrack()`. 모바일 중개사에게 가장 아쉬운 누락.
2. **`reservation.time` 표시** — 후보 시간 다건(`"10:00, 13:00, 16:00"`)이 그대로 나온다. 라이브 세션엔 확정된 단일 시각이 필요 — 데이터 모델부터 확인할 것.
3. **세션 코드** — 헤더에서 제거했다(잘려서 읽지도 복사하지도 못하는 상태였음). 세션 참여에 코드 공유 흐름이 있다면 복사 가능한 형태로 되살릴 것.
4. **`authStore` 영속화** — 새로고침하면 역할이 풀려 세입자 레이아웃으로 떨어진다. 배포 전 세션 유지 방식 확정 필요.

---

# 결정 상세

## B. "지금 확인 중" 브릿지

체크리스트에서 **한 항목만 활성** 상태가 되고, 세입자가 항목을 선택하면 중개사 주 화면 상단에 그 한 줄이 뜬다. 중개사는 그걸 보고 카메라를 겨눈다. 캡처·메모·AI 하자 감지 결과가 모두 활성 항목에 귀속된다.

- **왜**: 지금 영상과 체크리스트는 한 페이지에 놓인 남남이다. 이걸 묶으면 중개사에게 체크리스트가 처음으로 쓸모 있어지고, REPORT-01의 입력이 자동으로 쌓인다.
- **구현**: `/signal` WebSocket의 `SignalMessage` 타입에 `active-item` 추가.
- **자리는 이미 비어 있다**: 3단계에서 레이아웃 분기만 넣었으므로 그 위에 얹으면 된다. 중개사 데스크톱 패널이 현재 메모만 있어 370px 컬럼이 비어 보이는데, 거기가 "세입자가 확인 중인 항목"이 들어갈 자리다.
- **결정 필요**: 백엔드 계약 변경 협의 필요 여부, 담당·일정 — **TBD**.

## C. 캡처(RTC-05) — 4단계에서 완료

남은 것은 **저장 위치뿐**. 아래 "4단계" 참조.

## D. 체크리스트 공간별 그룹핑

- 명세 PAGE-13은 "공간별 점검 항목 관리"인데 현재는 평면 리스트.
- **변경 범위**: `types.ts`의 `ChecklistItem`에 공간 필드 추가 → `useReservationChecklist`의 저장 포맷 변경 → **기존 localStorage 데이터 마이그레이션** 필요.
- **결정 필요**: 이번에 함께 갈지 / 평면 유지할지, 공간 목록(현관·거실·주방·욕실·침실 등) 확정본 — **TBD**.

---

# 지금까지 한 것

## 근본 원인

이 화면은 **대칭적인 화상통화 UI**로 설계돼 있었으나, 두 참여자는 대칭이 아니다.

|        | 중개사                    | 세입자                         |
| ------ | ------------------------- | ------------------------------ |
| 위치   | 현장, 폰을 들고 이동      | 집, 주로 PC                    |
| 역할   | 카메라를 겨눈다           | 판단한다                       |
| 필요   | 큰 뷰파인더, 전·후면 전환 | 큰 상대 영상, 체크리스트, 캡처 |
| 불필요 | 체크리스트 패널           | 자기 얼굴                      |

관측된 UI 문제 대부분이 여기서 파생됐다.

## 1단계 — 즉시 수정 6건

| #   | 내용                                                                                                            | 위치                       |
| --- | --------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | 체크리스트 입력 `maxLength` 16 → 60 ("등기부등본 근저당 확인"이 12자라 실질적으로 못 쓰는 상태였음)             | `ReservationChecklist.tsx` |
| 2   | 항목 텍스트 `break-words`. 전역 `word-break: keep-all` + 띄어쓰기 없는 긴 문자열이 삭제 버튼을 뚫고 나가던 문제 | `ReservationChecklist.tsx` |
| 3   | 꺼진 마이크·카메라의 `bg-destructive` 제거 → 빨강은 통화 종료 전용으로 회수                                     | `ControlButton`            |
| 4   | 나가기 확인 다이얼로그 (이전엔 클릭 즉시 `navigate`)                                                            | `ReservationLivePage.tsx`  |
| 5   | 막힌 상태에 복구 버튼. `attempt` 카운터를 연결 effect 의존성에 추가해 재연결 구현                               | `ReservationLivePage.tsx`  |
| 6   | 상태 배지에 `role="status" aria-live="polite"`                                                                  | `ReservationLivePage.tsx`  |

## 2단계 — 영상 우선 레이아웃

**실측 결과** (실제 1:1 연결, 양쪽 640×480 스트림. before는 `git stash`로 `80317db` 복원 후 동일 방법 측정)

| 데스크톱 1440×731    | before                        | after                           |
| -------------------- | ----------------------------- | ------------------------------- |
| 영상 표시 면적       | 633×475 = 300,833px²          | 761×571 = **434,715px²** (+44%) |
| 타일 내 검은 여백    | 23.9%                         | **0%**                          |
| 패널 / 스테이지 높이 | 230–340 / 569 (컬럼 339px 빔) | **597 / 597** (빈 공간 0)       |
| 페이지 세로 오버플로 | 8px                           | **0**                           |

| 모바일 390×844    | before              | after                            |
| ----------------- | ------------------- | -------------------------------- |
| 영상 표시 면적    | 238×178 = 42,394px² | 375×281 = **105,469px²** (+149%) |
| 타일 내 검은 여백 | 25%                 | **0%**                           |

**변경 내용**

1. **nav 높이 토큰화** — `index.css :root`에 `--nav-h: calc(3.5rem + 1px)`. 기존 `calc(100svh-3.5rem)`가 실제 nav 높이(57px = `h-14` + `border-b`)와 어긋나 8px 오버플로를 만들고 있었다.
2. **타일이 스트림 비율을 따라간다** — `useVideoAspect` 훅(신규). 기존 `lg:h-[calc(100svh-16rem)]`는 **높이를 고정**해 타일 비율이 창 높이의 함수가 됐다. 같은 코드·같은 스트림에서 창 높이 900px일 때 낭비 3.1%, 731px일 때 23.9%로 요동쳤다.
3. **컨트롤을 영상 위로** — 별도 56px 바 제거, 스크림과 함께 오버레이.
4. **스테이지 full-bleed** — 모바일 `absolute inset-0`, 데스크톱 그리드 셀. 카드 껍데기 제거.
5. **모바일 바텀시트** — 접힘 48px ↔ 펼침 65%.
6. **탭 제거, 세로 스택** — 데스크톱 컬럼이 339px 비어 있었다. 공간이 부족해서 탭으로 나눈 게 아니었다.
7. **PiP를 영상 모서리에 고정** — 기존엔 스테이지 기준이라 영상이 작아지면 검은 여백 위에 떠 있었다.
8. **나가기 톤 조정** — 화면에서 가장 큰 요소였던 것을 어두운 ghost 필로. 아이콘만 두니 찾을 수 없어 라벨은 유지하고 hover에서만 빨강.
9. **헤더 축소** — 2줄 → 1줄.

## 3단계 — 역할 분기

**큰 타일에 올릴 스트림이 서로 반대다.** 기존엔 양쪽 모두 상대 영상이 크게 나와서, 중개사는 벽을 비추려는 순간에 세입자 얼굴을 크게 보고 있었다.

|        | 주 화면                           | PiP         | 패널              |
| ------ | --------------------------------- | ----------- | ----------------- |
| 중개사 | 내 카메라 (`내 카메라 (송출 중)`) | 세입자      | 메모만            |
| 세입자 | 중개사 영상                       | 나 (세입자) | 체크리스트 + 메모 |

- 오디오는 `muted`를 타일이 아니라 **스트림 기준**으로 붙였다. 어느 쪽이 큰 타일에 오든 내 화면은 항상 muted, 상대는 항상 unmuted.
- **명세 위반 수정**: 명세 "사용자 권한"에 체크리스트는 **중개사 불가**인데 기존 코드는 보여주고 편집까지 허용했다. `SessionPanels`의 `showChecklist`로 분기.
- **복구 오버레이를 타일 → 스테이지로**: `StageRecoveryOverlay`. 나가기는 컨트롤 바에 항상 있으므로(`z-20`) 오버레이엔 복구 동작 하나만 남겼다.

**역할별 실측 검증**

|                      | 중개사                         | 세입자                 |
| -------------------- | ------------------------------ | ---------------------- |
| 주 화면 라벨 / muted | `내 카메라 (송출 중)` / `true` | `중개사` / `false`     |
| PiP 라벨 / muted     | `세입자` / `false`             | `나 (세입자)` / `true` |
| 체크리스트           | 없음 (명세대로)                | 있음                   |
| 모바일 시트 peek     | 메모 개수만                    | 체크 + 메모 개수       |

## 4단계 — 세션 메모 제거 + 캡처(RTC-05)

### 세션 메모 제거

명세의 MEMO-01~04는 **매물 메모(PAGE-05 매물 상세)**이고, 라이브 세션 메모는 명세에 없던 추가분이었다. 빼는 쪽이 명세에 맞다. `PropertyDetailPage`의 매물 메모는 그대로 둔다.

- `src/hooks/useSessionMemos.ts` 삭제, `SessionMemoPanel`·`PanelSection`·`SessionPanels` 제거.
- localStorage의 기존 `bangbangbwa:session-memos` 키는 남지만 아무도 읽지 않는다. 정리 코드는 넣지 않았다.
- **중개사 패널이 완전히 비게 되어 패널 자체를 제거했다** — 체크리스트는 명세상 중개사 불가라 남는 게 없었다. `showPanel = !isBroker` 하나로 데스크톱 컬럼과 모바일 시트를 동시에 끈다.
- 세입자 패널은 체크리스트만 남아 `ChecklistPanel`로 단순화.

### 캡처

- `useSessionCaptures` 훅(신규) — `<video>` → `<canvas>` `drawImage` → `toBlob` → objectURL. 언마운트 시 일괄 `revokeObjectURL`.
- **주 화면(primary tile)을 캡처한다.** 중개사는 자기 카메라, 세입자는 중개사 영상 — 두 역할 모두 "지금 보고 있는 매물 화면"이 찍힌다.
- 캡처 버튼은 컨트롤 바의 **유일한 primary**. 스트립은 컨트롤 바 위에 가운데 정렬(`mx-auto w-fit`으로 넘칠 때 첫 항목이 잘리지 않게).
- 썸네일 클릭 → 원본 크기 미리보기 다이얼로그 → 삭제.
- 프레임이 없을 때(`videoWidth === 0`)는 빈 이미지를 만들지 않고 `role="alert"`로 알린다. `console.log` 대신 화면에 표시.
- 로딩·실패 상태는 `useActionState`로 처리(`<form action>`) — 프로젝트 규칙대로 `useState` 플래그를 새로 만들지 않았다. 진행 중에는 버튼이 비활성이라 중복 촬영이 안 된다.

### 실측 (측정 방법은 아래 하네스, 캔버스 스트림 640×480 주입)

| 항목                         | 중개사          | 세입자        |
| ---------------------------- | --------------- | ------------- |
| 데스크톱 1440×731 패널       | **없음**        | 370×597       |
| 데스크톱 스테이지 폭         | **1440 (full)** | 862           |
| 모바일 390×844 시트          | **없음**        | 49px (접힘)   |
| 모바일 컨트롤 바 하단 여백   | 16px            | 시트까지 15px |
| 세로/가로 오버플로 (양 크기) | **0 / 0**       | **0 / 0**     |

- 캡처 산출물: `image/png`, **640×480 = 스트림 원본 해상도**, 12.7KB. 표시 크기가 아니라 원본으로 저장된다.
- 삭제 시 objectURL이 실제로 revoke되는 것까지 확인(`fetch(url)` 실패).
- **1px 오버플로 수정**: 접힌 시트가 `h-12`(48px)인데 Card의 `border-top` 1px 때문에 내용 박스가 47px이라 peek 버튼이 1px 넘쳤다. `h-[calc(3rem+1px)]`로 맞춤 — `--nav-h`와 같은 이유, 같은 방식.
- **모바일 컨트롤/시트 겹침 수정**: 컨트롤 바 `pb-4`가 접힌 시트(48px) 아래에 깔려 있었다. 시트가 있을 때만 `pb-16`.

## 5단계 — GNB 이탈 보호 + 나가기 톤 되돌림

### GlobalNav 숨김

`useBlocker` 대신 **아예 노출하지 않는 쪽**을 골랐다. 링크가 없으면 막을 것도 없다.

- `App.tsx`에서 `matchPath("/reservation/:slug", location.pathname)`으로 분기. `startsWith("/reservation")`은 **`/reservations`(예약 목록)까지 잡아먹으므로 쓰지 않았다.**
- 이 화면을 벗어나는 길은 확인 다이얼로그가 붙은 나가기 버튼 하나뿐이 됐다.
- **높이 계산도 같이 바꿔야 한다**: nav가 없으니 `h-[calc(100svh-var(--nav-h))]` → `h-svh`. 안 바꾸면 57px이 그대로 남는다.
- `index.css`의 `--nav-h` 토큰은 이제 이 페이지가 안 쓴다. 다른 페이지의 GNB 높이는 여전히 57px이므로 토큰 자체는 유효해 남겨 뒀다. **쓰는 곳은 현재 없다.**

### 나가기 버튼

2단계에서 "화면에서 가장 큰 요소"라 어두운 ghost로 낮췄던 것을 **요청에 따라 `variant="destructive"`(실색 빨강)으로 되돌렸다.** 1단계에서 정한 "빨강은 통화 종료 전용" 규칙과는 어긋나지 않는다 — 빨강을 쓰는 유일한 컨트롤이 여전히 나가기다.

### 실측

| 경로                 | GNB      | main 상단 / 높이 | 세로·가로 오버플로 |
| -------------------- | -------- | ---------------- | ------------------ |
| `/reservation/:slug` | **없음** | 0 / 731 = 뷰포트 | **0 / 0**          |
| `/reservations`      | 있음     | 57 / —           | 정상 스크롤        |
| `/properties`        | 있음     | 57 / —           | 정상 스크롤        |

- 모바일 390×844도 동일: GNB 없음, `main` 0~844, 오버플로 0.
- 나가기 버튼 실측색 `rgb(231, 0, 11)` / 글자 흰색.

## 6단계 — 모바일 시트 높이 + 컨트롤 가림 수정

### 시트 높이를 내용 기준으로

펼침 높이가 `h-[65%]`(390×844에서 522px)라 화면의 3분의 2를 먹었다. **필요한 건 뷰포트 비율이 아니라 "항목 4개 + 입력창"이라는 내용량**이므로 고정 높이로 바꿨다.

실측한 부품 높이(390×844):

| 부품                    | 높이                 |
| ----------------------- | -------------------- |
| 제목 h2 + `mb-2`        | 28                   |
| 항목 4개 + 간격 3개     | 46×4 + 8×3 = **208** |
| 입력 폼 (`mt-3` + h-10) | 52                   |
| CardContent `pb-4`      | 16                   |
| peek 버튼 + 카드 테두리 | 49                   |
| **합계**                | **353**              |

→ `h-90`(360px). 여유 7px. **522 → 360px, 31% 축소**되고 영상이 보이는 높이는 281 → **443px**로 늘었다.

- 검증: 항목 4개일 때 `scrollHeight === clientHeight`(스크롤 없음), 입력창 아래 여백 23px. 5개째부터 스크롤(48px 넘침) — 의도대로다.
- 가로 모드처럼 낮은 화면에서는 360px이 과해지므로 `max-h-[70%]`로 막았다. 데스크톱은 `lg:max-h-none`으로 풀어야 패널이 컬럼을 꽉 채운다(안 풀면 70%에 걸린다).

### 시트가 컨트롤을 덮던 문제

**시트를 펼치면 마이크·카메라·캡처·나가기가 전부 클릭 불가였다.** 컨트롤은 스테이지 맨 아래 고정인데 시트가 그 위를 덮었다(둘 다 `z-20`, 시트가 DOM 뒤라 승리). `elementFromPoint`로 확인하니 전부 `LI`(체크리스트 항목)에 막혀 있었다. 2단계 바텀시트 도입 때부터 있던 문제이고, 65%일 때는 더 심했다.

- **여백(`pb-`)이 아니라 `bottom`을 옮겼다.** 여백으로 밀면 스크림(그라데이션) 박스가 같이 커져 영상 아래쪽을 크게 어둡게 덮는다. `bottom`을 옮기면 스크림 높이는 96px 그대로다.
- 시트 상태에 따라 `max-lg:bottom-12`(접힘 48px) / `max-lg:bottom-90`(펼침 360px). 중개사는 시트가 없으므로 기본 `bottom-0`.

| 상태          | 컨트롤 하단 | 시트 상단 | 간격 | 나가기 클릭 |
| ------------- | ----------- | --------- | ---- | ----------- |
| 펼침 (before) | 780         | 484       | -296 | **불가**    |
| 펼침 (after)  | 468         | 484       | 16   | **가능**    |
| 접힘 (after)  | 780         | 795       | 15   | 가능        |

- 데스크톱(1440×731) 양 역할, 중개사 모바일 모두 재확인 — 나가기 클릭 가능, 오버플로 0/0, 세입자 데스크톱 패널 654px로 컬럼 유지.

---

# 측정 하네스 (재현용)

작업 환경에서 브라우저 창을 임의 크기로 못 바꿔 `lg` 분기를 볼 수 없었다. **동일 오리진 iframe**으로 우회한다 — iframe에 크기를 주면 그 안에서 미디어 쿼리가 그 크기로 평가되므로 어떤 브레이크포인트든 렌더링할 수 있다. 같은 방에 숨은 피어 iframe을 하나 더 붙이면 **실제 1:1 연결 상태**가 된다.

dev 서버가 뜬 탭의 콘솔에 붙여넣고 `await mkProbe(1440, 731)` 형태로 호출한다. `provider`를 주면 로그인 스텁을 거쳐 역할까지 지정된다 (**카카오 = 세입자, 구글 = 중개사**).

```js
window.mkProbe = async function (W, H, provider) {
  document.getElementById("probe")?.remove();
  const room = "r" + Math.random().toString(36).slice(2, 8);
  const host = document.createElement("div");
  host.id = "probe";
  host.style.cssText = `position:fixed;top:0;left:0;z-index:2147483647;width:${W}px;height:${H}px;overflow:hidden;background:#000`;
  const mk = (src, w, h, hidden) => {
    const f = document.createElement("iframe");
    f.src = src;
    f.setAttribute("allow", "camera;microphone");
    f.style.cssText =
      `width:${w}px;height:${h}px;border:0;display:block;` +
      (hidden ? "position:absolute;left:-9999px;top:0;" : "");
    return f;
  };
  const peer = mk("/reservation/" + room, 400, 300, true);
  const main = mk(provider ? "/login" : "/reservation/" + room, W, H, false);
  host.appendChild(peer);
  host.appendChild(main);
  document.body.appendChild(host);
  await new Promise((r) => main.addEventListener("load", r, { once: true }));
  await new Promise((r) => setTimeout(r, 1200));
  const w = main.contentWindow;
  if (provider) {
    const label =
      provider === "kakao" ? "카카오로 시작하기" : "Google로 시작하기";
    [...main.contentDocument.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === label)
      .click();
    await new Promise((r) => setTimeout(r, 1200));
    // 새로고침하면 authStore가 날아가므로 SPA 라우팅으로 진입한다
    w.history.pushState({}, "", "/reservation/" + room);
    w.dispatchEvent(new PopStateEvent("popstate"));
  }
  await new Promise((r) => setTimeout(r, 6000));
  window.__probe = { room, main, peer };
  return room;
};

// 측정 — object-contain 하에서 실제로 보이는 영상 크기와 낭비 면적
window.measure = function () {
  const d = window.__probe.main.contentDocument;
  const R = (e) => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  };
  const v = d.querySelectorAll("video")[0];
  const tr = v.parentElement.getBoundingClientRect();
  const s = Math.min(tr.width / v.videoWidth, tr.height / v.videoHeight);
  return {
    status: d.querySelector('[role="status"]')?.textContent,
    tile: R(v.parentElement),
    video: {
      w: Math.round(v.videoWidth * s),
      h: Math.round(v.videoHeight * s),
    },
    wastedPct: +(
      100 -
      (100 * (v.videoWidth * s * v.videoHeight * s)) / (tr.width * tr.height)
    ).toFixed(1),
    panel: R(d.querySelector('[data-slot="card"]')),
    hOverflow: d.documentElement.scrollWidth - d.documentElement.clientWidth,
    vOverflow: d.documentElement.scrollHeight - d.documentElement.clientHeight,
  };
};

// 좁은 창에서 전체를 눈으로 보려면 축소
window.fitProbe = function () {
  const s =
    (innerHeight - 10) /
    Number(window.__probe.main.style.height.replace("px", ""));
  window.__probe.main.style.transformOrigin = "top left";
  window.__probe.main.style.transform = `scale(${s})`;
};

// 정리
window.clearProbe = function () {
  document.getElementById("probe")?.remove();
};
```

**`room-full` 상태를 만들려면**: 같은 방에 숨은 iframe 2개를 먼저 붙이고 4초쯤 뒤 세 번째(관찰용)를 붙인다.

**before/after 비교**: `git stash push src/pages/ReservationLivePage.tsx src/index.css` → 측정 → `git stash pop`. 추정하지 말고 항상 실측할 것.

---

# 검증 명령

```bash
npx tsc --noEmit
npx eslint src/pages/ReservationLivePage.tsx src/components/ReservationChecklist.tsx src/hooks/useVideoAspect.ts
npx prettier --check src/ docs/live-session-redesign.md
```

`src/api/auth.ts`의 TODO 경고 6건은 기존 항목이라 무시. `docs/api-guide.md`의 prettier 경고도 이번 작업과 무관한 기존 상태.

---

# 남은 측정 공백 — TBD

- **캡처 저장 위치 미정** — 지금은 세션 동안만 살아 있다. 나가면 사라진다는 것을 나가기 다이얼로그에 명시해 뒀지만, REPORT-01로 넘기려면 업로드가 필요하다.
- **하네스 실행 시 탭이 비활성(`visibilityState: "hidden"`)이었다.** 그 결과 (1) CSS 애니메이션 타임라인이 멈춰(`currentTime`이 0에서 고정) Radix 다이얼로그가 exit 애니메이션 종료를 못 받아 언마운트되지 않고, (2) `canvas.toBlob`이 간헐적으로 수백 ms 이상 지연된다. **둘 다 앱 버그가 아니라 측정 환경 문제다.** 다이얼로그 개폐 검증은 iframe에 `animation:none`을 주입해서 했다 — 보이는 창에서의 재확인은 **TBD**.
- **카메라 없는 환경이라 실제 웹캠 스트림 미검증** — 캔버스 `captureStream` 640×480을 `video.srcObject`에 물려 측정했다. 실제 `getUserMedia` 경로는 **TBD**.
- **모바일 실기기 미검증** — safe-area(노치·홈 인디케이터), 키보드 오픈 시 시트 레이아웃.
- **세로(9:16) 스트림 미검증** — 측정은 전부 4:3 웹캠 기준인데, 중개사가 폰을 세로로 드는 게 실사용 조건이다.
- 4:3 스트림을 세로 모바일에서 보면 스테이지에 약 465px의 어두운 여백이 남는다(타일 내부 여백은 0). 세로 스트림이면 거의 사라지는 값이라 실기기 확인 후 재평가.
