import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentVerificationStatus } from "@/types";

export const AGENT_VERIFICATION_STATUS_LABEL: Record<
  AgentVerificationStatus,
  string
> = {
  PENDING: "심사 중",
  APPROVED: "승인 완료",
  REJECTED: "반려",
};

const TONE: Record<AgentVerificationStatus, { badge: string; dot: string }> = {
  PENDING: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  APPROVED: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  REJECTED: {
    badge: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
};

// 마이페이지와 관리자 심사 화면이 같은 상태를 같은 모양으로 보여주도록 공유한다
function AgentVerificationStatusBadge({
  status,
  className,
}: {
  status: AgentVerificationStatus;
  className?: string;
}) {
  const tone = TONE[status];

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 px-2 py-0.5 font-medium", tone.badge, className)}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {AGENT_VERIFICATION_STATUS_LABEL[status]}
    </Badge>
  );
}

export default AgentVerificationStatusBadge;
