import { useState } from "react";

import { cn } from "@/lib/utils";
import type { User } from "@/types";

const DEFAULT_PROFILE_IMAGE = "/default-profile.webp";

// 프로필 이미지 — 이미지를 올리지 않은 계정과 URL이 깨진 경우 모두 기본 프로필로 떨어뜨린다.
// imageUrl을 직접 넘기면 저장 전 미리보기(blob URL)도 같은 모양으로 보여줄 수 있다.
function ProfileAvatar({
  user,
  imageUrl = user.profileImageUrl,
  className,
}: {
  user: User;
  imageUrl?: string;
  className?: string;
}) {
  // 실패한 URL 자체를 기억해두면, 이미지를 새로 고른 순간 자동으로 다시 시도하게 된다
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src =
    imageUrl && imageUrl !== failedUrl ? imageUrl : DEFAULT_PROFILE_IMAGE;

  return (
    <img
      src={src}
      alt="프로필 이미지"
      className={cn("size-20 shrink-0 rounded-full object-cover", className)}
      onError={() => imageUrl && setFailedUrl(imageUrl)}
    />
  );
}

export default ProfileAvatar;
