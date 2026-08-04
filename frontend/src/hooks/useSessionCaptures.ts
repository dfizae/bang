import { type RefObject, useEffect, useRef, useState } from "react";

export interface SessionCapture {
  id: string;
  url: string;
  createdAt: string;
}

// RTC-05 화면 캡처 — 영상 프레임을 캔버스로 옮겨 blob으로 남긴다.
// 저장 위치가 정해지기 전까지 세션 동안만 objectURL로 들고 있고, 떠날 때 함께 해제한다
export function useSessionCaptures(
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const [captures, setCaptures] = useState<SessionCapture[]>([]);
  const capturesRef = useRef(captures);

  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);

  useEffect(
    () => () => {
      capturesRef.current.forEach(({ url }) => URL.revokeObjectURL(url));
    },
    [],
  );

  // 영상이 아직 프레임을 그리기 전이면 빈 이미지가 남으므로 캡처하지 않는다
  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      return false;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (!blob) {
      return false;
    }

    setCaptures((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        url: URL.createObjectURL(blob),
        createdAt: new Date().toISOString(),
      },
    ]);
    return true;
  };

  const removeCapture = (captureId: string) => {
    const target = capturesRef.current.find(({ id }) => id === captureId);
    if (target) {
      URL.revokeObjectURL(target.url);
    }
    setCaptures((current) => current.filter(({ id }) => id !== captureId));
  };

  return { captures, capture, removeCapture };
}
