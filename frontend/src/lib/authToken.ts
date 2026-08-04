// accessToken 보관소 — localStorage 단일 소스. client.ts 요청 인터셉터와
// authStore가 이 헬퍼로만 토큰을 읽고/쓰고/지운다. (refreshToken은 로그인 응답에
// 없으므로 accessToken 만료 시 재로그인)
const ACCESS_TOKEN_KEY = "accessToken";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}
