import { useMutation } from "@tanstack/react-query";

import { getMyInfo, updateMyInfo, updateMyProfileImage } from "@/api/user";
import { useAuthStore } from "@/stores/authStore";
import type { User, UserProfileChanges } from "@/types";

export interface ProfileUpdateInput {
  changes: Partial<UserProfileChanges>;
  // 이미지를 새로 고르지 않았으면 생략 — 이미지 요청 자체를 보내지 않는다
  imageFile?: File;
}

// USER-02 내 정보 수정 — 텍스트 정보(PATCH /api/users/me)와 프로필 이미지
// (PATCH /api/users/me/profile-image)는 엔드포인트가 나뉘어 있어, 저장 한 번에 두 요청을 동시에 보낸다.
// 로그인 사용자 정보는 쿼리 캐시가 아니라 authStore가 소유하므로 성공 시 스토어를 갱신한다.
export function useUpdateProfile() {
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: async ({
      changes,
      imageFile,
    }: ProfileUpdateInput): Promise<User> => {
      const hasTextChanges = Object.keys(changes).length > 0;
      const [user, profileImageUrl] = await Promise.all([
        hasTextChanges ? updateMyInfo(changes) : getMyInfo(),
        imageFile ? updateMyProfileImage(imageFile) : undefined,
      ]);
      return profileImageUrl ? { ...user, profileImageUrl } : user;
    },
    onSuccess: setUser,
    // 두 요청 중 한쪽만 성공했을 수 있어, 화면이 실제 저장된 값과 어긋나지 않게 서버 상태로 다시 맞춘다.
    // 이 조회까지 실패하면 폼에 이미 표시된 에러 메시지로 충분하므로 세션은 그대로 둔다.
    onError: async () => {
      try {
        setUser(await getMyInfo());
      } catch {
        return;
      }
    },
  });
}
