import { api } from "@/api/client";
import type { Checklist, Page } from "@/types";

const REPORTS_PATH = "/api/reports";

export type ReportStatus = "DETECTED" | "CONFIRMED" | "REJECTED";

export interface ReportStatusResponse {
  reportId: number;
  status: ReportStatus;
}

export interface ReportSummary {
  reportId: number;
  status: ReportStatus;
  propertyId: number;
  propertyTitle: string;
  thumbnailUrl?: string;
  meetingDate: string;
  createdAt: string;
}

export interface ReportDefect {
  defectId: number;
  type: "MOLD" | "WALLPAPER_DAMAGE";
  confidence: number;
  description: string;
  status: ReportStatus;
}

export interface ReportCapture {
  captureId: number;
  imageUrl: string;
  capturedAt: string;
  defects: ReportDefect[];
}

export interface ReportDetail {
  reportId: number;
  status: ReportStatus;
  propertyId: number;
  summary: string;
  createdAt: string;
  checklist: Checklist;
  captures: ReportCapture[];
}

export function createReport(sessionId: number) {
  return api.post<ReportStatusResponse>({
    path: `/api/sessions/${sessionId}/reports`,
  });
}

export function getMyReports(signal?: AbortSignal) {
  return api.get<Page<ReportSummary>>({
    path: `${REPORTS_PATH}/me`,
    config: { params: { page: 0, size: 100, sort: "createdAt,DESC" }, signal },
  });
}

export function getReport(reportId: number, signal?: AbortSignal) {
  return api.get<ReportDetail>({
    path: `${REPORTS_PATH}/${reportId}`,
    config: { signal },
  });
}

export function getReportStatus(reportId: number) {
  return api.get<ReportStatusResponse>({
    path: `${REPORTS_PATH}/${reportId}/status`,
  });
}
