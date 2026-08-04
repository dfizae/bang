import { useEffect, useState } from "react";

// 검색어처럼 타이핑마다 바뀌는 값을 delay 동안 잠잠해진 뒤에만 반영한다.
// 쿼리 키에 바로 넣으면 글자마다 요청이 나가므로 서버 조회 전에 한 번 걸러 준다
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
