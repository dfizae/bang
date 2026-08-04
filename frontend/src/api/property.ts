import { api } from "@/api/client";
import type {
  MapBounds,
  Page,
  PagingParams,
  PropertyCreateInput,
  PropertyDetail,
  PropertyFilterOptions,
  PropertyFilters,
  PropertyMapPin,
  PropertySummary,
  PropertyUpdateInput,
} from "@/types";

// PROP-02 목록 / PROP-03 상세 / PROP-06 지도 / PROP-07 등록 / PROP-08 수정 / PROP-09 삭제 (/api/properties)
// 필드명은 도메인 타입과 대부분 1:1이라, 여기서는 두 가지만 변환한다.
//  - 금액: 백엔드는 원 단위, 화면·폼은 만원 단위
//  - 사진: 상세·업로드 응답은 { imageId, imageUrl, sequence } 배열, 화면은 URL 목록

const PROPERTIES_PATH = "/api/properties";
const WON_PER_MANWON = 10_000;

const toManwon = (won: number) => won / WON_PER_MANWON;
const toWon = (manwon: number) => Math.round(manwon * WON_PER_MANWON);

// 선택 금액 필드 — 백엔드가 null로 비워 보내면 값 없음으로 둔다
const toManwonOptional = (won: number | null | undefined) =>
  won === null || won === undefined ? undefined : toManwon(won);
const toWonOptional = (manwon: number | undefined) =>
  manwon === undefined ? undefined : toWon(manwon);

interface PropertyImageResponse {
  imageId: number;
  imageUrl: string;
  sequence: number;
}

interface PropertyAgentResponse {
  agentId: number;
  name: string;
  phone?: string | null;
}

// 백엔드 원본 응답 — 도메인 타입과 다른 부분(금액 단위·사진 형태)만 따로 표기한다
export type PropertySummaryResponse = Omit<PropertySummary, "imageUrl">;

type PropertyDetailResponse = Omit<
  PropertyDetail,
  "imageUrl" | "imageUrls" | "nearbyFacilities" | "maintenanceFee" | "agent"
> & {
  maintenanceFee?: number | null;
  images?: PropertyImageResponse[] | null;
  agent?: PropertyAgentResponse | null;
};

function toImageUrls(images: PropertyImageResponse[] | null | undefined) {
  if (!images || images.length === 0) {
    return undefined;
  }
  return [...images]
    .sort((first, second) => first.sequence - second.sequence)
    .map((image) => image.imageUrl);
}

function toPropertySummary(response: PropertySummaryResponse): PropertySummary {
  return {
    ...response,
    deposit: toManwon(response.deposit),
    monthlyRent: toManwon(response.monthlyRent),
  };
}

// 저장한 매물 목록(api/favorite.ts)도 같은 요약 스키마를 쓰므로 변환을 공유한다
export function toPropertySummaryPage(
  page: Page<PropertySummaryResponse>,
): Page<PropertySummary> {
  return { ...page, content: page.content.map(toPropertySummary) };
}

function toPropertyDetail(response: PropertyDetailResponse): PropertyDetail {
  const { images, agent, ...rest } = response;

  return {
    ...rest,
    deposit: toManwon(response.deposit),
    monthlyRent: toManwon(response.monthlyRent),
    maintenanceFee: toManwonOptional(response.maintenanceFee),
    imageUrls: toImageUrls(images),
    agent: agent ? { ...agent, phone: agent.phone ?? undefined } : undefined,
  };
}

function toFilterParams(filters: PropertyFilters) {
  return {
    ...filters,
    minDeposit: toWonOptional(filters.minDeposit),
    maxDeposit: toWonOptional(filters.maxDeposit),
  };
}

function toRequestBody(input: PropertyCreateInput | PropertyUpdateInput) {
  return {
    ...input,
    deposit: toWon(input.deposit),
    monthlyRent: toWonOptional(input.monthlyRent),
    maintenanceFee: toWonOptional(input.maintenanceFee),
  };
}

export function getProperties(
  filters: PropertyFilters,
  paging: PagingParams = {},
  signal?: AbortSignal,
): Promise<Page<PropertySummary>> {
  return api
    .get<Page<PropertySummaryResponse>>({
      path: PROPERTIES_PATH,
      config: { params: { ...toFilterParams(filters), ...paging }, signal },
    })
    .then(toPropertySummaryPage);
}

// 로그인한 중개사가 등록한 매물만 조회
export function getMyProperties(
  paging: PagingParams = {},
  signal?: AbortSignal,
): Promise<Page<PropertySummary>> {
  return api
    .get<Page<PropertySummaryResponse>>({
      path: `${PROPERTIES_PATH}/me`,
      config: { params: paging, signal },
    })
    .then(toPropertySummaryPage);
}

export function getProperty(
  propertyId: number,
  signal?: AbortSignal,
): Promise<PropertyDetail> {
  return api
    .get<PropertyDetailResponse>({
      path: `${PROPERTIES_PATH}/${propertyId}`,
      config: { signal },
    })
    .then(toPropertyDetail);
}

// 검색 필터 선택지 — 지역 목록을 하드코딩하지 않고 등록된 매물에서 받아온다
export function getPropertyFilterOptions(
  signal?: AbortSignal,
): Promise<PropertyFilterOptions> {
  return api.get<PropertyFilterOptions>({
    path: `${PROPERTIES_PATH}/filters`,
    config: { signal },
  });
}

// 지도 영역(남서·북동 좌표) 안의 매물 핀
export function getPropertiesInBounds(
  bounds: MapBounds,
  signal?: AbortSignal,
): Promise<PropertyMapPin[]> {
  return api
    .get<PropertyMapPin[]>({
      path: `${PROPERTIES_PATH}/map`,
      config: { params: bounds, signal },
    })
    .then((pins) =>
      pins.map((pin) => ({
        ...pin,
        deposit: toManwon(pin.deposit),
        monthlyRent: toManwon(pin.monthlyRent),
      })),
    );
}

export function createProperty(
  input: PropertyCreateInput,
): Promise<PropertyDetail> {
  return api
    .post<PropertyDetailResponse>({
      path: PROPERTIES_PATH,
      body: toRequestBody(input),
    })
    .then(toPropertyDetail);
}

export function updateProperty(
  propertyId: number,
  input: PropertyUpdateInput,
): Promise<PropertyDetail> {
  return api
    .patch<PropertyDetailResponse>({
      path: `${PROPERTIES_PATH}/${propertyId}`,
      body: toRequestBody(input),
    })
    .then(toPropertyDetail);
}

export function deleteProperty(propertyId: number): Promise<void> {
  return api.delete<void>({ path: `${PROPERTIES_PATH}/${propertyId}` });
}

// PROP-07 매물 사진 업로드 — 등록으로 매물 id가 나온 뒤 파일만 multipart로 따로 보낸다.
// 첫 번째 파일이 목록·상세의 대표 사진이 된다. 응답은 저장된 사진 URL 목록.
export function uploadPropertyImages(
  propertyId: number,
  files: File[],
): Promise<string[]> {
  const formData = new FormData();
  files.forEach((file) => formData.append("images", file));

  return api
    .post<PropertyImageResponse[]>({
      path: `${PROPERTIES_PATH}/${propertyId}/images`,
      body: formData,
    })
    .then((images) => toImageUrls(images) ?? []);
}
