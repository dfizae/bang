import { MAX_CHECKLIST_ITEMS, type ChecklistItemInput } from "@/api/checklist";
import { ApiError } from "@/api/error";
import { readStoredJson, writeStoredJson } from "@/lib/storage";
import type { Checklist, ChecklistItem, ChecklistItemStatus } from "@/types";

// 체크리스트 API(feature/27-checklist-crud)가 backend에 머지될 때까지 쓰는 임시 어댑터.
// src/api/checklist.ts와 시그니처가 같으므로, 서버에 붙일 때는
// hooks/queries/checklistQueries.ts의 import 경로만 "@/api/checklist"로 되돌리면 된다.
// 항목 20개 제한은 서버 규칙과 같다. 다만 서버는 회의 확정 시 빈 체크리스트를 만들지만,
// 목에서는 조회 시점에 기본 항목 2개와 함께 만들어 기존 UX를 유지한다(시딩 주체는 백엔드와 협의 중).

const STORAGE_KEY = "bangbangbwa:mock-checklists";
const MOCK_LATENCY_MS = 300;
const DEFAULT_ITEM_CONTENTS = [
  "벽지·천장 곰팡이 확인",
  "등기부등본 근저당 확인",
];

// 새로고침해도 유지되도록 localStorage에 저장하고, 모듈 사본으로 읽고 쓴다
const store: Record<number, Checklist> = readStoredJson(STORAGE_KEY, {});

function persist() {
  writeStoredJson(STORAGE_KEY, store);
}

// 목 응답도 로딩 상태를 거치도록 약간의 지연을 두고, 취소된 요청은 그대로 중단한다
function respond<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), MOCK_LATENCY_MS);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
    });
  });
}

function nextItemId(): number {
  const ids = Object.values(store).flatMap((checklist) =>
    checklist.items.map((item) => item.itemId),
  );
  return Math.max(0, ...ids) + 1;
}

function ensureChecklist(meetingId: number): Checklist {
  const existing = store[meetingId];
  if (existing) {
    return existing;
  }

  const baseItemId = nextItemId();
  const created: Checklist = {
    checklistId: meetingId,
    meetingId,
    title: "입주 체크리스트",
    createdAt: new Date().toISOString(),
    items: DEFAULT_ITEM_CONTENTS.map((content, index) => ({
      itemId: baseItemId + index,
      content,
      status: "PENDING",
      memo: null,
    })),
  };
  store[meetingId] = created;
  persist();
  return created;
}

function findItem(checklist: Checklist, itemId: number): ChecklistItem {
  const item = checklist.items.find((entry) => entry.itemId === itemId);
  if (!item) {
    throw new ApiError(
      404,
      "CHECKLIST_ITEM_NOT_FOUND",
      "체크리스트 항목을 찾을 수 없습니다.",
    );
  }
  return item;
}

function toChecklistCopy(checklist: Checklist): Checklist {
  return { ...checklist, items: checklist.items.map((item) => ({ ...item })) };
}

export function getChecklist(
  meetingId: number,
  signal?: AbortSignal,
): Promise<Checklist> {
  return respond(toChecklistCopy(ensureChecklist(meetingId)), signal);
}

export function createChecklistItem(
  meetingId: number,
  input: ChecklistItemInput,
): Promise<ChecklistItem> {
  const checklist = ensureChecklist(meetingId);
  if (checklist.items.length >= MAX_CHECKLIST_ITEMS) {
    return Promise.reject(
      new ApiError(
        400,
        "CHECKLIST_ITEM_LIMIT_EXCEEDED",
        `체크리스트 항목은 최대 ${MAX_CHECKLIST_ITEMS}개까지 등록할 수 있습니다.`,
      ),
    );
  }

  const item: ChecklistItem = {
    itemId: nextItemId(),
    content: input.content.trim(),
    status: "PENDING",
    memo: input.memo ?? null,
  };
  checklist.items.push(item);
  persist();
  return respond({ ...item });
}

export function updateChecklistItem(
  meetingId: number,
  itemId: number,
  input: ChecklistItemInput,
): Promise<ChecklistItem> {
  const item = findItem(ensureChecklist(meetingId), itemId);
  item.content = input.content.trim();
  item.memo = input.memo ?? null;
  persist();
  return respond({ ...item });
}

export function updateChecklistItemStatus(
  meetingId: number,
  itemId: number,
  status: ChecklistItemStatus,
): Promise<ChecklistItem> {
  const item = findItem(ensureChecklist(meetingId), itemId);
  item.status = status;
  persist();
  return respond({ ...item });
}

export function deleteChecklistItem(
  meetingId: number,
  itemId: number,
): Promise<void> {
  const checklist = ensureChecklist(meetingId);
  findItem(checklist, itemId);
  checklist.items = checklist.items.filter((entry) => entry.itemId !== itemId);
  persist();
  return respond(undefined);
}
