import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type ChecklistItemInput,
  createChecklistItem,
  deleteChecklistItem,
  getChecklist,
  updateChecklistItem,
  updateChecklistItemStatus,
} from "@/api/checklist";
import type { Checklist, ChecklistItemStatus } from "@/types";

export { MAX_CHECKLIST_ITEMS } from "@/api/checklist";
export type { ChecklistItemInput } from "@/api/checklist";

export const checklistKeys = {
  all: ["checklist"] as const,
  details: () => [...checklistKeys.all, "detail"] as const,
  detail: (meetingId: number) =>
    [...checklistKeys.details(), meetingId] as const,
};

export const checklistOptions = (meetingId: number) =>
  queryOptions({
    queryKey: checklistKeys.detail(meetingId),
    queryFn: ({ signal }) => getChecklist(meetingId, signal),
  });

// meetingId가 없으면(선택된 예약 없음) 요청을 보내지 않는다
export function useChecklist(meetingId: number | undefined) {
  return useQuery({
    ...checklistOptions(meetingId ?? -1),
    enabled: meetingId !== undefined,
  });
}

export function useCreateChecklistItem(meetingId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChecklistItemInput) =>
      createChecklistItem(meetingId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: checklistKeys.detail(meetingId),
      }),
  });
}

export function useUpdateChecklistItem(meetingId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      itemId,
      input,
    }: {
      itemId: number;
      input: ChecklistItemInput;
    }) => updateChecklistItem(meetingId, itemId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: checklistKeys.detail(meetingId),
      }),
  });
}

// 통화 중에 바로바로 체크하는 UX라 서버 응답을 기다리지 않고 캐시를 선반영한다
export function useUpdateChecklistItemStatus(meetingId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      itemId,
      status,
    }: {
      itemId: number;
      status: ChecklistItemStatus;
    }) => updateChecklistItemStatus(meetingId, itemId, status),
    onMutate: async ({ itemId, status }) => {
      await queryClient.cancelQueries({
        queryKey: checklistKeys.detail(meetingId),
      });
      const previous = queryClient.getQueryData<Checklist>(
        checklistKeys.detail(meetingId),
      );
      queryClient.setQueryData<Checklist>(
        checklistKeys.detail(meetingId),
        (old) =>
          old && {
            ...old,
            items: old.items.map((item) =>
              item.itemId === itemId ? { ...item, status } : item,
            ),
          },
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          checklistKeys.detail(meetingId),
          context.previous,
        );
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: checklistKeys.detail(meetingId),
      }),
  });
}

export function useDeleteChecklistItem(meetingId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) => deleteChecklistItem(meetingId, itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({
        queryKey: checklistKeys.detail(meetingId),
      });
      const previous = queryClient.getQueryData<Checklist>(
        checklistKeys.detail(meetingId),
      );
      queryClient.setQueryData<Checklist>(
        checklistKeys.detail(meetingId),
        (old) =>
          old && {
            ...old,
            items: old.items.filter((item) => item.itemId !== itemId),
          },
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          checklistKeys.detail(meetingId),
          context.previous,
        );
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: checklistKeys.detail(meetingId),
      }),
  });
}
