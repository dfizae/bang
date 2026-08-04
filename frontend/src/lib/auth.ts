import type { User } from "@/types";

// PROP-07~09 매물 등록·수정·삭제 권한 — 인증까지 마친 중개사만 허용.
// 인증이 승인되어야 서버 role이 AGENT("중개사")가 되므로 role 검사만으로 충분하다.
// 수정·삭제는 여기에 더해 본인이 등록한 매물이어야 한다 (useIsMyProperty)
export function isApprovedBroker(user: User | null) {
  return user?.role === "중개사";
}
