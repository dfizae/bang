import { type ReactNode, useActionState, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { isApiError } from "@/api/error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ChecklistItemInput,
  MAX_CHECKLIST_ITEMS,
  useChecklist,
  useCreateChecklistItem,
  useDeleteChecklistItem,
  useUpdateChecklistItem,
  useUpdateChecklistItemStatus,
} from "@/hooks/queries/checklistQueries";
import { cn } from "@/lib/utils";
import type {
  ChecklistItem,
  ChecklistItemStatus,
  MeetingStatus,
} from "@/types";

interface ReservationChecklistProps {
  meetingId: number | undefined;
  meetingStatus?: MeetingStatus;
  // bare — 이미 제목이 있는 탭·패널 안에 들어갈 때 카드 껍데기와 제목을 뺀다
  variant?: "card" | "bare";
}

// 확인 완료 ↔ 확인 전 토글, 문제 발견(ISSUE_FOUND) 항목은 눌러서 확인 완료로 되돌린다
const NEXT_STATUS: Record<ChecklistItemStatus, ChecklistItemStatus> = {
  PENDING: "COMPLETED",
  COMPLETED: "PENDING",
  ISSUE_FOUND: "COMPLETED",
};

const STATUS_LABEL: Record<ChecklistItemStatus, string> = {
  PENDING: "확인 전",
  COMPLETED: "확인 완료",
  ISSUE_FOUND: "문제 발견",
};

function ReservationChecklist({
  meetingId,
  meetingStatus,
  variant = "card",
}: ReservationChecklistProps) {
  const isBare = variant === "bare";

  if (meetingId === undefined) {
    return (
      <ChecklistFrame isBare={isBare}>
        <ChecklistNotice isBare={isBare}>
          예약을 선택하면 체크리스트가 표시됩니다.
        </ChecklistNotice>
      </ChecklistFrame>
    );
  }

  if (
    meetingStatus !== undefined &&
    meetingStatus !== "CONFIRMED" &&
    meetingStatus !== "COMPLETED"
  ) {
    return (
      <ChecklistFrame isBare={isBare}>
        <ChecklistNotice isBare={isBare}>
          {meetingStatus === "OPEN" || meetingStatus === "REQUESTED"
            ? "예약이 확정되면 체크리스트가 자동으로 생성됩니다."
            : "취소되거나 거절된 미팅에는 체크리스트가 생성되지 않습니다."}
        </ChecklistNotice>
      </ChecklistFrame>
    );
  }
  return <ChecklistContent meetingId={meetingId} isBare={isBare} />;
}

function ChecklistContent({
  meetingId,
  isBare,
}: {
  meetingId: number;
  isBare: boolean;
}) {
  const {
    data: checklist,
    isPending,
    isError,
    error,
    refetch,
  } = useChecklist(meetingId);
  const createItem = useCreateChecklistItem(meetingId);
  const updateItem = useUpdateChecklistItem(meetingId);
  const updateStatus = useUpdateChecklistItemStatus(meetingId);
  const deleteItem = useDeleteChecklistItem(meetingId);

  const [draft, setDraft] = useState("");
  const items = checklist?.items ?? [];
  const completedCount = items.filter(
    (item) => item.status === "COMPLETED",
  ).length;
  const isFull = items.length >= MAX_CHECKLIST_ITEMS;

  const [addError, addAction, isAdding] = useActionState(
    async (): Promise<string | null> => {
      const content = draft.trim();
      if (!content || isFull) {
        return null;
      }
      try {
        await createItem.mutateAsync({ content });
        setDraft("");
        return null;
      } catch (error) {
        return isApiError(error)
          ? error.message
          : "항목 추가에 실패했습니다. 다시 시도해 주세요.";
      }
    },
    null,
  );

  if (isPending) {
    return (
      <ChecklistFrame isBare={isBare}>
        <ChecklistNotice isBare={isBare}>
          체크리스트를 불러오는 중입니다…
        </ChecklistNotice>
      </ChecklistFrame>
    );
  }

  if (isError) {
    return (
      <ChecklistFrame isBare={isBare}>
        <ChecklistNotice isBare={isBare}>
          체크리스트를 불러오지 못했습니다.
          {isApiError(error) && (
            <span className="text-xs text-muted-foreground">
              {error.message}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw /> 다시 시도
          </Button>
        </ChecklistNotice>
      </ChecklistFrame>
    );
  }

  return (
    <ChecklistFrame
      isBare={isBare}
      badge={
        <Badge variant="secondary">
          {completedCount}/{items.length} · 최대 {MAX_CHECKLIST_ITEMS}개
        </Badge>
      }
    >
      {items.length === 0 ? (
        <p
          className={cn(
            "shrink-0 rounded-lg border border-dashed bg-white px-3 py-6 text-center text-xs text-muted-foreground",
            !isBare && "mt-4",
          )}
        >
          아직 체크리스트 항목이 없습니다. 아래에서 추가하세요.
        </p>
      ) : (
        <ul
          className={cn(
            "min-h-0 space-y-2 overflow-y-auto pr-1",
            // 부모가 높이를 주지 않는 카드 형태에서는 목록 자체에 상한을 둔다
            isBare ? "flex-1" : "mt-4 max-h-80",
          )}
        >
          {items.map((item) => (
            <ChecklistRow
              key={item.itemId}
              item={item}
              onToggle={() =>
                updateStatus.mutate({
                  itemId: item.itemId,
                  status: NEXT_STATUS[item.status],
                })
              }
              onRemove={() => deleteItem.mutate(item.itemId)}
              onSave={(input) =>
                updateItem.mutateAsync({ itemId: item.itemId, input })
              }
            />
          ))}
        </ul>
      )}

      <form className="mt-3 flex shrink-0 gap-2" action={addAction}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            isFull
              ? `최대 ${MAX_CHECKLIST_ITEMS}개까지 작성 가능`
              : "확인할 내용이나 질문을 입력하세요"
          }
          aria-label="체크리스트 항목"
          disabled={isFull}
          className="h-11 min-w-0 flex-1 bg-white py-2 text-sm leading-6 placeholder:text-sm placeholder:leading-6"
          maxLength={60}
        />
        <Button
          type="submit"
          size="sm"
          className="h-10 shrink-0"
          disabled={isFull || isAdding}
        >
          <Plus /> 추가
        </Button>
      </form>

      {addError && (
        <p role="alert" className="mt-2 shrink-0 text-xs text-red-600">
          {addError}
        </p>
      )}

      {isFull && (
        <p
          role="status"
          className="mt-2 shrink-0 text-xs text-muted-foreground"
        >
          체크리스트는 최대 {MAX_CHECKLIST_ITEMS}개까지 등록할 수 있어요.
        </p>
      )}
    </ChecklistFrame>
  );
}

function ChecklistRow({
  item,
  onToggle,
  onRemove,
  onSave,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onRemove: () => void;
  onSave: (input: ChecklistItemInput) => Promise<unknown>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const isCompleted = item.status === "COMPLETED";

  if (isEditing) {
    return (
      <ChecklistRowEditor
        item={item}
        onSave={onSave}
        onClose={() => setIsEditing(false)}
      />
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5">
      <button
        type="button"
        className={cn(
          "shrink-0",
          item.status === "ISSUE_FOUND" ? "text-red-500" : "text-primary",
        )}
        aria-label={`${item.content} (${STATUS_LABEL[item.status]}) ${STATUS_LABEL[NEXT_STATUS[item.status]]}로 변경`}
        onClick={onToggle}
      >
        {isCompleted ? (
          <CheckCircle2 className="size-5" />
        ) : item.status === "ISSUE_FOUND" ? (
          <TriangleAlert className="size-5" />
        ) : (
          <Circle className="size-5" />
        )}
      </button>
      <span
        className={cn(
          "min-w-0 flex-1 text-sm break-words",
          isCompleted && "text-muted-foreground line-through",
        )}
      >
        {item.content}
      </span>
      <button
        type="button"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-slate-900"
        aria-label={`${item.content} 내용 수정`}
        onClick={() => setIsEditing(true)}
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
        aria-label={`${item.content} 삭제`}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function ChecklistRowEditor({
  item,
  onSave,
  onClose,
}: {
  item: ChecklistItem;
  onSave: (input: ChecklistItemInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(item.content);

  const [saveError, saveAction, isSaving] = useActionState(
    async (): Promise<string | null> => {
      const content = draft.trim();
      if (!content) {
        return "내용을 입력해 주세요.";
      }
      if (content === item.content) {
        onClose();
        return null;
      }
      try {
        // 화면에는 memo 편집이 없지만 PUT이 memo까지 교체하므로 기존 값을 함께 보낸다
        await onSave({ content, memo: item.memo ?? undefined });
        onClose();
        return null;
      } catch (error) {
        return isApiError(error)
          ? error.message
          : "항목 수정에 실패했습니다. 다시 시도해 주세요.";
      }
    },
    null,
  );

  return (
    <li className="rounded-lg border border-primary/40 bg-white px-3 py-2.5">
      <form className="flex items-center gap-2" action={saveAction}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onClose()}
          aria-label={`${item.content} 내용 수정`}
          autoFocus
          maxLength={60}
          className="h-9 min-w-0 flex-1 bg-white text-sm"
        />
        <Button
          type="submit"
          size="sm"
          className="h-9 shrink-0"
          disabled={isSaving}
        >
          <Check /> 저장
        </Button>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-slate-900"
          aria-label="수정 취소"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </form>
      {saveError && (
        <p role="alert" className="mt-1.5 text-xs text-red-600">
          {saveError}
        </p>
      )}
    </li>
  );
}

function ChecklistFrame({
  isBare,
  badge,
  children,
}: {
  isBare: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    // 항목이 늘어나도 페이지가 아니라 목록만 스크롤되도록 높이를 여기서 가둔다
    <div
      className={cn(
        "flex min-h-0 flex-col",
        isBare ? "flex-1" : "rounded-xl border bg-slate-50/70 p-4",
      )}
    >
      {!isBare && (
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <strong className="text-sm text-slate-900">예약 체크리스트</strong>
            <p className="mt-1 text-xs text-muted-foreground">
              통화 중 확인할 내용을 적고, 확인한 항목을 체크하세요.
            </p>
          </div>
          {badge}
        </div>
      )}
      {children}
    </div>
  );
}

function ChecklistNotice({
  isBare,
  children,
}: {
  isBare: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-white px-3 py-8 text-center text-xs text-muted-foreground",
        !isBare && "mt-4",
      )}
    >
      {children}
    </div>
  );
}

export default ReservationChecklist;
