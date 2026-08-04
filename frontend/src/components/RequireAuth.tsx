import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/stores/authStore";
import type { User } from "@/types";

// 로그인 전용 라우트 가드 — 저장된 토큰으로 세션을 복원(GET /users/me)하는 동안
// 로그아웃으로 단정하면 새로고침할 때마다 로그인 화면으로 튕기므로, 복원 결과가
// 나올 때까지 기다린 뒤에만 리다이렉트한다
function RequireAuth({ children }: { children: (user: User) => ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const isSessionRestored = useAuthStore((state) => state.isSessionRestored);
  const location = useLocation();

  if (!isSessionRestored) {
    return (
      <main className="grid min-h-[calc(100svh-3.5rem)] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">로그인 정보를 확인하는 중</span>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children(user)}</>;
}

export default RequireAuth;
