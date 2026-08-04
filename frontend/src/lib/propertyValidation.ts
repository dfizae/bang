import { formatManwonLabel } from "@/lib/format";
import type { GeocodedAddress } from "@/lib/kakaoLocal";
import type { DealType } from "@/types";

export const DEPOSIT_LABEL: Record<DealType, string> = {
  전세: "전세 보증금 (만원)",
  월세: "보증금 (만원)",
  매매: "매매가 (만원)",
};

// 폼 입력 상·하한 — HTML 속성(min·max·maxLength)과 validatePropertyForm이 같은 값을 공유
export const PROPERTY_LIMITS = {
  titleMin: 2,
  titleMax: 50,
  complexNameMax: 50,
  descriptionMax: 1000,
  priceMax: 1_000_000,
  monthlyRentMax: 10_000,
  maintenanceFeeMax: 1_000,
  areaMax: 1_000,
  roomsMax: 20,
  floorMax: 130,
  builtYearMin: 1900,
  builtYearMax: 2100,
  imageMaxSizeMb: 5,
} as const;

const IMAGE_MAX_SIZE_BYTES = PROPERTY_LIMITS.imageMaxSizeMb * 1024 * 1024;

export interface PropertyFormInput {
  title: string;
  dealType: DealType;
  deposit: number;
  monthlyRent: number;
  maintenanceFee?: number;
  complexName: string;
  builtYear?: number;
  description: string;
  areaM2: number;
  floor: number;
  totalFloors?: number;
  rooms: number;
}

// 매물 등록·수정 폼 검증 — 필드명을 키로 하는 에러 메시지 맵 반환 (통과 시 빈 객체)
export function validatePropertyForm(
  input: PropertyFormInput,
  address: GeocodedAddress | null,
) {
  const errors: Record<string, string> = {};

  if (!input.title) {
    errors.title = "매물명을 입력해주세요";
  } else if (input.title.length < PROPERTY_LIMITS.titleMin) {
    errors.title = `매물명은 ${PROPERTY_LIMITS.titleMin}자 이상 입력해주세요`;
  } else if (input.title.length > PROPERTY_LIMITS.titleMax) {
    errors.title = `매물명은 ${PROPERTY_LIMITS.titleMax}자 이하로 입력해주세요`;
  }

  if (!Number.isFinite(input.deposit) || input.deposit <= 0) {
    errors.deposit = `${DEPOSIT_LABEL[input.dealType]}을 입력해주세요`;
  } else if (!Number.isInteger(input.deposit)) {
    errors.deposit = "만원 단위 정수로 입력해주세요";
  } else if (input.deposit > PROPERTY_LIMITS.priceMax) {
    errors.deposit = `최대 ${formatManwonLabel(PROPERTY_LIMITS.priceMax)}까지 입력할 수 있어요`;
  }

  if (input.dealType === "월세") {
    if (!Number.isFinite(input.monthlyRent) || input.monthlyRent <= 0) {
      errors.monthlyRent = "월세를 입력해주세요";
    } else if (!Number.isInteger(input.monthlyRent)) {
      errors.monthlyRent = "만원 단위 정수로 입력해주세요";
    } else if (input.monthlyRent > PROPERTY_LIMITS.monthlyRentMax) {
      errors.monthlyRent = `월세는 최대 ${formatManwonLabel(PROPERTY_LIMITS.monthlyRentMax)}까지 입력할 수 있어요`;
    }
  }

  if (input.maintenanceFee !== undefined) {
    if (!Number.isFinite(input.maintenanceFee) || input.maintenanceFee < 0) {
      errors.maintenanceFee = "관리비를 올바르게 입력해주세요";
    } else if (!Number.isInteger(input.maintenanceFee)) {
      errors.maintenanceFee = "만원 단위 정수로 입력해주세요";
    } else if (input.maintenanceFee > PROPERTY_LIMITS.maintenanceFeeMax) {
      errors.maintenanceFee = `관리비는 최대 ${formatManwonLabel(PROPERTY_LIMITS.maintenanceFeeMax)}까지 입력할 수 있어요`;
    }
  }

  if (!address) {
    errors.address = "주소를 검색해 위치를 확인해주세요";
  } else if (!address.sigungu || !address.dong) {
    errors.address = "동 단위까지 포함된 주소로 다시 검색해주세요";
  }

  if (input.complexName.length > PROPERTY_LIMITS.complexNameMax) {
    errors.complexName = `단지·건물명은 ${PROPERTY_LIMITS.complexNameMax}자 이하로 입력해주세요`;
  }

  if (
    input.builtYear !== undefined &&
    (!Number.isInteger(input.builtYear) ||
      input.builtYear < PROPERTY_LIMITS.builtYearMin ||
      input.builtYear > PROPERTY_LIMITS.builtYearMax)
  ) {
    errors.builtYear = `준공 연도를 ${PROPERTY_LIMITS.builtYearMin}~${PROPERTY_LIMITS.builtYearMax} 사이로 입력해주세요`;
  }

  if (!Number.isFinite(input.areaM2) || input.areaM2 <= 0) {
    errors.areaM2 = "전용면적을 입력해주세요";
  } else if (input.areaM2 > PROPERTY_LIMITS.areaMax) {
    errors.areaM2 = `전용면적은 ${PROPERTY_LIMITS.areaMax.toLocaleString()}㎡ 이하로 입력해주세요`;
  }

  if (!Number.isFinite(input.floor) || input.floor <= 0) {
    errors.floor = "층수를 입력해주세요";
  } else if (!Number.isInteger(input.floor)) {
    errors.floor = "층수는 정수로 입력해주세요";
  } else if (input.floor > PROPERTY_LIMITS.floorMax) {
    errors.floor = `층수는 ${PROPERTY_LIMITS.floorMax}층 이하로 입력해주세요`;
  }

  if (input.totalFloors !== undefined) {
    if (!Number.isInteger(input.totalFloors) || input.totalFloors <= 0) {
      errors.totalFloors = "총 층수를 올바르게 입력해주세요";
    } else if (input.totalFloors > PROPERTY_LIMITS.floorMax) {
      errors.totalFloors = `총 층수는 ${PROPERTY_LIMITS.floorMax}층 이하로 입력해주세요`;
    }
  }

  if (
    !errors.floor &&
    !errors.totalFloors &&
    input.totalFloors !== undefined &&
    input.floor > input.totalFloors
  ) {
    errors.floor = "층수는 총 층수보다 클 수 없습니다";
  }

  if (!Number.isFinite(input.rooms) || input.rooms <= 0) {
    errors.rooms = "방 개수를 입력해주세요";
  } else if (!Number.isInteger(input.rooms)) {
    errors.rooms = "방 개수는 정수로 입력해주세요";
  } else if (input.rooms > PROPERTY_LIMITS.roomsMax) {
    errors.rooms = `방 개수는 ${PROPERTY_LIMITS.roomsMax}개 이하로 입력해주세요`;
  }

  if (input.description.length > PROPERTY_LIMITS.descriptionMax) {
    errors.description = `상세 설명은 ${PROPERTY_LIMITS.descriptionMax.toLocaleString()}자 이하로 입력해주세요`;
  }

  return errors;
}

// 업로드 이미지 검증 — accept 속성은 우회 가능하므로 MIME·크기를 직접 확인 (통과 시 null)
export function validateImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    return "이미지 파일만 등록할 수 있어요";
  }
  if (file.size > IMAGE_MAX_SIZE_BYTES) {
    return `${PROPERTY_LIMITS.imageMaxSizeMb}MB 이하 이미지만 등록할 수 있어요`;
  }
  return null;
}
