import { type ReactNode, useActionState, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  Pencil,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { isApiError } from "@/api/error";
import MeetingTimePicker, {
  PreferredTimeList,
} from "@/components/MeetingTimePicker";
import ReservationChecklist from "@/components/ReservationChecklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCancelMeeting,
  useConfirmMeeting,
  useMeetingDetail,
  useMyMeetingList,
  usePropertyMeetingRequests,
  usePropertyMeetingSchedule,
  useRejectMeeting,
  useUpdatePreferredTimes,
} from "@/hooks/queries/meetingQueries";
import {
  useMyPropertyList,
  usePropertyDetail,
} from "@/hooks/queries/propertyQueries";
import {
  MEETING_STATUS_LABEL,
  compareByNearest,
  formatMeetingDateTime,
  formatMeetingShort,
  getMeetingDateTime,
  getMeetingDirection,
  getPreferredTimes,
  isPendingMeeting,
} from "@/lib/meeting";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type {
  Meeting,
  MeetingDirection,
  MeetingStatus,
  PreferredRank,
} from "@/types";

const PAGE_SIZE = 8;
// 매물 선택 드롭다운은 한 번에 다 보여준다 (중개사 보유 매물 수가 많지 않다)
const MY_PROPERTY_PAGE_SIZE = 100;

// mine: 내 회의 목록(공통) / property-request: 매물별 회의 요청(중개사) /
// property-schedule: 매물별 회의 일정 전체(중개사)
type MeetingSource = "mine" | "property-request" | "property-schedule";

const SOURCE_LABEL: Record<MeetingSource, string> = {
  mine: "내 회의",
  "property-request": "매물별 요청",
  "property-schedule": "매물별 일정",
};

const DIRECTION_LABEL: Record<MeetingDirection | "all", string> = {
  all: "전체",
  sent: "보낸 요청",
  received: "받은 요청",
};

const STATUS_TONE: Record<MeetingStatus, string> = {
  OPEN: "border-amber-200 bg-amber-50 text-amber-700",
  REQUESTED: "border-amber-200 bg-amber-50 text-amber-700",
  CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  COMPLETED: "border-blue-200 bg-blue-50 text-blue-700",
  REJECTED: "border-slate-200 bg-slate-100 text-slate-600",
  CANCELED: "border-slate-200 bg-slate-100 text-slate-600",
};

const STATUS_DOT: Record<MeetingStatus, string> = {
  OPEN: "bg-amber-500",
  REQUESTED: "bg-amber-500",
  CONFIRMED: "bg-emerald-500",
  COMPLETED: "bg-blue-500",
  REJECTED: "bg-slate-400",
  CANCELED: "bg-slate-400",
};

function MeetingStatusBadge({ status }: Pick<Meeting, "status">) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 px-2 py-0.5 font-medium", STATUS_TONE[status])}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", STATUS_DOT[status])}
      />
      {MEETING_STATUS_LABEL[status]}
    </Badge>
  );
}

// PAGE-09 예약 목록 / PAGE-10 예약 상세 — RES-05 확정, RES-06 수정, RES-07 취소, RES-08·09 조회
function ReservationPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isBroker = user?.role === "중개사";

  const [source, setSource] = useState<MeetingSource>("mine");
  const [direction, setDirection] = useState<MeetingDirection | "all">("all");
  const [propertyId, setPropertyId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);

  const paging = { page, size: PAGE_SIZE, direction: "DESC" as const };
  const isPropertySource = source !== "mine";
  const myMeetings = useMyMeetingList(paging);
  const propertyRequests = usePropertyMeetingRequests(
    propertyId,
    paging,
    source === "property-request",
  );
  const propertySchedule = usePropertyMeetingSchedule(
    propertyId,
    paging,
    source === "property-schedule",
  );
  const activeQuery =
    source === "mine"
      ? myMeetings
      : source === "property-request"
        ? propertyRequests
        : propertySchedule;

  const { data: myProperties } = useMyPropertyList(
    { size: MY_PROPERTY_PAGE_SIZE },
    isBroker,
  );

  const fetched = activeQuery.data?.content ?? [];
  const meetings = [
    ...(source === "mine" && direction !== "all"
      ? fetched.filter(
          (meeting) => getMeetingDirection(meeting, user?.id) === direction,
        )
      : fetched),
  ].sort(compareByNearest);
  // 목록이 바뀌어 이전 선택이 사라졌을 때는 첫 항목으로 되돌린다
  const activeId = meetings.some((meeting) => meeting.meetingId === selectedId)
    ? selectedId
    : meetings[0]?.meetingId;
  const activeMeeting = meetings.find(
    (meeting) => meeting.meetingId === activeId,
  );

  const totalPages = activeQuery.data?.totalPages ?? 1;
  const confirmedCount = fetched.filter(
    (meeting) => meeting.status === "CONFIRMED",
  ).length;

  const changeSource = (next: MeetingSource) => {
    setSource(next);
    setPage(0);
    if (next !== "mine" && propertyId === undefined) {
      setPropertyId(myProperties?.content[0]?.propertyId);
    }
  };

  return (
    <main className="min-h-[calc(100svh-3.5rem)] bg-white">
      <section className="border-b bg-slate-50/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold">예약 확인</h1>
            <p className="text-xs text-muted-foreground">
              미팅 일정, 매물 정보, 입장 준비 상태
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden sm:flex">
              <ShieldCheck /> 이 페이지 확정 {confirmedCount}건
            </Badge>
            <Button size="sm" onClick={() => navigate("/properties")}>
              새 미팅 예약
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 pt-4">
        {isBroker && (
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(["mine", "property-request", "property-schedule"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm transition-colors",
                    source === tab
                      ? "bg-white font-semibold text-primary shadow-sm"
                      : "text-muted-foreground",
                  )}
                  onClick={() => changeSource(tab)}
                >
                  {SOURCE_LABEL[tab]}
                </button>
              ),
            )}
          </div>
        )}

        {isBroker && source === "mine" && (
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(["all", "sent", "received"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={cn(
                  "rounded-lg px-4 py-2 text-sm transition-colors",
                  direction === tab
                    ? "bg-white font-semibold text-primary shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setDirection(tab)}
              >
                {DIRECTION_LABEL[tab]}
              </button>
            ))}
          </div>
        )}

        {isPropertySource && (
          <Select
            value={propertyId === undefined ? "" : String(propertyId)}
            onValueChange={(value) => {
              setPropertyId(Number(value));
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[260px] bg-white">
              <SelectValue placeholder="매물을 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {(myProperties?.content ?? []).map((property) => (
                <SelectItem
                  key={property.propertyId}
                  value={String(property.propertyId)}
                >
                  {property.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isPropertySource && propertyId === undefined ? (
        <EmptyState
          title="매물을 먼저 선택해 주세요"
          description="내가 등록한 매물을 고르면 회의 요청과 일정을 볼 수 있습니다."
        />
      ) : activeQuery.isPending ? (
        <div className="mx-auto max-w-7xl px-4 py-5">
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : activeQuery.isError ? (
        <EmptyState
          title="예약 목록을 불러오지 못했습니다"
          description={
            isApiError(activeQuery.error)
              ? activeQuery.error.message
              : "잠시 후 다시 시도해 주세요."
          }
          action={
            <Button className="mt-5" onClick={() => activeQuery.refetch()}>
              다시 시도
            </Button>
          }
        />
      ) : meetings.length === 0 || activeId === undefined ? (
        <EmptyState
          title="아직 표시할 예약이 없습니다"
          description={
            source === "mine"
              ? "매물 목록에서 원하는 매물의 미팅을 예약해 보세요."
              : "이 매물에는 아직 들어온 회의 요청이 없습니다."
          }
          action={
            <Button className="mt-5" onClick={() => navigate("/properties")}>
              매물 둘러보기
            </Button>
          }
        />
      ) : (
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)_350px] xl:grid-cols-[300px_minmax(0,1fr)_370px]">
          <Card className="gap-3 py-4">
            <CardHeader className="flex-row items-center justify-between px-4">
              <CardTitle className="text-base">예약 목록</CardTitle>
              <Badge variant="secondary">
                {activeQuery.data?.totalElements ?? meetings.length}건
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 px-4">
              {meetings.map((meeting) => (
                <MeetingListItem
                  key={meeting.meetingId}
                  meeting={meeting}
                  direction={getMeetingDirection(meeting, user?.id)}
                  isSelected={meeting.meetingId === activeId}
                  onSelect={() => setSelectedId(meeting.meetingId)}
                />
              ))}
              <MeetingPagination
                page={page}
                totalPages={totalPages}
                onChange={setPage}
              />
            </CardContent>
          </Card>

          <MeetingDetailCard
            meetingId={activeId}
            userId={user?.id}
            onEnter={(meetingId) => navigate(`/reservation/${meetingId}`)}
          />

          <Card className="gap-3 py-4">
            <CardContent className="px-4">
              <ReservationChecklist
                meetingId={activeId}
                meetingStatus={activeMeeting?.status}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 text-center">
      <CalendarClock className="mx-auto size-10 text-muted-foreground" />
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

function MeetingListItem({
  meeting,
  direction,
  isSelected,
  onSelect,
}: {
  meeting: Meeting;
  direction: MeetingDirection;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const at = getMeetingDateTime(meeting);
  const counterpart =
    direction === "sent" ? meeting.agentNickname : meeting.tenantNickname;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/[0.04]"
          : "bg-slate-50 hover:bg-slate-100",
      )}
      onClick={onSelect}
    >
      <PropertyTitle propertyId={meeting.propertyId} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <MeetingStatusBadge status={meeting.status} />
        <Badge variant="outline">
          {direction === "sent" ? "보낸 요청" : "받은 요청"}
        </Badge>
      </div>
      <p className="mt-1 text-xs font-medium text-primary">
        {at ? formatMeetingShort(at) : "희망 시간 없음"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {counterpart} · 온라인 미팅
      </p>
    </button>
  );
}

// 매물 제목은 회의 응답에 없어 매물 상세로 따로 채운다
function PropertyTitle({ propertyId }: { propertyId: number }) {
  const { data: property } = usePropertyDetail(propertyId);

  return (
    <strong className="block truncate text-sm">
      {property?.title ?? `매물 #${propertyId}`}
    </strong>
  );
}

function MeetingPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      className="flex items-center justify-center gap-1 pt-1"
      aria-label="예약 목록 페이지"
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="size-8 p-0"
        aria-label="이전 페이지"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft />
      </Button>
      <span className="px-2 text-xs text-muted-foreground">
        {page + 1} / {totalPages}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="size-8 p-0"
        aria-label="다음 페이지"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}

function MeetingDetailCard({
  meetingId,
  userId,
  onEnter,
}: {
  meetingId: number;
  userId: number | undefined;
  onEnter: (meetingId: number) => void;
}) {
  const {
    data: meeting,
    isPending,
    isError,
    error,
  } = useMeetingDetail(meetingId);

  if (isPending) {
    return <Skeleton className="h-96 rounded-xl" />;
  }
  if (isError || !meeting) {
    return (
      <Card className="py-4">
        <CardContent className="px-4 text-sm text-muted-foreground">
          {isApiError(error)
            ? error.message
            : "회의 상세를 불러오지 못했습니다."}
        </CardContent>
      </Card>
    );
  }

  const direction = getMeetingDirection(meeting, userId);
  const preferredTimes = getPreferredTimes(meeting);

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex-row items-start justify-between px-4">
        <div>
          <CardTitle className="text-base">미팅 상세</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            일정과 매물 정보를 확인하세요
          </p>
        </div>
        <MeetingStatusBadge status={meeting.status} />
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <PropertyBrief
          propertyId={meeting.propertyId}
          meetingId={meeting.meetingId}
        />

        <div className="grid grid-cols-2 overflow-hidden rounded-xl border text-sm">
          <div className="border-b border-r bg-slate-50 p-3 text-muted-foreground">
            {direction === "sent" ? "담당 중개사" : "요청자"}
          </div>
          <div className="border-b p-3 font-semibold">
            {direction === "sent"
              ? meeting.agentNickname
              : meeting.tenantNickname}
          </div>
          <div className="border-r bg-slate-50 p-3 text-muted-foreground">
            {meeting.scheduledAt ? "확정 시간" : "희망 시간"}
          </div>
          <div className="p-3 font-semibold text-primary">
            {meeting.scheduledAt ? (
              `${formatMeetingDateTime(meeting.scheduledAt)} · 약 30분`
            ) : preferredTimes.length === 0 ? (
              "등록된 희망 시간이 없습니다"
            ) : (
              <ol className="space-y-1">
                {preferredTimes.map(({ rank, at }) => (
                  <li key={rank}>
                    {rank}순위 · {formatMeetingDateTime(at)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {isPendingMeeting(meeting) &&
          (direction === "received" ? (
            <AgentDecisionPanel meeting={meeting} />
          ) : (
            <TenantRequestPanel meeting={meeting} />
          ))}

        {meeting.status === "CONFIRMED" && (
          <ConfirmedPanel meeting={meeting} onEnter={onEnter} />
        )}

        {(meeting.status === "REJECTED" || meeting.status === "CANCELED") && (
          <p className="rounded-xl border bg-slate-50/70 p-4 text-sm text-muted-foreground">
            {meeting.status === "REJECTED"
              ? "중개사가 이 요청을 거절했습니다. 다른 시간으로 새로 요청해 주세요."
              : "취소된 회의입니다."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PropertyBrief({
  propertyId,
  meetingId,
}: {
  propertyId: number;
  meetingId: number;
}) {
  const { data: property, isPending } = usePropertyDetail(propertyId);

  if (isPending) {
    return <Skeleton className="h-44 rounded-xl" />;
  }
  if (!property) {
    return (
      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        매물 정보를 불러오지 못했습니다 (매물 #{propertyId}).
      </div>
    );
  }

  return (
    <div className="grid overflow-hidden rounded-xl border sm:grid-cols-[220px_1fr]">
      {property.imageUrl ? (
        <img
          src={property.imageUrl}
          alt={`${property.title} 매물 사진`}
          className="h-44 w-full object-cover sm:h-full"
        />
      ) : (
        <div className="hidden bg-slate-100 sm:block" />
      )}
      <div className="relative p-4">
        <span className="absolute right-4 top-4 text-xs text-muted-foreground">
          회의번호 <strong className="ml-1 text-foreground">{meetingId}</strong>
        </span>
        <div className="flex gap-2 pr-24">
          <Badge variant="secondary">{property.transactionType}</Badge>
          <Badge variant="outline">{property.roomType}</Badge>
        </div>
        <h2 className="mt-3 text-lg font-semibold">{property.title}</h2>
        <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-4" /> {property.sigungu} {property.dong}
        </p>
        <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          <Home className="size-4" /> {property.area}㎡
          {property.floor !== undefined && ` · ${property.floor}층`}
        </p>
      </div>
    </div>
  );
}

// RES-05 회의 날짜 확정 — 세입자가 보낸 순위 중 하나를 고르거나 요청을 거절한다
function AgentDecisionPanel({ meeting }: { meeting: Meeting }) {
  const preferredTimes = getPreferredTimes(meeting);
  const [selectedRank, setSelectedRank] = useState<PreferredRank | undefined>(
    preferredTimes[0]?.rank,
  );
  const confirm = useConfirmMeeting(meeting.meetingId);
  const reject = useRejectMeeting(meeting.meetingId);

  const [error, decideAction, isDeciding] = useActionState<
    string | null,
    FormData
  >(async (_previous, formData) => {
    const intent = formData.get("intent");
    try {
      if (intent === "reject") {
        await reject.mutateAsync();
      } else if (selectedRank !== undefined) {
        await confirm.mutateAsync(selectedRank);
      }
      return null;
    } catch (decisionError) {
      return isApiError(decisionError)
        ? decisionError.message
        : "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }, null);

  return (
    <form
      action={decideAction}
      className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4"
    >
      <p className="font-semibold">예약 시간을 선택해 주세요</p>
      <p className="mt-1 text-xs text-muted-foreground">
        요청자가 보낸 후보 중 가능한 시간을 하나 선택하면 예약이 확정됩니다.
      </p>
      <div className="mt-3 space-y-2">
        {preferredTimes.map(({ rank, at }) => (
          <Button
            key={rank}
            type="button"
            variant={selectedRank === rank ? "default" : "outline"}
            aria-pressed={selectedRank === rank}
            className="w-full justify-start"
            onClick={() => setSelectedRank(rank)}
          >
            <Clock3 /> {rank}순위 · {formatMeetingDateTime(at)}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Button
          type="submit"
          name="intent"
          value="confirm"
          disabled={selectedRank === undefined || isDeciding}
        >
          <Check /> 이 시간으로 예약 확정
        </Button>
        <Button
          type="submit"
          name="intent"
          value="reject"
          variant="outline"
          disabled={isDeciding}
        >
          <X /> 요청 거절
        </Button>
      </div>
    </form>
  );
}

// RES-06 회의 날짜 수정 / RES-07 취소 — 확정 전 세입자가 할 수 있는 조작
function TenantRequestPanel({ meeting }: { meeting: Meeting }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-slate-50/70 p-4">
      <p className="text-sm font-semibold">중개사의 확정을 기다리고 있습니다</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        확정 전에는 희망 시간을 수정하거나 요청을 취소할 수 있어요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil /> 희망 시간 수정
        </Button>
        <CancelMeetingButton meetingId={meeting.meetingId} />
      </div>
      <PreferredTimesDialog
        key={meeting.updatedAt}
        meeting={meeting}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

function PreferredTimesDialog({
  meeting,
  open,
  onOpenChange,
}: {
  meeting: Meeting;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentTimes = getPreferredTimes(meeting).map(({ at }) => at);
  const [preferredTimes, setPreferredTimes] = useState(currentTimes);
  const { mutateAsync } = useUpdatePreferredTimes(meeting.meetingId);

  const [error, saveAction, isSaving] = useActionState<string | null>(
    async () => {
      try {
        await mutateAsync(preferredTimes);
        onOpenChange(false);
        return null;
      } catch (saveError) {
        return isApiError(saveError)
          ? saveError.message
          : "희망 시간 수정에 실패했습니다.";
      }
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>희망 회의 시간 수정</DialogTitle>
          <DialogDescription>
            새로 고른 시간이 기존 희망 시간을 대체합니다.
          </DialogDescription>
        </DialogHeader>
        <form action={saveAction} className="space-y-4">
          <MeetingTimePicker
            propertyId={meeting.propertyId}
            value={preferredTimes}
            onChange={setPreferredTimes}
            keepAvailable={currentTimes}
          />
          <PreferredTimeList
            value={preferredTimes}
            onRemove={(slot) =>
              setPreferredTimes((previous) =>
                previous.filter((picked) => picked !== slot),
              )
            }
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              닫기
            </Button>
            <Button
              type="submit"
              disabled={preferredTimes.length === 0 || isSaving}
            >
              <Check /> {isSaving ? "저장 중…" : "희망 시간 저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmedPanel({
  meeting,
  onEnter,
}: {
  meeting: Meeting;
  onEnter: (meetingId: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="size-5 text-emerald-600" /> 예약 상태
        </p>
        <MeetingStatusBadge status={meeting.status} />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        일정이 확정되었습니다.
        <br />
        시작 10분 전부터 입장할 수 있어요.
      </p>
      <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid grid-cols-[70px_1fr] gap-y-2 text-xs">
          <span className="text-muted-foreground">형식</span>
          <strong>실시간 영상 투어</strong>
          <span className="text-muted-foreground">소요시간</span>
          <strong>약 30분</strong>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onEnter(meeting.meetingId)}>
            <Video /> 미팅 입장
          </Button>
          <CancelMeetingButton meetingId={meeting.meetingId} />
        </div>
      </div>
    </div>
  );
}

function CancelMeetingButton({ meetingId }: { meetingId: number }) {
  const { mutateAsync } = useCancelMeeting(meetingId);
  const [error, cancelAction, isCanceling] = useActionState<string | null>(
    async () => {
      try {
        await mutateAsync();
        return null;
      } catch (cancelError) {
        return isApiError(cancelError)
          ? cancelError.message
          : "예약 취소에 실패했습니다.";
      }
    },
    null,
  );

  return (
    <form action={cancelAction}>
      <Button type="submit" variant="outline" disabled={isCanceling}>
        <X /> {isCanceling ? "취소 중…" : "예약 취소"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export default ReservationPage;
