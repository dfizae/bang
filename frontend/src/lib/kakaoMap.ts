import type { PropertyEnvironment } from "@/types";

// 카카오맵 JS SDK 로더 — 주소 → 좌표 변환(지오코딩)과 주변 편의시설 집계.
// SDK의 services.Geocoder·Places는 카카오 로컬 API를 감싸며 응답 문서 구조도 같다.
// https://developers.kakao.com/docs/ko/local/dev-guide

const SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";

interface KakaoLotAddress {
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
  region_3depth_name: string;
  main_address_no: string;
  sub_address_no: string;
}

interface KakaoRoadAddress {
  address_name: string;
  building_name: string;
}

interface KakaoAddressDocument {
  address_name: string;
  x: string;
  y: string;
  address?: KakaoLotAddress;
  road_address?: KakaoRoadAddress;
}

export type KakaoLatLng = object;

export interface KakaoLatLngBounds {
  extend: (position: KakaoLatLng) => void;
}

export interface KakaoPoint {
  x: number;
  y: number;
}

export interface KakaoMapProjection {
  pointFromCoords: (position: KakaoLatLng) => KakaoPoint;
  coordsFromPoint: (point: KakaoPoint) => KakaoLatLng;
}

export interface KakaoMap {
  panTo: (position: KakaoLatLng) => void;
  relayout: () => void;
  setBounds: (bounds: KakaoLatLngBounds) => void;
  getProjection: () => KakaoMapProjection;
  getLevel: () => number;
  setLevel: (level: number) => void;
}

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

export interface KakaoClusterer {
  clear: () => void;
  addMarkers: (markers: KakaoMarker[]) => void;
}

export interface KakaoClusterStyle {
  width: string;
  height: string;
  background: string;
  borderRadius: string;
  color: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  textAlign: string;
  boxShadow: string;
}

interface KakaoPlace {
  id: string;
  place_name: string;
  distance: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
}

interface KakaoPagination {
  totalCount: number;
}

interface KakaoPlacesSearchOptions {
  location: KakaoLatLng;
  radius: number;
  sort: string;
}

type KakaoPlacesCallback = (
  result: KakaoPlace[],
  status: string,
  pagination: KakaoPagination,
) => void;

interface KakaoPlaces {
  categorySearch: (
    categoryCode: string,
    callback: KakaoPlacesCallback,
    options: KakaoPlacesSearchOptions,
  ) => void;
  keywordSearch: (
    keyword: string,
    callback: KakaoPlacesCallback,
    options: KakaoPlacesSearchOptions,
  ) => void;
}

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

export type KakaoMapsSdk = {
  load: (callback: () => void) => void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Size: new (width: number, height: number) => object;
  Point: new (x: number, y: number) => KakaoPoint;
  MarkerImage: new (
    source: string,
    size: object,
    options: { offset: KakaoPoint },
  ) => KakaoMarkerImage;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number; draggable?: boolean },
  ) => KakaoMap;
  Marker: new (options: {
    position: KakaoLatLng;
    title: string;
    image?: KakaoMarkerImage;
  }) => KakaoMarker;
  MarkerClusterer: new (options: {
    map: KakaoMap;
    markers: KakaoMarker[];
    averageCenter: boolean;
    minLevel: number;
    disableClickZoom: boolean;
    clickable: boolean;
    calculator: number[];
    styles: KakaoClusterStyle[];
  }) => KakaoClusterer;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
    map?: KakaoMap;
  }) => KakaoCustomOverlay;
  event: {
    addListener: KakaoEventAddListener;
  };
  services: {
    Status: { OK: string; ZERO_RESULT: string };
    SortBy: { DISTANCE: string };
    Geocoder: new () => {
      addressSearch: (
        address: string,
        callback: (result: KakaoAddressDocument[], status: string) => void,
      ) => void;
    };
    Places: new () => KakaoPlaces;
  };
};

export function getKakaoMaps() {
  return (window as Window & { kakao?: { maps: KakaoMapsSdk } }).kakao?.maps;
}

let sdkLoader: Promise<void> | null = null;

// 같은 스크립트를 중복 삽입하지 않도록 로딩 Promise를 모듈 단위로 공유한다
export function loadKakaoMapSdk(): Promise<void> {
  if (getKakaoMaps()) {
    return Promise.resolve();
  }
  if (sdkLoader) {
    return sdkLoader;
  }

  const appKey = import.meta.env.VITE_KAKAO_KEY;
  if (!appKey) {
    return Promise.reject(new Error("카카오맵 키가 설정되지 않았습니다."));
  }

  sdkLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${SDK_URL}?appkey=${appKey}&autoload=false&libraries=services,clusterer`;
    script.async = true;
    script.onload = () => getKakaoMaps()?.load(resolve);
    script.onerror = () => {
      // 다음 시도에서 다시 로드할 수 있도록 실패한 Promise는 버린다
      sdkLoader = null;
      reject(new Error("카카오맵을 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });

  return sdkLoader;
}

export interface GeocodedAddress {
  addressName: string;
  sigungu: string;
  dong: string;
  lotNumber: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
}

// 지번 주번지-부번지 (부번지가 0이거나 없으면 주번지만)
function formatLotNumber(address: KakaoLotAddress | undefined): string {
  if (!address?.main_address_no) {
    return "";
  }
  const subAddressNo = address.sub_address_no;
  if (!subAddressNo || subAddressNo === "0") {
    return address.main_address_no;
  }
  return `${address.main_address_no}-${subAddressNo}`;
}

function toGeocodedAddress(document: KakaoAddressDocument): GeocodedAddress {
  const lotAddress = document.address;

  return {
    addressName: document.address_name,
    // 세종시처럼 구 단위가 없는 지역은 시도명을 시군구 값으로 사용한다
    sigungu:
      lotAddress?.region_2depth_name || lotAddress?.region_1depth_name || "",
    dong: lotAddress?.region_3depth_name ?? "",
    lotNumber: formatLotNumber(lotAddress),
    roadAddress: document.road_address?.address_name ?? "",
    latitude: Number(document.y),
    longitude: Number(document.x),
  };
}

/**
 * 지번·도로명 주소를 좌표와 주소 구성요소로 변환한다.
 * @throws {Error} SDK 로드 실패, 검색 결과 없음 — 메시지를 그대로 사용자에게 노출할 수 있다
 */
export async function searchAddress(query: string): Promise<GeocodedAddress> {
  await loadKakaoMapSdk();
  const maps = getKakaoMaps();
  if (!maps) {
    throw new Error("카카오맵을 불러오지 못했습니다.");
  }

  return new Promise((resolve, reject) => {
    new maps.services.Geocoder().addressSearch(query, (result, status) => {
      if (status !== maps.services.Status.OK || !result[0]) {
        reject(
          new Error(
            "주소를 찾지 못했습니다. 지번 또는 도로명 주소를 확인해주세요.",
          ),
        );
        return;
      }
      resolve(toGeocodedAddress(result[0]));
    });
  });
}

// 주소 → 좌표 캐시 — 필터가 바뀌어도 같은 동은 다시 지오코딩하지 않는다 (카카오 쿼터 절약)
const addressLookupCache = new Map<string, Promise<GeocodedAddress | null>>();

/**
 * 캐시된 주소 조회. {@link searchAddress}와 달리 실패를 예외로 올리지 않고 `null`을 돌려준다 —
 * 지도 핀은 일부 주소를 찾지 못해도 나머지를 그려야 하기 때문이다.
 */
export function lookupAddress(query: string): Promise<GeocodedAddress | null> {
  const cached = addressLookupCache.get(query);
  if (cached) {
    return cached;
  }

  const lookup = searchAddress(query).catch(() => null);
  addressLookupCache.set(query, lookup);
  // 실패(쿼터·일시 오류)는 캐시에 남기지 않아 다음 갱신에서 재시도된다
  void lookup.then((address) => {
    if (address === null) {
      addressLookupCache.delete(query);
    }
  });
  return lookup;
}

/**
 * 좌표를 화면 정중앙이 아니라 중앙에서 `offsetPixel`만큼 위에 놓고 이동한다.
 * 하단 시트처럼 지도 아래쪽을 덮는 UI가 있을 때, 방금 고른 핀이 그 아래로 숨지 않게 한다.
 */
export function panToAboveCenter(
  maps: KakaoMapsSdk,
  map: KakaoMap,
  position: KakaoLatLng,
  offsetPixel: number,
) {
  if (offsetPixel <= 0) {
    map.panTo(position);
    return;
  }

  const projection = map.getProjection();
  const point = projection.pointFromCoords(position);
  // 화면 y는 아래로 갈수록 커진다 — 지도 중심을 아래로 내리면 핀은 그만큼 위로 올라간다
  const shifted = new maps.Point(point.x, point.y + offsetPixel);
  map.panTo(projection.coordsFromPoint(shifted));
}

// 황금각(2.399963rad) 나선 — 같은 좌표에 겹친 핀을 균등하게 흩는다
const SPREAD_ANGLE_RADIAN = 2.399963;
const SPREAD_RADIUS_DEGREE = 0.00045;

/**
 * 매물 목록 응답에는 개별 위경도가 없어 같은 동의 매물이 동일 좌표에 겹친다.
 * 같은 주소의 두 번째 매물부터 가까운 반경에 펼쳐, 확대 시 모든 핀이 보이게 한다.
 */
export function spreadOverlappingPosition(
  latitude: number,
  longitude: number,
  overlapIndex: number,
) {
  if (overlapIndex === 0) {
    return { latitude, longitude };
  }

  const angle = overlapIndex * SPREAD_ANGLE_RADIAN;
  const radius = SPREAD_RADIUS_DEGREE * Math.sqrt(overlapIndex);
  // 경도 1도의 실제 거리는 고위도로 갈수록 짧아진다 — 위도별로 보정해 원형을 유지한다
  const longitudeScale = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);

  return {
    latitude: latitude + Math.sin(angle) * radius,
    longitude: longitude + (Math.cos(angle) * radius) / longitudeScale,
  };
}

/**
 * 지도 생성은 컨테이너가 실제 크기를 가진 뒤여야 한다 — 크기 확정 전에 만들면
 * 내부 뷰포트 계산이 어긋나 빈 지도가 나온다 (relayout 타이머로 때우지 않는다).
 */
export function waitForContainerSize(element: HTMLElement) {
  return new Promise<void>((resolve) => {
    if (element.clientWidth > 0 && element.clientHeight > 0) {
      resolve();
      return;
    }
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(element);
  });
}

// 도보 1분 = 67m (성인 평균 보행 속도 4km/h) — 매물 상세의 편의시설 표기와 같은 기준
const WALKING_METERS_PER_MINUTE = 67;
// 생활 편의시설 집계 반경 — 도보 약 7분 거리
const FACILITY_RADIUS_METER = 500;
// 지하철역은 생활권보다 넓게 잡아 가장 가까운 역 하나를 찾는다
const STATION_RADIUS_METER = 3_000;

const SUBWAY_CATEGORY_CODE = "SW8";

// 카카오 장소 카테고리 코드로 집계하는 항목
const FACILITY_CATEGORY_CODES = {
  convenienceStoreCount: "CS2",
} as const;

// 대응하는 카테고리 코드가 없어 키워드로 집계하는 항목
const FACILITY_KEYWORDS = {
  laundryCount: "셀프빨래방",
} as const;

type FacilityCountField =
  keyof typeof FACILITY_CATEGORY_CODES | keyof typeof FACILITY_KEYWORDS;

type PlacesQuery = { categoryCode: string } | { keyword: string };

// 카카오는 검색 결과를 15건씩 나눠 주므로, 총 개수는 pagination.totalCount에서 읽는다
function searchPlaces(
  maps: KakaoMapsSdk,
  places: KakaoPlaces,
  query: PlacesQuery,
  radius: number,
  center: KakaoLatLng,
): Promise<{ places: KakaoPlace[]; totalCount: number }> {
  const options: KakaoPlacesSearchOptions = {
    location: center,
    radius,
    sort: maps.services.SortBy.DISTANCE,
  };

  return new Promise((resolve, reject) => {
    const handleSearch: KakaoPlacesCallback = (result, status, pagination) => {
      if (status === maps.services.Status.ZERO_RESULT) {
        resolve({ places: [], totalCount: 0 });
        return;
      }
      if (status !== maps.services.Status.OK) {
        reject(new Error("주변 편의시설을 조회하지 못했습니다."));
        return;
      }
      resolve({
        places: result,
        totalCount: pagination?.totalCount ?? result.length,
      });
    };

    if ("categoryCode" in query) {
      places.categorySearch(query.categoryCode, handleSearch, options);
      return;
    }
    places.keywordSearch(query.keyword, handleSearch, options);
  });
}

async function findNearestStation(
  maps: KakaoMapsSdk,
  places: KakaoPlaces,
  center: KakaoLatLng,
) {
  const { places: stations } = await searchPlaces(
    maps,
    places,
    { categoryCode: SUBWAY_CATEGORY_CODE },
    STATION_RADIUS_METER,
    center,
  );
  const nearest = stations[0];
  if (!nearest) {
    return null;
  }

  const distanceMeter = Number(nearest.distance);
  return {
    nearestStationName: nearest.place_name,
    stationDistanceMeter: distanceMeter,
    stationWalkingMinutes: Math.max(
      1,
      Math.ceil(distanceMeter / WALKING_METERS_PER_MINUTE),
    ),
  };
}

async function countFacilities(
  maps: KakaoMapsSdk,
  places: KakaoPlaces,
  center: KakaoLatLng,
): Promise<Record<FacilityCountField, number>> {
  const queries: Array<readonly [FacilityCountField, PlacesQuery]> = [
    ...Object.entries(FACILITY_CATEGORY_CODES).map(
      ([field, categoryCode]) =>
        [field as FacilityCountField, { categoryCode }] as const,
    ),
    ...Object.entries(FACILITY_KEYWORDS).map(
      ([field, keyword]) => [field as FacilityCountField, { keyword }] as const,
    ),
  ];

  const counted = await Promise.all(
    queries.map(async ([field, query]) => {
      const { totalCount } = await searchPlaces(
        maps,
        places,
        query,
        FACILITY_RADIUS_METER,
        center,
      );
      return [field, totalCount] as const;
    }),
  );

  return Object.fromEntries(counted) as Record<FacilityCountField, number>;
}

/**
 * 좌표 주변의 생활 편의시설을 집계한다 (property_environment 테이블 형태).
 * 편의시설 개수는 반경 {@link FACILITY_RADIUS_METER}m 기준이고,
 * 지하철역은 반경 {@link STATION_RADIUS_METER}m 안에서 가장 가까운 한 곳을 찾는다.
 * @throws {Error} SDK 로드 실패, 장소 검색 실패
 */
export async function searchPropertyEnvironment(
  latitude: number,
  longitude: number,
): Promise<PropertyEnvironment> {
  await loadKakaoMapSdk();
  const maps = getKakaoMaps();
  if (!maps) {
    throw new Error("카카오맵을 불러오지 못했습니다.");
  }

  const places = new maps.services.Places();
  const center = new maps.LatLng(latitude, longitude);
  const [station, counts] = await Promise.all([
    findNearestStation(maps, places, center),
    countFacilities(maps, places, center),
  ]);

  return { ...counts, ...station };
}
