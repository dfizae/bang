import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { isApiError } from "@/api/error";
import { Button } from "@/components/ui/button";
import { takeReturnTo } from "@/lib/oauth";
import { useAuthStore } from "@/stores/authStore";

// AUTH-01 소셜 로그인 콜백 — provider가 되돌려준 인가 코드를 백엔드로 넘겨 세션을 확정한다.
function OAuthCallbackPage() {
  const { provider } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const completeSocialLogin = useAuthStore(
    (state) => state.completeSocialLogin,
  );
  const [error, setError] = useState<string | null>(null);
  // OAuth 인가 코드는 1회용 — StrictMode 이중 실행으로 두 번 교환되지 않게 막는다
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const code = params.get("code");
    const isValidProvider = provider === "kakao" || provider === "google";

    if (!isValidProvider || !code) {
      setError("로그인 정보를 받지 못했어요. 다시 시도해주세요.");
      return;
    }

    completeSocialLogin(provider, code)
      .then(() => navigate(takeReturnTo(), { replace: true }))
      .catch((e) =>
        setError(
          isApiError(e) ? e.message : "로그인에 실패했어요. 다시 시도해주세요.",
        ),
      );
  }, [completeSocialLogin, navigate, params, provider]);

  return (
    <main className="grid min-h-[calc(100svh-3.5rem)] place-items-center bg-muted/40 px-4">
      {error ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button onClick={() => navigate("/login", { replace: true })}>
            로그인으로 돌아가기
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          <p className="text-sm">로그인 중이에요...</p>
        </div>
      )}
    </main>
  );
}

export default OAuthCallbackPage;
