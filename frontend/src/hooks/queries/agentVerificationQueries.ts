import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  getAgentVerificationDetail,
  getAgentVerifications,
  reviewAgentVerification,
} from "@/api/admin";
import {
  checkLicense,
  getMyAgentVerification,
  submitAgentVerification,
} from "@/api/agentVerification";
import type {
  AgentVerificationDecision,
  AgentVerificationListParams,
} from "@/types";

export const agentVerificationKeys = {
  all: ["agent-verifications"] as const,
  me: () => [...agentVerificationKeys.all, "me"] as const,
  adminLists: () => [...agentVerificationKeys.all, "admin", "list"] as const,
  adminList: (params: AgentVerificationListParams) =>
    [...agentVerificationKeys.adminLists(), params] as const,
  adminDetails: () =>
    [...agentVerificationKeys.all, "admin", "detail"] as const,
  adminDetail: (verificationId: number) =>
    [...agentVerificationKeys.adminDetails(), verificationId] as const,
};

export const myAgentVerificationOptions = () =>
  queryOptions({
    queryKey: agentVerificationKeys.me(),
    queryFn: ({ signal }) => getMyAgentVerification(signal),
  });

export const adminAgentVerificationListOptions = (
  params: AgentVerificationListParams,
) =>
  queryOptions({
    queryKey: agentVerificationKeys.adminList(params),
    queryFn: ({ signal }) => getAgentVerifications(params, signal),
    // 탭·페이지를 옮길 때 목록이 빈 화면으로 깜빡이지 않게 이전 결과를 유지
    placeholderData: keepPreviousData,
  });

export const adminAgentVerificationDetailOptions = (verificationId: number) =>
  queryOptions({
    queryKey: agentVerificationKeys.adminDetail(verificationId),
    queryFn: ({ signal }) => getAgentVerificationDetail(verificationId, signal),
    // 서류 URL이 만료되기 때문에 오래 캐시하지 않는다
    staleTime: 0,
  });

// 신청 이력이 없으면 null — 화면은 null(미신청)과 isError(조회 실패)를 구분해 처리한다
export function useMyAgentVerification() {
  return useQuery(myAgentVerificationOptions());
}

// 사용자가 [조회]를 눌렀을 때만 실행되는 온디맨드 검증이라 쿼리가 아닌 뮤테이션으로 다룬다
export function useCheckLicense() {
  return useMutation({
    mutationFn: (licenseNumber: string) => checkLicense(licenseNumber),
  });
}

export function useSubmitAgentVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitAgentVerification,
    onSuccess: (verification) => {
      queryClient.setQueryData(agentVerificationKeys.me(), verification);
      queryClient.invalidateQueries({
        queryKey: agentVerificationKeys.adminLists(),
      });
    },
  });
}

export function useAdminAgentVerifications(
  params: AgentVerificationListParams,
) {
  return useQuery(adminAgentVerificationListOptions(params));
}

// enabled: 목록이 비어 선택된 신청이 없을 때는 상세를 요청하지 않는다
export function useAdminAgentVerificationDetail(verificationId: number | null) {
  return useQuery({
    ...adminAgentVerificationDetailOptions(verificationId ?? 0),
    enabled: verificationId !== null,
  });
}

// 승인·반려하면 대상 건이 다른 탭으로 옮겨가므로 목록 전체를 무효화해 탭 카운트까지 맞춘다
export function useReviewAgentVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      verificationId,
      decision,
    }: {
      verificationId: number;
      decision: AgentVerificationDecision;
    }) => reviewAgentVerification(verificationId, decision),
    onSuccess: (verification) => {
      queryClient.invalidateQueries({
        queryKey: agentVerificationKeys.adminDetail(
          verification.verificationId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: agentVerificationKeys.adminLists(),
      });
    },
  });
}
