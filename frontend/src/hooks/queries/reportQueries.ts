import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createReport,
  getMyReports,
  getReport,
  getReportStatus,
} from "@/api/report";

const REPORT_STATUS_INTERVAL_MS = 1_000;
const REPORT_STATUS_ATTEMPTS = 15;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function createReportAndWait(sessionId: number) {
  const created = await createReport(sessionId);
  for (let attempt = 0; attempt < REPORT_STATUS_ATTEMPTS; attempt += 1) {
    const current = await getReportStatus(created.reportId);
    if (current.status === "REJECTED") {
      throw new Error("AI 리포트 생성이 거절되었습니다.");
    }
    if (current.status === "CONFIRMED") {
      return current;
    }
    await wait(REPORT_STATUS_INTERVAL_MS);
  }
  return created;
}

export const reportKeys = {
  all: ["reports"] as const,
  lists: () => [...reportKeys.all, "list"] as const,
  mine: () => [...reportKeys.lists(), "me"] as const,
  details: () => [...reportKeys.all, "detail"] as const,
  detail: (reportId: number) => [...reportKeys.details(), reportId] as const,
};

export const myReportsOptions = () =>
  queryOptions({
    queryKey: reportKeys.mine(),
    queryFn: ({ signal }) => getMyReports(signal),
  });

export const reportDetailOptions = (reportId: number) =>
  queryOptions({
    queryKey: reportKeys.detail(reportId),
    queryFn: ({ signal }) => getReport(reportId, signal),
  });

export function usePropertyReports() {
  return useQuery(myReportsOptions());
}

export function useReportDetail(reportId: number | undefined) {
  return useQuery({
    ...reportDetailOptions(reportId ?? -1),
    enabled: reportId !== undefined,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => createReportAndWait(sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reportKeys.lists() }),
  });
}
