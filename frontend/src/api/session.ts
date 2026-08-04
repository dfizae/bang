import { api } from "@/api/client";

// RTC 세션(Session) API — 생성은 멱등이라 이미 세션이 있는 회의면 기존 세션을 돌려준다.
// 입장 응답의 signalingUrl에는 시그널링 전용 토큰(roomToken·accessToken)이 쿼리로
// 붙어 있어, 프론트는 그 URL 그대로 WebSocket을 열면 된다.

const MEETINGS_PATH = "/api/meetings";
const SESSIONS_PATH = "/api/sessions";

export type SessionStatus = "CREATED" | "ACTIVE" | "ENDED";

export interface CreatedSession {
  sessionId: number;
  meetingId: number;
  roomToken: string;
  joinUrl: string;
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;
}

export interface JoinedSession {
  sessionId: number;
  meetingId: number;
  roomToken: string;
  signalingUrl: string;
  status: SessionStatus;
  startedAt: string;
  expiresAt: string;
}

export interface EndedSession {
  sessionId: number;
  meetingId: number;
  status: SessionStatus;
  startedAt: string;
  endedAt: string;
}

export interface LeavedSession {
  sessionId: number;
  status: SessionStatus;
  leftAt: string;
}

export interface StoredSessionCapture {
  captureId: number;
  imageUrl: string;
  capturedAt: string;
}

export function createSession(meetingId: number): Promise<CreatedSession> {
  return api.post<CreatedSession>({
    path: `${MEETINGS_PATH}/${meetingId}/session`,
  });
}

export function joinSession(sessionId: number): Promise<JoinedSession> {
  return api.post<JoinedSession>({
    path: `${SESSIONS_PATH}/${sessionId}/join`,
  });
}

export function endSession(sessionId: number): Promise<EndedSession> {
  return api.patch<EndedSession>({ path: `${SESSIONS_PATH}/${sessionId}/end` });
}

export function leaveSession(sessionId: number): Promise<LeavedSession> {
  return api.post<LeavedSession>({
    path: `${SESSIONS_PATH}/${sessionId}/leave`,
  });
}

export function uploadUserCapture(
  sessionId: number,
  image: Blob,
): Promise<StoredSessionCapture> {
  const form = new FormData();
  form.append("image", image, `capture-${Date.now()}.png`);
  return api.post<StoredSessionCapture>({
    path: `${SESSIONS_PATH}/${sessionId}/captures/user`,
    body: form,
  });
}
