import { api } from "@/api/client";
import { isApiError } from "@/api/error";
import type {
  AgentVerification,
  AgentVerificationStatus,
  LicenseCheck,
} from "@/types";

// 중개사 인증 신청 (/api/agent-verifications) — 등록번호 조회, 서류 제출, 내 신청 조회

interface LicenseCheckResponse {
  licenseNumber: string | null;
  valid: boolean;
  brokerName: string | null;
  officeName: string | null;
  officeAddress: string | null;
  officePhone: string | null;
  businessStatus: string | null;
  checkedAt: string | null;
}

interface AgentVerificationResponse {
  verificationId: number;
  userId: number;
  licenseNumber: string | null;
  brokerName: string | null;
  officeName: string | null;
  officeAddress: string | null;
  officePhone: string | null;
  businessStatus: string | null;
  status: AgentVerificationStatus;
  externalCheckedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export function toAgentVerification(
  dto: AgentVerificationResponse,
): AgentVerification {
  return {
    verificationId: dto.verificationId,
    userId: dto.userId,
    licenseNumber: dto.licenseNumber ?? "",
    brokerName: dto.brokerName ?? undefined,
    officeName: dto.officeName ?? undefined,
    officeAddress: dto.officeAddress ?? undefined,
    officePhone: dto.officePhone ?? undefined,
    businessStatus: dto.businessStatus ?? undefined,
    status: dto.status,
    externalCheckedAt: dto.externalCheckedAt ?? undefined,
    submittedAt: dto.submittedAt ?? undefined,
    reviewedAt: dto.reviewedAt ?? undefined,
  };
}

export type { AgentVerificationResponse };

export async function checkLicense(
  licenseNumber: string,
  signal?: AbortSignal,
): Promise<LicenseCheck> {
  const dto = await api.get<LicenseCheckResponse>({
    path: "/api/agent-verifications/license-check",
    config: { params: { licenseNumber }, signal },
  });
  return {
    licenseNumber: dto.licenseNumber ?? licenseNumber,
    valid: dto.valid,
    brokerName: dto.brokerName ?? undefined,
    officeName: dto.officeName ?? undefined,
    officeAddress: dto.officeAddress ?? undefined,
    officePhone: dto.officePhone ?? undefined,
    businessStatus: dto.businessStatus ?? undefined,
    checkedAt: dto.checkedAt ?? undefined,
  };
}

// 신청 이력이 없는 계정은 정상적인 상태다 — 404·빈 응답을 오류가 아닌 null로 정규화해
// 화면이 "미신청"과 "조회 실패"를 구분할 수 있게 한다
export async function getMyAgentVerification(
  signal?: AbortSignal,
): Promise<AgentVerification | null> {
  try {
    const dto = await api.get<AgentVerificationResponse | null>({
      path: "/api/agent-verifications/me",
      config: { signal },
    });
    return dto ? toAgentVerification(dto) : null;
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export interface AgentVerificationSubmitInput {
  licenseNumber: string;
  document: File;
}

export async function submitAgentVerification({
  licenseNumber,
  document,
}: AgentVerificationSubmitInput): Promise<AgentVerification> {
  const body = new FormData();
  body.append("licenseNumber", licenseNumber);
  body.append("document", document);
  const dto = await api.post<AgentVerificationResponse>({
    path: "/api/agent-verifications",
    body,
  });
  return toAgentVerification(dto);
}
