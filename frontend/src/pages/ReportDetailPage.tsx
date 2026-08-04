import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock3,
  FileText,
  MapPin,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useReportDetail } from "@/hooks/queries/reportQueries";
import { usePropertyDetail } from "@/hooks/queries/propertyQueries";
import { formatDateTime } from "@/lib/format";
import type { ChecklistItem, ChecklistItemStatus } from "@/types";

interface ChecklistStatusStyle {
  label: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  badgeClassName: string;
  groupClassName: string;
}

const CHECKLIST_STATUS: Record<ChecklistItemStatus, ChecklistStatusStyle> = {
  COMPLETED: {
    label: "확인 완료",
    description: "현장에서 확인을 마친 항목",
    icon: CheckCircle2,
    iconClassName: "text-emerald-600",
    badgeClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    groupClassName: "border-emerald-200/80 dark:border-emerald-900",
  },
  ISSUE_FOUND: {
    label: "확인 필요",
    description: "문제가 있거나 추가 확인이 필요한 항목",
    icon: TriangleAlert,
    iconClassName: "text-amber-600",
    badgeClassName:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    groupClassName: "border-amber-200/80 dark:border-amber-900",
  },
  PENDING: {
    label: "미확인",
    description: "미팅에서 아직 확인하지 않은 항목",
    icon: Circle,
    iconClassName: "text-slate-400",
    badgeClassName:
      "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
    groupClassName: "border-slate-200 dark:border-slate-800",
  },
};

const CHECKLIST_ORDER: ChecklistItemStatus[] = [
  "ISSUE_FOUND",
  "PENDING",
  "COMPLETED",
];

function ChecklistGroup({
  status,
  items,
}: {
  status: ChecklistItemStatus;
  items: ChecklistItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  const style = CHECKLIST_STATUS[status];
  const StatusIcon = style.icon;

  return (
    <section
      className={`overflow-hidden rounded-xl border ${style.groupClassName}`}
    >
      <header className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <StatusIcon className={`size-5 shrink-0 ${style.iconClassName}`} />
          <div>
            <h3 className="text-sm font-semibold">{style.label}</h3>
            <p className="text-xs text-muted-foreground">{style.description}</p>
          </div>
        </div>
        <span
          className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${style.badgeClassName}`}
        >
          {items.length}개
        </span>
      </header>

      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.itemId} className="flex gap-3 bg-background px-4 py-4">
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${style.badgeClassName}`}
              aria-hidden="true"
            >
              {status === "COMPLETED" ? (
                <Check className="size-3.5 stroke-[3]" />
              ) : (
                <StatusIcon className="size-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium leading-6">{item.content}</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.badgeClassName}`}
                >
                  {style.label}
                </span>
              </div>
              {item.memo ? (
                <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm leading-6 text-muted-foreground">
                  <span className="mr-2 font-medium text-foreground">메모</span>
                  {item.memo}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  작성된 메모 없음
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportDetailPage() {
  const { reportId: reportIdParam } = useParams();
  const navigate = useNavigate();
  const reportId = Number(reportIdParam);
  const validReportId = Number.isInteger(reportId) ? reportId : undefined;
  const {
    data: report,
    isPending,
    isError,
    refetch,
  } = useReportDetail(validReportId);
  const { data: property } = usePropertyDetail(
    report?.propertyId ?? -1,
    report !== undefined,
  );

  if (isPending) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="mt-6 h-96 w-full rounded-2xl" />
      </main>
    );
  }

  if (isError || !report) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-4 py-12 sm:px-6">
        <p className="font-medium">리포트를 불러오지 못했어요.</p>
        <p className="text-sm text-muted-foreground">
          네트워크 상태를 확인한 후 다시 시도해 주세요.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          다시 시도
        </Button>
      </main>
    );
  }

  const items = report.checklist?.items ?? [];
  const statusCounts = {
    COMPLETED: items.filter((item) => item.status === "COMPLETED").length,
    ISSUE_FOUND: items.filter((item) => item.status === "ISSUE_FOUND").length,
    PENDING: items.filter((item) => item.status === "PENDING").length,
  } satisfies Record<ChecklistItemStatus, number>;
  const checkedCount = statusCounts.COMPLETED + statusCounts.ISSUE_FOUND;
  const progress =
    items.length === 0 ? 0 : Math.round((checkedCount / items.length) * 100);

  const documentStatus =
    report.status === "CONFIRMED"
      ? "작성 완료"
      : report.status === "REJECTED"
        ? "검토 필요"
        : "작성 중";

  return (
    <main className="min-h-[calc(100svh-3.5rem)] bg-slate-50/60 px-4 py-8 dark:bg-slate-950/30 sm:px-6 sm:py-10">
      <article className="mx-auto max-w-5xl">
        <Button
          variant="ghost"
          className="mb-4 -ml-3 min-h-11"
          onClick={() => navigate("/mypage?section=reports")}
        >
          <ArrowLeft className="size-4" /> 리포트 목록
        </Button>

        <header className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="border-b px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  <FileText className="size-4" /> 현장 점검 리포트
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {property?.title ?? `매물 #${report.propertyId}`}
                </h1>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-4" />
                  {property
                    ? `${property.sigungu} ${property.dong}`
                    : "매물 위치 확인 중"}
                </p>
              </div>
              <span className="w-fit rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary">
                {documentStatus}
              </span>
            </div>
          </div>

          <dl className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-5 py-4 sm:px-6">
              <dt className="text-xs font-medium text-muted-foreground">
                작성일
              </dt>
              <dd className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                <Clock3 className="size-4 text-muted-foreground" />
                {formatDateTime(report.createdAt)}
              </dd>
            </div>
            <div className="px-5 py-4 sm:px-6">
              <dt className="text-xs font-medium text-muted-foreground">
                점검 진행률
              </dt>
              <dd className="mt-1.5 text-sm font-medium">
                {checkedCount}/{items.length}개 확인 · {progress}%
              </dd>
            </div>
            <div className="px-5 py-4 sm:px-6">
              <dt className="text-xs font-medium text-muted-foreground">
                현장 자료
              </dt>
              <dd className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                <Camera className="size-4 text-muted-foreground" /> 사진{" "}
                {report.captures.length}장
              </dd>
            </div>
          </dl>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
          <div className="space-y-6">
            <section className="rounded-2xl border bg-background p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">점검 요약</h2>
              </div>
              <p className="mt-4 border-l-2 border-primary pl-4 text-sm leading-7 text-foreground/90">
                {report.summary || "점검 내용을 정리하고 있습니다."}
              </p>
            </section>

            <section className="rounded-2xl border bg-background p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">체크리스트</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    미팅에서 작성한 항목을 상태별로 구분했습니다.
                  </p>
                </div>
                <p
                  className="text-sm font-semibold"
                  aria-label={`전체 ${items.length}개 중 ${checkedCount}개 확인`}
                >
                  <span className="text-primary">{checkedCount}개 확인</span>
                  <span className="mx-1.5 text-muted-foreground">/</span>
                  전체 {items.length}개
                </p>
              </div>

              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {items.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed px-4 py-10 text-center">
                  <ClipboardCheck className="mx-auto size-6 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">
                    작성된 체크리스트가 없습니다.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    미팅에서 작성한 점검 항목이 이곳에 표시됩니다.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {CHECKLIST_ORDER.map((status) => (
                    <ChecklistGroup
                      key={status}
                      status={status}
                      items={items.filter((item) => item.status === status)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-background p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Camera className="size-5 text-primary" /> 현장 사진
                </h2>
                <span className="text-sm text-muted-foreground">
                  {report.captures.length}장
                </span>
              </div>
              {report.captures.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  저장된 현장 사진이 없습니다.
                </div>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {report.captures.map((capture) => (
                    <figure
                      key={capture.captureId}
                      className="overflow-hidden rounded-xl border bg-muted/20"
                    >
                      <img
                        src={capture.imageUrl}
                        alt={`${formatDateTime(capture.capturedAt)} 현장 캡처`}
                        className="aspect-video w-full bg-slate-900 object-contain"
                      />
                      <figcaption className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(capture.capturedAt)}
                        </p>
                        {capture.defects.length === 0 ? (
                          <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="size-4" /> 발견된 이상 없음
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {capture.defects.map((defect) => (
                              <p
                                key={defect.defectId}
                                className="flex gap-2 text-sm text-amber-700 dark:text-amber-300"
                              >
                                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                                <span>
                                  <strong className="font-semibold">
                                    확인 필요
                                  </strong>{" "}
                                  · {defect.description}
                                </span>
                              </p>
                            ))}
                          </div>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="rounded-2xl border bg-background p-5 shadow-sm lg:sticky lg:top-20">
            <h2 className="text-sm font-semibold">체크리스트 상태</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              색상뿐 아니라 아이콘과 상태명으로 구분합니다.
            </p>
            <dl className="mt-4 space-y-4">
              {(
                ["COMPLETED", "ISSUE_FOUND", "PENDING"] as ChecklistItemStatus[]
              ).map((status) => {
                const style = CHECKLIST_STATUS[status];
                const StatusIcon = style.icon;
                return (
                  <div
                    key={status}
                    className="flex items-center justify-between gap-3"
                  >
                    <dt className="flex items-center gap-2 text-sm">
                      <StatusIcon className={`size-4 ${style.iconClassName}`} />{" "}
                      {style.label}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {statusCounts[status]}개
                    </dd>
                  </div>
                );
              })}
            </dl>
            <div className="mt-5 border-t pt-4">
              <div className="flex items-end justify-between">
                <p className="text-xs text-muted-foreground">전체 진행률</p>
                <p className="text-xl font-semibold tabular-nums">
                  {progress}%
                </p>
              </div>
              {statusCounts.PENDING > 0 && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  아직 확인하지 않은 항목이 {statusCounts.PENDING}개 있습니다.
                </p>
              )}
            </div>
          </aside>
        </div>
      </article>
    </main>
  );
}

export default ReportDetailPage;
