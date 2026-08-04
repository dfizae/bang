import {
  toAgentVerification,
  type AgentVerificationResponse,
} from "@/api/agentVerification";
import { api } from "@/api/client";
import type {
  AgentVerification,
  AgentVerificationDecision,
  AgentVerificationDetail,
  AgentVerificationListParams,
  Page,
} from "@/types";

// ADMIN-01~03 중개사 인증 심사 (/api/admin/agent-verifications) — 목록·상세·승인/반려

const ADMIN_VERIFICATIONS_PATH = "/api/admin/agent-verifications";

interface DocumentResponse {
  originalName: string | null;
  contentType: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  urlExpiresAt: string | null;
}

interface AgentVerificationDetailResponse extends AgentVerificationResponse {
  document: DocumentResponse | null;
}

// fileUrl이 없으면 서류를 열 수 없어 문서 자체가 없는 것과 같으므로 undefined로 접는다
function toDetail(
  dto: AgentVerificationDetailResponse,
): AgentVerificationDetail {
  const { document } = dto;

  return {
    ...toAgentVerification(dto),
    document: document?.fileUrl
      ? {
          originalName: document.originalName ?? "증빙 서류",
          contentType: document.contentType ?? "",
          fileSize: document.fileSize ?? 0,
          fileUrl: document.fileUrl,
          urlExpiresAt: document.urlExpiresAt ?? undefined,
        }
      : undefined,
  };
}

export function getAgentVerifications(
  { status, page, size }: AgentVerificationListParams,
  signal?: AbortSignal,
): Promise<Page<AgentVerification>> {
  return api
    .get<Page<AgentVerificationResponse>>({
      path: ADMIN_VERIFICATIONS_PATH,
      config: { params: { status, page, size }, signal },
    })
    .then((result) => ({
      ...result,
      content: result.content.map(toAgentVerification),
    }));
}

export function getAgentVerificationDetail(
  verificationId: number,
  signal?: AbortSignal,
): Promise<AgentVerificationDetail> {
  return api
    .get<AgentVerificationDetailResponse>({
      path: `${ADMIN_VERIFICATIONS_PATH}/${verificationId}`,
      config: { signal },
    })
    .then(toDetail);
}

// 승인하면 신청자 계정이 중개사(AGENT)로 전환된다 — 되돌리는 엔드포인트는 없다
export function reviewAgentVerification(
  verificationId: number,
  decision: AgentVerificationDecision,
): Promise<AgentVerification> {
  return api
    .patch<AgentVerificationResponse>({
      path: `${ADMIN_VERIFICATIONS_PATH}/${verificationId}/review`,
      body: { decision },
    })
    .then(toAgentVerification);
}
