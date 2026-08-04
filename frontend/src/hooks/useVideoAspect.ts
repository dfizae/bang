import { type RefObject, useEffect, useState } from "react";

// 스트림의 실제 가로세로비를 추적한다.
// 타일 높이를 고정하면 비율이 창 크기의 함수가 되어 검은 여백이 들쭉날쭉해지므로,
// 타일이 스트림 비율을 그대로 따라가게 하려고 쓴다.
export function useVideoAspect(ref: RefObject<HTMLVideoElement | null>) {
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) {
      return;
    }

    const update = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setAspect(video.videoWidth / video.videoHeight);
      }
    };

    update();
    // resize — 상대가 카메라를 전환하거나 해상도가 바뀔 때도 따라간다
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);

    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
    };
  }, [ref]);

  return aspect;
}
