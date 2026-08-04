export type DealType = "전세" | "월세" | "매매";

export type FacilityCategory = "지하철" | "편의점" | "빨래방";

export interface NearbyFacility {
  id: string;
  category: FacilityCategory;
  name: string;
  distanceM: number;
  walkingMinutes: number;
  direction: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

// ── 매물 API 계약 (Swagger /api/properties) ──────────────────────────────
// 백엔드 roomType enum이 허용하는 값 ("아파트"는 아직 미지원)
export type RoomType = "오피스텔" | "빌라" | "원룸";

// 금액 단위: 화면·폼은 만원, 백엔드는 원 — 변환은 src/api/property.ts에서만 한다

export interface Page<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface PagingParams {
  page?: number;
  size?: number;
  // Spring 정렬 표기 — "createdAt,DESC"
  sort?: string;
}

export interface PropertyFilters {
  query?: string;
  sigungu?: string;
  transactionType?: DealType;
  roomType?: RoomType;
  minDeposit?: number;
  maxDeposit?: number;
}

// PROP-02 필터 선택지 — 등록된 매물에서 뽑아낸 값이라 매물이 늘면 자동으로 넓어진다.
// sigungu는 시/도 없는 이름("중구")이라 이름이 겹치는 지역은 서로 구분되지 않는다 (백엔드 계약 한계)
export interface PropertyFilterOptions {
  transactionTypes: DealType[];
  roomTypes: RoomType[];
  sigungus: string[];
}

export interface MapBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

export interface PropertySummary {
  propertyId: number;
  title: string;
  transactionType: DealType;
  roomType: RoomType;
  deposit: number;
  monthlyRent: number;
  sigungu: string;
  dong: string;
  complexName?: string;
  area?: number;
  floor?: number;
  totalFloor?: number;
  rooms?: number;
  status: string;
  saved: boolean;
  // TBD: 백엔드 목록 응답(PropertySummaryResponse)에 대표 사진이 아직 없어 항상 비어 있다
  imageUrl?: string;
}

// 매물을 등록한 중개사 (상세 응답 agent)
export interface PropertyAgent {
  agentId: number;
  name: string;
  phone?: string;
}

export interface PropertyDetail extends PropertySummary {
  maintenanceFee?: number;
  lotNumber?: string;
  roadAddress?: string;
  builtYear?: number;
  latitude?: number;
  longitude?: number;
  description?: string;
  createdAt: string;
  // 백엔드 상세 응답의 images(imageId·sequence 포함)를 순서대로 편 URL 목록
  imageUrls?: string[];
  // 등록한 중개사 — 백엔드 배포 전 응답에는 없을 수 있어 선택 필드로 둔다
  agent?: PropertyAgent;
  // TBD: 상세 응답의 environment는 시설 개수 집계라 목록 형태(주변 편의시설)로는 아직 못 채운다
  nearbyFacilities?: NearbyFacility[];
}

export interface PropertyMapPin {
  propertyId: number;
  title: string;
  latitude: number;
  longitude: number;
  transactionType: DealType;
  deposit: number;
  monthlyRent: number;
}

// property_environment 테이블 — 주소 좌표를 기준으로 카카오 장소 검색에서 집계한다
export interface PropertyEnvironment {
  nearestStationName?: string;
  stationDistanceMeter?: number;
  stationWalkingMinutes?: number;
  convenienceStoreCount: number;
  laundryCount: number;
}

// latitude·longitude는 주소 입력 시 카카오 좌표 변환으로 채운다 (src/lib/kakaoLocal.ts)
// rooms·environment는 백엔드 PropertyCreateRequest에 아직 없는 필드다 — 스키마가 확장되기 전까지는 서버가 무시한다.
// 사진은 JSON이 아니라 등록 직후 multipart 업로드(uploadPropertyImages)로 따로 보낸다
export interface PropertyCreateInput {
  title: string;
  transactionType: DealType;
  roomType: RoomType;
  deposit: number;
  monthlyRent?: number;
  maintenanceFee?: number;
  sigungu: string;
  dong: string;
  lotNumber?: string;
  roadAddress?: string;
  complexName?: string;
  builtYear?: number;
  latitude?: number;
  longitude?: number;
  area?: number;
  floor?: number;
  totalFloor?: number;
  description?: string;
  rooms?: number;
  environment?: PropertyEnvironment;
}

// PROP-08 매물 수정(PATCH) — 등록 요청과 같은 필드를 받되 environment는 받지 않는다
export type PropertyUpdateInput = Omit<PropertyCreateInput, "environment">;

// ── 회의 API 계약 (Swagger /api/meetings) ────────────────────────────────
export type MeetingStatus =
  "OPEN" | "REQUESTED" | "CONFIRMED" | "COMPLETED" | "REJECTED" | "CANCELED";

// 희망 시간 순위 — 중개사가 확정할 때 preferredRank로 지정한다
export type PreferredRank = 1 | 2 | 3;

export interface Meeting {
  meetingId: number;
  propertyId: number;
  tenantId: number;
  tenantNickname: string;
  agentId: number;
  agentNickname: string;
  // 세입자가 등록한 희망 시간 1~3순위. 타임존 없는 LocalDateTime 표기("2026-08-01T14:00:00").
  // 등록하지 않은 순위는 null로 온다
  preferredAt1?: string | null;
  preferredAt2?: string | null;
  preferredAt3?: string | null;
  // 중개사가 확정한 시간 — 확정 전에는 null
  scheduledAt?: string | null;
  status: MeetingStatus;
  createdAt: string;
  updatedAt: string;
}

// 회의 목록 엔드포인트는 Spring의 sort 대신 정렬 방향 하나만 받는다
export interface MeetingPaging {
  page?: number;
  size?: number;
  direction?: "ASC" | "DESC";
}

// 로그인한 사용자 기준 — 세입자로 보낸 요청 / 중개사로 받은 요청
export type MeetingDirection = "sent" | "received";

// 회의 등록 불가능 시간 조회 구간 (yyyy-MM-dd)
export interface MeetingDateRange {
  from: string;
  to: string;
}

export interface PriceBand {
  value: string;
  label: string;
  min: number;
  max: number;
}

export interface Memo {
  id: number;
  text: string;
  createdAt: string;
}
export type ChecklistItemStatus = "PENDING" | "COMPLETED" | "ISSUE_FOUND";

export interface ChecklistItem {
  itemId: number;
  content: string;
  status: ChecklistItemStatus;
  memo: string | null;
}

export interface Checklist {
  checklistId: number;
  meetingId: number;
  title: string;
  createdAt: string;
  items: ChecklistItem[];
}

export interface Filters {
  query: string;
  dealType: string;
  region: string;
  price: string;
  rent: string;
  buildingType: string;
}

export type AuthProvider = "kakao" | "google";

export type UserRole = "세입자" | "중개사" | "관리자";

// 인증 승인 시 서버가 계정 role을 AGENT로 바꾼다 — 승인 여부는 role이 곧 진실이므로
// User에 인증 상태를 따로 두지 않는다. 신청 진행 상태는 AgentVerification으로 조회한다
export interface User {
  id: number;
  name: string;
  birth: string;
  nickname: string;
  email: string;
  phone: string;
  profileImageUrl?: string;
  role: UserRole;
  provider: AuthProvider;
}

// 프로필 이미지는 엔드포인트가 따로라 여기 포함하지 않는다 (파일로 별도 전송)
export type UserProfileChanges = Pick<User, "birth" | "nickname" | "phone">;

// ── 중개사 인증 API 계약 (Swagger /api/agent-verifications) ───────────────
export type AgentVerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AgentVerificationDecision = Exclude<
  AgentVerificationStatus,
  "PENDING"
>;

// 등록번호 실시간 조회 결과 — 신청 전에 사무소 정보를 대조하는 용도
export interface LicenseCheck {
  licenseNumber: string;
  valid: boolean;
  brokerName?: string;
  officeName?: string;
  officeAddress?: string;
  officePhone?: string;
  businessStatus?: string;
  checkedAt?: string;
}

// brokerName·officeName 등은 서버가 등록번호로 외부 조회해 채운 값이라
// 조회에 실패한 신청 건에서는 비어 있을 수 있다
export interface AgentVerification {
  verificationId: number;
  userId: number;
  licenseNumber: string;
  brokerName?: string;
  officeName?: string;
  officeAddress?: string;
  officePhone?: string;
  businessStatus?: string;
  status: AgentVerificationStatus;
  externalCheckedAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
}

// fileUrl은 urlExpiresAt이 지나면 만료되는 임시 URL이다
export interface VerificationDocument {
  originalName: string;
  contentType: string;
  fileSize: number;
  fileUrl: string;
  urlExpiresAt?: string;
}

export interface AgentVerificationDetail extends AgentVerification {
  document?: VerificationDocument;
}

export interface AgentVerificationListParams {
  status: AgentVerificationStatus;
  page?: number;
  size?: number;
}
