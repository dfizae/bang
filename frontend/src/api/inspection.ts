import axios from "axios";

// AI 하자 탐지 서버(FastAPI) 연동 — 메인 백엔드와 별개 서버라 공통 envelope가 없고
// 응답 필드도 서버 스키마(snake_case) 그대로 다룬다. client.ts를 거치지 않는 유일한 예외.
const aiClient = axios.create({
  baseURL: import.meta.env.VITE_AI_BASE_URL,
  timeout: 15_000,
  // ngrok 도메인으로 되돌릴 때의 브라우저 경고 인터스티셜 우회 (RunPod에는 무해)
  headers: { "ngrok-skip-browser-warning": "true" },
});

export interface InspectionSession {
  session_id: string;
  expires_at: string;
}

// bbox는 YOLO 형식 [x_center, y_center, width, height] — 네 값 모두 0~1 정규화
export interface FrameDetection {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface FrameResult {
  detected: boolean;
  frame_sequence: number;
  detections?: FrameDetection[];
  saved: boolean;
  replaced: boolean;
  duplicate_suppressed: boolean;
  candidate_id?: string | null;
  inference_ms: number;
  annotated_image?: string | null;
}

export interface InspectionFinding {
  finding_id: string;
  class_name: string;
  confidence: number;
  room_name: string | null;
  captured_at: string;
  image_url?: string | null;
  image_filename?: string | null;
  bbox: [number, number, number, number];
}

export interface InspectionResult {
  session_id: string;
  status: string;
  total_frames: number;
  detected_frames: number;
  selected_findings: number;
  findings: InspectionFinding[];
  // AI 서버가 백엔드에 결과를 직접 전달한 경우 그 응답 원문
  backend_response?: Record<string, unknown> | null;
}

export function createInspectionSession(): Promise<InspectionSession> {
  return aiClient
    .post<InspectionSession>("/v1/inspection-sessions")
    .then((response) => response.data);
}

export interface InspectFrameOptions {
  // 방 이름 태그 (최대 100자)
  roomName?: string;
  // true면 응답에 annotated_image(탐지 박스가 그려진 미리보기)가 포함된다
  includePreview?: boolean;
}

// 프레임은 JPEG·PNG·WebP만 허용되며 MIME 타입이 반드시 지정돼야 한다
export function inspectFrame(
  sessionId: string,
  image: Blob,
  frameSequence: number,
  capturedAt: string,
  options: InspectFrameOptions = {},
): Promise<FrameResult> {
  const form = new FormData();
  form.append("image", image, `frame-${frameSequence}.jpg`);
  form.append("frame_sequence", String(frameSequence));
  form.append("captured_at", capturedAt);
  if (options.roomName) {
    form.append("room_name", options.roomName);
  }
  if (options.includePreview) {
    form.append("include_preview", "true");
  }
  return aiClient
    .post<FrameResult>(`/v1/inspection-sessions/${sessionId}/frames`, form)
    .then((response) => response.data);
}

export function completeInspection(
  sessionId: string,
): Promise<InspectionResult> {
  return aiClient
    .post<InspectionResult>(`/v1/inspection-sessions/${sessionId}/complete`)
    .then((response) => response.data);
}
