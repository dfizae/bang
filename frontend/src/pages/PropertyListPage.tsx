import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Heart,
  ImageIcon,
  MapPin,
  Plus,
  Search,
  SearchX,
  X,
} from "lucide-react";

import {
  toPropertyCardItem,
  type PropertyCardItem,
} from "@/components/PropertyCard";
import PropertyFilterPanel, {
  DEFAULT_FILTERS,
  countActiveFilters,
  resetPanelFilters,
} from "@/components/PropertyFilterPanel";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MONTHLY_DEPOSIT_BANDS, PRICE_BANDS } from "@/data/properties";
import { useToggleFavorite } from "@/hooks/queries/favoriteQueries";
import { usePropertyList } from "@/hooks/queries/propertyQueries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatPrice } from "@/lib/format";
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
import { parseRegionQuery } from "@/lib/regionSearch";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { DealType, Filters, PropertyFilters, RoomType } from "@/types";

const SKELETON_COUNT = 5;
const MAP_RESULT_SIZE = 100;
// Tailwind lg — 사이드바(352px)를 빼고도 지도가 넉넉히 남는 최소 폭
const DESKTOP_QUERY = "(min-width: 1024px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SEOUL_CITY_HALL = { latitude: 37.5665, longitude: 126.978 };
const INITIAL_MAP_LEVEL = 8;
// 이 거리 이상 끌어올리면(내리면) 탭이 아니라 시트 여닫기로 해석한다
const SHEET_DRAG_THRESHOLD_PX = 30;
const MARKER_WIDTH_PX = 42;
const MARKER_HEIGHT_PX = 48;
// 하단 시트가 지도를 덮는 화면에서 고른 핀이 놓일 자리 — 지도 높이 기준 위에서부터의 비율
const MARKER_FOCUS_TOP_RATIO = 0.32;
// 클러스터러가 핀을 묶기 시작하는 지도 레벨 — 이 아래에서는 모든 핀이 개별로 그려진다
const CLUSTER_MIN_LEVEL = 6;
// 이 개수 미만이면 클러스터러가 원 대신 개별 핀을 그대로 그린다
const MIN_CLUSTER_SIZE = 2;
const MARKER_LABEL_Z_INDEX = 1;
// 라벨보다 위에 뜬다 — 버튼이 다른 매물 라벨에 가리면 안 된다
const DETAIL_OVERLAY_Z_INDEX = 10;
// 목록에서 고른 매물로 좁혀 보여주는 지도 레벨 — 클러스터가 풀리는 수준(CLUSTER_MIN_LEVEL)보다 가깝다
const LIST_FOCUS_MAP_LEVEL = 4;

const DEAL_TYPE_MARKER = {
  전세: { slug: "jeonse", label: "전세", color: "var(--marker-jeonse)" },
  월세: { slug: "monthly", label: "월세", color: "var(--marker-monthly)" },
  매매: { slug: "sale", label: "매매", color: "var(--marker-sale)" },
} as const satisfies Record<
  DealType,
  { slug: string; label: string; color: string }
>;

const ROOM_TYPE_MARKER_SLUG = {
  오피스텔: "officetel",
  빌라: "villa",
  원룸: "one-room",
} as const satisfies Record<RoomType, string>;

const markerImageCache = new Map<string, KakaoMarkerImage>();

function getPropertyMarkerImage(
  maps: KakaoMapsSdk,
  dealType: DealType,
  roomType: RoomType,
) {
  const imageUrl = `${import.meta.env.BASE_URL}map-markers/${DEAL_TYPE_MARKER[dealType].slug}-${ROOM_TYPE_MARKER_SLUG[roomType]}.svg`;
  const cached = markerImageCache.get(imageUrl);
  if (cached) {
    return cached;
  }

  const markerImage = new maps.MarkerImage(
    imageUrl,
    new maps.Size(MARKER_WIDTH_PX, MARKER_HEIGHT_PX),
    {
      offset: new maps.Point(MARKER_WIDTH_PX / 2, MARKER_HEIGHT_PX),
    },
  );
  markerImageCache.set(imageUrl, markerImage);
  return markerImage;
}

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

// 포커스 요청은 "어떤 매물"을 위한 것인지 함께 들고 있어야 한다 — 그 사이 지도 핀 클릭 등으로
// 다른 매물이 선택되면 낡은 요청을 조용히 버려야, 엉뚱한 매물의 버튼이 포커스를 가로채지 않는다.
// 요청이 아직 유효해도 오버레이가 지도에 안 붙어 버튼이 문서 밖에 있으면 focus()가 조용히 실패하므로,
// 이때는 요청을 소비하지 않고 남겨 오버레이가 붙는 시점(호출하는 쪽)에 재시도하게 한다
function focusDetailButtonIfReady(
  requestedPropertyIdRef: { current: number | null },
  currentPropertyId: number | null,
  buttonRef: { current: HTMLButtonElement | null },
) {
  const requestedPropertyId = requestedPropertyIdRef.current;
  if (requestedPropertyId === null) {
    return;
  }
  if (requestedPropertyId !== currentPropertyId) {
    requestedPropertyIdRef.current = null;
    return;
  }
  if (!buttonRef.current?.isConnected) {
    return;
  }
  requestedPropertyIdRef.current = null;
  buttonRef.current.focus();
}

const CLUSTER_STYLE: KakaoClusterStyle = {
  width: "48px",
  height: "48px",
  background: "#165dfc",
  borderRadius: "50%",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "700",
  lineHeight: "48px",
  textAlign: "center",
  boxShadow: "0 3px 12px rgba(22, 93, 252, 0.38)",
};

// 지도 위에 뜨는 컨트롤은 모두 같은 재질을 쓴다 — 지도와 겹쳐도 읽히고, 지도를 가리지 않는다
const FLOATING_SURFACE =
  "rounded-full border bg-background/95 shadow-[0_2px_12px_rgba(15,23,42,0.12)] backdrop-blur";

// 핀 하나를 고르면 그 매물만, 클러스터를 고르면 그 안의 매물만 목록에 남는다
type MapSelection =
  | { kind: "marker"; propertyId: number }
  | { kind: "cluster"; propertyIds: number[] };

interface SelectHandlers {
  onSelectMarker: (propertyId: number) => void;
  onSelectCluster: (propertyIds: number[]) => void;
}

// 카메라 이동은 선택 상태에서 파생시키지 않는다 — 같은 매물을 다시 골라도 다시 그 핀으로 돌아와야 한다
interface PropertyMapHandle {
  focusProperty: (propertyId: number) => void;
}

interface PropertyMapProps extends SelectHandlers {
  properties: PropertyCardItem[];
  hasBottomSheet: boolean;
  selectedPropertyId: number | null;
  onOpenDetail: (propertyId: number) => void;
  // 지오코딩이 끝났는데도 핀이 없는 매물 — 지도에서 열 방법이 없으니 상세로 바로 보낸다
  onDetailUnavailable: (propertyId: number) => void;
  ref: Ref<PropertyMapHandle>;
}

// 지도와 핀만 담당한다. 무엇이 선택됐는지는 페이지가 소유하고, 목록 패널이 같은 값을 함께 본다
function PropertyMap({
  properties,
  hasBottomSheet,
  selectedPropertyId,
  onSelectMarker,
  onSelectCluster,
  onOpenDetail,
  onDetailUnavailable,
  ref,
}: PropertyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const clustererRef = useRef<KakaoClusterer | null>(null);
  const [map, setMap] = useState<KakaoMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const appKey = import.meta.env.VITE_KAKAO_KEY;

  // 지도·마커 리스너는 한 번만 등록되므로, 최신 핸들러를 ref로 건네 stale closure를 막는다
  const selectHandlersRef = useRef<SelectHandlers>({
    onSelectMarker,
    onSelectCluster,
  });
  // 시트 유무는 창 크기에 따라 바뀌지만 마커를 다시 그릴 이유는 아니다 — 최신 값만 참조한다
  const hasBottomSheetRef = useRef(hasBottomSheet);
  // 마커 없는 매물을 상세로 보내는 콜백도 리스너·프로미스 콜백에서 최신 값을 읽어야 한다
  const onDetailUnavailableRef = useRef(onDetailUnavailable);
  useEffect(() => {
    selectHandlersRef.current = { onSelectMarker, onSelectCluster };
    hasBottomSheetRef.current = hasBottomSheet;
    selectedPropertyIdRef.current = selectedPropertyId;
    onDetailUnavailableRef.current = onDetailUnavailable;
  });

  // clusterclick 리스너도 생성 시 한 번만 달리므로, 최신 마커 → 매물 매핑을 ref로 넘겨준다
  const propertyByMarkerRef = useRef(new Map<KakaoMarker, PropertyCardItem>());
  // 라벨 표시 여부와 카메라 이동은 마커 배치 결과를 봐야 한다 — 리스너가 최신 값을 읽도록 ref로 둔다
  const placedMarkersRef = useRef<PlacedMarker[]>([]);
  const clusteredMarkersRef = useRef(new Set<KakaoMarker>());
  const detailOverlayRef = useRef<KakaoCustomOverlay | null>(null);
  // 오버레이 콘텐츠는 지도 생성 시 만든 DOM에 portal로 그린다 — shadcn Button을 그대로 쓰기 위해서다
  const [detailOverlayElement, setDetailOverlayElement] =
    useState<HTMLDivElement | null>(null);
  const selectedPropertyIdRef = useRef(selectedPropertyId);
  // "아직 지오코딩 중이라 마커가 없다"와 "끝났는데 마커가 없다"를 구분하는 데 쓴다
  const placementSettledRef = useRef(false);
  // 지오코딩이 끝나기 전에 고른 매물 — 핀이 놓이는 즉시 한 번 이동한다
  const pendingFocusIdRef = useRef<number | null>(null);
  // 목록에서 고른 매물의 상세 보기 버튼으로 포커스를 옮긴다 — 어떤 매물이 요청했는지 들고 있어야
  // 그 사이 지도 핀 클릭 등으로 다른 매물이 선택되면 낡은 요청을 버릴 수 있다
  const focusRequestedPropertyIdRef = useRef<number | null>(null);
  const detailButtonRef = useRef<HTMLButtonElement>(null);

  // 지도 생성은 마운트에 1회 — SDK 로드 후 컨테이너 크기가 확정되면 만든다
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || !appKey) {
      return;
    }

    let cancelled = false;
    let relayoutFrame = 0;
    let resizeObserver: ResizeObserver | null = null;

    loadKakaoMapSdk()
      .then(() => waitForContainerSize(container))
      .then(() => {
        const maps = getKakaoMaps();
        if (cancelled || !maps) {
          return;
        }

        const createdMap = new maps.Map(container, {
          center: new maps.LatLng(
            SEOUL_CITY_HALL.latitude,
            SEOUL_CITY_HALL.longitude,
          ),
          level: INITIAL_MAP_LEVEL,
          draggable: true,
        });

        const clusterer = new maps.MarkerClusterer({
          map: createdMap,
          markers: [],
          averageCenter: true,
          minLevel: CLUSTER_MIN_LEVEL,
          disableClickZoom: true,
          clickable: true,
          calculator: [10, 30, 50],
          styles: [CLUSTER_STYLE, CLUSTER_STYLE, CLUSTER_STYLE, CLUSTER_STYLE],
        });

        maps.event.addListener(clusterer, "clusterclick", (cluster) => {
          const propertyIds = cluster
            .getMarkers()
            .map((marker) => propertyByMarkerRef.current.get(marker)?.id)
            .filter((id): id is number => id !== undefined);

          selectHandlersRef.current.onSelectCluster(propertyIds);
        });

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
            selectedPropertyIdRef.current,
          );
        });

        // clustered가 저레벨에서도 발화하는지에 의존하지 않는다 — 이동이 멎을 때마다 레벨로 다시 판정한다
        maps.event.addListener(createdMap, "idle", () => {
          syncMarkerLabels(
            createdMap,
            placedMarkersRef.current,
            clusteredMarkersRef.current,
            selectedPropertyIdRef.current,
          );
        });

        // 사이드바를 여닫거나 창 크기가 바뀌면 지도만 다시 재도록 한다
        resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(relayoutFrame);
          relayoutFrame = requestAnimationFrame(() => createdMap.relayout());
        });
        resizeObserver.observe(container);

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

        clustererRef.current = clusterer;
        setMap(createdMap);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapError(
            error instanceof Error
              ? error.message
              : "카카오맵을 불러오지 못했습니다.",
          );
        }
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(relayoutFrame);
      resizeObserver?.disconnect();
      clustererRef.current = null;
      detailOverlayRef.current = null;
      setDetailOverlayElement(null);
      setMap(null);
      container.replaceChildren();
    };
  }, [appKey]);

  // 매물 목록이 바뀌면 지도는 그대로 두고 핀만 갈아끼운다
  useEffect(() => {
    const clusterer = clustererRef.current;
    const maps = getKakaoMaps();
    if (!map || !clusterer || !maps) {
      return;
    }

    placementSettledRef.current = false;
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
      placementSettledRef.current = true;

      // 이전 마커 참조는 새 목록에서 의미가 없다 — clustered가 다시 채운다
      clusteredMarkersRef.current = new Set();
      clusterer.clear();
      // 핀이 하나도 없어도 아래 오버레이 정리와 보류 포커스 처리는 그대로 거쳐야 한다
      if (placed.length > 0) {
        clusterer.addMarkers(placed.map(({ marker }) => marker));
        // 고른 매물이 있으면 사용자가 직접 맞춘 화면이다 — 저장 토글 같은 배경 갱신으로 이 이펙트가
        // 다시 돌 때 전체 범위로 카메라를 되돌리지 않는다. 필터 변경은 선택을 지우므로 다시 맞춘다
        if (selectedPropertyIdRef.current === null) {
          map.setBounds(bounds);
        }
      }
      syncMarkerLabels(
        map,
        placed,
        clusteredMarkersRef.current,
        selectedPropertyIdRef.current,
      );
      syncDetailOverlay(
        map,
        detailOverlayRef.current,
        placed,
        selectedPropertyIdRef.current,
      );

      const pendingFocusId = pendingFocusIdRef.current;
      if (pendingFocusId === null) {
        return;
      }
      pendingFocusIdRef.current = null;
      // 지오코딩이 끝나기 전에 선택이 풀렸다면(Esc 등) 지금 와서 카메라를 튀길 이유가 없다
      if (selectedPropertyIdRef.current !== pendingFocusId) {
        return;
      }

      const pendingTarget = placed.find(
        ({ property }) => property.id === pendingFocusId,
      );
      if (!pendingTarget) {
        // 지오코딩이 끝났는데도 핀이 없다 — 지도로는 영영 열 수 없으니 상세로 바로 보낸다
        focusRequestedPropertyIdRef.current = null;
        onDetailUnavailableRef.current(pendingFocusId);
        return;
      }

      focusPlacedMarker(
        maps,
        map,
        pendingTarget,
        mapContainerRef.current,
        hasBottomSheetRef.current,
      );
      // 방금 syncDetailOverlay가 오버레이를 다시 붙였을 수 있다 — 그때만 버튼이 문서에 존재한다
      focusDetailButtonIfReady(
        focusRequestedPropertyIdRef,
        selectedPropertyIdRef.current,
        detailButtonRef,
      );
    });

    return () => {
      cancelled = true;
      for (const { labelOverlay } of placedMarkersRef.current) {
        labelOverlay.setMap(null);
      }
      placedMarkersRef.current = [];
      // 지난 배치의 마커는 새 목록에서 의미가 없다 — 남겨두면 그 핀 클릭이 낡은 매물을 고른다
      propertyByMarkerRef.current = new Map();
    };
  }, [map, properties]);

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

  useImperativeHandle(
    ref,
    () => ({
      focusProperty: (propertyId: number) => {
        // 키가 없거나 SDK 로드가 실패했으면 지도는 영영 만들어지지 않는다 — 기다려도 배치 이펙트가
        // 돌지 않으므로 보류하지 않고, 지도로 열 수 없는 매물과 같은 길(상세 이동)로 보낸다
        if (!appKey || mapError) {
          pendingFocusIdRef.current = null;
          focusRequestedPropertyIdRef.current = null;
          onDetailUnavailableRef.current(propertyId);
          return;
        }

        // 지도가 아직 없어도(SDK 로딩 중) 클릭을 흘리지 않는다 — 지도가 뜨면 배치 이펙트가 이 값을 집어간다
        pendingFocusIdRef.current = propertyId;
        focusRequestedPropertyIdRef.current = propertyId;

        const maps = getKakaoMaps();
        if (!map || !maps) {
          return;
        }

        const target = placedMarkersRef.current.find(
          ({ property }) => property.id === propertyId,
        );
        if (!target) {
          // placementSettledRef가 true면 지오코딩이 이미 끝난 뒤라는 뜻 — 이 매물은 핀이 영영 없다
          if (placementSettledRef.current) {
            pendingFocusIdRef.current = null;
            focusRequestedPropertyIdRef.current = null;
            onDetailUnavailableRef.current(propertyId);
          }
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
    [map, appKey, mapError],
  );

  // 목록 클릭이 더 이상 상세로 가지 않으므로, 키보드 사용자가 지도까지 Tab으로 넘어가지 않게 한다.
  // 요청한 매물이 여전히 선택돼 있고, 오버레이가 지도에 붙어 버튼이 문서에 있을 때만 포커스를 옮긴다.
  // 둘 중 하나라도 아니면(다른 매물이 선택됐거나 아직 배치 전이면) 여기서는 넘기고, 배치가 끝나
  // 오버레이가 붙는 시점(마커 배치 이펙트)에 다시 시도한다
  useEffect(() => {
    focusDetailButtonIfReady(
      focusRequestedPropertyIdRef,
      selectedPropertyId,
      detailButtonRef,
    );
  }, [selectedPropertyId]);

  const selectedProperty = properties.find(
    ({ id }) => id === selectedPropertyId,
  );

  return (
    <>
      {/* touch-none — 지도 제스처를 페이지 스크롤에 뺏기지 않는다 */}
      <div ref={mapContainerRef} className="absolute inset-0 touch-none" />

      {detailOverlayElement &&
        selectedProperty &&
        createPortal(
          // pb-13(52px) — 48px 핀 위로 버튼을 올린다. yAnchor 1이라 콘텐츠 아래쪽이 핀 끝에 붙는다
          <div className="pb-13">
            <Button
              ref={detailButtonRef}
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

      {(!appKey || mapError) && (
        <div className="absolute inset-0 grid place-items-center bg-muted p-6 text-center">
          <div className="max-w-sm rounded-xl border bg-background p-6 shadow-sm">
            <p className="font-semibold">지도를 표시할 수 없습니다</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {mapError ??
                "카카오맵 키가 설정되지 않았습니다. 관리자에게 문의해 주세요."}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              매물 목록은 그대로 이용할 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

interface PropertyResultItemProps {
  property: PropertyCardItem;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onToggleSave: (id: number, saved: boolean) => void;
  ref: Ref<HTMLButtonElement>;
}

function PropertyResultItem({
  property,
  isSelected,
  onSelect,
  onToggleSave,
  ref,
}: PropertyResultItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl p-2 transition-colors",
        isSelected ? "bg-accent ring-1 ring-primary/30" : "hover:bg-muted",
      )}
    >
      <button
        ref={ref}
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        // 지금 지도가 가리키는 항목이라는 사실을 배경색 말고도 보조 기술에 전한다
        aria-current={isSelected ? "true" : undefined}
        onClick={() => onSelect(property.id)}
      >
        {property.imageUrl ? (
          <img
            src={property.imageUrl}
            alt=""
            className="size-20 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="grid size-20 shrink-0 place-items-center rounded-lg bg-muted">
            <ImageIcon className="size-5 text-muted-foreground" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold">{property.title}</span>
          <span className="mt-1 block font-semibold text-primary">
            {formatPrice(property)}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {property.region} {property.dong} · {property.roomType}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-background"
        aria-label={property.saved ? "매물 저장 취소" : "매물 저장"}
        aria-pressed={property.saved}
        onClick={() => onToggleSave(property.id, !property.saved)}
      >
        <Heart
          className={cn(
            "size-5",
            property.saved
              ? "fill-primary text-primary"
              : "text-muted-foreground",
          )}
        />
      </button>
    </div>
  );
}

function PropertyResultSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2">
      <Skeleton className="size-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-2 h-5 w-24" />
        <Skeleton className="mt-2 h-4 w-32" />
      </div>
    </div>
  );
}

interface PropertyResultListProps {
  properties: PropertyCardItem[];
  isPending: boolean;
  isError: boolean;
  selectedId: number | null;
  onRetry: () => void;
  onResetFilters: () => void;
  onSelect: (id: number) => void;
  onToggleSave: (id: number, saved: boolean) => void;
}

// 사이드바(데스크탑)와 바텀시트(그 미만)가 함께 쓰는 결과 목록 — 조회 상태 분기를 여기서 끝낸다
function PropertyResultList({
  properties,
  isPending,
  isError,
  selectedId,
  onRetry,
  onResetFilters,
  onSelect,
  onToggleSave,
}: PropertyResultListProps) {
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());
  // 목록에서 고른 매물 — 선택이 풀리면 포커스를 돌려줄 자리를 알아야 한다
  const listInvokedIdRef = useRef<number | null>(null);
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  // 지도에서 핀을 고르면 목록도 그 매물로 따라 움직인다
  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    itemRefs.current.get(selectedId)?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [selectedId, prefersReducedMotion]);

  // 목록 클릭으로 옮겨간 포커스는 지도 위 상세 보기 버튼에 있다 — 선택이 풀려 그 버튼이 사라지면
  // 포커스가 body로 떨어져 Tab이 문서 처음부터 다시 시작한다. 눌렀던 항목으로 되돌려준다
  useEffect(() => {
    const invokedId = listInvokedIdRef.current;
    if (invokedId === null || invokedId === selectedId) {
      return;
    }
    listInvokedIdRef.current = null;

    const activeElement = document.activeElement;
    // 지도 핀으로 다른 매물이 선택됐거나 사용자가 포커스를 이미 옮겼다면 빼앗지 않는다
    if (
      selectedId !== null ||
      (activeElement !== null && activeElement !== document.body)
    ) {
      return;
    }
    itemRefs.current.get(invokedId)?.focus();
  }, [selectedId]);

  const selectFromItem = (id: number) => {
    listInvokedIdRef.current = id;
    onSelect(id);
  };

  if (isPending) {
    return (
      <div className="p-2">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <PropertyResultSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="font-medium">매물 목록을 불러오지 못했습니다</p>
        <p className="text-sm text-muted-foreground">
          잠시 후 다시 시도해 주세요.
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <SearchX className="size-10 text-muted-foreground" />
        <p className="font-medium">조건에 맞는 매물이 없습니다</p>
        <p className="text-sm text-muted-foreground">
          필터를 넓히면 더 많은 매물을 볼 수 있습니다.
        </p>
        <Button variant="outline" size="sm" onClick={onResetFilters}>
          필터 초기화
        </Button>
      </div>
    );
  }

  return (
    <div className="p-2">
      {properties.map((property) => (
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
          onSelect={selectFromItem}
          onToggleSave={onToggleSave}
        />
      ))}
    </div>
  );
}

interface ResultHeaderProps {
  title: string;
  isFiltered: boolean;
  onClearSelection: () => void;
}

function ResultHeader({
  title,
  isFiltered,
  onClearSelection,
}: ResultHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-4">
      <p className="truncate font-semibold">{title}</p>
      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          전체 보기
        </Button>
      )}
    </div>
  );
}

function PropertyMarkerLegend() {
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 px-3 py-2 text-xs font-medium",
        FLOATING_SURFACE,
      )}
      aria-label="매물 마커 색상 범례"
    >
      {Object.values(DEAL_TYPE_MARKER).map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5">
          <MapPin
            aria-hidden
            className="size-3.5 shrink-0"
            fill="currentColor"
            strokeWidth={2.5}
            style={{ color }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

// 화면 필터 → 매물 목록 API 쿼리 파라미터 (선택하지 않은 값은 보내지 않는다)
// 월세 탭의 가격 축은 보증금 구간이라 밴드 목록이 갈린다.
// "서울시 강남구 역삼동" 같은 검색어는 시군구 필터와 나머지 검색어로 분리하되,
// 지역 셀렉트를 직접 골랐다면 그 선택이 우선한다
function toQueryFilters(filters: Filters, query: string): PropertyFilters {
  const bands =
    filters.dealType === "월세" ? MONTHLY_DEPOSIT_BANDS : PRICE_BANDS;
  const band = bands.find((b) => b.value === filters.price);
  const parsed = parseRegionQuery(query);

  return {
    query: parsed.query,
    transactionType:
      filters.dealType === "all" ? undefined : (filters.dealType as DealType),
    sigungu: filters.region === "all" ? parsed.sigungu : filters.region,
    roomType:
      filters.buildingType === "all"
        ? undefined
        : (filters.buildingType as RoomType),
    minDeposit: band && band.min > 0 ? band.min : undefined,
    maxDeposit: band && Number.isFinite(band.max) ? band.max : undefined,
  };
}

// 사이드바·바텀시트 머리글에 같은 문구를 쓴다 — 지금 목록이 무엇을 보여주는지 한 줄로 말한다.
// 핀 하나를 고른 경우 목록은 그대로 두고 강조만 하므로 건수도 전체 그대로다
function getResultTitle(
  isPending: boolean,
  isClusterSelected: boolean,
  resultCount: number,
) {
  if (isPending) {
    return "매물 찾는 중";
  }
  if (isClusterSelected) {
    return `선택 영역 ${resultCount}건`;
  }
  return `매물 ${resultCount}건`;
}

interface PropertyListPageProps {
  canCreate: boolean;
  onOpen: (id: number) => void;
  onCreate: () => void;
}

// PAGE-03·04 매물 탐색 — 지도가 화면 전체를 쓰고, 검색·필터·결과 목록이 그 위에 얹힌다.
function PropertyListPage({
  canCreate,
  onOpen,
  onCreate,
}: PropertyListPageProps) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sheetDragStartYRef = useRef<number | null>(null);
  const didDragSheetRef = useRef(false);
  const propertyMapRef = useRef<PropertyMapHandle>(null);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const debouncedQuery = useDebouncedValue(filters.query.trim());
  const { mutate: toggleFavorite } = useToggleFavorite();

  const queryFilters = useMemo(
    () => toQueryFilters(filters, debouncedQuery),
    [filters, debouncedQuery],
  );
  const { data, isPending, isError, refetch } = usePropertyList(queryFilters, {
    page: 0,
    size: MAP_RESULT_SIZE,
  });
  const items = useMemo(
    () => data?.content.map(toPropertyCardItem) ?? [],
    [data],
  );

  const selectedId = selection?.kind === "marker" ? selection.propertyId : null;
  const isClusterSelected = selection?.kind === "cluster";
  const listedProperties = isClusterSelected
    ? items.filter((property) => selection.propertyIds.includes(property.id))
    : items;
  const activeFilterCount = countActiveFilters(filters);
  const resultCount = isClusterSelected
    ? listedProperties.length
    : (data?.totalElements ?? 0);
  const resultTitle = getResultTitle(isPending, isClusterSelected, resultCount);

  const changeFilters = (next: Filters) => {
    setFilters(next);
    setSelection(null);
  };

  const resetFilters = () => changeFilters(resetPanelFilters(filters));

  const showResults = () => {
    setIsSidebarOpen(true);
    setIsSheetOpen(true);
  };

  const selectMarker = (propertyId: number) => {
    setSelection({ kind: "marker", propertyId });
    showResults();
  };

  const selectCluster = (propertyIds: number[]) => {
    setSelection({ kind: "cluster", propertyIds });
    showResults();
  };

  // 목록에서 고르면 상세로 튀지 않고 지도를 그 매물로 좁힌다 — 탐색 맥락을 잃지 않는다
  const selectFromList = (propertyId: number) => {
    setSelection({ kind: "marker", propertyId });
    propertyMapRef.current?.focusProperty(propertyId);
  };

  // 저장은 로그인 사용자만 가능 — 비로그인 상태에서는 401 대신 로그인 화면으로 보낸다
  const handleToggleSave = (propertyId: number, saved: boolean) => {
    if (!user) {
      navigate("/login");
      return;
    }
    setSaveError(null);
    toggleFavorite(
      { propertyId, saved },
      {
        onError: () =>
          setSaveError(
            saved
              ? "매물을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "저장을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          ),
      },
    );
  };

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

  const filterPanel = (
    <PropertyFilterPanel
      filters={filters}
      onChange={changeFilters}
      resultCount={data?.totalElements}
    />
  );

  return (
    <div className="flex h-[calc(100svh-var(--nav-h)-var(--tabbar-h))] overflow-hidden sm:h-[calc(100svh-var(--nav-h))]">
      <aside
        className={cn(
          "hidden h-full shrink-0 overflow-hidden border-r bg-background transition-[width] duration-300 motion-reduce:transition-none lg:block",
          isSidebarOpen ? "w-88" : "w-0",
        )}
        aria-label="매물 목록"
      >
        <div className="flex h-full w-88 flex-col py-4">
          <ResultHeader
            title={resultTitle}
            isFiltered={isClusterSelected}
            onClearSelection={() => setSelection(null)}
          />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t">
            {resultList}
          </div>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        <PropertyMap
          ref={propertyMapRef}
          properties={items}
          hasBottomSheet={!isDesktop}
          selectedPropertyId={selectedId}
          onSelectMarker={selectMarker}
          onSelectCluster={selectCluster}
          onOpenDetail={onOpen}
          onDetailUnavailable={onOpen}
        />

        {/* 목록 손잡이도 검색·필터·범례와 같은 왼쪽 여백(left-3)에 같은 재질로 세운다 */}
        <button
          type="button"
          className={cn(
            "absolute top-1/2 left-3 z-20 hidden size-11 -translate-y-1/2 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:grid",
            FLOATING_SURFACE,
          )}
          aria-expanded={isSidebarOpen}
          aria-label={isSidebarOpen ? "매물 목록 접기" : "매물 목록 펼치기"}
          onClick={() => setIsSidebarOpen((current) => !current)}
        >
          {isSidebarOpen ? (
            <ChevronLeft className="size-5" />
          ) : (
            <ChevronRight className="size-5" />
          )}
        </button>

        {isFilterOpen && isDesktop && (
          <button
            type="button"
            aria-label="필터 닫기"
            className="absolute inset-0 z-20 cursor-default"
            onClick={() => setIsFilterOpen(false)}
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3">
          <div className="pointer-events-auto relative min-w-0 flex-1 sm:max-w-72">
            {/* z-10 — backdrop-blur를 쓰는 Input이 쌓임 맥락을 만들어 아이콘을 덮는다 */}
            <Search className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="매물명·지역 검색"
              className={cn("h-11 pl-10", FLOATING_SURFACE)}
              value={filters.query}
              onChange={(event) =>
                changeFilters({ ...filters, query: event.target.value })
              }
            />
          </div>

          <div className="pointer-events-auto relative shrink-0">
            <button
              type="button"
              className={cn(
                "flex h-11 items-center gap-1.5 px-4 text-sm font-medium transition-colors",
                FLOATING_SURFACE,
                isFilterOpen &&
                  "border-primary bg-primary text-primary-foreground",
              )}
              aria-expanded={isFilterOpen}
              onClick={() => setIsFilterOpen((current) => !current)}
            >
              {isFilterOpen ? (
                <X className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              필터
              {activeFilterCount > 0 && !isFilterOpen && (
                <span className="grid size-5 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {isFilterOpen && isDesktop && (
              <div className="absolute top-13 left-0 w-88 rounded-xl border bg-background p-4 shadow-lg">
                {filterPanel}
              </div>
            )}
          </div>

          {/* 지도 우하단은 카카오 로고·축척이 쓰는 자리라, 등록 버튼도 상단 줄에 함께 세운다 */}
          {canCreate && (
            <Button
              className="pointer-events-auto ml-auto h-11 shrink-0 rounded-full shadow-md"
              aria-label="매물 등록"
              onClick={onCreate}
            >
              <Plus />
              <span className="hidden sm:inline">매물 등록</span>
            </Button>
          )}
        </div>

        <div className="pointer-events-none absolute top-16 left-3 z-20">
          <PropertyMarkerLegend />
        </div>

        <section
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t bg-background shadow-[0_-4px_16px_rgba(15,23,42,0.12)] transition-[height] duration-300 motion-reduce:transition-none lg:hidden",
            isSheetOpen ? "h-[50%]" : "h-16",
          )}
          aria-label="매물 목록"
        >
          <button
            type="button"
            className="relative flex h-16 shrink-0 touch-none items-center justify-between px-5 pt-2 text-left"
            aria-expanded={isSheetOpen}
            onClick={() => {
              if (didDragSheetRef.current) {
                didDragSheetRef.current = false;
                return;
              }
              setIsSheetOpen((current) => !current);
            }}
            onPointerDown={(event) => {
              didDragSheetRef.current = false;
              sheetDragStartYRef.current = event.clientY;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              const startY = sheetDragStartYRef.current;
              sheetDragStartYRef.current = null;
              if (startY === null) {
                return;
              }

              const distance = event.clientY - startY;
              if (distance < -SHEET_DRAG_THRESHOLD_PX) {
                didDragSheetRef.current = true;
                setIsSheetOpen(true);
              }
              if (distance > SHEET_DRAG_THRESHOLD_PX) {
                didDragSheetRef.current = true;
                setIsSheetOpen(false);
              }
            }}
          >
            <span
              aria-hidden
              className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-border"
            />
            <span>
              <span className="block font-semibold">{resultTitle}</span>
              {!isSheetOpen && (
                <span className="text-xs text-muted-foreground">
                  위로 올려 목록 보기
                </span>
              )}
            </span>
            {isSheetOpen ? (
              <ChevronDown className="size-5 text-muted-foreground" />
            ) : (
              <ChevronUp className="size-5 text-muted-foreground" />
            )}
          </button>

          {isSheetOpen && isClusterSelected && (
            <div className="shrink-0 px-4 pb-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setSelection(null)}
              >
                전체 매물 보기
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto border-t">
            {resultList}
          </div>
        </section>
      </main>

      <Drawer open={isFilterOpen && !isDesktop} onOpenChange={setIsFilterOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>필터</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8">{filterPanel}</div>
        </DrawerContent>
      </Drawer>

      {saveError && (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-4 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-xl border bg-background px-4 py-3 text-sm shadow-sm"
        >
          {saveError}
        </div>
      )}
    </div>
  );
}

export default PropertyListPage;
