import {
  useActionState,
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  FileText,
  ImageIcon,
  LogOut,
  Search,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AgentVerificationStatusBadge from "@/components/AgentVerificationStatusBadge";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/api/error";
import {
  useCheckLicense,
  useMyAgentVerification,
  useSubmitAgentVerification,
} from "@/hooks/queries/agentVerificationQueries";
import { useMyPropertyList } from "@/hooks/queries/propertyQueries";
import { useUpdateProfile } from "@/hooks/queries/userQueries";
import { usePropertyReports } from "@/hooks/queries/reportQueries";
import { useAuthStore } from "@/stores/authStore";
import { isApprovedBroker } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentVerification, AuthProvider, User } from "@/types";

const PROVIDER_LABEL: Record<AuthProvider, string> = {
  kakao: "카카오",
  google: "Google",
};

// 백엔드 UserUpdateRequest가 요구하는 형식 — 400을 받기 전에 폼에서 먼저 걸러낸다
const PHONE_PATTERN = /^010-\d{4}-\d{4}$/;

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

type MyPageSection = "account" | "reports";

function IdentityRail({
  user,
  section,
  onSectionChange,
}: {
  user: User;
  section: MyPageSection;
  onSectionChange: (section: MyPageSection) => void;
}) {
  return (
    <aside className="flex flex-col gap-6 self-start md:sticky md:top-24">
      <div className="flex items-center gap-4 md:flex-col md:items-start">
        <ProfileAvatar user={user} />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold">
              {user.nickname || user.name || "내 계정"}
            </p>
            <Badge>{user.role}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            {PROVIDER_LABEL[user.provider]} 계정으로 로그인
          </p>
        </div>
      </div>
      <nav aria-label="마이페이지 메뉴" className="border-t pt-4">
        <ul className="flex gap-2 md:flex-col">
          <li className="flex-1">
            <button
              type="button"
              aria-current={section === "account" ? "page" : undefined}
              onClick={() => onSectionChange("account")}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted",
                section === "account" && "bg-primary/10 text-primary",
              )}
            >
              <UserRound className="size-4" /> 계정
            </button>
          </li>
          <li className="flex-1">
            <button
              type="button"
              aria-current={section === "reports" ? "page" : undefined}
              onClick={() => onSectionChange("reports")}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted",
                section === "reports" && "bg-primary/10 text-primary",
              )}
            >
              <FileText className="size-4" /> 매물 리포트
            </button>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

// 문서형 섹션 공통 헤더 — 밑줄 하나로 위계를 만들고 카드 박스는 쓰지 않는다
function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-9 items-center justify-between border-b pb-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

// 내 정보 — 조회(USER-01)와 페이지 내 수정(USER-02) 모드 전환
function ProfileSection({ user }: { user: User }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return <ProfileEditForm user={user} onDone={() => setIsEditing(false)} />;
  }

  const infoRows = [
    { label: "이름", value: user.name },
    { label: "생년월일", value: user.birth.replaceAll("-", ".") },
    { label: "전화번호", value: user.phone },
    { label: "닉네임", value: user.nickname },
    { label: "이메일", value: user.email },
  ];

  return (
    <section>
      <SectionHeader
        title="내 정보"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            수정
          </Button>
        }
      />
      <dl>
        {infoRows.map(({ label, value }) => (
          <div key={label} className="flex items-baseline gap-4 py-3">
            <dt className="w-20 shrink-0 text-sm text-muted-foreground">
              {label}
            </dt>
            <span
              aria-hidden
              className="min-w-8 flex-1 border-b border-dotted border-border"
            />
            <dd
              className={cn(
                "text-sm font-medium",
                !value && "font-normal text-muted-foreground",
              )}
            >
              {value || "미입력"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// 편집 필드 — 중개사 인증 다이얼로그와 동일한 라벨 위 + 표준 인풋 패턴
function ProfileEditField({
  label,
  name,
  type = "text",
  defaultValue,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      <Input
        name={name}
        type={type}
        defaultValue={defaultValue}
        onChange={onChange}
      />
    </label>
  );
}

// 내 정보 수정 폼 — 이름과 이메일은 조회만 가능
function ProfileEditForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { mutateAsync: updateProfile } = useUpdateProfile();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const [error, submitAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const birth = String(formData.get("birth")).trim();
      const nickname = String(formData.get("nickname")).trim();
      const phone = formatPhoneNumber(String(formData.get("phone")).trim());
      if (phone && !PHONE_PATTERN.test(phone)) {
        return "전화번호는 010-0000-0000 형식으로 입력해주세요";
      }

      const changes = {
        ...(birth && birth !== user.birth ? { birth } : {}),
        ...(phone && phone !== user.phone ? { phone } : {}),
        ...(nickname && nickname !== user.nickname ? { nickname } : {}),
      };

      const selectedImage = formData.get("profileImage");
      const imageFile =
        selectedImage instanceof File && selectedImage.size > 0
          ? selectedImage
          : undefined;
      try {
        await updateProfile({ changes, imageFile });
        onDone();
        return null;
      } catch (submitError) {
        return isApiError(submitError)
          ? submitError.message
          : "정보 수정에 실패했습니다. 잠시 후 다시 시도해주세요";
      }
    },
    null,
  );

  return (
    <section>
      <form action={submitAction}>
        <SectionHeader
          title="내 정보"
          action={
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onDone}>
                취소
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          }
        />
        <div className="flex flex-col gap-5 pt-5">
          <p className="text-xs text-muted-foreground">
            변경할 항목만 수정해도 저장할 수 있습니다.
          </p>
          <div className="flex items-center gap-4">
            <ProfileAvatar
              user={user}
              imageUrl={previewUrl ?? user.profileImageUrl}
              className="size-16"
            />
            <Button
              asChild
              variant="outline"
              size="sm"
              className="cursor-pointer has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
            >
              <label>
                이미지 변경
                <input
                  name="profileImage"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleImageChange}
                />
              </label>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">이름</span>
              <p className="py-2 text-sm">{user.name}</p>
              <p className="text-xs text-muted-foreground">
                본인 확인 정보 · 변경 불가
              </p>
            </div>
            <ProfileEditField
              label="생년월일"
              name="birth"
              type="date"
              defaultValue={user.birth}
            />
            <ProfileEditField
              label="전화번호"
              name="phone"
              type="tel"
              defaultValue={user.phone}
              onChange={(event) => {
                event.currentTarget.value = formatPhoneNumber(
                  event.currentTarget.value,
                );
              }}
            />
            <ProfileEditField
              label="닉네임"
              name="nickname"
              defaultValue={user.nickname}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">이메일</span>
            <p className="text-sm">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              {PROVIDER_LABEL[user.provider]} 계정 이메일 · 변경 불가
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>
    </section>
  );
}

// 신청 요약·조회 결과에서 반복되는 "라벨 / 값" 한 줄
function OfficeInfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex gap-2 text-xs">
      <dt className="w-14 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{value}</dd>
    </div>
  );
}

// 중개사 인증 — 등록번호·서류 제출 후 관리자 수동 승인
function AgentVerificationPanel({ user }: { user: User }) {
  const [applyOpen, setApplyOpen] = useState(false);
  const approvedBroker = isApprovedBroker(user);
  const {
    data: verification,
    isPending,
    isError,
    refetch,
  } = useMyAgentVerification(!approvedBroker);

  if (approvedBroker) {
    return (
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">중개사 인증</h2>
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            <CheckCircle2 className="size-3.5" /> 인증 완료
          </Badge>
        </div>
        <div className="mt-3 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              중개사 인증이 완료되었습니다.
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-700">
              매물 등록과 중개사 전용 기능을 이용할 수 있습니다.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">중개사 인증</h2>
        {verification && (
          <AgentVerificationStatusBadge status={verification.status} />
        )}
      </div>
      {isPending ? (
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : isError ? (
        <div className="mt-2 flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            인증 상태를 불러오지 못했어요.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        </div>
      ) : !verification ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            중개업등록번호와 증빙 서류를 제출하면 관리자 확인 후 중개사 계정으로
            전환됩니다.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setApplyOpen(true)}
          >
            인증 신청
          </Button>
        </>
      ) : (
        <VerificationDetail
          user={user}
          verification={verification}
          onReapply={() => setApplyOpen(true)}
        />
      )}
      <AgentVerificationDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </section>
  );
}

// 신청 이력이 있는 계정의 상태별 안내 — 심사 중 / 승인 완료 / 반려
function VerificationDetail({
  user,
  verification,
  onReapply,
}: {
  user: User;
  verification: AgentVerification;
  onReapply: () => void;
}) {
  if (verification.status === "PENDING") {
    return (
      <>
        <p className="mt-2 text-sm text-muted-foreground">
          제출하신 서류를 관리자가 확인하고 있습니다. 승인되면 중개사 계정으로
          전환됩니다.
        </p>
        <dl className="mt-3 flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3">
          <OfficeInfoRow label="등록번호" value={verification.licenseNumber} />
          <OfficeInfoRow label="사무소" value={verification.officeName} />
          <OfficeInfoRow
            label="신청일"
            value={formatDateTime(verification.submittedAt)}
          />
        </dl>
      </>
    );
  }

  if (verification.status === "APPROVED") {
    return (
      <>
        <p className="mt-2 text-sm text-muted-foreground">
          중개사 인증이 완료된 계정입니다.
        </p>
        <dl className="mt-3 flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3">
          <OfficeInfoRow label="등록번호" value={verification.licenseNumber} />
          <OfficeInfoRow label="사무소" value={verification.officeName} />
          <OfficeInfoRow label="대표" value={verification.brokerName} />
          <OfficeInfoRow
            label="승인일"
            value={formatDateTime(verification.reviewedAt)}
          />
        </dl>
        {!isApprovedBroker(user) && <ApplyBrokerRoleButton />}
      </>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm text-muted-foreground">
        제출하신 서류로는 자격을 확인하지 못했습니다. 등록번호와 서류를 다시
        확인한 뒤 신청해 주세요.
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onReapply}>
        다시 신청
      </Button>
    </>
  );
}

// 승인은 서버 role 변경으로 반영되는데, 승인 시점에 열려 있던 세션은 아직 옛 role을 들고 있다.
// 몰래 고치지 않고 사용자가 누르는 버튼으로 세션을 다시 맞춘다
function ApplyBrokerRoleButton() {
  const refreshUser = useAuthStore((state) => state.refreshUser);

  const [error, refreshAction, isPending] = useActionState(async () => {
    try {
      await refreshUser();
      return null;
    } catch (refreshError) {
      return isApiError(refreshError)
        ? refreshError.message
        : "권한을 반영하지 못했습니다. 잠시 후 다시 시도해주세요";
    }
  }, null);

  return (
    <form action={refreshAction} className="mt-3">
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "반영 중..." : "중개사 기능 사용하기"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  );
}

// 인증 신청 — 등록번호를 먼저 조회해 사무소 정보를 확인시킨 뒤 서류를 받는다.
// 잘못된 번호로 신청했다가 반려되는 왕복을 신청 전에 끊는 것이 목적
function AgentVerificationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [licenseNumber, setLicenseNumber] = useState("");
  const {
    mutateAsync: checkLicense,
    data: licenseCheck,
    isPending: isChecking,
    error: checkError,
    reset: resetCheck,
  } = useCheckLicense();
  const { mutateAsync: submitVerification } = useSubmitAgentVerification();
  // 조회한 번호와 제출하는 번호가 어긋나지 않도록, 번호를 고치면 조회 결과를 버린다
  const verifiedLicense =
    licenseCheck?.valid && licenseCheck.licenseNumber === licenseNumber.trim()
      ? licenseCheck
      : null;

  const closeDialog = () => {
    onOpenChange(false);
    setLicenseNumber("");
    resetCheck();
  };

  const handleCheck = async () => {
    const trimmed = licenseNumber.trim();
    if (!trimmed) {
      return;
    }
    try {
      await checkLicense(trimmed);
    } catch {
      // 조회 실패는 checkError로 화면에 표시된다
    }
  };

  const [submitError, submitAction, isSubmitting] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      if (!verifiedLicense) {
        return "중개업등록번호를 먼저 조회해주세요";
      }
      const document = formData.get("document");
      if (!(document instanceof File) || document.size === 0) {
        return "중개사 증빙 서류를 첨부해주세요";
      }
      try {
        await submitVerification({
          licenseNumber: verifiedLicense.licenseNumber,
          document,
        });
        closeDialog();
        return null;
      } catch (error) {
        return isApiError(error)
          ? error.message
          : "인증 신청에 실패했습니다. 잠시 후 다시 시도해주세요";
      }
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>중개사 인증 신청</DialogTitle>
          <DialogDescription>
            중개업등록번호를 조회해 사무소 정보를 확인한 뒤 증빙 서류를
            제출합니다.
          </DialogDescription>
        </DialogHeader>
        <form action={submitAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="licenseNumber" className="text-sm font-medium">
              중개업등록번호
            </label>
            <div className="flex gap-2">
              <Input
                id="licenseNumber"
                name="licenseNumber"
                placeholder="예) 11110-2026-00001"
                value={licenseNumber}
                onChange={(event) => setLicenseNumber(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={isChecking || licenseNumber.trim().length === 0}
                onClick={handleCheck}
              >
                <Search />
                {isChecking ? "조회 중..." : "조회"}
              </Button>
            </div>
          </div>

          <div aria-live="polite">
            {verifiedLicense ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3.5" />
                  등록번호가 확인되었습니다
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {verifiedLicense.officeName ?? "상호 미확인"}
                </p>
                <dl className="mt-2 flex flex-col gap-1.5">
                  <OfficeInfoRow
                    label="대표"
                    value={verifiedLicense.brokerName}
                  />
                  <OfficeInfoRow
                    label="영업상태"
                    value={verifiedLicense.businessStatus}
                  />
                  <OfficeInfoRow
                    label="주소"
                    value={verifiedLicense.officeAddress}
                  />
                  <OfficeInfoRow
                    label="전화"
                    value={verifiedLicense.officePhone}
                  />
                </dl>
              </div>
            ) : licenseCheck && !licenseCheck.valid ? (
              <p className="text-sm text-destructive">
                조회되지 않는 등록번호입니다. 번호를 다시 확인해주세요.
              </p>
            ) : checkError ? (
              <p className="text-sm text-destructive">
                {isApiError(checkError)
                  ? checkError.message
                  : "등록번호를 조회하지 못했습니다. 잠시 후 다시 시도해주세요"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                조회한 사무소 정보가 본인의 중개사무소와 같은지 확인한 뒤
                신청해주세요.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="document" className="text-sm font-medium">
              증빙 서류
            </label>
            <Input
              id="document"
              name="document"
              type="file"
              accept="image/*,.pdf"
              disabled={!verifiedLicense}
            />
            <span className="text-xs text-muted-foreground">
              중개사무소 등록증 등 자격을 확인할 수 있는 서류 (PDF·이미지)
            </span>
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              취소
            </Button>
            <Button type="submit" disabled={!verifiedLicense || isSubmitting}>
              {isSubmitting ? "신청 중..." : "신청하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// PROP-10 내가 올린 매물 — 중개사 본인이 등록한 매물만 모아 보여준다 (GET /api/properties/me)
export function MyListingsSection() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useMyPropertyList();
  const properties = data?.content ?? [];

  return (
    <section>
      <SectionHeader
        title={
          data ? `내가 올린 매물 (${data.totalElements})` : "내가 올린 매물"
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/properties/new")}
          >
            매물 등록
          </Button>
        }
      />
      {isPending ? (
        <div className="flex flex-col gap-3 py-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-muted-foreground">
            매물 목록을 불러오지 못했어요.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        </div>
      ) : properties.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          아직 등록한 매물이 없어요. 첫 매물을 등록해보세요.
        </p>
      ) : (
        <ul>
          {properties.map((property) => (
            <li
              key={property.propertyId}
              className="flex items-center gap-4 border-b py-3 last:border-b-0"
            >
              <span
                aria-hidden
                className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-muted"
              >
                <ImageIcon className="size-4 text-muted-foreground" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <button
                  type="button"
                  className="max-w-full self-start truncate text-sm font-medium hover:underline"
                  onClick={() => navigate(`/properties/${property.propertyId}`)}
                >
                  {property.title}
                </button>
                <p className="truncate text-xs text-muted-foreground">
                  {property.sigungu} {property.dong} · {property.roomType} ·{" "}
                  {property.transactionType}{" "}
                  {formatPrice({
                    dealType: property.transactionType,
                    deposit: property.deposit,
                    monthlyRent: property.monthlyRent,
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() =>
                  navigate(`/properties/${property.propertyId}/edit`)
                }
              >
                수정
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportsSection({ reportSaved }: { reportSaved: boolean }) {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = usePropertyReports();
  const reports = data?.content ?? [];

  return (
    <section>
      <SectionHeader title={`매물 리포트 (${reports.length})`} />
      {reportSaved && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          미팅 점검 기록이 저장되었습니다.
        </p>
      )}
      {isPending ? (
        <div className="flex flex-col gap-3 py-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between py-6">
          <p className="text-sm text-muted-foreground">
            리포트를 불러오지 못했어요.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        </div>
      ) : reports.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          영상통화를 마치면 해당 매물의 점검 기록이 여기에 저장됩니다.
        </p>
      ) : (
        <ul>
          {reports.map((report) => (
            <li key={report.reportId} className="border-b py-3 last:border-b-0">
              <button
                type="button"
                onClick={() => navigate(`/reports/${report.reportId}`)}
                className="flex w-full cursor-pointer items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                >
                  <FileText className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {report.propertyTitle}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    미팅 {formatDateTime(report.meetingDate)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatDateTime(report.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// 계정 — 로그아웃(AUTH-02)·회원 탈퇴(USER-03), 카드 없이 조용한 하단 섹션
function AccountSection() {
  const logout = useAuthStore((state) => state.logout);
  const withdraw = useAuthStore((state) => state.withdraw);
  const navigate = useNavigate();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const [logoutError, logoutAction, isLoggingOut] = useActionState(async () => {
    try {
      await logout();
      navigate("/", { replace: true });
      return null;
    } catch {
      return "로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요";
    }
  }, null);

  const [withdrawError, withdrawAction, isWithdrawing] = useActionState(
    async () => {
      try {
        await withdraw();
        navigate("/", { replace: true });
        return null;
      } catch {
        return "회원 탈퇴에 실패했습니다. 잠시 후 다시 시도해주세요";
      }
    },
    null,
  );

  return (
    <section>
      <SectionHeader title="계정" />
      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <p className="text-sm font-medium">로그아웃</p>
          <p className="text-sm text-muted-foreground">
            현재 기기에서 로그아웃합니다.
          </p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" disabled={isLoggingOut}>
            <LogOut />
            로그아웃
          </Button>
        </form>
      </div>
      {logoutError && <p className="text-sm text-destructive">{logoutError}</p>}
      <div className="flex items-center justify-between gap-4 border-t py-4">
        <div>
          <p className="text-sm font-medium text-destructive">회원 탈퇴</p>
          <p className="text-sm text-muted-foreground">
            탈퇴 시 저장한 매물과 리포트가 모두 삭제되며 복구할 수 없습니다.
          </p>
        </div>
        <Button
          variant="ghost"
          className="shrink-0 text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={() => setWithdrawOpen(true)}
        >
          탈퇴하기
        </Button>
      </div>
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>정말 탈퇴하시겠어요?</DialogTitle>
            <DialogDescription>
              탈퇴하면 계정 정보와 저장한 매물, 리포트가 모두 삭제되며 되돌릴 수
              없습니다.
            </DialogDescription>
          </DialogHeader>
          {withdrawError && (
            <p className="text-sm text-destructive">{withdrawError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
              취소
            </Button>
            <form action={withdrawAction}>
              <Button
                type="submit"
                variant="destructive"
                disabled={isWithdrawing}
              >
                {isWithdrawing ? "처리 중..." : "탈퇴하기"}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// PAGE-02 마이페이지 — 내 정보 조회·수정·중개사 인증·내가 올린 매물(중개사)·탈퇴·로그아웃
// 로그인 여부는 라우트의 RequireAuth가 보장하고, user는 그쪽에서 내려받는다
function MyPage({ user }: { user: User }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const section: MyPageSection =
    searchParams.get("section") === "reports" ? "reports" : "account";

  const setSection = (nextSection: MyPageSection) => {
    setSearchParams(nextSection === "reports" ? { section: "reports" } : {});
  };

  return (
    <main className="min-h-[calc(100svh-3.5rem)] px-4 py-12">
      <h1 className="sr-only">마이페이지</h1>
      <div className="mx-auto grid w-full max-w-4xl gap-10 md:grid-cols-[15rem_1fr] md:gap-14">
        <IdentityRail
          user={user}
          section={section}
          onSectionChange={setSection}
        />
        <div className="flex min-w-0 flex-col gap-12">
          {section === "account" ? (
            <>
              <ProfileSection user={user} />
              <AgentVerificationPanel user={user} />
              <AccountSection />
            </>
          ) : (
            <ReportsSection
              reportSaved={location.state?.reportSaved === true}
            />
          )}
        </div>
      </div>
    </main>
  );
}

export default MyPage;
