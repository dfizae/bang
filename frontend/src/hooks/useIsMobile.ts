import { useMediaQuery } from "@/hooks/useMediaQuery";

const MOBILE_QUERY = "(max-width: 639px)"; // Tailwind sm(640px) 미만

// 모바일 전용 UI 분기를 위한 뷰포트 구독
export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY);
}
