import type { DealType, PriceBand, RoomType } from "@/types";

// PAGE-04 매물 탐색 필터 선택지 (PROP-02)
// 금액 단위: 만원 — 백엔드로 나갈 때 원 단위로 바뀐다 (src/api/property.ts)

export const DEAL_TYPES: DealType[] = ["월세", "전세", "매매"];

// 매물 등록 폼·필터 선택지 — 백엔드 roomType enum이 받는 값만 노출한다 ("아파트" 미지원)
export const ROOM_TYPES: RoomType[] = ["오피스텔", "빌라", "원룸"];

export const PRICE_BANDS: PriceBand[] = [
  { value: "all", label: "가격 전체", min: 0, max: Infinity },
  { value: "under1", label: "1억 이하", min: 0, max: 10000 },
  { value: "1to3", label: "1억 ~ 3억", min: 10000, max: 30000 },
  { value: "3to5", label: "3억 ~ 5억", min: 30000, max: 50000 },
  { value: "5to10", label: "5억 ~ 10억", min: 50000, max: 100000 },
  { value: "over10", label: "10억 이상", min: 100000, max: Infinity },
];

// 월세 거래유형 전용 2축 가격 구간 — deposit(보증금) × monthlyRent(월세)
export const MONTHLY_DEPOSIT_BANDS: PriceBand[] = [
  { value: "all", label: "보증금 전체", min: 0, max: Infinity },
  { value: "under1000", label: "1천만 이하", min: 0, max: 1000 },
  { value: "1000to5000", label: "1천 ~ 5천만", min: 1000, max: 5000 },
  { value: "over5000", label: "5천만 이상", min: 5000, max: Infinity },
];

export const RENT_BANDS: PriceBand[] = [
  { value: "all", label: "월세 전체", min: 0, max: Infinity },
  { value: "under50", label: "50만 이하", min: 0, max: 50 },
  { value: "50to100", label: "50 ~ 100만", min: 50, max: 100 },
  { value: "100to150", label: "100 ~ 150만", min: 100, max: 150 },
  { value: "over150", label: "150만 이상", min: 150, max: Infinity },
];
