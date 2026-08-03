import { useEffect, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, Circle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePropertyReports } from "@/hooks/queries/reportQueries";
import { formatDateTime } from "@/lib/format";
import type { PropertyReportCapture } from "@/lib/reportStorage";
import type { User } from "@/types";

function CaptureImage({ capture }: { capture: PropertyReportCapture }) {
  const [source, setSource] = useState("");

  useEffect(() => {
    if (capture.imageUrl) {
      setSource(capture.imageUrl);
      return;
    }
    if (!capture.image) {
      return;
    }
    const objectUrl = URL.createObjectURL(capture.image);
    setSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [capture.image, capture.imageUrl]);

  return source ? (
    <img
      src={source}
      alt={`${formatDateTime(capture.createdAt)} 캡처`}
      className="aspect-video w-full rounded-lg bg-slate-900 object-contain"
    />
  ) : (
    <Skeleton className="aspect-video w-full" />
  );
}

function ReportDetailPage({ user }: { user: User }) {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const {
    data: reports,
    isPending,
    isError,
    refetch,
  } = usePropertyReports(user.id);
  const report = reports?.find((item) => item.reportId === reportId);

  if (isPending) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <Skeleton className="h-72 w-full" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col items-start gap-4 px-4 py-12">
        <p>리포트를 불러오지 못했어요.</p>
        <Button variant="outline" onClick={() => refetch()}>
          다시 시도
        </Button>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col items-start gap-4 px-4 py-12">
        <p>존재하지 않거나 접근할 수 없는 리포트입니다.</p>
        <Button
          variant="outline"
          onClick={() => navigate("/mypage?section=reports")}
        >
          마이페이지로 돌아가기
        </Button>
      </main>
    );
  }

  const completed = report.checklistItems.filter(
    (item) => item.status === "COMPLETED",
  ).length;

  return (
    <main className="min-h-[calc(100svh-3.5rem)] px-4 py-10">
      <article className="mx-auto max-w-4xl">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate("/mypage?section=reports")}
        >
          <ArrowLeft /> 리포트 목록
        </Button>
        <header className="border-b pb-6">
          <p className="text-sm font-medium text-primary">매물 점검 리포트</p>
          <h1 className="mt-2 text-2xl font-semibold">
            {report.propertyTitle}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.propertyAddress} · {formatDateTime(report.createdAt)}
          </p>
        </header>
        <section className="grid gap-4 border-b py-6 sm:grid-cols-2">
          <div className="rounded-xl bg-muted p-4">
            <p className="text-sm text-muted-foreground">체크리스트 완료</p>
            <p className="mt-1 text-2xl font-semibold">
              {completed}/{report.checklistItems.length}
            </p>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <p className="text-sm text-muted-foreground">저장된 캡처</p>
            <p className="mt-1 text-2xl font-semibold">
              {report.captures.length}장
            </p>
          </div>
        </section>
        <section className="border-b py-6">
          <h2 className="mb-3 text-lg font-semibold">총평가</h2>
          <div className="rounded-xl border bg-primary/5 p-4">
            <p className="text-2xl font-semibold text-primary">
              {report.evaluation?.score ?? 0}점
            </p>
            <p className="mt-2 text-sm leading-6">
              {report.evaluation?.summary ??
                "이전 리포트에는 총평가 정보가 없습니다."}
            </p>
          </div>
        </section>
        <section className="border-b py-6">
          <h2 className="mb-4 text-lg font-semibold">점검 항목</h2>
          {report.checklistItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              등록된 체크리스트가 없습니다.
            </p>
          ) : (
            <ul className="space-y-3">
              {report.checklistItems.map((item) => (
                <li
                  key={item.itemId}
                  className="flex gap-3 rounded-xl border p-4"
                >
                  {item.status === "COMPLETED" ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{item.content}</p>
                    {item.memo && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.memo}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="py-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Camera className="size-5" /> 현장 캡처
          </h2>
          {report.captures.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              저장된 캡처가 없습니다.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {report.captures.map((capture) => (
                <CaptureImage key={capture.id} capture={capture} />
              ))}
            </div>
          )}
        </section>
      </article>
    </main>
  );
}

export default ReportDetailPage;
