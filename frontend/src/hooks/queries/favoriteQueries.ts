import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  addFavorite,
  getFavoriteProperties,
  removeFavorite,
} from "@/api/favorite";
import { propertyKeys } from "@/hooks/queries/propertyQueries";
import type {
  Page,
  PagingParams,
  PropertyDetail,
  PropertySummary,
} from "@/types";

export const favoriteKeys = {
  all: ["favorites"] as const,
  lists: () => [...favoriteKeys.all, "list"] as const,
  list: (paging: PagingParams) => [...favoriteKeys.lists(), paging] as const,
};

export const favoritePropertyListOptions = (paging: PagingParams = {}) =>
  queryOptions({
    queryKey: favoriteKeys.list(paging),
    queryFn: ({ signal }) => getFavoriteProperties(paging, signal),
    // 페이지 이동 중 목록이 빈 화면으로 깜빡이지 않도록 이전 페이지를 유지
    placeholderData: keepPreviousData,
  });

export function useFavoritePropertyList(paging: PagingParams = {}) {
  return useQuery(favoritePropertyListOptions(paging));
}

// 하트를 그리는 캐시 — 저장 목록과 매물 목록이 같은 요약 스키마를 공유한다
const SAVED_LIST_KEYS = [favoriteKeys.lists(), propertyKeys.lists()];

// PROP-04·05 저장 토글 — 하트는 즉시 반응해야 하므로 캐시를 선반영하고 실패하면 되돌린다.
// 해제한 매물은 목록에서 곧바로 빼지 않고(다시 눌러 되돌릴 수 있게) 다음 진입 때 새로 받는다.
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      propertyId,
      saved,
    }: {
      propertyId: number;
      saved: boolean;
    }) => (saved ? addFavorite(propertyId) : removeFavorite(propertyId)),
    onMutate: async ({ propertyId, saved }) => {
      const detailKey = propertyKeys.detail(propertyId);
      await Promise.all(
        [...SAVED_LIST_KEYS, detailKey].map((queryKey) =>
          queryClient.cancelQueries({ queryKey }),
        ),
      );

      const previousLists = SAVED_LIST_KEYS.flatMap((queryKey) =>
        queryClient.getQueriesData<Page<PropertySummary>>({ queryKey }),
      );
      const previousDetail =
        queryClient.getQueryData<PropertyDetail>(detailKey);

      SAVED_LIST_KEYS.forEach((queryKey) =>
        queryClient.setQueriesData<Page<PropertySummary>>(
          { queryKey },
          (page) =>
            page && {
              ...page,
              content: page.content.map((property) =>
                property.propertyId === propertyId
                  ? { ...property, saved }
                  : property,
              ),
            },
        ),
      );
      queryClient.setQueryData<PropertyDetail>(
        detailKey,
        (property) => property && { ...property, saved },
      );

      return { previousLists, previousDetail, detailKey };
    },
    onError: (_error, _variables, context) => {
      context?.previousLists.forEach(([queryKey, page]) =>
        queryClient.setQueryData(queryKey, page),
      );
      if (context) {
        queryClient.setQueryData(context.detailKey, context.previousDetail);
      }
    },
    onSettled: (_result, _error, { propertyId }) =>
      [...SAVED_LIST_KEYS, propertyKeys.detail(propertyId)].forEach(
        (queryKey) =>
          queryClient.invalidateQueries({ queryKey, refetchType: "none" }),
      ),
  });
}
