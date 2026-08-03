import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createSession,
  endSession,
  joinSession,
  uploadUserCapture,
} from "@/api/session";

export const sessionKeys = {
  all: ["sessions"] as const,
  joins: () => [...sessionKeys.all, "join"] as const,
  join: (meetingId: number) => [...sessionKeys.joins(), meetingId] as const,
};

// 세션 생성이 멱등(있으면 기존 세션 반환)이라 참가자 양쪽 모두 "생성 → 입장"을
// 한 번의 조회로 처리할 수 있다 — 입장 정보(signalingUrl)를 서버 상태로 다룬다
export const liveSessionOptions = (meetingId: number) =>
  queryOptions({
    queryKey: sessionKeys.join(meetingId),
    queryFn: async () => {
      const session = await createSession(meetingId);
      return joinSession(session.sessionId);
    },
    // 리페치마다 새 시그널링 토큰이 발급돼 WebSocket이 재연결되므로,
    // 화면에 머무는 동안에는 다시 받아오지 않고 떠나면 캐시를 버린다
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

export function useLiveSession(meetingId: number | undefined) {
  return useQuery({
    ...liveSessionOptions(meetingId ?? -1),
    enabled: meetingId !== undefined,
  });
}

export function useEndSession(meetingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => endSession(sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sessionKeys.join(meetingId) }),
  });
}

export function useUploadSessionCapture() {
  return useMutation({
    mutationFn: ({ sessionId, image }: { sessionId: number; image: Blob }) =>
      uploadUserCapture(sessionId, image),
  });
}
