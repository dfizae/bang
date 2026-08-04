# 지도 마커 이름 라벨과 상세 보기 오버레이 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/properties` 지도에서 핀 아래에 매물 이름을 보여주고, 목록 클릭 시 상세로 튀는 대신 그 매물로 지도를 확대한 뒤 핀 위 "상세 보기" 버튼으로만 상세 페이지에 가도록 바꾼다.

**Architecture:** 이름 라벨과 상세 보기 버튼 모두 카카오 `CustomOverlay`로 그린다. 라벨은 개수가 많고 정적이므로 순수 DOM으로, 상세 보기 버튼은 하나뿐이고 상호작용하므로 React portal로 렌더링해 shadcn `Button`을 그대로 쓴다. 카메라 이동은 선택 상태에서 파생시키지 않고 `PropertyMap`이 ref로 노출하는 명령형 핸들(`focusProperty`)로 호출한다.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, 카카오맵 JS SDK(`services`, `clusterer` 라이브러리)

**설계 문서:** `docs/superpowers/specs/2026-08-03-map-marker-label-and-detail-overlay-design.md`

## Global Constraints

- 패키지 매니저는 `pnpm`만 쓴다. 새 패키지를 설치하지 않는다.
- **이 저장소에는 테스트 러너가 없다.** `package.json`의 scripts는 `dev`, `build`, `preview`, `lint`, `lint:fix`, `format`뿐이다. `.claude/rules/60-dependencies-tests.md`는 "테스트 환경이 없는 프로젝트에 승인 없이 새로운 테스트 프레임워크를 설치하지 않는다"고 못박고 있다. **따라서 이 계획의 각 태스크는 TDD 대신 `pnpm lint` → `pnpm build` → 브라우저 수동 확인 순으로 검증한다.** 테스트 프레임워크를 추가하지 마라.
- `pnpm build`는 `tsc -b && vite build`다. 타입 검사는 반드시 이 명령으로 한다. `tsc --noEmit`은 이 저장소 설정에서 거짓 통과한다.
- 수동 확인용 dev 서버는 **반드시 포트 5173**에서 띄운다. 백엔드 CORS 허용 목록이 `http://localhost:5173`뿐이라 다른 포트에서는 API가 403으로 막힌다. `pnpm dev`가 5173을 잡지 못하면 다른 프로세스를 먼저 정리한다.
- ESLint 설정에서 `react-hooks/exhaustive-deps`가 **error**다. 이펙트에서 쓰는 값은 ref이거나 deps에 들어 있어야 한다. 규칙을 끄거나 `eslint-disable`로 우회하지 마라.
- ESLint `curly: ["error", "all"]` — 한 줄 `if`에도 중괄호를 쓴다.
- ESLint `@typescript-eslint/naming-convention` — interface·type alias는 PascalCase, 변수는 camelCase 또는 UPPER_CASE.
- 스타일링은 Tailwind 유틸리티만 쓴다. 인라인 `style`을 새로 도입하지 않는다.
- Tailwind v4는 소스 파일의 **문자열 리터럴**을 스캔해 클래스를 생성한다. 순수 DOM 요소에 붙이는 클래스와 `classList.toggle("border-primary", ...)`의 클래스 이름은 모두 소스에 리터럴로 존재하므로 생성된다. 클래스 이름을 문자열 연결로 조립하지 마라 — 생성되지 않는다.
- 요청 범위 밖 리팩터링·파일 이동·이름 변경을 함께 하지 않는다.

---

## File Structure

| 파일 | 역할 | 변경 |
| --- | --- | --- |
| `src/lib/kakaoMap.ts` | 카카오 SDK 로더·타입·순수 헬퍼 | 수정 (Task 1) — `CustomOverlay`, `setLevel`/`getLevel`, `Cluster.getSize`, 이벤트 오버로드 타입 추가 |
| `src/pages/PropertyListPage.tsx` | 지도·필터·결과 목록 페이지 | 수정 (Task 2~4) — 라벨 오버레이, 상세 보기 오버레이, 목록 클릭 동작 변경 |
| `src/App.tsx` | 라우트 | **변경 없음.** `onOpen={(id) => navigate(\`/properties/${id}\`)}`는 그대로 두고, 페이지 내부에서 이 콜백을 쓰는 주체만 바뀐다 |

`PropertyListPage.tsx`는 이미 976줄로 크지만, 이번 변경은 그 안의 `PropertyMap`에 집중되고 분할은 요청 범위 밖이다. 파일 지역 헬퍼(순수 함수)를 `PropertyMap` 위에 모아 두는 기존 패턴(`getPropertyMarkerImage`, `toQueryFilters`, `getResultTitle`)을 따른다.

---

## Task 1: 카카오 SDK 타입 확장

`CustomOverlay`, 줌 레벨 제어, 클러스터 크기, `clustered`/`idle` 이벤트는 지금 타입에 없다. 이후 태스크가 전부 이 타입에 의존하므로 먼저 넓힌다. 이 태스크는 **동작을 바꾸지 않는다.**

**Files:**
- Modify: `src/lib/kakaoMap.ts:47-52` (`KakaoMap`), `:54-59` (`KakaoMarker`/`KakaoCluster`), `:118-166` (`KakaoMapsSdk`)
- Modify: `src/pages/PropertyListPage.tsx:212-222` (`clusterclick` 핸들러의 불필요해진 가드 제거)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `KakaoMap.getLevel(): number`, `KakaoMap.setLevel(level: number): void`
  - `KakaoCustomOverlay` — `setMap(map: KakaoMap | null): void`, `setPosition(position: KakaoLatLng): void`
  - `KakaoMapsSdk.CustomOverlay` 생성자
  - `KakaoCluster.getSize(): number`
  - `maps.event.addListener` 오버로드 — `"click" | "idle"` → `() => void`, `"clusterclick"` → `(cluster: KakaoCluster) => void`, `"clustered"` → `(clusters: KakaoCluster[]) => void`

- [ ] **Step 1: `KakaoMap`에 줌 레벨 접근자 추가**

`src/lib/kakaoMap.ts`의 `KakaoMap` 인터페이스를 아래로 교체한다.

```ts
export interface KakaoMap {
  panTo: (position: KakaoLatLng) => void;
  relayout: () => void;
  setBounds: (bounds: KakaoLatLngBounds) => void;
  getProjection: () => KakaoMapProjection;
  getLevel: () => number;
  setLevel: (level: number) => void;
}
```

- [ ] **Step 2: `KakaoCustomOverlay`와 `KakaoCluster.getSize` 추가**

`export type KakaoMarker = object;` / `export type KakaoMarkerImage = object;` 바로 아래 블록을 아래로 교체한다.

```ts
export type KakaoMarker = object;
export type KakaoMarkerImage = object;

export interface KakaoCustomOverlay {
  setMap: (map: KakaoMap | null) => void;
  setPosition: (position: KakaoLatLng) => void;
}

export interface KakaoCluster {
  getMarkers: () => KakaoMarker[];
  getSize: () => number;
}
```

- [ ] **Step 3: 이벤트 리스너 오버로드 타입 추가**

`KakaoMapsSdk` 타입 선언 **바로 위**에 다음 인터페이스를 추가한다.

```ts
// 카카오 이벤트는 이름마다 핸들러 인자가 다르다 — 호출부에서 단언 없이 좁혀지도록 오버로드로 적는다
export interface KakaoEventAddListener {
  (target: object, type: "click" | "idle", handler: () => void): void;
  (
    target: object,
    type: "clusterclick",
    handler: (cluster: KakaoCluster) => void,
  ): void;
  (
    target: object,
    type: "clustered",
    handler: (clusters: KakaoCluster[]) => void,
  ): void;
}
```

- [ ] **Step 4: `KakaoMapsSdk`에 `CustomOverlay` 생성자와 새 `event` 타입 연결**

`KakaoMapsSdk` 안에서 `MarkerClusterer` 선언 **다음**에 아래를 추가한다.

```ts
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
    map?: KakaoMap;
  }) => KakaoCustomOverlay;
```

그리고 기존 `event` 블록을 아래로 교체한다.

```ts
  event: {
    addListener: KakaoEventAddListener;
  };
```

- [ ] **Step 5: `clusterclick` 핸들러의 불필요해진 가드 제거**

`src/pages/PropertyListPage.tsx`의 `clusterclick` 리스너에서 `cluster`가 이제 필수 인자이므로 `if (!cluster)` 가드를 지운다. 아래로 교체한다.

```tsx
        maps.event.addListener(clusterer, "clusterclick", (cluster) => {
          const propertyIds = cluster
            .getMarkers()
            .map((marker) => propertyByMarkerRef.current.get(marker)?.id)
            .filter((id): id is number => id !== undefined);

          selectHandlersRef.current.onSelectCluster(propertyIds);
        });
```

- [ ] **Step 6: 검증**

```bash
pnpm lint
pnpm build
```

기대: 둘 다 오류 없이 통과. 타입만 넓혔으므로 동작 변화는 없다.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/kakaoMap.ts src/pages/PropertyListPage.tsx
git commit -m "feat: 카카오맵 CustomOverlay·줌 레벨·클러스터 이벤트 타입 추가"
```

---

## Task 2: 마커 이름 라벨

핀 끝 아래에 매물 이름 pill을 그리고, 클러스터로 묶여 안 보이는 핀의 라벨은 숨긴다.

**Files:**
- Modify: `src/pages/PropertyListPage.tsx` — import 블록, 상수, 파일 지역 헬퍼, `PropertyMap`의 지도 생성 이펙트와 마커 배치 이펙트

**Interfaces:**
- Consumes (Task 1): `KakaoCustomOverlay`, `KakaoMapsSdk.CustomOverlay`, `KakaoMap.getLevel`, `KakaoCluster.getSize`, `addListener`의 `"clustered"`·`"idle"` 오버로드
- Produces:
  - `interface PlacedMarker { marker: KakaoMarker; property: PropertyCardItem; position: KakaoLatLng; labelPill: HTMLElement; labelOverlay: KakaoCustomOverlay }`
  - `function createMarkerLabel(title: string): { wrapper: HTMLDivElement; pill: HTMLSpanElement }`
  - `function syncMarkerLabels(map: KakaoMap, placed: PlacedMarker[], clusteredMarkers: Set<KakaoMarker>): void` — Task 3에서 4번째 인자가 붙는다
  - `function focusOffsetPixel(container: HTMLElement | null, hasBottomSheet: boolean): number`
  - `placedMarkersRef: RefObject<PlacedMarker[]>`, `clusteredMarkersRef: RefObject<Set<KakaoMarker>>` — Task 3·4가 읽는다
  - 상수 `CLUSTER_MIN_LEVEL = 6`

- [ ] **Step 1: import에 새 타입 추가**

`@/lib/kakaoMap` import 목록에 `type KakaoCustomOverlay`와 `type KakaoLatLng`를 추가한다. 알파벳 순서를 맞춘다.

```tsx
import {
  getKakaoMaps,
  loadKakaoMapSdk,
  lookupAddress,
  panToAboveCenter,
  spreadOverlappingPosition,
  waitForContainerSize,
  type KakaoClusterStyle,
  type KakaoClusterer,
  type KakaoCustomOverlay,
  type KakaoLatLng,
  type KakaoMap,
  type KakaoMarker,
  type KakaoMarkerImage,
  type KakaoMapsSdk,
} from "@/lib/kakaoMap";
```

- [ ] **Step 2: 상수 추가**

파일 상단 상수 블록에서 `MARKER_FOCUS_TOP_RATIO` 선언 **아래**에 추가한다.

```tsx
// 클러스터러가 핀을 묶기 시작하는 지도 레벨 — 이 아래에서는 모든 핀이 개별로 그려진다
const CLUSTER_MIN_LEVEL = 6;
// 이 개수 미만이면 클러스터러가 원 대신 개별 핀을 그대로 그린다
const MIN_CLUSTER_SIZE = 2;
const MARKER_LABEL_Z_INDEX = 1;
```

- [ ] **Step 3: 클러스터러 옵션의 매직 넘버를 상수로 교체**

지도 생성 이펙트의 `new maps.MarkerClusterer({ ... })`에서 `minLevel: 6`을 `minLevel: CLUSTER_MIN_LEVEL`로 바꾼다. 라벨 표시 규칙이 이 값과 반드시 같아야 하므로 한 곳에서 나온 값이어야 한다.

- [ ] **Step 4: 라벨 DOM 팩토리와 동기화 함수 추가**

`markerImageCache` / `getPropertyMarkerImage` 아래, `CLUSTER_STYLE` 선언 **위**에 추가한다.

```tsx
const MARKER_LABEL_CLASS =
  "block max-w-32 truncate rounded-full border bg-background/95 px-2 py-0.5 text-xs font-medium whitespace-nowrap shadow-sm backdrop-blur";

// 라벨은 읽기 전용이다 — pointer-events를 끊어 클릭은 그대로 핀이 받는다
function createMarkerLabel(title: string) {
  const wrapper = document.createElement("div");
  wrapper.className = "pointer-events-none pt-1";

  const pill = document.createElement("span");
  pill.className = MARKER_LABEL_CLASS;
  pill.textContent = title;
  wrapper.append(pill);

  return { wrapper, pill };
}

interface PlacedMarker {
  marker: KakaoMarker;
  property: PropertyCardItem;
  position: KakaoLatLng;
  labelPill: HTMLElement;
  labelOverlay: KakaoCustomOverlay;
}

// 클러스터러는 마커만 관리하고 오버레이는 모른다 — 지금 개별로 그려지는 핀에만 이름을 남긴다
function syncMarkerLabels(
  map: KakaoMap,
  placed: PlacedMarker[],
  clusteredMarkers: Set<KakaoMarker>,
) {
  const isClustering = map.getLevel() >= CLUSTER_MIN_LEVEL;
  for (const { marker, labelOverlay } of placed) {
    const isHidden = isClustering && clusteredMarkers.has(marker);
    labelOverlay.setMap(isHidden ? null : map);
  }
}

// 하단 시트가 지도 아래를 덮는 화면에서는 고른 핀을 시트 위쪽으로 끌어올려 보여준다
function focusOffsetPixel(
  container: HTMLElement | null,
  hasBottomSheet: boolean,
) {
  if (!hasBottomSheet || !container) {
    return 0;
  }
  return container.clientHeight * (0.5 - MARKER_FOCUS_TOP_RATIO);
}
```

`focusOffsetPixel`은 지금 마커 배치 이펙트 **안**에 같은 이름의 지역 함수로 있다. 모듈 수준으로 끌어올리는 이유는 Task 4의 `useImperativeHandle`에서도 같은 계산이 필요한데, 이펙트 안에 있으면 꺼내 쓸 수 없고 컴포넌트 본문에 두면 `exhaustive-deps`가 걸리기 때문이다. Step 6에서 지역 정의를 지운다.

- [ ] **Step 5: `PropertyMap`에 라벨 상태 ref 추가**

`propertyByMarkerRef` 선언 **아래**에 추가한다.

```tsx
  // 라벨 표시 여부와 카메라 이동은 마커 배치 결과를 봐야 한다 — 리스너가 최신 값을 읽도록 ref로 둔다
  const placedMarkersRef = useRef<PlacedMarker[]>([]);
  const clusteredMarkersRef = useRef(new Set<KakaoMarker>());
```

- [ ] **Step 6: 마커 배치 이펙트에서 라벨 오버레이를 함께 만든다**

`useEffect(() => { ... }, [map, properties]);` 전체를 아래로 교체한다.

```tsx
  // 매물 목록이 바뀌면 지도는 그대로 두고 핀만 갈아끼운다
  useEffect(() => {
    const clusterer = clustererRef.current;
    const maps = getKakaoMaps();
    if (!map || !clusterer || !maps) {
      return;
    }

    let cancelled = false;
    const addressOccurrences = new Map<string, number>();

    const markerPromises = properties.map(async (property) => {
      const address = `${property.region} ${property.dong}`;
      const overlapIndex = addressOccurrences.get(address) ?? 0;
      addressOccurrences.set(address, overlapIndex + 1);

      const geocoded = await lookupAddress(address);
      if (cancelled || !geocoded) {
        return null;
      }

      const spread = spreadOverlappingPosition(
        geocoded.latitude,
        geocoded.longitude,
        overlapIndex,
      );
      const position = new maps.LatLng(spread.latitude, spread.longitude);
      const marker = new maps.Marker({
        position,
        title: property.title,
        image: getPropertyMarkerImage(
          maps,
          property.dealType,
          property.roomType,
        ),
      });

      const label = createMarkerLabel(property.title);
      // map을 넘기지 않는다 — 표시 여부는 syncMarkerLabels가 결정한다
      const labelOverlay = new maps.CustomOverlay({
        position,
        content: label.wrapper,
        yAnchor: 0,
        zIndex: MARKER_LABEL_Z_INDEX,
      });

      maps.event.addListener(marker, "click", () => {
        selectHandlersRef.current.onSelectMarker(property.id);
        panToAboveCenter(
          maps,
          map,
          position,
          focusOffsetPixel(mapContainerRef.current, hasBottomSheetRef.current),
        );
      });
      return {
        marker,
        property,
        position,
        labelPill: label.pill,
        labelOverlay,
      };
    });

    void Promise.all(markerPromises).then((results) => {
      if (cancelled) {
        return;
      }

      const placed = results.filter(
        (result): result is PlacedMarker => result !== null,
      );
      const propertyByMarker = new Map<KakaoMarker, PropertyCardItem>();
      const bounds = new maps.LatLngBounds();
      for (const { marker, property, position } of placed) {
        propertyByMarker.set(marker, property);
        bounds.extend(position);
      }
      propertyByMarkerRef.current = propertyByMarker;
      placedMarkersRef.current = placed;

      clusterer.clear();
      if (placed.length === 0) {
        return;
      }
      clusterer.addMarkers(placed.map(({ marker }) => marker));
      map.setBounds(bounds);
      syncMarkerLabels(map, placed, clusteredMarkersRef.current);
    });

    return () => {
      cancelled = true;
      for (const { labelOverlay } of placedMarkersRef.current) {
        labelOverlay.setMap(null);
      }
      placedMarkersRef.current = [];
    };
  }, [map, properties]);
```

바뀐 점: 지역 `focusOffsetPixel` 정의 제거(모듈 함수 호출로 대체), 라벨 오버레이 생성, `placedMarkersRef` 갱신, 배치 후 `syncMarkerLabels` 호출, 클린업에서 라벨 제거.

- [ ] **Step 7: 지도 생성 이펙트에 라벨 동기화 리스너 등록**

`clusterclick` 리스너 등록 **다음**에 아래 두 리스너를 추가한다.

```tsx
        // 클러스터로 묶인 핀의 라벨은 원 위에 겹쳐 뜨므로 숨긴다
        maps.event.addListener(clusterer, "clustered", (clusters) => {
          const clusteredMarkers = new Set<KakaoMarker>();
          for (const cluster of clusters) {
            if (cluster.getSize() < MIN_CLUSTER_SIZE) {
              continue;
            }
            for (const marker of cluster.getMarkers()) {
              clusteredMarkers.add(marker);
            }
          }
          clusteredMarkersRef.current = clusteredMarkers;
          syncMarkerLabels(
            createdMap,
            placedMarkersRef.current,
            clusteredMarkers,
          );
        });

        // clustered가 저레벨에서도 발화하는지에 의존하지 않는다 — 이동이 멎을 때마다 레벨로 다시 판정한다
        maps.event.addListener(createdMap, "idle", () => {
          syncMarkerLabels(
            createdMap,
            placedMarkersRef.current,
            clusteredMarkersRef.current,
          );
        });
```

- [ ] **Step 8: 검증**

```bash
pnpm lint
pnpm build
```

기대: 둘 다 통과.

- [ ] **Step 9: 브라우저 수동 확인**

```bash
pnpm dev
```

`http://localhost:5173/properties`를 열고 확인한다.

1. 개별 핀 아래에 매물 이름 pill이 뜬다. 이름이 길면 잘리고 `…` 처리된다.
2. 축소해서 핀들이 파란 원으로 묶이면 그 핀들의 라벨이 사라진다. 묶이지 않고 혼자 남은 핀의 라벨은 유지된다.
3. 다시 확대하면 라벨이 되돌아온다.
4. 라벨을 클릭해도 라벨이 클릭을 먹지 않고 그 아래 핀이 반응한다(목록이 해당 매물로 스크롤됨).
5. 필터를 바꿔 매물 목록이 갱신되면 옛 라벨이 남지 않는다.

- [ ] **Step 10: 커밋**

```bash
git add src/pages/PropertyListPage.tsx
git commit -m "feat: 지도 마커 아래에 매물 이름 라벨 표시"
```

---

## Task 3: 상세 보기 오버레이

선택된 매물의 핀 위에 "상세 보기" 버튼을 띄우고, 그 버튼으로만 상세 페이지에 간다. 이 시점에는 아직 지도 핀 클릭으로만 선택이 생기므로, 목록 클릭은 기존대로 상세로 이동한다 — 중간 상태에서도 상세 진입 경로가 끊기지 않는다.

**Files:**
- Modify: `src/pages/PropertyListPage.tsx` — import, 상수, `syncMarkerLabels`, `PropertyMapProps`, `PropertyMap` 본문·JSX, `PropertyListPage`의 `<PropertyMap />` 호출

**Interfaces:**
- Consumes (Task 2): `PlacedMarker`, `syncMarkerLabels`, `placedMarkersRef`, `clusteredMarkersRef`
- Produces:
  - `PropertyMapProps`에 `selectedPropertyId: number | null`, `onOpenDetail: (propertyId: number) => void` 추가
  - `function syncDetailOverlay(map: KakaoMap, overlay: KakaoCustomOverlay | null, placed: PlacedMarker[], selectedPropertyId: number | null): void`
  - `syncMarkerLabels`가 4번째 인자 `selectedPropertyId: number | null`을 받도록 변경
  - `detailOverlayElement` state, `detailOverlayRef`, `selectedPropertyIdRef` — Task 4가 읽는다

- [ ] **Step 1: import 추가**

portal 렌더링에 `createPortal`이 필요하다. `useImperativeHandle`은 Task 4에서 추가하므로 지금은 건드리지 않는다.

```tsx
import { createPortal } from "react-dom";
```

`react-dom` import는 `react-router-dom` import **위**에 둔다(패키지 import 그룹 안에서 알파벳 순).

- [ ] **Step 2: 상수 추가**

`MARKER_LABEL_Z_INDEX` 아래에 추가한다.

```tsx
// 라벨보다 위에 뜬다 — 버튼이 다른 매물 라벨에 가리면 안 된다
const DETAIL_OVERLAY_Z_INDEX = 10;
```

- [ ] **Step 3: `syncMarkerLabels`에 선택 강조 추가하고 `syncDetailOverlay` 신설**

`syncMarkerLabels` 전체를 아래로 교체하고, 바로 아래에 `syncDetailOverlay`를 추가한다.

```tsx
// 클러스터러는 마커만 관리하고 오버레이는 모른다 — 지금 개별로 그려지는 핀에만 이름을 남긴다.
// 고른 매물의 라벨은 강조해 핀·라벨·목록이 같은 매물을 가리키는지 한눈에 보이게 한다
function syncMarkerLabels(
  map: KakaoMap,
  placed: PlacedMarker[],
  clusteredMarkers: Set<KakaoMarker>,
  selectedPropertyId: number | null,
) {
  const isClustering = map.getLevel() >= CLUSTER_MIN_LEVEL;
  for (const { marker, property, labelPill, labelOverlay } of placed) {
    const isSelected = property.id === selectedPropertyId;
    labelPill.classList.toggle("border-primary", isSelected);
    labelPill.classList.toggle("text-primary", isSelected);

    const isHidden = isClustering && clusteredMarkers.has(marker);
    labelOverlay.setMap(isHidden ? null : map);
  }
}

// 상세 보기 버튼은 고른 매물의 핀 위에만 뜬다 — 핀이 아직 배치되지 않았으면 지도에서 뗀다
function syncDetailOverlay(
  map: KakaoMap,
  overlay: KakaoCustomOverlay | null,
  placed: PlacedMarker[],
  selectedPropertyId: number | null,
) {
  if (!overlay) {
    return;
  }

  const target =
    selectedPropertyId === null
      ? undefined
      : placed.find(({ property }) => property.id === selectedPropertyId);
  if (!target) {
    overlay.setMap(null);
    return;
  }

  overlay.setPosition(target.position);
  overlay.setMap(map);
}
```

- [ ] **Step 4: `PropertyMapProps` 확장**

```tsx
interface PropertyMapProps extends SelectHandlers {
  properties: PropertyCardItem[];
  hasBottomSheet: boolean;
  selectedPropertyId: number | null;
  onOpenDetail: (propertyId: number) => void;
}
```

컴포넌트 시그니처도 함께 바꾼다.

```tsx
function PropertyMap({
  properties,
  hasBottomSheet,
  selectedPropertyId,
  onSelectMarker,
  onSelectCluster,
  onOpenDetail,
}: PropertyMapProps) {
```

- [ ] **Step 5: 오버레이용 ref·state 추가와 최신값 동기화**

`clusteredMarkersRef` 선언 아래에 추가한다.

```tsx
  const detailOverlayRef = useRef<KakaoCustomOverlay | null>(null);
  // 오버레이 콘텐츠는 지도 생성 시 만든 DOM에 portal로 그린다 — shadcn Button을 그대로 쓰기 위해서다
  const [detailOverlayElement, setDetailOverlayElement] =
    useState<HTMLDivElement | null>(null);
  const selectedPropertyIdRef = useRef(selectedPropertyId);
```

그리고 기존 최신값 동기화 이펙트에 한 줄을 더한다.

```tsx
  useEffect(() => {
    selectHandlersRef.current = { onSelectMarker, onSelectCluster };
    hasBottomSheetRef.current = hasBottomSheet;
    selectedPropertyIdRef.current = selectedPropertyId;
  });
```

- [ ] **Step 6: 지도 생성 이펙트에서 오버레이 만들기**

`clustererRef.current = clusterer;` **바로 위**에 추가한다.

```tsx
        const detailOverlayContent = document.createElement("div");
        const detailOverlay = new maps.CustomOverlay({
          position: new maps.LatLng(
            SEOUL_CITY_HALL.latitude,
            SEOUL_CITY_HALL.longitude,
          ),
          content: detailOverlayContent,
          yAnchor: 1,
          zIndex: DETAIL_OVERLAY_Z_INDEX,
          clickable: true,
        });
        detailOverlayRef.current = detailOverlay;
        setDetailOverlayElement(detailOverlayContent);
```

같은 이펙트의 클린업에 두 줄을 더한다. `clustererRef.current = null;` 아래에 넣는다.

```tsx
      detailOverlayRef.current = null;
      setDetailOverlayElement(null);
```

- [ ] **Step 7: 선택이 바뀔 때 오버레이·라벨 동기화**

마커 배치 이펙트 **아래**에 새 이펙트를 추가한다.

```tsx
  // 선택이 바뀌면 핀을 다시 그리지 않고 오버레이 위치와 라벨 강조만 갱신한다
  useEffect(() => {
    if (!map) {
      return;
    }
    syncDetailOverlay(
      map,
      detailOverlayRef.current,
      placedMarkersRef.current,
      selectedPropertyId,
    );
    syncMarkerLabels(
      map,
      placedMarkersRef.current,
      clusteredMarkersRef.current,
      selectedPropertyId,
    );
  }, [map, selectedPropertyId]);
```

- [ ] **Step 8: 기존 `syncMarkerLabels` 호출부에 4번째 인자 전달**

세 곳이다. 선택 상태는 이펙트 밖 리스너에서도 최신값이어야 하므로 ref를 읽는다.

마커 배치 이펙트 안:

```tsx
      syncMarkerLabels(map, placed, clusteredMarkersRef.current, selectedPropertyIdRef.current);
      syncDetailOverlay(
        map,
        detailOverlayRef.current,
        placed,
        selectedPropertyIdRef.current,
      );
```

`clustered` 리스너 안:

```tsx
          syncMarkerLabels(
            createdMap,
            placedMarkersRef.current,
            clusteredMarkers,
            selectedPropertyIdRef.current,
          );
```

`idle` 리스너 안:

```tsx
          syncMarkerLabels(
            createdMap,
            placedMarkersRef.current,
            clusteredMarkersRef.current,
            selectedPropertyIdRef.current,
          );
```

- [ ] **Step 9: 오버레이 콘텐츠를 portal로 렌더링**

`PropertyMap`의 `return (` 바로 위에 파생값을 계산한다.

```tsx
  const selectedProperty = properties.find(
    ({ id }) => id === selectedPropertyId,
  );
```

그리고 JSX에서 지도 컨테이너 `div` **다음**, 오류 화면 블록 **앞**에 추가한다.

```tsx
      {detailOverlayElement &&
        selectedProperty &&
        createPortal(
          // pb-13(52px) — 48px 핀 위로 버튼을 올린다. yAnchor 1이라 콘텐츠 아래쪽이 핀 끝에 붙는다
          <div className="pb-13">
            <Button
              size="sm"
              className="cursor-pointer rounded-full shadow-md"
              aria-label={`${selectedProperty.title} 상세 보기`}
              onClick={() => onOpenDetail(selectedProperty.id)}
            >
              상세 보기
            </Button>
          </div>,
          detailOverlayElement,
        )}
```

- [ ] **Step 10: 페이지에서 새 props 전달**

`PropertyListPage`의 `<PropertyMap />` 호출을 아래로 교체한다.

```tsx
        <PropertyMap
          properties={items}
          hasBottomSheet={!isDesktop}
          selectedPropertyId={selectedId}
          onSelectMarker={selectMarker}
          onSelectCluster={selectCluster}
          onOpenDetail={onOpen}
        />
```

- [ ] **Step 11: 검증**

```bash
pnpm lint
pnpm build
```

기대: 둘 다 통과.

- [ ] **Step 12: 브라우저 수동 확인**

`http://localhost:5173/properties`에서 확인한다.

1. 지도 핀을 클릭하면 그 핀 위에 "상세 보기" 버튼이 뜨고, 핀은 확대 없이 패닝만 된다.
2. 버튼을 클릭하면 `/properties/{id}`로 이동한다.
3. 다른 핀을 클릭하면 버튼이 그 핀으로 옮겨간다.
4. 클러스터를 클릭하면 버튼이 사라진다.
5. 선택된 매물의 이름 라벨이 파란 테두리·글자로 강조된다.
6. 모바일 폭(하단 시트)에서 핀이 시트 위쪽에 놓이고 버튼이 시트에 가리지 않는다.
7. 필터를 바꾸면 선택이 풀리고 버튼이 사라진다.

- [ ] **Step 13: 커밋**

```bash
git add src/pages/PropertyListPage.tsx
git commit -m "feat: 선택한 매물 핀 위에 상세 보기 오버레이 버튼 추가"
```

---

## Task 4: 목록 클릭 시 지도 확대와 키보드 경로

목록 클릭을 상세 이동에서 "선택 + 지도 확대"로 바꾸고, 상세로 가는 경로가 지도 위 버튼 하나가 되므로 키보드 경로를 함께 만든다.

**Files:**
- Modify: `src/pages/PropertyListPage.tsx` — import, 상수, 파일 지역 헬퍼, `PropertyMap`(ref 핸들), `PropertyResultItem`·`PropertyResultList`(prop 이름), `PropertyListPage`(선택 핸들러·Esc)

**Interfaces:**
- Consumes (Task 2·3): `PlacedMarker`, `focusOffsetPixel`, `placedMarkersRef`, `detailOverlayElement`, `selectedProperty`
- Produces:
  - `interface PropertyMapHandle { focusProperty: (propertyId: number) => void }`
  - `PropertyMapProps`에 `ref: Ref<PropertyMapHandle>` 추가
  - `function focusPlacedMarker(maps: KakaoMapsSdk, map: KakaoMap, target: PlacedMarker, container: HTMLElement | null, hasBottomSheet: boolean): void`
  - `PropertyResultItemProps`·`PropertyResultListProps`의 `onOpen` → `onSelect: (id: number) => void`
  - 상수 `LIST_FOCUS_MAP_LEVEL = 4`

- [ ] **Step 1: import에 `useImperativeHandle` 추가**

```tsx
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
```

- [ ] **Step 2: 상수 추가**

`DETAIL_OVERLAY_Z_INDEX` 아래에 추가한다.

```tsx
// 목록에서 고른 매물로 좁혀 보여주는 지도 레벨 — 클러스터가 풀리는 수준(CLUSTER_MIN_LEVEL)보다 가깝다
const LIST_FOCUS_MAP_LEVEL = 4;
```

- [ ] **Step 3: 카메라 이동 헬퍼 추가**

`focusOffsetPixel` 함수 **아래**에 추가한다.

```tsx
// setLevel은 즉시 반영하고 이동만 애니메이션한다 — 확대 도중 좌표 투영이 흔들리지 않게 한다
function focusPlacedMarker(
  maps: KakaoMapsSdk,
  map: KakaoMap,
  target: PlacedMarker,
  container: HTMLElement | null,
  hasBottomSheet: boolean,
) {
  map.setLevel(LIST_FOCUS_MAP_LEVEL);
  panToAboveCenter(
    maps,
    map,
    target.position,
    focusOffsetPixel(container, hasBottomSheet),
  );
}
```

- [ ] **Step 4: `PropertyMapHandle` 정의와 props에 ref 추가**

`PropertyMapProps` **위**에 추가한다.

```tsx
// 카메라 이동은 선택 상태에서 파생시키지 않는다 — 같은 매물을 다시 골라도 다시 그 핀으로 돌아와야 한다
interface PropertyMapHandle {
  focusProperty: (propertyId: number) => void;
}
```

`PropertyMapProps`에 ref를 더한다.

```tsx
interface PropertyMapProps extends SelectHandlers {
  properties: PropertyCardItem[];
  hasBottomSheet: boolean;
  selectedPropertyId: number | null;
  onOpenDetail: (propertyId: number) => void;
  ref: Ref<PropertyMapHandle>;
}
```

컴포넌트 시그니처에 `ref`를 받는다.

```tsx
function PropertyMap({
  properties,
  hasBottomSheet,
  selectedPropertyId,
  onSelectMarker,
  onSelectCluster,
  onOpenDetail,
  ref,
}: PropertyMapProps) {
```

React 19에서는 `ref`가 일반 prop이다. `forwardRef`를 쓰지 마라 — 이 파일의 `PropertyResultItem`이 이미 같은 방식(`ref: Ref<HTMLDivElement>`)을 쓴다.

- [ ] **Step 5: 포커스용 ref 추가**

`selectedPropertyIdRef` 아래에 추가한다.

```tsx
  // 지오코딩이 끝나기 전에 고른 매물 — 핀이 놓이는 즉시 한 번 이동한다
  const pendingFocusIdRef = useRef<number | null>(null);
  // 목록에서 고른 경우에만 상세 보기 버튼으로 포커스를 옮긴다
  const shouldFocusDetailButtonRef = useRef(false);
  const detailButtonRef = useRef<HTMLButtonElement>(null);
```

- [ ] **Step 6: `focusProperty` 핸들 노출**

Task 3 Step 7에서 만든 선택 동기화 이펙트 **아래**에 추가한다.

```tsx
  useImperativeHandle(
    ref,
    () => ({
      focusProperty: (propertyId: number) => {
        const maps = getKakaoMaps();
        if (!map || !maps) {
          return;
        }

        shouldFocusDetailButtonRef.current = true;
        const target = placedMarkersRef.current.find(
          ({ property }) => property.id === propertyId,
        );
        if (!target) {
          pendingFocusIdRef.current = propertyId;
          return;
        }

        pendingFocusIdRef.current = null;
        focusPlacedMarker(
          maps,
          map,
          target,
          mapContainerRef.current,
          hasBottomSheetRef.current,
        );
      },
    }),
    [map],
  );
```

- [ ] **Step 7: 배치가 끝난 뒤 보류된 포커스 적용**

마커 배치 이펙트의 `.then` 마지막(`syncDetailOverlay(...)` 호출 다음)에 추가한다.

```tsx
      const pendingFocusId = pendingFocusIdRef.current;
      if (pendingFocusId === null) {
        return;
      }
      pendingFocusIdRef.current = null;
      const pendingTarget = placed.find(
        ({ property }) => property.id === pendingFocusId,
      );
      if (pendingTarget) {
        focusPlacedMarker(
          maps,
          map,
          pendingTarget,
          mapContainerRef.current,
          hasBottomSheetRef.current,
        );
      }
```

`map.setBounds(bounds)` 다음에 오므로 보류된 포커스가 전체 범위 맞춤을 덮어쓴다. 의도한 순서다.

- [ ] **Step 8: 상세 보기 버튼으로 포커스 이동**

`useImperativeHandle` **아래**에 추가한다.

```tsx
  // 목록 클릭이 더 이상 상세로 가지 않으므로, 키보드 사용자가 지도까지 Tab으로 넘어가지 않게 한다
  useEffect(() => {
    if (!shouldFocusDetailButtonRef.current) {
      return;
    }
    shouldFocusDetailButtonRef.current = false;
    detailButtonRef.current?.focus();
  }, [selectedPropertyId]);
```

이미 고른 매물을 목록에서 다시 클릭하면 `selectedPropertyId`가 그대로라 이 이펙트는 재실행되지 않는다. 지도만 다시 그 핀으로 돌아오고 포커스는 목록 항목에 남는다 — 이미 적절한 위치이므로 그대로 둔다.

- [ ] **Step 9: 버튼에 ref 연결**

Task 3에서 만든 portal의 `<Button>`에 `ref={detailButtonRef}`를 추가한다.

```tsx
            <Button
              ref={detailButtonRef}
              size="sm"
              className="cursor-pointer rounded-full shadow-md"
              aria-label={`${selectedProperty.title} 상세 보기`}
              onClick={() => onOpenDetail(selectedProperty.id)}
            >
              상세 보기
            </Button>
```

- [ ] **Step 10: 목록 아이템의 prop 이름 변경**

`PropertyResultItemProps`와 `PropertyResultItem`에서 `onOpen`을 `onSelect`로 바꾼다. 이제 하는 일이 "연다"가 아니라 "고른다"다.

```tsx
interface PropertyResultItemProps {
  property: PropertyCardItem;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onToggleSave: (id: number, saved: boolean) => void;
  ref: Ref<HTMLDivElement>;
}

function PropertyResultItem({
  property,
  isSelected,
  onSelect,
  onToggleSave,
  ref,
}: PropertyResultItemProps) {
```

본문의 버튼 핸들러도 바꾼다.

```tsx
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        onClick={() => onSelect(property.id)}
      >
```

- [ ] **Step 11: `PropertyResultList`의 prop 이름 변경**

`PropertyResultListProps`의 `onOpen: (id: number) => void`를 `onSelect: (id: number) => void`로 바꾸고, 구조 분해와 `PropertyResultItem` 전달을 함께 바꾼다.

```tsx
        <PropertyResultItem
          key={property.id}
          ref={(element) => {
            if (!element) {
              return;
            }
            itemRefs.current.set(property.id, element);
            return () => {
              itemRefs.current.delete(property.id);
            };
          }}
          property={property}
          isSelected={property.id === selectedId}
          onSelect={onSelect}
          onToggleSave={onToggleSave}
        />
```

`onToggleSave`는 그대로 둔다 — 이번 변경 대상이 아니다.

- [ ] **Step 12: 페이지에서 목록 선택 핸들러 연결**

`PropertyListPage` 안에서 `navigate` 선언 근처에 ref를 만든다.

```tsx
  const propertyMapRef = useRef<PropertyMapHandle>(null);
```

`selectCluster` 아래에 목록 선택 핸들러를 추가한다.

```tsx
  // 목록에서 고르면 상세로 튀지 않고 지도를 그 매물로 좁힌다 — 탐색 맥락을 잃지 않는다
  const selectFromList = (propertyId: number) => {
    setSelection({ kind: "marker", propertyId });
    propertyMapRef.current?.focusProperty(propertyId);
  };
```

`resultList`의 `onOpen={onOpen}`을 `onSelect={selectFromList}`로 바꾼다.

```tsx
  const resultList = (
    <PropertyResultList
      properties={listedProperties}
      isPending={isPending}
      isError={isError}
      selectedId={selectedId}
      onRetry={() => refetch()}
      onResetFilters={resetFilters}
      onSelect={selectFromList}
      onToggleSave={handleToggleSave}
    />
  );
```

`<PropertyMap />`에 ref를 전달한다.

```tsx
        <PropertyMap
          ref={propertyMapRef}
          properties={items}
          hasBottomSheet={!isDesktop}
          selectedPropertyId={selectedId}
          onSelectMarker={selectMarker}
          onSelectCluster={selectCluster}
          onOpenDetail={onOpen}
        />
```

- [ ] **Step 13: Esc로 선택 해제**

기존 Esc 이펙트를 아래로 교체한다.

```tsx
  // 지도를 가린 패널과 지도 위 선택은 Esc로 즉시 걷어낼 수 있어야 한다
  useEffect(() => {
    if (!isFilterOpen && selection === null) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (isFilterOpen) {
        setIsFilterOpen(false);
        return;
      }
      setSelection(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isFilterOpen, selection]);
```

- [ ] **Step 14: 검증**

```bash
pnpm lint
pnpm build
```

기대: 둘 다 통과. `onOpen`이 페이지에서 `PropertyMap`으로만 전달되는지, 목록 경로에 남아 있지 않은지 타입 오류로 확인된다.

- [ ] **Step 15: 브라우저 수동 확인**

`http://localhost:5173/properties`에서 확인한다.

1. 목록에서 매물을 클릭하면 상세로 이동하지 않고 지도가 레벨 4로 확대되며 그 핀으로 이동한다.
2. 확대 후 그 핀 위에 "상세 보기" 버튼이 떠 있고, 클릭하면 `/properties/{id}`로 이동한다.
3. 지도를 손으로 멀리 끌어놓은 뒤 **같은** 목록 항목을 다시 클릭하면 다시 그 핀으로 돌아온다.
4. 목록 클릭 직후 Tab을 누르지 않아도 포커스가 "상세 보기" 버튼에 있다. 키보드에서 Enter로 상세에 갈 수 있다.
5. 마우스로 목록을 클릭했을 때 버튼에 파란 포커스 링이 보이지 않는다(`focus-visible`).
6. Esc를 누르면 선택이 풀리고 버튼과 라벨 강조가 사라진다. 필터 패널이 열려 있으면 Esc가 필터를 먼저 닫는다.
7. 지도 핀을 직접 클릭했을 때는 확대되지 않고 패닝만 된다(Task 3 동작 유지).
8. 모바일 폭에서 목록 클릭 시 하단 시트가 열리고 핀이 시트 위쪽에 놓인다.
9. 클러스터를 클릭해 목록이 좁혀진 상태에서도 목록 클릭이 같은 방식으로 동작한다.

- [ ] **Step 16: 커밋**

```bash
git add src/pages/PropertyListPage.tsx
git commit -m "feat: 매물 목록 클릭 시 상세 이동 대신 지도 확대로 변경"
```

---

## Self-Review 결과

**스펙 커버리지**

| 스펙 항목 | 태스크 |
| --- | --- |
| 1. 마커 이름 라벨 (CustomOverlay, yAnchor 0, pointer-events-none, 순수 DOM) | Task 2 Step 4·6 |
| 1. 선택 매물 라벨 강조 (`border-primary text-primary`) | Task 3 Step 3 |
| 1. 클러스터와의 동기화 (레벨 분기 + `clustered` + `idle`) | Task 2 Step 7, Task 3 Step 8 |
| 2. 목록 클릭이 라우팅 대신 선택 + 포커스 | Task 4 Step 10~12 |
| 2. `App.tsx` 라우트 유지, `onOpen` 소비 주체 이동 | Task 3 Step 10, Task 4 Step 12 |
| 2. `PropertyResultItem`의 `onOpen` → `onSelect` | Task 4 Step 10·11 |
| 2. 명령형 `focusProperty` 핸들 | Task 4 Step 4·6 |
| 2. `setLevel(4)` + `panToAboveCenter` | Task 4 Step 3 |
| 2. 보류된 포커스(지오코딩 미완료) | Task 4 Step 5·7 |
| 2. 핀 직접 클릭은 확대하지 않음 | Task 2 Step 6 (기존 동작 유지) |
| 3. CustomOverlay yAnchor 1 + `pb-13` | Task 3 Step 6·9 |
| 3. React portal + shadcn Button | Task 3 Step 1·9 |
| 3. `aria-label`에 매물명 | Task 3 Step 9 |
| 3. 선택 해제 시 오버레이 숨김 | Task 3 Step 3·7 |
| 3. 목록 선택 시에만 버튼으로 포커스 이동 | Task 4 Step 5·8·9 |
| 3. Esc로 선택 해제, 필터 우선 | Task 4 Step 13 |
| 4. `kakaoMap.ts` 타입 확장 | Task 1 전체 |

누락 없음.

**타입 일관성**

- `syncMarkerLabels`는 Task 2에서 3-arg로 만들고 Task 3 Step 3에서 4-arg로 교체한다. Task 3 Step 8이 기존 호출부 세 곳을 모두 갱신한다.
- `PlacedMarker`의 필드 이름(`marker`, `property`, `position`, `labelPill`, `labelOverlay`)은 Task 2·3·4에서 동일하다.
- `focusOffsetPixel(container, hasBottomSheet)` 시그니처는 Task 2에서 정의되고 Task 4의 `focusPlacedMarker`에서 그대로 쓰인다.
- `PropertyMapHandle.focusProperty(propertyId: number): void`는 Task 4에서만 등장하고 페이지의 `propertyMapRef.current?.focusProperty(propertyId)`와 일치한다.
