import { api } from "@/api/client";
import type { Checklist, ChecklistItem, ChecklistItemStatus } from "@/types";

// CHECK-01~03 (/api/checklist) — 회의(Meeting) 확정 시 백엔드가 체크리스트를
// 자동 생성·취소 시 삭제하므로 생성 API는 없다. 확정 전 조회는 CHECKLIST_NOT_FOUND로 실패한다.

const CHECKLIST_PATH = "/api/checklist";

// 백엔드 항목 개수 상한(CHECKLIST_ITEM_LIMIT_EXCEEDED)과 같은 값
export const MAX_CHECKLIST_ITEMS = 20;

export interface ChecklistItemInput {
  content: string;
  memo?: string;
}

export function getChecklist(
  meetingId: number,
  signal?: AbortSignal,
): Promise<Checklist> {
  return api.get<Checklist>({
    path: `${CHECKLIST_PATH}/${meetingId}`,
    config: { signal },
  });
}

export function createChecklistItem(
  meetingId: number,
  input: ChecklistItemInput,
): Promise<ChecklistItem> {
  return api.post<ChecklistItem>({
    path: `${CHECKLIST_PATH}/${meetingId}/items`,
    body: input,
  });
}

export function updateChecklistItem(
  meetingId: number,
  itemId: number,
  input: ChecklistItemInput,
): Promise<ChecklistItem> {
  return api.put<ChecklistItem>({
    path: `${CHECKLIST_PATH}/${meetingId}/items/${itemId}`,
    body: input,
  });
}

export function updateChecklistItemStatus(
  meetingId: number,
  itemId: number,
  status: ChecklistItemStatus,
): Promise<ChecklistItem> {
  return api.patch<ChecklistItem>({
    path: `${CHECKLIST_PATH}/${meetingId}/items/${itemId}/status`,
    body: { status },
  });
}

export function deleteChecklistItem(
  meetingId: number,
  itemId: number,
): Promise<void> {
  return api.delete<void>({
    path: `${CHECKLIST_PATH}/${meetingId}/items/${itemId}`,
  });
}
