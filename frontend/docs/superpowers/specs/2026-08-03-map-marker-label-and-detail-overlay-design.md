# 지도 마커 이름 라벨과 상세 보기 오버레이 설계

작성일: 2026-08-03

## 배경

`/properties`(`src/pages/PropertyListPage.tsx`)는 지도가 화면 전체를 쓰고 검색·필터·결과 목록이 그 위에 얹히는 구조다. 지금은 두 가지가 아쉽다.

1. 지도의 핀은 거래 유형·방 종류를 색과 모양으로만 구분한다. 핀만 봐서는 그게 어떤 매물인지 알 수 없고, 목록과 지도를 번갈아 봐야 매칭이 된다.
2. 목록에서 매물을 클릭하면 곧바로 `/properties/:id`로 빠진다. 탐색 중이던 지도 맥락(어디를 보고 있었는지, 주변에 뭐가 있었는지)이 한 번에 사라진다.

핀에 이름을 붙여 지도만으로 매물을 식별할 수 있게 하고, 목록 클릭은 상세로 튀는 대신 그 매물로 지도를 좁혀준 뒤 사용자가 원할 때만 상세로 가도록 바꾼다.

## 현재 구조에서 알아야 할 것

- `PropertyMap`은 지도와 핀만 담당한다. 무엇이 선택됐는지는 페이지가 `MapSelection`으로 소유하고, 목록 패널이 같은 값을 함께 본다.
- 마커는 매물 목록이 바뀔 때마다 통째로 다시 그린다. 좌표는 `region + dong`을 지오코딩해 얻으므로 **비동기**이고, 같은 동의 매물은 `spreadOverlappingPosition`으로 좁은 반경에 흩어 놓는다.
- 클러스터러는 `minLevel: 6`, `disableClickZoom: true`로 동작한다. 레벨 6 이상에서 2개 이상 겹치는 핀은 하나의 원으로 묶인다.
- 마커 이미지는 42×48px이고 offset이 바닥 중앙이다. 즉 **좌표는 핀의 뾰족한 끝**이다.
- 하단 시트가 지도를 덮는 화면에서는 `panToAboveCenter`로 고른 핀을 시트 위쪽(`MARKER_FOCUS_TOP_RATIO = 0.32`)으로 끌어올린다.

## 결정 사항

브레인스토밍에서 확정한 값이다.

| 항목 | 결정 |
| --- | --- |
| 라벨 노출 | 항상 표시 (지도에 개별로 그려지는 핀 전부. 클러스터로 묶여 안 보이는 핀은 제외) |
| 상세 보기 버튼 노출 | 목록 클릭·핀 클릭 모두 |
| 목록 클릭 시 확대 수준 | 레벨 4 (동·거리 수준) |

## 설계

### 1. 마커 이름 라벨

마커마다 `kakao.maps.CustomOverlay`를 하나씩 만들어 핀 끝 아래에 이름 pill을 그린다.

- `position`은 마커와 같은 좌표, `yAnchor: 0` → 콘텐츠 위쪽이 좌표(=핀 끝)에 붙는다. 래퍼에 `pt-1`을 줘 핀과 살짝 띄운다.
- `clickable`을 켜지 않고 콘텐츠에 `pointer-events-none`을 준다. 라벨은 읽기 전용이고 클릭은 그대로 마커가 받는다.
- 콘텐츠는 정적 텍스트뿐이므로 React portal 없이 `document.createElement`로 만든 DOM에 Tailwind class를 붙인다. 최대 100개가 뜨는 요소라 portal 비용을 감수할 이유가 없다.
- 스타일: 지도 위 컨트롤과 같은 재질을 쓰되 더 작게. `rounded-full border bg-background/95 px-2 py-0.5 text-xs font-medium shadow-sm backdrop-blur`, 긴 이름은 `max-w-32 truncate whitespace-nowrap`.
- 선택된 매물의 라벨은 `border-primary text-primary`로 강조한다. 핀·라벨·목록 하이라이트가 같은 매물을 가리키는지 한눈에 보이게 하기 위해서다.

#### 클러스터와의 동기화

클러스터러는 마커만 관리하고 오버레이는 모른다. 그대로 두면 레벨 6 이상에서 핀이 뭉쳐도 라벨은 남아 클러스터 원 위에 이름이 흩날린다. 라벨 표시 여부를 다음 규칙으로 계산한다.

- `map.getLevel() < 6`(클러스터 `minLevel`): 클러스터링이 아예 없다. 모든 라벨을 켠다.
- 레벨 6 이상: 클러스터러의 `clustered` 이벤트가 넘겨준 클러스터 배열에서, `getSize() >= 2`인 클러스터에 속한 마커의 라벨만 끈다. 혼자 남아 개별 핀으로 그려지는 마커는 라벨을 유지한다.

`clustered` 이벤트가 저레벨에서도 발화하는지에 의존하지 않기 위해, 레벨 기준 분기를 먼저 두고 `clustered` 페이로드는 고레벨에서만 쓴다. 갱신 시점은 `clustered` 이벤트와 지도 `idle` 이벤트 두 곳이다.

### 2. 목록 클릭 → 지도 포커스

목록 아이템 클릭이 라우팅 대신 선택 + 지도 포커스를 수행한다.

- `App.tsx`의 라우트 정의와 `PropertyListPage`의 `onOpen` prop 시그니처는 그대로 둔다. `onOpen`을 쓰는 주체가 목록 아이템에서 오버레이 버튼으로 옮겨갈 뿐이다.
- `PropertyResultItem`의 `onOpen` prop 이름을 `onSelect`로 바꾼다. 이제 하는 일이 "연다"가 아니라 "고른다"이기 때문이다.

#### 카메라 이동은 명령형으로

지도 이동은 `PropertyMap`이 ref로 노출하는 명령형 핸들로 호출한다.

```ts
interface PropertyMapHandle {
  focusProperty: (propertyId: number) => void;
}
```

선택 상태(`MapSelection`)만으로 카메라를 움직이면, 같은 매물을 다시 클릭했을 때 상태가 그대로라 이펙트가 재실행되지 않는다. 지도를 옮겨 놓고 사용자가 손으로 패닝한 뒤 같은 항목을 다시 눌러도 아무 일이 없다. 이를 피하려고 nonce를 상태에 끼워 넣는 대신, "무엇이 선택됐는가"(선언적 상태)와 "카메라를 옮겨라"(동작)를 분리한다. React 19에서는 `ref`를 일반 prop으로 받을 수 있으므로 별도 `forwardRef` 없이 `useImperativeHandle`로 노출한다.

#### `focusProperty` 동작

1. 해당 매물의 마커 좌표를 찾는다. 없으면(지오코딩 미완료·주소 조회 실패) 그 id를 보류 대기열에 저장하고 종료한다. 마커 배치가 끝나는 시점에 보류된 id가 있으면 한 번 실행하고 비운다.
2. `map.setLevel(4)`로 확대한다.
3. 기존 `panToAboveCenter(maps, map, position, focusOffsetPixel())`로 이동한다. 하단 시트 보정 로직을 그대로 재사용한다.

`setLevel` 후 `panTo`를 부르므로 두 단계 애니메이션이 된다. 레벨 변경은 `setLevel(4)` 기본 동작(애니메이션 없음)으로 두고 패닝만 애니메이션시켜, 확대 도중 좌표 투영이 흔들리는 것을 피한다.

#### 핀 직접 클릭은 확대하지 않는다

지도 핀 클릭은 지금처럼 선택 + `panToAboveCenter`만 한다. 이미 보고 있는 위치를 클릭했는데 화면이 확 당겨지면 방향을 잃는다. 확대는 "목록에서 골랐다 = 지도에서 어디인지 모른다"는 맥락에서만 의미가 있다.

### 3. 상세 보기 오버레이

선택된 매물(`selection.kind === "marker"`)의 마커 좌표에 `CustomOverlay` 하나를 띄운다.

- `yAnchor: 1` → 콘텐츠 아래쪽이 좌표에 붙는다. 콘텐츠 래퍼에 `pb-13`(52px)을 줘서 48px 핀 위로 버튼을 올린다.
- `clickable: true`, `zIndex`는 라벨보다 위.
- 콘텐츠는 **React portal**로 렌더링한다. 오버레이용 컨테이너 `div`를 만들어 `CustomOverlay`의 `content`로 넘기고, `createPortal`로 그 안에 JSX를 그린다. 이렇게 해야 shadcn `Button`과 기존 이벤트 핸들러를 그대로 쓸 수 있다. 인스턴스가 하나뿐이라 portal 비용도 문제되지 않는다.
- 버튼 문구는 "상세 보기", `aria-label`은 `` `${property.title} 상세 보기` `` — 지도 위에 뜬 버튼만 읽었을 때 어느 매물인지 알 수 있어야 한다.
- 클릭 시 페이지가 받은 `onOpen(propertyId)`을 호출해 `/properties/:id`로 이동한다.
- 선택이 풀리면(`전체 보기`, 필터 변경, 클러스터 선택, Esc) 오버레이를 `setMap(null)`한다.

#### 키보드 접근

목록 클릭이 더 이상 상세로 가지 않으므로, 상세 페이지로 가는 유일한 경로가 지도 위 버튼이 된다. 키보드 사용자가 목록에서 Tab을 반복해 지도 영역까지 가야 하는 상황을 만들지 않는다.

- 오버레이 버튼은 실제 `<button>`이고 Tab으로 도달 가능하다.
- **목록에서 선택한 경우** 오버레이가 뜬 직후 그 버튼으로 포커스를 옮긴다. `focus-visible` 스타일이므로 마우스 사용자에게는 포커스 링이 보이지 않는다.
- 지도 핀 클릭으로 뜬 경우에는 포커스를 옮기지 않는다. 마우스 사용자의 포인터 맥락을 뺏을 이유가 없다.
- Esc로 선택을 해제한다. 현재 Esc 핸들러는 필터 패널이 열렸을 때만 등록되므로, 선택 해제용 분기를 추가한다. 필터가 열려 있으면 필터를 먼저 닫는다.

### 4. `src/lib/kakaoMap.ts` 타입 확장

지금 SDK 타입은 이번 작업에 필요한 API를 덮지 못한다. 다음을 추가·수정한다.

- `KakaoMap`에 `setLevel: (level: number) => void`, `getLevel: () => number` 추가.
- `KakaoCustomOverlay` 인터페이스(`setMap`, `setPosition`)와 `KakaoMapsSdk.CustomOverlay` 생성자 추가. 옵션은 `{ position, content, xAnchor?, yAnchor?, zIndex?, clickable?, map? }`.
- `KakaoCluster`에 `getSize: () => number` 추가.
- `event.addListener`의 이벤트 유니온이 `"click" | "clusterclick"`으로 좁고 핸들러가 `(cluster?: KakaoCluster) => void`로 고정돼 있다. `"clustered"`(클러스터 배열)와 `"idle"`(인자 없음)을 받을 수 있도록 넓힌다. 이벤트 이름별로 핸들러 인자가 다르므로 오버로드 시그니처로 표현해 호출부에서 타입 단언이 필요 없게 한다.

라벨·오버레이 생성 자체는 `PropertyMap`의 관심사이므로 `kakaoMap.ts`에는 타입과 SDK 래핑만 두고, DOM 조립은 페이지 쪽에 둔다. 단 라벨 pill DOM을 만드는 순수 함수는 `PropertyMap` 위에 파일 지역 헬퍼로 분리한다.

## 상태 흐름

```
목록 아이템 클릭
  → setSelection({ kind: "marker", propertyId })
  → mapRef.current.focusProperty(propertyId)   // setLevel(4) + panToAboveCenter
  → 오버레이 표시 + 버튼으로 포커스 이동

지도 핀 클릭
  → onSelectMarker(propertyId) → setSelection({ kind: "marker", propertyId })
  → panToAboveCenter (확대 없음)
  → 오버레이 표시 (포커스 이동 없음)

전체 보기 / 필터 변경 / 클러스터 선택 / Esc
  → setSelection(null) 또는 cluster 선택
  → 오버레이 숨김
```

## 검증

- `pnpm lint`, `pnpm build`
- 수동 확인 항목
  - 라벨이 모든 개별 핀 아래에 뜨고, 레벨 6 이상에서 클러스터로 묶인 핀의 라벨은 사라진다.
  - 목록 클릭 시 레벨 4로 확대되고 해당 핀이 하단 시트 위쪽에 놓인다.
  - 오버레이 버튼 클릭 시 `/properties/:id`로 이동한다.
  - 같은 목록 항목을 지도 패닝 후 다시 클릭하면 다시 그 핀으로 돌아온다.
  - Esc로 선택이 풀리고 오버레이가 사라진다.
  - 데스크톱(사이드바)과 모바일(하단 시트) 양쪽에서 오버레이가 가려지지 않는다.

## 범위 밖

- 마커 라벨에 가격을 함께 표시하는 것. 요청 범위가 "매물 이름"이다.
- 라벨 겹침 회피(충돌 감지·자동 배치). 클러스터링이 이미 밀도를 줄이고 있고, 요청 범위를 넘는다.
- 목록·상세 간 다른 진입 경로 추가.
