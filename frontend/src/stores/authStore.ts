import { create } from "zustand";

import * as authApi from "@/api/auth";
import { isApiError } from "@/api/error";
import { deleteMyAccount, getMyInfo } from "@/api/user";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/authToken";
import type { AuthProvider, User } from "@/types";

interface AuthStore {
  user: User | null;
  // 저장된 토큰으로 세션 복원을 시도했는지. false인 동안은 "로그인 여부 미확정"이라
  // 라우트 가드·GNB가 로그아웃으로 단정하지 않고 판단을 보류한다
  isSessionRestored: boolean;
  restoreSession: () => Promise<void>;
  completeSocialLogin: (
    provider: AuthProvider,
    authorizationCode: string,
  ) => Promise<User>;
  loginAsMockBroker: (brokerId: number) => Promise<User>;
  loginAsMockTenant: () => Promise<User>;
  loginAsMockAdmin: () => Promise<User>;
  logout: () => Promise<void>;
  // 서버에서 갱신된 내 정보를 세션에 반영한다 (USER-02 수정 뮤테이션이 호출)
  setUser: (user: User) => void;
  // 서버에서 role이 바뀐 뒤(중개사 인증 승인) 세션을 최신 상태로 다시 맞춘다
  refreshUser: () => Promise<User>;
  withdraw: () => Promise<void>;
}

// StrictMode 이중 실행·여러 컴포넌트 동시 호출에서 /users/me가 중복 요청되지 않게 하는 single-flight
let restorePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isSessionRestored: false,
  // 앱 로드 시 저장된 토큰으로 로그인 상태 복원. 토큰이 없거나 만료면 로그아웃 상태 유지
  restoreSession: () => {
    if (get().isSessionRestored) {
      return Promise.resolve();
    }
    if (restorePromise) {
      return restorePromise;
    }

    restorePromise = (async () => {
      try {
        if (!getAccessToken()) {
          return;
        }
        const user = await getMyInfo();
        set({ user });
      } catch (error) {
        // 토큰이 무효한 401만 재로그인 대상 (client.ts가 이미 토큰을 비운 상태).
        // 네트워크·서버 오류라면 토큰을 남겨 다음 진입에서 복원을 다시 시도한다
        if (isApiError(error) && error.status === 401) {
          clearAccessToken();
        }
        set({ user: null });
      } finally {
        set({ isSessionRestored: true });
        restorePromise = null;
      }
    })();

    return restorePromise;
  },
  // OAuth 콜백에서 받은 인가 코드 → accessToken 발급 → 내 정보 조회로 세션 확정
  completeSocialLogin: async (provider, authorizationCode) => {
    const login =
      provider === "kakao" ? authApi.kakaoLogin : authApi.googleLogin;
    const { accessToken } = await login(authorizationCode);
    setAccessToken(accessToken);
    try {
      const user = await getMyInfo();
      set({ user, isSessionRestored: true });
      return user;
    } catch (error) {
      clearAccessToken();
      throw error;
    }
  },
  loginAsMockBroker: async (brokerId) => {
    const user = await authApi.loginWithMockBroker(brokerId);
    set({ user, isSessionRestored: true });
    return user;
  },
  loginAsMockTenant: async () => {
    const user = await authApi.loginWithMockTenant();
    set({ user, isSessionRestored: true });
    return user;
  },
  loginAsMockAdmin: async () => {
    const user = await authApi.loginWithMockAdmin();
    set({ user });
    return user;
  },
  // 서버 로그아웃 실패해도 클라이언트는 항상 로그아웃 상태로 만든다
  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      clearAccessToken();
      set({ user: null });
    }
  },
  setUser: (user) => set({ user }),
  refreshUser: async () => {
    const user = await getMyInfo();
    set({ user });
    return user;
  },
  // 회원 탈퇴는 서버 성공 시에만 로컬 세션 정리 (실패 시 로그인 유지 + 에러 노출)
  withdraw: async () => {
    await deleteMyAccount();
    clearAccessToken();
    set({ user: null });
  },
}));
