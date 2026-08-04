import type { PropertyEnvironment } from "@/types";

// 카카오 로컬 REST API — 주소 → 좌표 변환과 주변 편의시설 집계.
// https://developers.kakao.com/docs/ko/local/dev-guide
//
// 백엔드 fetcher(api/client.ts)는 우리 서버 전용(baseURL·Bearer 토큰 주입)이라
// 외부 API인 여기서는 쓰지 않고 fetch로 직접 호출한다.

const LOCAL_API_URL = "https://dapi.kakao.com/v2/local";

interface LocalResponse<T> {
  meta: {
    // 검색된 문서 수 — pageable_count(최대 45)와 달리 잘리지 않는다
    total_count: number;
    pageable_count: number;
  };
  documents: T[];
}

async function requestLocalApi<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<LocalResponse<T>> {
  const restApiKey = import.meta.env.VITE_KAKAO_CLIENT_ID;
  if (!restApiKey) {
    throw new Error("카카오 REST API 키가 설정되지 않았습니다.");
  }

  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  const response = await fetch(`${LOCAL_API_URL}${path}?${query}`, {
    headers: { Authorization: `KakaoAK ${restApiKey}` },
  });
  if (!response.ok) {
    throw new Error("카카오 지도 서비스에 연결하지 못했습니다.");
  }
  return response.json() as Promise<LocalResponse<T>>;
}

interface KakaoLotAddress {
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
  region_3depth_name: string;
  main_address_no: string;
  sub_address_no: string;
}

interface KakaoAddressDocument {
  address_name: string;
  x: string;
  y: string;
  address?: KakaoLotAddress;
  road_address?: { address_name: string; building_name: string };
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
 * @throws {Error} 검색 결과 없음·통신 실패 — 메시지를 그대로 사용자에게 노출할 수 있다
 */
export async function searchAddress(query: string): Promise<GeocodedAddress> {
  const { documents } = await requestLocalApi<KakaoAddressDocument>(
    "/search/address.json",
    { query, size: 1 },
  );
  const document = documents[0];
  if (!document) {
    throw new Error(
      "주소를 찾지 못했습니다. 지번 또는 도로명 주소를 확인해주세요.",
    );
  }
  return toGeocodedAddress(document);
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

interface KakaoPlaceDocument {
  id: string;
  place_name: string;
  distance: string;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

// 카카오 좌표 파라미터는 x=경도, y=위도
function searchPlaces(
  query: PlacesQuery,
  { latitude, longitude }: Coordinates,
  radius: number,
  size: number,
) {
  const params = {
    x: longitude,
    y: latitude,
    radius,
    sort: "distance",
    size,
  };

  if ("categoryCode" in query) {
    return requestLocalApi<KakaoPlaceDocument>("/search/category.json", {
      ...params,
      category_group_code: query.categoryCode,
    });
  }
  return requestLocalApi<KakaoPlaceDocument>("/search/keyword.json", {
    ...params,
    query: query.keyword,
  });
}

// 문서는 1건만 받고 개수는 meta.total_count에서 읽는다.
// (JS SDK의 pagination.totalCount는 노출 가능 문서 수라 45에서 잘린다)
async function countPlaces(query: PlacesQuery, center: Coordinates) {
  const { meta } = await searchPlaces(query, center, FACILITY_RADIUS_METER, 1);
  return meta.total_count;
}

async function findNearestStation(center: Coordinates) {
  const { documents } = await searchPlaces(
    { categoryCode: SUBWAY_CATEGORY_CODE },
    center,
    STATION_RADIUS_METER,
    1,
  );
  const nearest = documents[0];
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
  center: Coordinates,
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
      return [field, await countPlaces(query, center)] as const;
    }),
  );

  return Object.fromEntries(counted) as Record<FacilityCountField, number>;
}

/**
 * 좌표 주변의 생활 편의시설을 집계한다 (property_environment 테이블 형태).
 * 편의시설 개수는 반경 {@link FACILITY_RADIUS_METER}m 기준이고,
 * 지하철역은 반경 {@link STATION_RADIUS_METER}m 안에서 가장 가까운 한 곳을 찾는다.
 * @throws {Error} 장소 검색 실패
 */
export async function searchPropertyEnvironment({
  latitude,
  longitude,
}: Coordinates): Promise<PropertyEnvironment> {
  const center = { latitude, longitude };
  const [station, counts] = await Promise.all([
    findNearestStation(center),
    countFacilities(center),
  ]);

  return { ...counts, ...station };
}
