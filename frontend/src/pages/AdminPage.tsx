import { useActionState, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { isApiError } from "@/api/error";
import AgentVerificationStatusBadge, {
  AGENT_VERIFICATION_STATUS_LABEL,
} from "@/components/AgentVerificationStatusBadge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminAgentVerificationDetail,
  useAdminAgentVerifications,
  useReviewAgentVerification,
} from "@/hooks/queries/agentVerificationQueries";
import { downloadFileFromUrl } from "@/lib/file";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AgentVerification,
  AgentVerificationDecision,
  AgentVerificationDetail,
  AgentVerificationStatus,
  VerificationDocument,
} from "@/types";

const STATUS_TABS: AgentVerificationStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
];

const TAB_LABEL: Record<AgentVerificationStatus, string> = {
  PENDING: "심사 대기",
  APPROVED: "승인 완료",
  REJECTED: "반려",
};

const EMPTY_MESSAGE: Record<AgentVerificationStatus, string> = {
  PENDING: "새 신청이 접수되면 이곳에 표시됩니다.",
  APPROVED: "승인한 신청이 이곳에 쌓입니다.",
  REJECTED: "반려한 신청이 이곳에 쌓입니다.",
};

const PAGE_SIZE = 20;

function isVerificationStatus(
  value: string | null,
): value is AgentVerificationStatus {
  return STATUS_TABS.some((status) => status === value);
}

function isDocumentExpired(document: VerificationDocument) {
  return document.urlExpiresAt
    ? new Date(document.urlExpiresAt).getTime() <= Date.now()
    : false;
}

// 서버가 등록번호로 외부 조회한 영업상태 — "영업"이 아닌 값은 심사자가 한 번 더 봐야 한다
function isActiveBusiness(businessStatus?: string) {
  return Boolean(businessStatus?.includes("영업"));
}

// 심사 판단의 근거 — 신청자가 적은 값이 아니라 서버가 외부에서 조회해 온 결과다
function ExternalCheckBlock({
  verification,
}: {
  verification: AgentVerificationDetail;
}) {
  const hasCheck = Boolean(verification.externalCheckedAt);
  const active = isActiveBusiness(verification.businessStatus);

  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">국가 조회 결과</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-semibold tracking-wide">
          {verification.licenseNumber || "등록번호 없음"}
        </p>
        {verification.businessStatus && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1 font-medium",
              active
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700",
            )}
          >
            {active ? <CheckCircle2 /> : <AlertTriangle />}
            {verification.businessStatus}
          </Badge>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {hasCheck
          ? `${formatDateTime(verification.externalCheckedAt)} 확인`
          : "외부 조회 기록이 없습니다. 제출 서류로 직접 확인해 주세요."}
      </p>
    </div>
  );
}

function InfoTable({
  verification,
}: {
  verification: AgentVerificationDetail;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "대표자", value: verification.brokerName || "—" },
    { label: "상호", value: verification.officeName || "—" },
    { label: "사무소 주소", value: verification.officeAddress || "—" },
    { label: "사무소 전화", value: verification.officePhone || "—" },
    { label: "신청자 ID", value: `#${verification.userId}` },
    { label: "신청일시", value: formatDateTime(verification.submittedAt) },
  ];

  if (verification.status !== "PENDING") {
    rows.push({
      label: "처리일시",
      value: formatDateTime(verification.reviewedAt),
    });
  }

  return (
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] overflow-hidden rounded-xl border text-sm">
      {rows.map(({ label, value }, index) => (
        <div key={label} className="contents">
          <dt
            className={cn(
              "border-r bg-slate-50 p-3 text-muted-foreground",
              index < rows.length - 1 && "border-b",
            )}
          >
            {label}
          </dt>
          <dd
            className={cn(
              "min-w-0 p-3 break-words",
              index < rows.length - 1 && "border-b",
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// 서류 뷰어 — 이미지·PDF·기타 형식과 만료된 임시 URL까지 처리한다.
// fileUrl이 바뀌면 부모가 key로 다시 마운트해 로드 실패 상태를 초기화한다
function DocumentViewer({
  document,
  onReload,
  isReloading,
}: {
  document: VerificationDocument;
  onReload: () => void;
  isReloading: boolean;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const expired = isDocumentExpired(document) || loadFailed;
  const isImage = document.contentType.startsWith("image/");
  const isPdf = document.contentType === "application/pdf";

  const handleDownload = async () => {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      await downloadFileFromUrl(document.fileUrl, document.originalName);
    } catch {
      setDownloadError(
        "서류를 내려받지 못했습니다. 링크가 만료되었을 수 있으니 다시 불러온 뒤 시도해주세요.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const reloadButton = (
    <Button
      variant="outline"
      size="sm"
      disabled={isReloading}
      onClick={onReload}
    >
      <RefreshCw />
      {isReloading ? "불러오는 중..." : "다시 불러오기"}
    </Button>
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">증빙 서류</h3>
        <div className="flex items-center gap-2">
          {reloadButton}
          <Button
            variant="outline"
            size="sm"
            disabled={isDownloading || expired}
            onClick={handleDownload}
          >
            <Download />
            {isDownloading ? "내려받는 중..." : "다운로드"}
          </Button>
        </div>
      </div>

      <p className="mt-2 truncate text-xs text-muted-foreground">
        {document.originalName}
        {document.fileSize > 0 && ` · ${formatFileSize(document.fileSize)}`}
      </p>

      <div className="mt-3">
        {expired ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle className="size-4" />
              서류 링크가 만료되었습니다
            </p>
            <p className="mt-1 text-xs text-amber-800/80">
              다시 불러오면 새 링크로 서류를 열 수 있습니다.
            </p>
          </div>
        ) : isImage ? (
          <button
            type="button"
            className="block w-full cursor-pointer overflow-hidden rounded-xl border transition-opacity hover:opacity-90"
            onClick={() => setEnlarged(true)}
          >
            <img
              src={document.fileUrl}
              alt={`증빙 서류 미리보기 — ${document.originalName}`}
              className="max-h-96 w-full bg-slate-50 object-contain"
              onError={() => setLoadFailed(true)}
            />
          </button>
        ) : isPdf ? (
          <iframe
            src={document.fileUrl}
            title={`증빙 서류 — ${document.originalName}`}
            className="h-96 w-full rounded-xl border bg-slate-50"
          />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <FileText className="size-8 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {document.originalName}
              </p>
              <p className="text-xs text-muted-foreground">
                미리보기를 지원하지 않는 형식입니다. 내려받아 확인해 주세요.
              </p>
            </div>
          </div>
        )}
      </div>

      {!expired && (
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <a href={document.fileUrl} target="_blank" rel="noreferrer">
            새 탭에서 열기
            <ExternalLink />
          </a>
        </Button>
      )}
      {downloadError && (
        <p className="mt-2 text-xs text-destructive">{downloadError}</p>
      )}

      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>증빙 서류</DialogTitle>
            <DialogDescription>{document.originalName}</DialogDescription>
          </DialogHeader>
          <img
            src={document.fileUrl}
            alt={`증빙 서류 원본 — ${document.originalName}`}
            className="max-h-[70svh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

const DECISION_COPY: Record<
  AgentVerificationDecision,
  { title: string; description: string; confirm: string }
> = {
  APPROVED: {
    title: "이 신청을 승인할까요?",
    description:
      "승인하면 신청자 계정이 즉시 중개사로 전환되어 매물을 등록할 수 있게 됩니다. 승인은 되돌릴 수 없습니다.",
    confirm: "승인하기",
  },
  REJECTED: {
    title: "이 신청을 반려할까요?",
    description:
      "반려하면 신청자는 등록번호와 서류를 다시 제출해야 합니다. 반려는 되돌릴 수 없습니다.",
    confirm: "반려하기",
  },
};

function ReviewConfirmDialog({
  verification,
  decision,
  onClose,
}: {
  verification: AgentVerification;
  decision: AgentVerificationDecision | null;
  onClose: () => void;
}) {
  const { mutateAsync: review } = useReviewAgentVerification();

  const [error, confirmAction, isPending] = useActionState(async () => {
    if (!decision) {
      return null;
    }
    try {
      await review({
        verificationId: verification.verificationId,
        decision,
      });
      onClose();
      return null;
    } catch (reviewError) {
      return isApiError(reviewError)
        ? reviewError.message
        : "처리에 실패했습니다. 잠시 후 다시 시도해주세요";
    }
  }, null);

  const copy = decision ? DECISION_COPY[decision] : null;

  return (
    <Dialog
      open={decision !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3 text-xs">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-muted-foreground">등록번호</dt>
            <dd className="min-w-0 flex-1 break-words font-medium">
              {verification.licenseNumber}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-muted-foreground">사무소</dt>
            <dd className="min-w-0 flex-1 break-words">
              {verification.officeName || "—"}
            </dd>
          </div>
        </dl>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          <form action={confirmAction}>
            <Button
              type="submit"
              variant={decision === "REJECTED" ? "destructive" : "default"}
              disabled={isPending}
            >
              {isPending ? "처리 중..." : copy?.confirm}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ADMIN-02 신청 상세 — 외부 조회 결과·사무소 정보·서류를 확인하고 판정한다
function VerificationDetailPanel({
  verificationId,
}: {
  verificationId: number;
}) {
  const { data, isPending, isError, refetch, isFetching } =
    useAdminAgentVerificationDetail(verificationId);
  const [decision, setDecision] = useState<AgentVerificationDecision | null>(
    null,
  );

  if (isPending) {
    return (
      <Card className="gap-3 self-start py-4">
        <CardContent className="space-y-4 px-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="gap-3 self-start py-4">
        <CardContent className="flex flex-col items-start gap-3 px-4 py-8">
          <p className="text-sm text-muted-foreground">
            신청 상세를 불러오지 못했습니다.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-3 self-start py-4">
      <CardHeader className="flex-row items-start justify-between px-4">
        <div>
          <CardTitle className="text-base">신청 상세</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            조회 결과와 제출 서류가 일치하는지 확인하세요
          </p>
        </div>
        <AgentVerificationStatusBadge status={data.status} />
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <ExternalCheckBlock verification={data} />
        <InfoTable verification={data} />

        {data.document ? (
          <DocumentViewer
            key={data.document.fileUrl}
            document={data.document}
            onReload={() => refetch()}
            isReloading={isFetching}
          />
        ) : (
          <div className="rounded-xl border border-dashed p-4">
            <p className="text-sm font-medium">제출된 서류가 없습니다</p>
            <p className="mt-1 text-xs text-muted-foreground">
              서류 없이는 자격을 확인할 수 없습니다. 반려 후 재신청을 안내해
              주세요.
            </p>
          </div>
        )}

        {data.status === "PENDING" ? (
          <div className="border-t pt-4">
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => setDecision("APPROVED")}
              >
                <CheckCircle2 /> 승인
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setDecision("REJECTED")}
              >
                <XCircle /> 반려
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              승인하면 신청자 계정이 중개사로 전환됩니다.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-xl border p-4 text-sm",
              data.status === "APPROVED"
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-red-200 bg-red-50/60",
            )}
          >
            <p className="font-semibold">
              {formatDateTime(data.reviewedAt)}에{" "}
              {AGENT_VERIFICATION_STATUS_LABEL[data.status]} 처리된 신청입니다
            </p>
          </div>
        )}
      </CardContent>

      <ReviewConfirmDialog
        verification={data}
        decision={decision}
        onClose={() => setDecision(null)}
      />
    </Card>
  );
}

function AdminSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="gap-3 py-4">
        <CardContent className="space-y-2 px-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </CardContent>
      </Card>
      <Card className="gap-3 py-4">
        <CardContent className="space-y-4 px-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}

// PAGE-ADMIN 중개사 인증 심사 — 신청 목록(ADMIN-01), 상세 검토(ADMIN-02), 승인/반려(ADMIN-03)
function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const status = isVerificationStatus(statusParam) ? statusParam : "PENDING";
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isPending, isError, refetch } = useAdminAgentVerifications({
    status,
    page,
    size: PAGE_SIZE,
  });
  // 다른 탭을 보고 있어도 처리해야 할 건수는 항상 보이게 따로 센다
  const { data: pendingSummary } = useAdminAgentVerifications({
    status: "PENDING",
    page: 0,
    size: 1,
  });

  const applications = data?.content ?? [];
  const selected =
    applications.find(
      (application) => application.verificationId === selectedId,
    ) ?? applications[0];

  const moveTo = (next: {
    status?: AgentVerificationStatus;
    page?: number;
  }) => {
    setSelectedId(null);
    setSearchParams({
      status: next.status ?? status,
      page: String(next.page ?? 0),
    });
  };

  return (
    <main className="min-h-[calc(100svh-3.5rem)] bg-white">
      <section className="border-b bg-slate-50/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold">중개사 인증 심사</h1>
            <p className="text-xs text-muted-foreground">
              등록번호 조회 결과와 증빙 서류를 확인하고 승인 여부를 결정하세요
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            <ShieldCheck /> 심사 대기 {pendingSummary?.totalElements ?? 0}건
          </Badge>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-4">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-current={status === tab ? "page" : undefined}
              className={cn(
                "cursor-pointer rounded-lg px-5 py-2 text-sm transition-colors",
                status === tab
                  ? "bg-white font-semibold text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => moveTo({ status: tab, page: 0 })}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {isPending ? (
          <AdminSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <p className="text-sm text-muted-foreground">
              신청 목록을 불러오지 못했습니다.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              다시 시도
            </Button>
          </div>
        ) : !selected ? (
          <div className="py-20 text-center">
            <FileSearch className="mx-auto size-10 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">
              {TAB_LABEL[status]} 상태의 신청이 없습니다
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {EMPTY_MESSAGE[status]}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="gap-3 self-start py-4">
              <CardHeader className="flex-row items-center justify-between px-4">
                <CardTitle className="text-base">신청 목록</CardTitle>
                <Badge variant="secondary">{data.totalElements}건</Badge>
              </CardHeader>
              <CardContent className="space-y-2 px-4">
                {applications.map((application) => (
                  <button
                    key={application.verificationId}
                    type="button"
                    aria-current={
                      application.verificationId === selected.verificationId
                    }
                    className={cn(
                      "w-full cursor-pointer rounded-xl border p-3 text-left transition-colors",
                      application.verificationId === selected.verificationId
                        ? "border-primary bg-primary/[0.04]"
                        : "bg-slate-50 hover:bg-slate-100",
                    )}
                    onClick={() => setSelectedId(application.verificationId)}
                  >
                    <p className="truncate text-sm font-semibold tracking-wide">
                      {application.licenseNumber || "등록번호 없음"}
                    </p>
                    <p className="mt-1 truncate text-xs">
                      {application.officeName || "상호 미확인"}
                      {application.brokerName && ` · ${application.brokerName}`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(application.submittedAt)} 신청
                    </p>
                  </button>
                ))}
              </CardContent>
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 border-t px-4 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.first}
                    onClick={() => moveTo({ page: page - 1 })}
                  >
                    <ChevronLeft />
                    이전
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {data.number + 1} / {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.last}
                    onClick={() => moveTo({ page: page + 1 })}
                  >
                    다음
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </Card>

            <VerificationDetailPanel
              key={selected.verificationId}
              verificationId={selected.verificationId}
            />
          </div>
        )}
      </div>
    </main>
  );
}

export default AdminPage;
