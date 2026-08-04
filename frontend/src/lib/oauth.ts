import type { AuthProvider } from "@/types";

// 소셜 로그인 인가 코드 흐름의 클라이언트 절반.
// 로그인 버튼 → provider 인가 페이지로 redirect → provider가 아래 콜백 경로로
// ?code= 를 붙여 되돌려줌 → 콜백 페이지가 code를 백엔드(/api/auth/{provider})로 전달.
//
// 여기서 쓰는 redirect_uri는 반드시 카카오/구글 콘솔에 "그대로" 등록돼 있어야 하고,
// 백엔드가 인가 코드를 교환할 때 쓰는 redirect_uri와도 일치해야 한다.
export const OAUTH_CALLBACK_PATH = "/oauth/callback";

// 로그인 성공 후 되돌아갈 경로 — redirect로 라우터 state가 날아가므로 세션에 보관
const RETURN_TO_KEY = "oauth_return_to";

function redirectUri(provider: AuthProvider): string {
  return `${window.location.origin}${OAUTH_CALLBACK_PATH}/${provider}`;
}

export function saveReturnTo(path: string): void {
  sessionStorage.setItem(RETURN_TO_KEY, path);
}

export function takeReturnTo(): string {
  const path = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  return path ?? "/";
}

// 카카오: client_id는 REST API 키(콘솔 등록값). 프로젝트 .env의 VITE_KAKAO_CLIENT_ID 사용
function buildKakaoAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_KAKAO_CLIENT_ID,
    redirect_uri: redirectUri("kakao"),
    response_type: "code",
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

function buildGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri("google"),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function redirectToSocialLogin(provider: AuthProvider): void {
  window.location.assign(
    provider === "kakao" ? buildKakaoAuthUrl() : buildGoogleAuthUrl(),
  );
}
