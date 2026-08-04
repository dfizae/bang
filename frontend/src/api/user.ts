import { api } from "@/api/client";
import type { AuthProvider, User, UserProfileChanges, UserRole } from "@/types";

// USER-01 내 정보 조회 / USER-02 내 정보·프로필 이미지 수정 / USER-03 회원 탈퇴 (/api/users/me)

interface OAuthInfo {
  provider: string | null;
  email: string | null;
  profileImage: string | null;
}

// 소셜 가입 직후에는 소셜 계정이 주지 않는 값(생년월일·전화번호 등)이 null로 내려온다
interface UserResponse {
  userId: number;
  nickname: string | null;
  name: string | null;
  birth: string | null;
  phone: string | null;
  role: "TENANT" | "AGENT" | "ADMIN";
  profileImage: string | null;
  oauthAccounts: OAuthInfo[] | null;
}

// 백엔드가 허용하는 수정 필드 — 이름·이메일은 본인 확인 정보라 수정 대상이 아니다
interface UserUpdateRequest {
  nickname: string;
  birth: string;
  phone: string;
}

interface ProfileImageResponse {
  profileImage: string;
}

function toAuthProvider(provider: string | null | undefined): AuthProvider {
  return provider?.toLowerCase().includes("google") ? "google" : "kakao";
}

// 서버 role → 화면 역할. 중개사 인증이 승인되면 서버가 TENANT를 AGENT로 바꾸므로
// 인증 승인 여부는 이 role 하나로 판단한다 (src/lib/auth.ts의 isApprovedBroker)
const ROLE_LABEL: Record<UserResponse["role"], UserRole> = {
  TENANT: "세입자",
  AGENT: "중개사",
  ADMIN: "관리자",
};

// 백엔드 UserResponse → 프론트 도메인 User.
// email·provider는 첫 OAuth 계정에서, 프로필 이미지는 직접 올린 것(profileImage)을 우선하고
// 없으면 소셜 계정 이미지로 대체한다.
// 미입력 문자열 필드는 빈 문자열로 정규화해 화면에서 null 접근이 나지 않게 한다.
function toUser(dto: UserResponse): User {
  const account = dto.oauthAccounts?.[0];

  return {
    id: dto.userId,
    name: dto.name ?? "",
    birth: dto.birth ?? "",
    nickname: dto.nickname ?? "",
    email: account?.email ?? "",
    phone: dto.phone ?? "",
    profileImageUrl: dto.profileImage || account?.profileImage || undefined,
    role: ROLE_LABEL[dto.role],
    provider: toAuthProvider(account?.provider),
  };
}

export async function getMyInfo(signal?: AbortSignal): Promise<User> {
  const dto = await api.get<UserResponse>({
    path: "/api/users/me",
    config: { signal },
  });
  return toUser(dto);
}

export async function updateMyInfo(changes: UserProfileChanges): Promise<User> {
  const body: UserUpdateRequest = {
    nickname: changes.nickname,
    birth: changes.birth,
    phone: changes.phone,
  };
  const dto = await api.patch<UserResponse>({ path: "/api/users/me", body });
  return toUser(dto);
}

// 이미지는 JSON이 아니라 multipart로 따로 보낸다 — 응답은 저장된 이미지 URL
export async function updateMyProfileImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const { profileImage } = await api.patch<ProfileImageResponse>({
    path: "/api/users/me/profile-image",
    body,
  });
  return profileImage;
}

export function deleteMyAccount(): Promise<void> {
  return api.delete<void>({ path: "/api/users/me" });
}
