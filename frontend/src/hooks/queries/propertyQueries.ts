import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createProperty,
  deleteProperty,
  getMyProperties,
  getProperties,
  getPropertiesInBounds,
  getProperty,
  getPropertyFilterOptions,
  updateProperty,
  uploadPropertyImages,
} from "@/api/property";
import { isApprovedBroker } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import type {
  MapBounds,
  PagingParams,
  PropertyFilters,
  PropertyUpdateInput,
} from "@/types";

export const propertyKeys = {
  all: ["properties"] as const,
  lists: () => [...propertyKeys.all, "list"] as const,
  list: (filters: PropertyFilters, paging: PagingParams) =>
    [...propertyKeys.lists(), filters, paging] as const,
  myLists: () => [...propertyKeys.all, "my-list"] as const,
  myList: (paging: PagingParams) =>
    [...propertyKeys.myLists(), paging] as const,
  filterOptions: () => [...propertyKeys.all, "filter-options"] as const,
  maps: () => [...propertyKeys.all, "map"] as const,
  map: (bounds: MapBounds) => [...propertyKeys.maps(), bounds] as const,
  details: () => [...propertyKeys.all, "detail"] as const,
  detail: (propertyId: number) =>
    [...propertyKeys.details(), propertyId] as const,
};

export const propertyListOptions = (
  filters: PropertyFilters,
  paging: PagingParams = {},
) =>
  queryOptions({
    queryKey: propertyKeys.list(filters, paging),
    queryFn: ({ signal }) => getProperties(filters, paging, signal),
    // 페이지 이동 중 목록이 빈 화면으로 깜빡이지 않도록 이전 페이지를 유지
    placeholderData: keepPreviousData,
  });

export const myPropertyListOptions = (paging: PagingParams = {}) =>
  queryOptions({
    queryKey: propertyKeys.myList(paging),
    queryFn: ({ signal }) => getMyProperties(paging, signal),
    placeholderData: keepPreviousData,
  });

export const propertyDetailOptions = (propertyId: number) =>
  queryOptions({
    queryKey: propertyKeys.detail(propertyId),
    queryFn: ({ signal }) => getProperty(propertyId, signal),
  });

// 매물이 등록될 때만 바뀌는 목록이라 오래 캐시한다 (랜딩·목록 두 화면이 같이 쓴다)
export const propertyFilterOptionsOptions = () =>
  queryOptions({
    queryKey: propertyKeys.filterOptions(),
    queryFn: ({ signal }) => getPropertyFilterOptions(signal),
    staleTime: 10 * 60_000,
  });

export const propertyMapOptions = (bounds: MapBounds) =>
  queryOptions({
    queryKey: propertyKeys.map(bounds),
    queryFn: ({ signal }) => getPropertiesInBounds(bounds, signal),
  });

export function usePropertyList(
  filters: PropertyFilters,
  paging: PagingParams = {},
) {
  return useQuery(propertyListOptions(filters, paging));
}

// enabled: 중개사만 조회 대상이라, 권한이 없을 때는 401이 뻔한 요청을 아예 보내지 않는다
export function useMyPropertyList(paging: PagingParams = {}, enabled = true) {
  return useQuery({ ...myPropertyListOptions(paging), enabled });
}

// enabled: 회의 목록처럼 매물 id가 정해지기 전에도 마운트되는 화면이 있다
export function usePropertyDetail(propertyId: number, enabled = true) {
  return useQuery({ ...propertyDetailOptions(propertyId), enabled });
}

export function usePropertiesInBounds(bounds: MapBounds) {
  return useQuery(propertyMapOptions(bounds));
}

export function usePropertyFilterOptions() {
  return useQuery(propertyFilterOptionsOptions());
}

// PROP-08·09 수정·삭제 권한 — 상세 응답에 등록 중개사가 없어 내 매물 목록에 있는지로 판단한다
export function useIsMyProperty(propertyId: number) {
  const user = useAuthStore((state) => state.user);
  const canManage = isApprovedBroker(user);
  const { data, isPending } = useMyPropertyList({}, canManage);

  return {
    isMyProperty:
      canManage &&
      Boolean(
        data?.content.some((property) => property.propertyId === propertyId),
      ),
    isPending: canManage && isPending,
  };
}

export function useCreateProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProperty,
    onSuccess: (property) => {
      queryClient.setQueryData(
        propertyKeys.detail(property.propertyId),
        property,
      );
      queryClient.invalidateQueries({ queryKey: propertyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: propertyKeys.myLists() });
      queryClient.invalidateQueries({ queryKey: propertyKeys.maps() });
    },
  });
}

// PROP-08 매물 수정 — 등록 중개사 본인만 호출할 수 있다 (권한은 useIsMyProperty로 판단)
export function useUpdateProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      propertyId,
      input,
    }: {
      propertyId: number;
      input: PropertyUpdateInput;
    }) => updateProperty(propertyId, input),
    onSuccess: (property) => {
      queryClient.setQueryData(
        propertyKeys.detail(property.propertyId),
        property,
      );
      queryClient.invalidateQueries({ queryKey: propertyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: propertyKeys.myLists() });
      queryClient.invalidateQueries({ queryKey: propertyKeys.maps() });
    },
  });
}

// PROP-09 매물 삭제 — 상세 캐시까지 지워 뒤로가기로 지워진 매물이 다시 보이지 않게 한다
export function useDeleteProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProperty,
    onSuccess: (_result, propertyId) => {
      queryClient.removeQueries({ queryKey: propertyKeys.detail(propertyId) });
      queryClient.invalidateQueries({ queryKey: propertyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: propertyKeys.myLists() });
      queryClient.invalidateQueries({ queryKey: propertyKeys.maps() });
    },
  });
}

// 매물 등록 직후 사진 업로드 — 매물은 이미 만들어진 뒤라 실패해도 등록 자체는 유효하다
export function useUploadPropertyImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      propertyId,
      files,
    }: {
      propertyId: number;
      files: File[];
    }) => uploadPropertyImages(propertyId, files),
    onSuccess: (_images, { propertyId }) => {
      queryClient.invalidateQueries({
        queryKey: propertyKeys.detail(propertyId),
      });
      queryClient.invalidateQueries({ queryKey: propertyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: propertyKeys.myLists() });
    },
  });
}
