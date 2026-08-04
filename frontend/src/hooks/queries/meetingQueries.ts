import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  cancelMeeting,
  confirmMeeting,
  createMeeting,
  getMeeting,
  getMyMeetings,
  getPropertyMeetingRequests,
  getPropertyMeetings,
  getUnavailableTimes,
  rejectMeeting,
  updateMeetingPreferredTimes,
} from "@/api/meeting";
import type {
  Meeting,
  MeetingDateRange,
  MeetingPaging,
  PreferredRank,
} from "@/types";

export const meetingKeys = {
  all: ["meetings"] as const,
  lists: () => [...meetingKeys.all, "list"] as const,
  list: (paging: MeetingPaging) => [...meetingKeys.lists(), paging] as const,
  propertySchedules: () => [...meetingKeys.all, "property-schedule"] as const,
  propertySchedule: (propertyId: number, paging: MeetingPaging) =>
    [...meetingKeys.propertySchedules(), propertyId, paging] as const,
  propertyRequests: () => [...meetingKeys.all, "property-request"] as const,
  propertyRequest: (propertyId: number, paging: MeetingPaging) =>
    [...meetingKeys.propertyRequests(), propertyId, paging] as const,
  details: () => [...meetingKeys.all, "detail"] as const,
  detail: (meetingId: number) => [...meetingKeys.details(), meetingId] as const,
  unavailableTimesAll: () => [...meetingKeys.all, "unavailable-times"] as const,
  unavailableTimes: (propertyId: number, range: MeetingDateRange) =>
    [...meetingKeys.unavailableTimesAll(), propertyId, range] as const,
};

export const myMeetingListOptions = (paging: MeetingPaging = {}) =>
  queryOptions({
    queryKey: meetingKeys.list(paging),
    queryFn: ({ signal }) => getMyMeetings(paging, signal),
    // 페이지를 넘길 때 목록이 빈 화면으로 깜빡이지 않게 이전 페이지를 유지
    placeholderData: keepPreviousData,
  });

export const meetingDetailOptions = (meetingId: number) =>
  queryOptions({
    queryKey: meetingKeys.detail(meetingId),
    queryFn: ({ signal }) => getMeeting(meetingId, signal),
  });

export const propertyMeetingScheduleOptions = (
  propertyId: number,
  paging: MeetingPaging = {},
) =>
  queryOptions({
    queryKey: meetingKeys.propertySchedule(propertyId, paging),
    queryFn: ({ signal }) => getPropertyMeetings(propertyId, paging, signal),
    placeholderData: keepPreviousData,
  });

export const propertyMeetingRequestOptions = (
  propertyId: number,
  paging: MeetingPaging = {},
) =>
  queryOptions({
    queryKey: meetingKeys.propertyRequest(propertyId, paging),
    queryFn: ({ signal }) =>
      getPropertyMeetingRequests(propertyId, paging, signal),
    placeholderData: keepPreviousData,
  });

export const unavailableTimesOptions = (
  propertyId: number,
  range: MeetingDateRange,
) =>
  queryOptions({
    queryKey: meetingKeys.unavailableTimes(propertyId, range),
    queryFn: ({ signal }) => getUnavailableTimes(propertyId, range, signal),
  });

export function useMyMeetingList(paging: MeetingPaging = {}) {
  return useQuery(myMeetingListOptions(paging));
}

// meetingId가 없으면(선택된 회의 없음) 요청을 보내지 않는다
export function useMeetingDetail(meetingId: number | undefined) {
  return useQuery({
    ...meetingDetailOptions(meetingId ?? -1),
    enabled: meetingId !== undefined,
  });
}

// 중개사 전용 엔드포인트 — 매물을 고르기 전이거나 권한이 없으면 요청하지 않는다
export function usePropertyMeetingSchedule(
  propertyId: number | undefined,
  paging: MeetingPaging = {},
  enabled = true,
) {
  return useQuery({
    ...propertyMeetingScheduleOptions(propertyId ?? -1, paging),
    enabled: enabled && propertyId !== undefined,
  });
}

export function usePropertyMeetingRequests(
  propertyId: number | undefined,
  paging: MeetingPaging = {},
  enabled = true,
) {
  return useQuery({
    ...propertyMeetingRequestOptions(propertyId ?? -1, paging),
    enabled: enabled && propertyId !== undefined,
  });
}

export function useUnavailableTimes(
  propertyId: number,
  range: MeetingDateRange,
) {
  return useQuery(unavailableTimesOptions(propertyId, range));
}

export function useCreateMeeting(propertyId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferredTimes: string[]) =>
      createMeeting(propertyId, preferredTimes),
    onSuccess: (meeting) => {
      queryClient.setQueryData(meetingKeys.detail(meeting.meetingId), meeting);
      invalidateMeetingCollections(queryClient);
    },
  });
}

export function useUpdatePreferredTimes(meetingId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferredTimes: string[]) =>
      updateMeetingPreferredTimes(meetingId, preferredTimes),
    onSuccess: (meeting) => cacheUpdatedMeeting(queryClient, meeting),
  });
}

export function useConfirmMeeting(meetingId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferredRank: PreferredRank) =>
      confirmMeeting(meetingId, preferredRank),
    onSuccess: (meeting) => cacheUpdatedMeeting(queryClient, meeting),
  });
}

export function useRejectMeeting(meetingId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => rejectMeeting(meetingId),
    onSuccess: (meeting) => cacheUpdatedMeeting(queryClient, meeting),
  });
}

// 취소는 응답 본문이 없어 상세도 서버에서 다시 읽어온다
export function useCancelMeeting(meetingId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cancelMeeting(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: meetingKeys.detail(meetingId),
      });
      invalidateMeetingCollections(queryClient);
    },
  });
}

type MeetingQueryClient = ReturnType<typeof useQueryClient>;

function cacheUpdatedMeeting(
  queryClient: MeetingQueryClient,
  meeting: Meeting,
) {
  queryClient.setQueryData(meetingKeys.detail(meeting.meetingId), meeting);
  invalidateMeetingCollections(queryClient);
}

// 확정·거절·취소는 목록의 상태 뱃지와 등록 불가능 시간에 모두 영향을 준다
function invalidateMeetingCollections(queryClient: MeetingQueryClient) {
  queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
  queryClient.invalidateQueries({ queryKey: meetingKeys.propertySchedules() });
  queryClient.invalidateQueries({ queryKey: meetingKeys.propertyRequests() });
  queryClient.invalidateQueries({
    queryKey: meetingKeys.unavailableTimesAll(),
  });
}
