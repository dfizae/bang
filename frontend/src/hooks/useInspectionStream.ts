import { type RefObject, useEffect, useRef, useState } from "react";

import { createInspectionSession, inspectFrame } from "@/api/inspection";

const FRAME_INTERVAL_MS = 1_000;
// AI 서버 권장 입력 크기 — 긴 변 960px (클수록 탐지 정확도가 좋다)
const TARGET_LONG_EDGE = 960;
const JPEG_QUALITY = 0.85;

// RTC-06 AI 하자 검수 — 영상 프레임을 1초 간격으로 AI 탐지 서버에 흘려보낸다.
// 서버가 후보로 채택(saved)한 프레임의 원본 blob을 candidate_id로 보관해 두어,
// 추후 백엔드 세션 캡처 저장(POST /api/sessions/{id}/captures)에 그대로 쓸 수 있다.
// 이전 요청이 끝나기 전에는 다음 프레임을 건너뛰어 전송이 밀리지 않게 한다.
// 프레임 요청은 AI 세션 생성이 끝난 뒤에만 나가므로, 백엔드 세션 id가
// 정해지기 전에는 스트림을 시작하지 않는다.
// 검수 완료(/complete)는 세션 종료(PATCH /end) 때 백엔드가 호출한다 — 프론트가
// 먼저 닫으면 백엔드의 완료 요청이 실패하므로 여기서는 절대 부르지 않는다
export function useInspectionStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  backendSessionId: number | undefined,
  enabled: boolean,
) {
  const [candidateCount, setCandidateCount] = useState(0);
  const candidateBlobsRef = useRef(new Map<string, Blob>());

  useEffect(() => {
    if (!enabled || backendSessionId === undefined) {
      return;
    }

    let disposed = false;
    let inFlight = false;
    let frameSequence = 0;
    let sessionId: string | null = null;
    let intervalId = 0;
    const candidateBlobs = candidateBlobsRef.current;

    const captureFrame = async (): Promise<Blob | null> => {
      const video = videoRef.current;
      if (!video?.videoWidth || !video.videoHeight) {
        return null;
      }

      const scale = Math.min(
        1,
        TARGET_LONG_EDGE / Math.max(video.videoWidth, video.videoHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      return new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
      });
    };

    const sendFrame = async () => {
      if (inFlight || !sessionId) {
        return;
      }
      const blob = await captureFrame();
      if (!blob || disposed) {
        return;
      }

      inFlight = true;
      frameSequence += 1;
      try {
        const result = await inspectFrame(
          sessionId,
          blob,
          frameSequence,
          new Date().toISOString(),
        );
        if (!disposed && result.saved && result.candidate_id) {
          candidateBlobs.set(result.candidate_id, blob);
          setCandidateCount(candidateBlobs.size);
        }
      } catch {
        // 일시적 전송 실패는 다음 프레임에서 자연스럽게 재시도된다
      } finally {
        inFlight = false;
      }
    };

    void createInspectionSession(backendSessionId)
      .then((session) => {
        // 생성 응답이 정리 이후에 도착하면 프레임을 보내지 않는다 —
        // 안 쓰인 세션은 백엔드 종료(end) 또는 expires_at 만료가 정리한다
        if (disposed) {
          return;
        }
        sessionId = session.session_id;
        intervalId = window.setInterval(
          () => void sendFrame(),
          FRAME_INTERVAL_MS,
        );
      })
      .catch(() => {
        // AI 서버가 내려가 있어도 라이브 통화 자체는 계속돼야 한다
      });

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      candidateBlobs.clear();
      setCandidateCount(0);
    };
  }, [backendSessionId, enabled, videoRef]);

  return { candidateCount, candidateBlobsRef };
}
