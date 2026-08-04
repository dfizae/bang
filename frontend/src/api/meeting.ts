import { api } from "@/api/client";
import type {
  Meeting,
  MeetingDateRange,
  MeetingPaging,
  Page,
  PreferredRank,
} from "@/types";

// RES-01~09 회의(Meeting) API — 백엔드 응답 필드명이 도메인 타입과 1:1이라 변환 없이 반환한다.
// 세입자가 희망 시간을 등록하면(POST) 중개사가 그중 하나를 확정하거나 거절하고,
// 취소·목록·상세는 양쪽 공통이다.

const MEETINGS_PATH = "/api/meetings";
const PROPERTIES_PATH = "/api/properties";

// ── Meeting - Common ──────────────────────────────────────────────────────

export function getMyMeetings(
  paging: MeetingPaging = {},
  signal?: AbortSignal,
): Promise<Page<Meeting>> {
  return api.get<Page<Meeting>>({
    path: MEETINGS_PATH,
    config: { params: paging, signal },
  });
}

export function getMeeting(
  meetingId: number,
  signal?: AbortSignal,
): Promise<Meeting> {
  return api.get<Meeting>({
    path: `${MEETINGS_PATH}/${meetingId}`,
    config: { signal },
  });
}

export function cancelMeeting(meetingId: number): Promise<void> {
  return api.delete<void>({ path: `${MEETINGS_PATH}/${meetingId}/cancel` });
}

// ── Meeting - Tenant ──────────────────────────────────────────────────────

// 희망 시간은 1~3개까지 보낼 수 있고, 배열 순서가 그대로 순위가 된다
export function createMeeting(
  propertyId: number,
  preferredTimes: string[],
): Promise<Meeting> {
  return api.post<Meeting>({
    path: `${PROPERTIES_PATH}/${propertyId}/meetings`,
    body: { preferredTimes },
  });
}

export function updateMeetingPreferredTimes(
  meetingId: number,
  preferredTimes: string[],
): Promise<Meeting> {
  return api.patch<Meeting>({
    path: `${MEETINGS_PATH}/${meetingId}/preferred-times`,
    body: { preferredTimes },
  });
}

// 이미 다른 회의가 잡혀 있어 희망 시간으로 고를 수 없는 시각 목록
export function getUnavailableTimes(
  propertyId: number,
  range: MeetingDateRange,
  signal?: AbortSignal,
): Promise<string[]> {
  return api.get<string[]>({
    path: `${PROPERTIES_PATH}/${propertyId}/meetings/unavailable-times`,
    config: { params: range, signal },
  });
}

// ── Meeting - Agent ───────────────────────────────────────────────────────

// 내가 등록한 매물에 잡힌 회의 일정 전체 (상태 무관)
export function getPropertyMeetings(
  propertyId: number,
  paging: MeetingPaging = {},
  signal?: AbortSignal,
): Promise<Page<Meeting>> {
  return api.get<Page<Meeting>>({
    path: `${PROPERTIES_PATH}/${propertyId}/meetings`,
    config: { params: paging, signal },
  });
}

// 아직 확정·거절하지 않은 회의 요청만
export function getPropertyMeetingRequests(
  propertyId: number,
  paging: MeetingPaging = {},
  signal?: AbortSignal,
): Promise<Page<Meeting>> {
  return api.get<Page<Meeting>>({
    path: `${PROPERTIES_PATH}/${propertyId}/meetings/request`,
    config: { params: paging, signal },
  });
}

export function confirmMeeting(
  meetingId: number,
  preferredRank: PreferredRank,
): Promise<Meeting> {
  return api.patch<Meeting>({
    path: `${MEETINGS_PATH}/${meetingId}/confirm`,
    config: { params: { preferredRank } },
  });
}

export function rejectMeeting(meetingId: number): Promise<Meeting> {
  return api.patch<Meeting>({ path: `${MEETINGS_PATH}/${meetingId}/reject` });
}
