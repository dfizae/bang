import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  matchPath,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import GlobalNav from "@/components/GlobalNav";
import RequireAuth from "@/components/RequireAuth";
import AdminPage from "@/pages/AdminPage";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import MyPage from "@/pages/MyPage";
import OAuthCallbackPage from "@/pages/OAuthCallbackPage";
import PropertyDetailPage from "@/pages/PropertyDetailPage";
import PropertyFormPage from "@/pages/PropertyFormPage";
import PropertyListPage from "@/pages/PropertyListPage";
import ReservationLivePage from "@/pages/ReservationLivePage";
import ReservationPage from "@/pages/ReservationPage";
import BookingPage from "@/pages/BookingPage";
import SavedPropertiesPage from "@/pages/SavedPropertiesPage";
import {
  useDeleteProperty,
  useIsMyProperty,
} from "@/hooks/queries/propertyQueries";
import { isApprovedBroker } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import type { Memo } from "@/types";

// ADMIN 페이지 가드 — 세션 복원을 기다린 뒤(RequireAuth) 관리자가 아니면 랜딩으로 돌려보낸다.
// 직접 URL 진입은 복원 전 첫 렌더의 user가 null이라, 기다리지 않으면 관리자도 튕긴다
function AdminRoute() {
  return (
    <RequireAuth>
      {(user) =>
        user.role === "관리자" ? <AdminPage /> : <Navigate to="/" replace />
      }
    </RequireAuth>
  );
}

interface MemoActions {
  add: (propertyId: number, text: string) => void;
  update: (propertyId: number, memoId: number, text: string) => void;
  remove: (propertyId: number, memoId: number) => void;
}

interface DetailRouteProps {
  memos: Record<number, Memo[]>;
  onReserve: (id: number) => void;
  onDeleted: (id: number) => void;
  memoActions: MemoActions;
}

function DetailRoute({
  memos,
  onReserve,
  onDeleted,
  memoActions,
}: DetailRouteProps) {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const id = Number(idParam);
  const { isMyProperty } = useIsMyProperty(id);
  const { mutateAsync: deleteProperty } = useDeleteProperty();

  return (
    <PropertyDetailPage
      propertyId={id}
      canManage={isMyProperty}
      // 히스토리 뒤로가기로 지도 탭·찜 목록 등 이전 화면을 유지, 직접 진입 시엔 목록으로 폴백
      onBack={() =>
        location.key === "default" ? navigate("/properties") : navigate(-1)
      }
      onReserve={onReserve}
      onEdit={() => navigate(`/properties/${id}/edit`)}
      // 실패는 상세의 삭제 다이얼로그가 잡아 보여주므로, 성공했을 때만 목록으로 보낸다
      onDelete={async () => {
        await deleteProperty(id);
        onDeleted(id);
        navigate("/properties", { replace: true });
      }}
      memos={memos[id] ?? []}
      onAddMemo={(text) => memoActions.add(id, text)}
      onUpdateMemo={(memoId, text) => memoActions.update(id, memoId, text)}
      onDeleteMemo={(memoId) => memoActions.remove(id, memoId)}
    />
  );
}

function App() {
  const [memos, setMemos] = useState<Record<number, Memo[]>>({});
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const location = useLocation();
  // 라이브 세션 중에는 GNB 링크 한 번에 확인 없이 통화가 끊기므로 아예 노출하지 않는다.
  // 이 화면을 벗어나는 길은 확인 다이얼로그가 붙은 나가기 버튼 하나뿐이다
  const hideGlobalNav = matchPath("/reservation/:slug", location.pathname);

  // 저장된 accessToken이 있으면 내 정보 조회로 로그인 상태 복원
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // PROP-09 매물 삭제 후 정리 — 메모는 아직 화면 상태라 지워진 매물의 것을 같이 버린다
  const forgetPropertyMemos = (id: number) => {
    setMemos((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  // MEMO-01~03 메모 작성·수정·삭제
  const memoActions: MemoActions = {
    add: (propertyId, text) =>
      setMemos((prev) => ({
        ...prev,
        [propertyId]: [
          ...(prev[propertyId] ?? []),
          { id: Date.now(), text, createdAt: new Date().toISOString() },
        ],
      })),
    update: (propertyId, memoId, text) =>
      setMemos((prev) => ({
        ...prev,
        [propertyId]: prev[propertyId].map((m) =>
          m.id === memoId ? { ...m, text } : m,
        ),
      })),
    remove: (propertyId, memoId) =>
      setMemos((prev) => ({
        ...prev,
        [propertyId]: prev[propertyId].filter((m) => m.id !== memoId),
      })),
  };

  return (
    <>
      {!hideGlobalNav && <GlobalNav />}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/oauth/callback/:provider"
          element={<OAuthCallbackPage />}
        />
        <Route path="/admin" element={<AdminRoute />} />
        <Route
          path="/mypage"
          element={
            <RequireAuth>{(user) => <MyPage user={user} />}</RequireAuth>
          }
        />
        <Route
          path="/reservations"
          element={<RequireAuth>{() => <ReservationPage />}</RequireAuth>}
        />
        <Route
          path="/booking/:id"
          element={<RequireAuth>{() => <BookingPage />}</RequireAuth>}
        />
        <Route
          path="/saved"
          element={<RequireAuth>{() => <SavedPropertiesPage />}</RequireAuth>}
        />
        <Route
          path="/reservation/:slug"
          element={<RequireAuth>{() => <ReservationLivePage />}</RequireAuth>}
        />
        <Route
          path="/properties"
          element={
            <PropertyListPage
              canCreate={isApprovedBroker(user)}
              onOpen={(id) => navigate(`/properties/${id}`)}
              onCreate={() => navigate("/properties/new")}
            />
          }
        />
        <Route
          path="/properties/new"
          element={
            <RequireAuth>
              {(user) => <PropertyFormPage user={user} />}
            </RequireAuth>
          }
        />
        <Route
          path="/properties/:id/edit"
          element={
            <RequireAuth>
              {(user) => <PropertyFormPage user={user} />}
            </RequireAuth>
          }
        />
        <Route
          path="/properties/:id"
          element={
            <DetailRoute
              memos={memos}
              onReserve={(id) => navigate(`/booking/${id}`)}
              onDeleted={forgetPropertyMemos}
              memoActions={memoActions}
            />
          }
        />
      </Routes>
    </>
  );
}

export default App;
