import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  Heart,
  House,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ProfileAvatar from "@/components/ProfileAvatar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

interface NavItemConfig {
  label: string;
  to: string | null;
  authRequired?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { label: "매물 목록", to: "/properties" },
  { label: "관심 매물", to: "/saved", authRequired: true },
  { label: "예약 확인", to: "/reservations", authRequired: true },
];

function NavItem({
  item,
  onNavigate,
}: {
  item: NavItemConfig;
  onNavigate?: () => void;
}) {
  if (!item.to) {
    // 미구현 경로 — 비활성 톤
    return (
      <span
        aria-disabled="true"
        title="준비 중"
        className="cursor-not-allowed text-sm text-muted-foreground/50"
      >
        {item.label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "text-sm transition-colors hover:text-foreground",
          isActive ? "font-semibold text-foreground" : "text-muted-foreground",
        )
      }
    >
      {item.label}
    </NavLink>
  );
}

function AuthArea({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const isSessionRestored = useAuthStore((state) => state.isSessionRestored);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  // 세션 복원 전에는 로그인 버튼을 먼저 보여줬다가 아바타로 바뀌는 깜빡임이 생긴다
  if (!isSessionRestored) {
    return <Skeleton className="h-8 w-24" />;
  }

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onNavigate?.();
          navigate("/login", { state: { from: location.pathname } });
        }}
      >
        로그인
      </Button>
    );
  }

  return (
    <div className={cn("flex items-center", compact ? "gap-3" : "gap-2")}>
      <Link
        to="/mypage"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-muted"
        aria-label="마이페이지"
      >
        <ProfileAvatar user={user} className="size-8" />
        <span className="text-sm font-medium">
          {user.name || user.nickname || "내 계정"}
        </span>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onNavigate?.();
          logout();
        }}
      >
        <LogOut />
        로그아웃
      </Button>
    </div>
  );
}

// 공통 GNB — App 레이아웃 레벨에서 모든 페이지 상단에 표시 (h-14 고정)
function GlobalNav() {
  const user = useAuthStore((state) => state.user);
  const isSessionRestored = useAuthStore((state) => state.isSessionRestored);
  // ADMIN-01 인증 심사 메뉴는 관리자 계정에만 노출
  const navItems = NAV_ITEMS.filter((item) => user || !item.authRequired);
  if (user?.role === "관리자") {
    navItems.push({ label: "인증 심사", to: "/admin" });
  }
  const mobileTabs = [
    { label: "홈", to: "/", icon: House },
    ...navItems.map((item) => ({
      label: item.label.replace(" 목록", "").replace(" 매물", ""),
      to: item.to ?? "#",
      icon:
        item.to === "/properties"
          ? Building2
          : item.to === "/saved"
            ? Heart
            : item.to === "/reservations"
              ? CalendarDays
              : ShieldCheck,
    })),
    ...(user ? [{ label: "마이", to: "/mypage", icon: UserRound }] : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-bold text-primary"
          >
            <img
              src="/logo-symbol.png"
              alt=""
              className="h-7 w-auto rounded-md bg-white"
            />
            방방봐
          </Link>

          <div className="hidden items-center gap-6 sm:flex">
            {navItems.map((item) => (
              <NavItem key={item.label} item={item} />
            ))}
          </div>

          <div className="ml-auto hidden items-center gap-1 sm:flex">
            <AuthArea />
          </div>

          <div className="ml-auto sm:hidden">
            {!isSessionRestored ? (
              <Skeleton className="size-8 rounded-full" />
            ) : user ? (
              <Link to="/mypage" aria-label="마이페이지">
                <ProfileAvatar user={user} className="size-8" />
              </Link>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link to="/login">로그인</Link>
              </Button>
            )}
          </div>
        </nav>
      </header>

      <nav
        data-mobile-tabbar
        className="scrollbar-hidden fixed inset-x-0 bottom-0 z-50 flex h-16 overflow-x-auto border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden"
        aria-label="모바일 주요 메뉴"
      >
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={`${tab.to}-${tab.label}`}
              to={tab.to}
              end={tab.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-w-16 flex-1 flex-col items-center justify-center gap-1 px-2 text-xs font-medium",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <Icon className="size-5" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}

export default GlobalNav;
