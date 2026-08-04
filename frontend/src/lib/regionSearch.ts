import { ALL_SIGUNGUS, SIDO_TOKENS } from "@/data/regions";

// "서울시 강남구 역삼동"·"부산 해운대구" 같은 지역 계층 입력을 시군구 필터와 나머지 검색어로 분리한다.
// 시/도 표기는 백엔드 sigungu에 없는 단계라 버리고, 전국 시군구 이름과 정확히 일치하는
// 토큰만 sigungu로 승격한다 — 나머지(동 이름·매물명)는 그대로 검색어로 남긴다.

export interface ParsedRegionQuery {
  sigungu?: string;
  query?: string;
}

export function parseRegionQuery(raw: string): ParsedRegionQuery {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  let sigungu: string | undefined;
  const rest: string[] = [];

  for (const token of tokens) {
    if (SIDO_TOKENS.has(token)) {
      continue;
    }
    if (!sigungu && ALL_SIGUNGUS.has(token)) {
      sigungu = token;
      continue;
    }
    rest.push(token);
  }

  return { sigungu, query: rest.join(" ") || undefined };
}
