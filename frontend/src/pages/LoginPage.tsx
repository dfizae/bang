import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MOCK_BROKER_ACCOUNTS, MOCK_TENANT_ACCOUNT } from "@/api/auth";
import { redirectToSocialLogin, saveReturnTo } from "@/lib/oauth";
import { useAuthStore } from "@/stores/authStore";
import type { AuthProvider } from "@/types";

// 카카오 공식 심볼(말풍선) — 브랜드 가이드: 심볼·텍스트 검정(#000000 85%), 배경 #FEE500
function KakaoSymbol() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4.5 fill-[#000000]">
      <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.82 1.88 5.3 4.7 6.7l-.98 3.62c-.09.32.28.58.56.4l4.32-2.86c.46.05.93.08 1.4.08 5.52 0 10-3.53 10-7.94S17.52 3 12 3z" />
    </svg>
  );
}

// 구글 공식 G 로고 (4색)
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4.5">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

// PAGE-01 로그인 — 카카오·구글 소셜 로그인 (AUTH-01). 인가 코드 흐름은 /oauth/callback에서 마무리.
function LoginPage() {
  const loginAsMockBroker = useAuthStore((state) => state.loginAsMockBroker);
  const loginAsMockTenant = useAuthStore((state) => state.loginAsMockTenant);
  const loginAsMockAdmin = useAuthStore((state) => state.loginAsMockAdmin);
  const navigate = useNavigate();
  const location = useLocation();

  // GNB 로그인 버튼이 넘겨준 이전 경로. 없으면 "/"
  const from = location.state?.from ?? "/";

  // provider 인가 페이지로 이동. redirect로 라우터 state가 날아가므로 복귀 경로를 세션에 저장
  const startSocialLogin = (provider: AuthProvider) => {
    saveReturnTo(from);
    redirectToSocialLogin(provider);
  };

  const mockBrokerLogin = async (brokerId: number) => {
    await loginAsMockBroker(brokerId);
    navigate(from, { replace: true });
  };

  const mockAdminLogin = async () => {
    await loginAsMockAdmin();
    navigate("/admin", { replace: true });
  };

  const mockTenantLogin = async () => {
    await loginAsMockTenant();
    navigate(from, { replace: true });
  };

  return (
    <main className="grid min-h-[calc(100svh-3.5rem)] place-items-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm gap-6">
        <CardHeader className="text-center">
          <img
            src="/logo-symbol.png"
            alt="방방봐 로고"
            className="mx-auto h-14 w-auto rounded-lg bg-white"
          />
          <p className="text-2xl font-bold text-primary">방방봐</p>
          <p className="text-sm text-muted-foreground">간편하게 시작하세요</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full bg-[#FEE500] text-[#000000]/85 hover:bg-[#FEE500]/90"
            onClick={() => startSocialLogin("kakao")}
          >
            <KakaoSymbol />
            카카오로 시작하기
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full bg-white text-foreground"
            onClick={() => startSocialLogin("google")}
          >
            <GoogleLogo />
            Google로 시작하기
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            로그인 시{" "}
            <a href="#" className="underline underline-offset-2">
              서비스 이용약관
            </a>
            에 동의하게 됩니다
          </p>
          {import.meta.env.DEV && (
            <div className="mt-2 flex flex-col gap-2 border-t pt-4">
              <p className="text-center text-xs text-muted-foreground">
                개발용 중개사 테스트 계정 — 배포 빌드에는 노출되지 않아요
              </p>
              {MOCK_BROKER_ACCOUNTS.map((broker) => (
                <Button
                  key={broker.id}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => mockBrokerLogin(broker.id)}
                >
                  중개사 {broker.id} · {broker.nickname} ({broker.name})
                </Button>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={mockTenantLogin}
              >
                세입자 · {MOCK_TENANT_ACCOUNT.nickname} (
                {MOCK_TENANT_ACCOUNT.name})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={mockAdminLogin}
              >
                관리자 · 인증 심사 (방방봐 운영팀)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default LoginPage;
