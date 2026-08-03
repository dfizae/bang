import { api } from "@/api/client";
import type { AuthProvider, User } from "@/types";

// AUTH-01 소셜 로그인 / AUTH-02 로그아웃 (/api/auth/*)

// AUTH-01 소셜 로그인 응답 — accessToken은 authStore가 localStorage에 저장한다.
interface TokenResponse {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  newUser: boolean;
}

function socialLogin(
  provider: AuthProvider,
  authorizationCode: string,
): Promise<TokenResponse> {
  return api.post<TokenResponse>({
    path: `/api/auth/${provider}`,
    body: { authorizationCode },
  });
}

// 카카오/구글 인가 코드를 백엔드로 넘겨 accessToken을 발급받는다.
export function kakaoLogin(authorizationCode: string): Promise<TokenResponse> {
  return socialLogin("kakao", authorizationCode);
}

export function googleLogin(authorizationCode: string): Promise<TokenResponse> {
  return socialLogin("google", authorizationCode);
}

// AUTH-02 로그아웃 — 서버 세션·토큰 무효화 (로컬 토큰 정리는 authStore 책임)
export function logout(): Promise<void> {
  return api.post<void>({ path: "/api/auth/logout" });
}

// id는 data/properties.ts의 brokerId와 연결됨 — 중개사별 매물 구분 테스트용 2계정
const MOCK_BROKERS: Array<Omit<User, "provider">> = [
  {
    id: 1,
    name: "박중개",
    birth: "1990-08-21",
    nickname: "방방부동산",
    email: "broker@example.com",
    phone: "010-9876-5432",
    role: "중개사",
  },
  {
    id: 2,
    name: "이중개",
    birth: "1987-02-11",
    nickname: "봐봐부동산",
    email: "broker2@example.com",
    phone: "010-2468-1357",
    role: "중개사",
  },
];

const MOCK_TENANT: Omit<User, "provider"> = {
  id: 100,
  name: "김세입",
  birth: "1996-05-14",
  nickname: "집구하는중",
  email: "tenant@example.com",
  phone: "010-1234-5678",
  role: "세입자",
};

// ADMIN-01~03 심사용 관리자 계정 — 실제 관리자 인증 연동 전 개발용
const MOCK_ADMIN: Omit<User, "provider"> = {
  id: 900,
  name: "관리자",
  birth: "1985-01-01",
  nickname: "방방봐 운영팀",
  email: "admin@bangbangbwa.com",
  phone: "010-0000-0000",
  role: "관리자",
};

// 로그인 페이지의 개발용 테스트 계정 버튼에 노출할 중개사 목록
export const MOCK_BROKER_ACCOUNTS = MOCK_BROKERS.map(
  ({ id, name, nickname }) => ({ id, name, nickname }),
);
export const MOCK_TENANT_ACCOUNT = {
  id: MOCK_TENANT.id,
  name: MOCK_TENANT.name,
  nickname: MOCK_TENANT.nickname,
};

// 개발용 — 중개사별 매물 구분 테스트를 위해 특정 목 중개사로 로그인
export async function loginWithMockBroker(brokerId: number): Promise<User> {
  const broker = MOCK_BROKERS.find((b) => b.id === brokerId) ?? MOCK_BROKERS[0];
  return { ...broker, provider: "google" };
}

// 개발용 — 세입자 권한 UI와 예약 흐름 테스트
export async function loginWithMockTenant(): Promise<User> {
  return { ...MOCK_TENANT, provider: "google" };
}

// 개발용 — 인증 심사 페이지 테스트를 위한 관리자 로그인
export async function loginWithMockAdmin(): Promise<User> {
  return { ...MOCK_ADMIN, provider: "google" };
}
