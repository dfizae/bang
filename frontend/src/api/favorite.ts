import { api } from "@/api/client";
import {
  toPropertySummaryPage,
  type PropertySummaryResponse,
} from "@/api/property";
import type { Page, PagingParams, PropertySummary } from "@/types";

// PROP-04 저장 / PROP-05 저장 취소 / PROP-06 저장한 매물 조회
// 저장 목록 응답은 매물 목록과 같은 요약 스키마라 변환도 매물 API의 것을 그대로 쓴다.

const FAVORITE_PROPERTIES_PATH = "/api/users/me/favorite-properties";

function favoritePath(propertyId: number) {
  return `/api/properties/${propertyId}/favorites`;
}

export function getFavoriteProperties(
  paging: PagingParams = {},
  signal?: AbortSignal,
): Promise<Page<PropertySummary>> {
  return api
    .get<Page<PropertySummaryResponse>>({
      path: FAVORITE_PROPERTIES_PATH,
      config: { params: paging, signal },
    })
    .then(toPropertySummaryPage);
}

export function addFavorite(propertyId: number): Promise<void> {
  return api.post<void>({ path: favoritePath(propertyId) });
}

export function removeFavorite(propertyId: number): Promise<void> {
  return api.delete<void>({ path: favoritePath(propertyId) });
}
