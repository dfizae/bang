import { useCallback, useSyncExternalStore } from "react";

// 뷰포트에 따라 렌더 결과 자체가 달라져야 할 때 사용한다.
// 보여주고 숨기기만 하면 되는 경우에는 Tailwind 반응형 유틸리티가 우선이다
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
