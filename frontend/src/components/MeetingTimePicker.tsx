import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnavailableTimes } from "@/hooks/queries/meetingQueries";
import {
  MAX_PREFERRED_TIMES,
  formatMeetingDateTime,
  toDateKey,
  toLocalDateTime,
  toSlotKey,
} from "@/lib/meeting";
import { cn } from "@/lib/utils";

// 회의 가능 시간대 — 08:00~22:00 정각 슬롯
const HOURS = Array.from({ length: 15 }, (_, index) => index + 8);

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface MeetingTimePickerProps {
  propertyId: number;
  // LocalDateTime 문자열 배열 — 순서가 그대로 희망 순위가 된다
  value: string[];
  onChange: (next: string[]) => void;
  // 수정 중인 회의가 이미 점유한 시간은 등록 불가능 목록에서 빼야 다시 고를 수 있다
  keepAvailable?: string[];
}

function getCalendarDays(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const lastDate = new Date(year, monthIndex + 1, 0).getDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: lastDate },
      (_, index) => new Date(year, monthIndex, index + 1),
    ),
  ];
}

// RES-01 회의 가능 날짜·시간 조회 + 희망 시간 선택 (최대 3순위).
// 매물 상세의 예약 요청과 예약 목록의 희망 시간 수정이 같은 UI를 공유한다
function MeetingTimePicker({
  propertyId,
  value,
  onChange,
  keepAvailable = [],
}: MeetingTimePickerProps) {
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(toDateKey(today));

  const monthDays = getCalendarDays(visibleMonth);
  const monthStart = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  );
  const monthEnd = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  );
  const {
    data: unavailableTimes,
    isPending,
    isError,
  } = useUnavailableTimes(propertyId, {
    from: toDateKey(monthStart),
    to: toDateKey(monthEnd),
  });

  const keptSlots = new Set(keepAvailable.map(toSlotKey));
  const blockedSlots = new Set(
    (unavailableTimes ?? [])
      .map(toSlotKey)
      .filter((slot) => !keptSlots.has(slot)),
  );
  const selectedSlots = new Set(value.map(toSlotKey));
  const isFull = value.length >= MAX_PREFERRED_TIMES;

  const toggleSlot = (slot: string) => {
    if (selectedSlots.has(slot)) {
      onChange(value.filter((picked) => toSlotKey(picked) !== slot));
      return;
    }
    if (isFull) {
      return;
    }
    onChange([...value, slot]);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="rounded-xl border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" /> 날짜 선택
        </h3>
        <div className="mt-3 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="이전 달"
            onClick={() =>
              setVisibleMonth(
                (month) =>
                  new Date(month.getFullYear(), month.getMonth() - 1, 1),
              )
            }
          >
            <ChevronLeft />
          </Button>
          <strong className="text-sm">
            {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월
          </strong>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="다음 달"
            onClick={() =>
              setVisibleMonth(
                (month) =>
                  new Date(month.getFullYear(), month.getMonth() + 1, 1),
              )
            }
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} className="py-1 text-xs text-muted-foreground">
              {weekday}
            </span>
          ))}
          {monthDays.map((date, index) => {
            if (!date) {
              return <span key={`empty-${index}`} />;
            }
            const dateKey = toDateKey(date);
            const isPast = dateKey < toDateKey(today);
            const pickedCount = value.filter((picked) =>
              picked.startsWith(dateKey),
            ).length;
            return (
              <button
                key={dateKey}
                type="button"
                disabled={isPast}
                aria-pressed={selectedDate === dateKey}
                className={cn(
                  "relative aspect-square rounded-md text-xs transition-colors hover:bg-accent",
                  selectedDate === dateKey &&
                    "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  isPast && "cursor-not-allowed text-muted-foreground/35",
                )}
                onClick={() => setSelectedDate(dateKey)}
              >
                {date.getDate()}
                {pickedCount > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 bottom-1 mx-auto size-1 rounded-full",
                      selectedDate === dateKey
                        ? "bg-primary-foreground"
                        : "bg-primary",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h3 className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Clock3 className="size-4 text-primary" /> 시간 선택
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            08:00–22:00
          </span>
        </h3>
        {isPending ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {HOURS.map((hour) => (
              <Skeleton key={hour} className="h-9 rounded-md" />
            ))}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {HOURS.map((hour) => {
              const slot = toLocalDateTime(
                new Date(
                  `${selectedDate}T${String(hour).padStart(2, "0")}:00:00`,
                ),
              );
              const selected = selectedSlots.has(slot);
              const blocked = blockedSlots.has(slot);
              const past = new Date(slot).getTime() < Date.now();
              const disabled = blocked || past || (isFull && !selected);
              return (
                <Button
                  key={hour}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  disabled={disabled}
                  title={blocked ? "이미 예약된 시간입니다" : undefined}
                  onClick={() => toggleSlot(slot)}
                >
                  {String(hour).padStart(2, "0")}:00
                </Button>
              );
            })}
          </div>
        )}
        {isError && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            이미 예약된 시간을 확인하지 못했습니다. 선택한 시간이 겹치면 등록이
            거절될 수 있어요.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          희망 시간을 최대 {MAX_PREFERRED_TIMES}개까지 고를 수 있고, 고른 순서가
          그대로 순위가 됩니다.
        </p>
      </section>
    </div>
  );
}

// 선택한 희망 시간을 순위와 함께 보여주는 요약 목록 — 등록·수정 화면이 공유한다
export function PreferredTimeList({
  value,
  onRemove,
}: {
  value: string[];
  onRemove?: (slot: string) => void;
}) {
  return (
    <ol className="space-y-2">
      {Array.from({ length: MAX_PREFERRED_TIMES }, (_, index) => {
        const slot = value[index];
        return (
          <li
            key={index}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
              slot ? "bg-background font-semibold" : "text-muted-foreground",
            )}
          >
            <span className="min-w-0 truncate">
              {slot
                ? `${index + 1}순위 · ${formatMeetingDateTime(slot)}`
                : `${index + 1}순위 (선택 안 함)`}
            </span>
            {slot && onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs font-normal text-muted-foreground"
                onClick={() => onRemove(slot)}
              >
                해제
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default MeetingTimePicker;
