import type { FacilityCategory, NearbyFacility } from "@/types";

export const FACILITY_CATEGORIES = [
  "지하철",
  "편의점",
  "빨래방",
] as const satisfies readonly FacilityCategory[];

export const NEAREST_FACILITY_LIMIT = 3;

// 목데이터·카카오맵·백엔드 응답 모두 동일한 노출 규칙을 사용한다.
export function getNearestFacilities(
  facilities: NearbyFacility[],
  category: FacilityCategory,
) {
  return facilities
    .filter(
      (facility) =>
        facility.category === category &&
        Number.isFinite(facility.distanceM) &&
        facility.distanceM >= 0,
    )
    .sort((first, second) => first.distanceM - second.distanceM)
    .slice(0, NEAREST_FACILITY_LIMIT);
}
