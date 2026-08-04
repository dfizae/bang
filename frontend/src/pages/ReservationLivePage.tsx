import {
  type ReactNode,
  type RefObject,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Camera,
  CameraOff,
  ChevronUp,
  ListChecks,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  ScanSearch,
  Trash2,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { isApiError } from "@/api/error";
import ReservationChecklist from "@/components/ReservationChecklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChecklist } from "@/hooks/queries/checklistQueries";
import { useMeetingDetail } from "@/hooks/queries/meetingQueries";
import { usePropertyDetail } from "@/hooks/queries/propertyQueries";
import {
  useEndSession,
  useLeaveSession,
  useLiveSession,
  useUploadSessionCapture,
} from "@/hooks/queries/sessionQueries";
import { useCreateReport } from "@/hooks/queries/reportQueries";
import {
  type SessionCapture,
  useSessionCaptures,
} from "@/hooks/useSessionCaptures";
import { useInspectionStream } from "@/hooks/useInspectionStream";
import { useVideoAspect } from "@/hooks/useVideoAspect";
import { formatMeetingDateTime, getMeetingDateTime } from "@/lib/meeting";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { UserRole } from "@/types";

type SessionStatus =
  "connecting" | "waiting" | "connected" | "peer-left" | "room-full" | "error";

const STATUS_LABEL: Record<SessionStatus, string> = {
  connecting: "연결 준비 중",
  waiting: "상대방 대기 중",
  connected: "연결됨",
  "peer-left": "상대방이 나갔어요",
  "room-full": "이미 두 명이 입장한 세션이에요",
  error: "연결에 실패했어요",
};

const STATUS_BADGE_VARIANT: Record<
  SessionStatus,
  "default" | "secondary" | "destructive"
> = {
  connecting: "secondary",
  waiting: "secondary",
  connected: "default",
  "peer-left": "secondary",
  "room-full": "destructive",
  error: "destructive",
};

type MediaStatus = "pending" | "ready" | "blocked";

// 관리자는 라이브 미팅에 참여하지 않지만 타입 완결성을 위해 세입자 상대로 둔다
const PEER_ROLE: Record<UserRole, UserRole> = {
  세입자: "중개사",
  중개사: "세입자",
  관리자: "세입자",
};

// 셀룰러(CGNAT)·사내망(대칭 NAT) 사이는 STUN만으로 P2P가 뚫리지 않아
// TURN 중계가 필요하다. TURN 미설정(로컬 개발 등)이면 STUN만으로 시도한다
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  const urls = (import.meta.env.VITE_TURN_URLS ?? "")
    .split(",")
    .map((url: string) => url.trim())
    .filter(Boolean);
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (urls.length > 0 && username && credential) {
    servers.push({ urls, username, credential });
  }
  return servers;
}

// 백엔드 SignalHandler 프로토콜 — OFFER/ANSWER는 sdp 원문, ICE 후보는 평탄화된
// 필드로 오간다. 정원 초과는 ERROR 후 서버가 1008(Policy Violation)로 소켓을 닫는다
interface SignalMessage {
  type:
    | "JOINED"
    | "PEER_JOINED"
    | "PEER_LEFT"
    | "OFFER"
    | "ANSWER"
    | "ICE_CANDIDATE"
    | "ERROR";
  senderId?: number;
  peerId?: number;
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
  message?: string;
}

function formatCaptureTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 영상 타일 — 영상이 없을 때는 notice로 상황을 대신 알린다
interface VideoTileProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  label: string;
  className: string;
  muted?: boolean;
  aspect?: number | null;
  notice?: ReactNode;
}

function VideoTile({
  videoRef,
  label,
  className,
  muted = false,
  aspect,
  notice,
}: VideoTileProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-slate-900",
        className,
      )}
      // 타일이 스트림 비율을 그대로 따라가 검은 여백이 생기지 않게 한다
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="size-full object-contain"
      />
      {notice}
      <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-slate-950/70 px-2 py-0.5 text-xs font-medium text-white">
        {label}
      </span>
    </div>
  );
}

// 영상 대신 상태를 안내하는 타일 오버레이 — compact는 우측 상단 내 화면용
interface TileNoticeProps {
  icon: ReactNode;
  compact?: boolean;
  children: ReactNode;
}

function TileNotice({ icon, compact = false, children }: TileNoticeProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 px-4 text-center text-sm text-slate-400",
        compact && "gap-1 px-2 pb-5 text-xs",
      )}
    >
      {icon}
      <span className="max-w-80">{children}</span>
    </div>
  );
}

// 내 영상이 보이지 않는 이유를 상황별로 안내한다
function LocalTileNotice({
  mediaStatus,
  camOn,
}: {
  mediaStatus: MediaStatus;
  camOn: boolean;
}) {
  if (mediaStatus === "blocked") {
    return (
      <TileNotice icon={<CameraOff className="size-4" />} compact>
        카메라 권한 필요
      </TileNotice>
    );
  }

  if (mediaStatus === "pending") {
    return (
      <TileNotice icon={<Loader2 className="size-4 animate-spin" />} compact>
        준비 중
      </TileNotice>
    );
  }

  if (!camOn) {
    return (
      <TileNotice icon={<VideoOff className="size-4" />} compact>
        카메라 꺼짐
      </TileNotice>
    );
  }

  return null;
}

// 스스로 풀리지 않아 사용자가 손을 써야 하는 상태.
// 상대가 나간 경우는 재입장(PEER_JOINED) 때 자동으로 재협상되므로 넣지 않는다 —
// 여기서 재시도(퇴장 후 재입장)를 누르면 멀쩡한 상대를 도로 내쫓는 핑퐁이 된다
const RECOVERABLE_STATUS: Record<SessionStatus, boolean> = {
  connecting: false,
  waiting: false,
  connected: false,
  "peer-left": false,
  "room-full": true,
  error: true,
};

const RETRY_LABEL: Partial<Record<SessionStatus, string>> = {
  "room-full": "다시 입장",
  error: "다시 시도",
};

// 상대 영상이 오기 전까지 그 자리에서 준비 상태를 알린다.
// 손을 써야 하는 상태는 좁은 타일 대신 스테이지 전체가 맡는다
function PeerPreparingNotice({
  status,
  compact,
}: {
  status: SessionStatus;
  compact?: boolean;
}) {
  if (status === "connected" || RECOVERABLE_STATUS[status]) {
    return null;
  }

  return (
    <TileNotice
      icon={
        <Loader2
          className={cn("animate-spin", compact ? "size-4" : "size-6")}
        />
      }
      compact={compact}
    >
      {STATUS_LABEL[status]}
    </TileNotice>
  );
}

// 세션이 막히면 영상 위 작은 문구가 아니라 스테이지를 덮고 다음 행동을 제시한다.
// 나가기는 컨트롤 바에 항상 있으므로 여기서는 복구 하나만 제안한다
function StageRecoveryOverlay({
  status,
  detail,
  onRetry,
}: {
  status: SessionStatus;
  detail?: string;
  onRetry: () => void;
}) {
  if (!RECOVERABLE_STATUS[status]) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/90 px-6 text-center">
      <VideoOff className="size-8 text-slate-500" />
      <p className="text-sm text-slate-300">{STATUS_LABEL[status]}</p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
      <Button size="sm" onClick={onRetry}>
        <RotateCcw /> {RETRY_LABEL[status]}
      </Button>
    </div>
  );
}

// 마이크·카메라처럼 켜고 끄는 통화 옵션 버튼
interface ControlButtonProps {
  on: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ControlButton({
  on,
  label,
  disabled,
  onClick,
  children,
}: ControlButtonProps) {
  return (
    <Button
      type="button"
      size="icon-lg"
      aria-label={label}
      aria-pressed={on}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border border-slate-700 bg-slate-800 text-white hover:bg-slate-700",
        // 꺼짐은 위험이 아니라 비활성 — 빨강은 통화 종료에만 쓴다
        !on && "border-slate-800 bg-slate-800/50 text-slate-500",
      )}
    >
      {children}
    </Button>
  );
}

// 세입자 전용 패널 — 데스크톱 사이드바와 모바일 하단 시트가 함께 쓴다.
// 명세 "사용자 권한" — 체크리스트 확인·수정은 세입자만 가능하다
interface ChecklistPanelProps {
  meetingId: number | undefined;
}

function ChecklistPanel({ meetingId }: ChecklistPanelProps) {
  const { data: checklist } = useChecklist(meetingId);
  const items = checklist?.items ?? [];
  const completedCount = items.filter(
    (item) => item.status === "COMPLETED",
  ).length;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <h2 className="mb-2 flex shrink-0 items-center gap-1.5 text-sm font-semibold">
        <ListChecks className="size-4" />
        체크리스트
        <span className="font-normal text-muted-foreground">
          {completedCount}/{items.length}
        </span>
      </h2>
      <ReservationChecklist meetingId={meetingId} variant="bare" />
    </section>
  );
}

// 이번 세션에서 남긴 캡처 — 주 화면 아래에 쌓아 방금 찍은 것이 바로 보이게 한다
interface CaptureStripProps {
  captures: SessionCapture[];
  onSelect: (capture: SessionCapture) => void;
}

function CaptureStrip({ captures, onSelect }: CaptureStripProps) {
  if (captures.length === 0) {
    return null;
  }

  return (
    // w-fit + mx-auto — 가운데 정렬하되 넘칠 때 첫 항목이 잘리지 않게 한다
    <ul className="mx-auto mb-3 flex w-fit max-w-full gap-2 overflow-x-auto pb-1">
      {captures.map((capture) => (
        <li key={capture.id} className="shrink-0">
          <button
            type="button"
            onClick={() => onSelect(capture)}
            className="block overflow-hidden rounded-md border border-slate-700 transition-colors hover:border-primary"
          >
            <img
              src={capture.url}
              alt={`${formatCaptureTime(capture.createdAt)} 캡처`}
              className="h-12 w-20 object-cover"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

// PAGE-12 RTC 회의 — RTC-01 세션 생성(멱등), RTC-02 입장. 세션 입장 API가 돌려준
// signalingUrl(접속 토큰 포함)로 백엔드 시그널링 서버에 붙는다. slug는 회의 id
function ReservationLivePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionEndedRef = useRef(false);

  const [status, setStatus] = useState<SessionStatus>("connecting");
  // 나가기 다이얼로그 분기용 — 상대가 세션에 남아 있으면 퇴장만, 혼자면 종료까지 제안한다
  const [peerPresent, setPeerPresent] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus>("pending");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewCapture, setPreviewCapture] = useState<SessionCapture | null>(
    null,
  );
  const mediaBlocked = mediaStatus === "blocked";

  const remoteAspect = useVideoAspect(remoteVideoRef);
  const localAspect = useVideoAspect(localVideoRef);

  const meetingId = Number(slug);
  const { data: meeting } = useMeetingDetail(
    Number.isInteger(meetingId) ? meetingId : undefined,
  );
  const { data: property } = usePropertyDetail(
    meeting?.propertyId ?? -1,
    meeting !== undefined,
  );
  // RTC-01·02 — 세션 생성(멱등) 후 입장해 시그널링 접속 정보를 받는다
  const {
    data: session,
    isError: joinFailed,
    error: joinError,
    refetch: refetchSession,
  } = useLiveSession(Number.isInteger(meetingId) ? meetingId : undefined);

  // 재시도는 입장부터 다시 — 새 시그널링 토큰이 발급되며 연결 effect가 재실행된다
  const retryConnection = () => {
    setStatus("connecting");
    setMediaStatus("pending");
    void refetchSession();
  };

  // 입장 API 실패(만료·권한·미확정 회의)는 소켓을 열기 전에 나므로
  // 백엔드가 준 사유를 복구 오버레이에 함께 보여준다
  const displayStatus: SessionStatus = joinFailed ? "error" : status;
  const statusDetail =
    joinFailed && isApiError(joinError) ? joinError.message : undefined;

  const meetingAt = meeting && getMeetingDateTime(meeting);
  const { data: checklistData } = useChecklist(meeting?.meetingId);
  const checklistItems = checklistData?.items ?? [];

  const myLabel = user ? `나 (${user.role})` : "나";
  const peerLabel = user ? PEER_ROLE[user.role] : "상대방";
  const completedCount = checklistItems.filter(
    (item) => item.status === "COMPLETED",
  ).length;

  // 중개사는 현장에서 카메라를 겨누고, 세입자는 그 화면을 보고 판단한다.
  // 각자에게 중요한 영상이 반대라서 큰 타일에 올릴 스트림도 반대가 된다
  const isBroker = user?.role === "중개사";
  const localTile = {
    videoRef: localVideoRef,
    label: isBroker ? "내 카메라 (송출 중)" : myLabel,
    muted: true,
    aspect: localAspect,
    notice: <LocalTileNotice mediaStatus={mediaStatus} camOn={camOn} />,
  };
  const peerTile = {
    videoRef: remoteVideoRef,
    label: peerLabel,
    muted: false,
    aspect: remoteAspect,
    notice: <PeerPreparingNotice status={displayStatus} />,
  };
  const primaryTile = isBroker ? localTile : peerTile;
  const secondaryTile = isBroker
    ? {
        ...peerTile,
        notice: <PeerPreparingNotice status={displayStatus} compact />,
      }
    : localTile;

  // 중개사에게는 체크리스트가 없어(명세상 불가) 패널 자체를 두지 않고
  // 그만큼 뷰파인더에 내준다
  const showPanel = !isBroker;

  const { captures, capture, removeCapture } = useSessionCaptures(
    primaryTile.videoRef,
  );
  const { mutateAsync: createSessionReport, isPending: isSavingReport } =
    useCreateReport();
  const { mutateAsync: endLiveSession, isPending: isEndingSession } =
    useEndSession(meetingId);
  const { mutateAsync: leaveLiveSession, isPending: isLeavingSession } =
    useLeaveSession(meetingId);
  const { mutateAsync: uploadCapture, isPending: isUploadingCapture } =
    useUploadSessionCapture();
  const [reportError, setReportError] = useState<string | null>(null);

  // 진행 중에는 어느 버튼으로도 중복 요청이 나가지 않게 함께 잠근다
  const isClosingSession =
    isSavingReport || isEndingSession || isUploadingCapture;
  const sessionActionPending = isClosingSession || isLeavingSession;

  // RTC-03 세션 퇴장 — 세션은 살려 둔 채 나만 나간다 (재입장 가능)
  const leaveMeeting = async () => {
    if (!session) {
      setReportError(
        "세션 정보를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }

    setReportError(null);
    try {
      await leaveLiveSession(session.sessionId);
    } catch (error) {
      setReportError(
        `퇴장 요청 실패: ${isApiError(error) ? error.message : "잠시 후 다시 시도해 주세요."}`,
      );
      return;
    }
    navigate("/reservations");
  };

  const endMeeting = async () => {
    if (!session) {
      setReportError(
        "리포트 정보를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }

    setReportError(null);
    try {
      await Promise.all(
        captures.map(async (item) => {
          const image = await fetch(item.url).then((response) =>
            response.blob(),
          );
          const stored = await uploadCapture({
            sessionId: session.sessionId,
            image,
          });
          return stored;
        }),
      );
    } catch (error) {
      setReportError(
        `현장 캡처 저장 실패: ${isApiError(error) ? error.message : "잠시 후 다시 시도해 주세요."}`,
      );
      return;
    }

    if (!sessionEndedRef.current) {
      try {
        await endLiveSession(session.sessionId);
        sessionEndedRef.current = true;
      } catch (error) {
        setReportError(
          `미팅 종료 요청 실패: ${isApiError(error) ? error.message : "잠시 후 다시 시도해 주세요."}`,
        );
        return;
      }
    }

    try {
      await createSessionReport(session.sessionId);
      navigate("/mypage?section=reports", {
        state: { reportSaved: true },
      });
    } catch (error) {
      const reportFailure = isApiError(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : "잠시 후 다시 시도해 주세요.";
      setReportError(`AI 리포트 생성 요청 실패: ${reportFailure}`);
    }
  };

  // RTC-06 AI 하자 검수 — 원본 화질(송출 전) 스트림을 가진 중개사 쪽에서만 돌린다
  const { candidateCount } = useInspectionStream(
    localVideoRef,
    session?.sessionId,
    isBroker && status === "connected",
  );

  // RTC-05 — 캡처는 영상 프레임이 있어야 가능하므로 실패를 사용자에게 알린다
  const [captureError, captureAction, capturing] = useActionState<
    string | null
  >(async () => {
    const captured = await capture();
    return captured
      ? null
      : "지금은 화면을 캡처할 수 없어요. 영상이 나온 뒤 다시 시도해 주세요.";
  }, null);

  const deletePreviewCapture = () => {
    if (previewCapture) {
      removeCapture(previewCapture.id);
      setPreviewCapture(null);
    }
  };

  const signalingUrl = session?.signalingUrl;

  useEffect(() => {
    if (!signalingUrl) {
      return;
    }
    // 중첩 함수(start) 안에서도 string으로 좁혀진 값을 쓰기 위한 고정
    const wsUrl = signalingUrl;

    let disposed = false;
    let pc: RTCPeerConnection | null = null;
    let ws: WebSocket | null = null;
    let localStream: MediaStream | null = null;
    // 원격 description 설정 전에 도착한 ICE 후보 보관 — 연결을 갈아끼울 때 함께 비운다
    let pendingCandidates: RTCIceCandidateInit[] = [];

    const send = (message: SignalMessage) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };

    // 협상 이력(ICE 자격 등)이 남은 연결로는 새 상대와 재협상이 성립하지 않으므로,
    // 상대가 바뀌거나 나갈 때마다 RTCPeerConnection을 새로 만들어 교체한다
    const resetPeerConnection = () => {
      pc?.close();
      pendingCandidates = [];

      const next = new RTCPeerConnection({ iceServers: buildIceServers() });
      pc = next;

      if (localStream) {
        for (const track of localStream.getTracks()) {
          next.addTrack(track, localStream);
        }
      } else {
        // 장치가 없어도 상대 영상은 수신할 수 있게 recvonly로 입장
        next.addTransceiver("video", { direction: "recvonly" });
        next.addTransceiver("audio", { direction: "recvonly" });
      }

      next.ontrack = ({ streams: [stream] }) => {
        if (remoteVideoRef.current && stream) {
          remoteVideoRef.current.srcObject = stream;
        }
      };

      next.onconnectionstatechange = () => {
        if (next.connectionState === "connected") {
          setStatus("connected");
        }
        // disconnected는 일시적 유실이라 스스로 복구될 수 있어 failed만 실패로 본다
        if (next.connectionState === "failed") {
          setStatus("error");
        }
      };

      next.onicecandidate = ({ candidate }) => {
        // 릴레이는 후보를 평탄화된 필드로 받는다 — 종료 신호(null)는 보내지 않는다
        if (candidate) {
          send({
            type: "ICE_CANDIDATE",
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid ?? undefined,
            sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
          });
        }
      };

      return next;
    };

    async function start() {
      try {
        // AI 하자 검수 입력(긴 변 960px)을 보장하려고 1080p를 요청한다.
        // ideal이라 미지원 카메라는 가능한 최대 해상도로 열린다
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
      } catch {
        localStream = null;
      }
      if (disposed) {
        localStream?.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = localStream;
      setMediaStatus(localStream ? "ready" : "blocked");
      if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
      }

      resetPeerConnection();

      // 접속 토큰(roomToken·accessToken)은 signalingUrl 쿼리에 이미 들어 있다
      ws = new WebSocket(wsUrl);

      ws.onerror = () => setStatus("error");
      ws.onclose = (event) => {
        if (disposed) {
          return;
        }
        // 정원 초과는 서버가 ERROR를 보낸 뒤 1008(Policy Violation)로 소켓을 닫는다.
        // 그 외의 끊김(토큰 만료·네트워크 단절)도 재시도로 재입장하게 알린다
        setStatus(event.code === 1008 ? "room-full" : "error");
      };

      ws.onmessage = async (event) => {
        if (!pc) {
          return;
        }
        const message: SignalMessage = JSON.parse(event.data);

        switch (message.type) {
          case "JOINED":
            // peerId가 없으면 내가 첫 입장. 상대가 이미 있으면 그쪽이
            // PEER_JOINED를 받고 오퍼를 보내오므로 여기서는 기다린다
            setPeerPresent(message.peerId != null);
            if (message.peerId == null) {
              setStatus("waiting");
            }
            break;
          case "PEER_JOINED": {
            // 첫 입장이든 나갔던 상대의 재입장이든, 협상 이력이 없는
            // 새 연결에서 오퍼를 만들어야 ICE가 처음부터 다시 뚫린다
            setPeerPresent(true);
            setStatus("connecting");
            const fresh = resetPeerConnection();
            await fresh.setLocalDescription();
            send({ type: "OFFER", sdp: fresh.localDescription?.sdp });
            break;
          }
          case "PEER_LEFT":
            setPeerPresent(false);
            setStatus("peer-left");
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = null;
            }
            // 실패한 연결을 정리해 두고 상대의 재입장(PEER_JOINED)을 기다린다
            resetPeerConnection();
            break;
          case "OFFER": {
            if (!message.sdp) {
              break;
            }
            await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
            await pc.setLocalDescription();
            send({ type: "ANSWER", sdp: pc.localDescription?.sdp });
            for (const candidate of pendingCandidates.splice(0)) {
              await pc.addIceCandidate(candidate);
            }
            break;
          }
          case "ANSWER": {
            if (!message.sdp) {
              break;
            }
            await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
            for (const candidate of pendingCandidates.splice(0)) {
              await pc.addIceCandidate(candidate);
            }
            break;
          }
          case "ICE_CANDIDATE": {
            if (!message.candidate) {
              break;
            }
            const candidate: RTCIceCandidateInit = {
              candidate: message.candidate,
              sdpMid: message.sdpMid,
              sdpMLineIndex: message.sdpMLineIndex,
            };
            if (pc.remoteDescription) {
              await pc.addIceCandidate(candidate);
            } else {
              pendingCandidates.push(candidate);
            }
            break;
          }
          case "ERROR":
            // 정원 초과는 곧 이어지는 onclose(1008)가 처리하고,
            // 릴레이 단계의 안내성 오류는 연결 상태를 바꾸지 않는다
            break;
        }
      };
    }

    void start();

    return () => {
      disposed = true;
      localStream?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      pc?.close();
      ws?.close();
    };
  }, [signalingUrl]);

  const toggleTrack = (kind: "audio" | "video", next: boolean) => {
    const tracks =
      kind === "audio"
        ? localStreamRef.current?.getAudioTracks()
        : localStreamRef.current?.getVideoTracks();
    tracks?.forEach((track) => {
      track.enabled = next;
    });
  };

  const handleToggleMic = () => {
    toggleTrack("audio", !micOn);
    setMicOn(!micOn);
  };

  const handleToggleCam = () => {
    toggleTrack("video", !camOn);
    setCamOn(!camOn);
  };

  return (
    // GNB를 숨기는 화면이라 뷰포트 전체를 쓴다 (App의 hideGlobalNav와 짝)
    <main className="flex h-svh flex-col overflow-hidden bg-slate-50">
      <section className="shrink-0 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold lg:text-lg">
              {property?.title ?? "라이브 점검"}
            </h1>
            <Badge
              role="status"
              aria-live="polite"
              variant={STATUS_BADGE_VARIANT[displayStatus]}
            >
              {STATUS_LABEL[displayStatus]}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {meetingAt && (
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {formatMeetingDateTime(meetingAt)}
              </span>
            )}
            {user && (
              <Badge variant="secondary" className="hidden sm:flex">
                <Users /> {myLabel} · {peerLabel}
              </Badge>
            )}
          </div>
        </div>
      </section>

      <div
        className={cn(
          // grid-rows를 명시하지 않으면 행이 내용 높이로 늘어나 패널이 화면 밖으로 새어나간다
          "relative mx-auto min-h-0 w-full max-w-7xl flex-1 lg:grid lg:grid-rows-[minmax(0,1fr)] lg:gap-4 lg:p-4",
          showPanel ? "lg:grid-cols-[minmax(0,1fr)_370px]" : "lg:grid-cols-1",
        )}
      >
        <section className="absolute inset-0 flex flex-col bg-slate-950 lg:relative lg:inset-auto lg:rounded-xl lg:border">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden lg:p-3">
            {/* 보조 영상을 주 영상 모서리에 붙이려고 영상 크기만큼만 차지하는 래퍼를 둔다 */}
            <div
              className="relative max-h-full w-full lg:h-full lg:w-auto lg:max-w-full"
              style={{ aspectRatio: primaryTile.aspect ?? 16 / 9 }}
            >
              <VideoTile
                videoRef={primaryTile.videoRef}
                label={primaryTile.label}
                muted={primaryTile.muted}
                className="size-full"
                notice={primaryTile.notice}
              />
              <VideoTile
                videoRef={secondaryTile.videoRef}
                label={secondaryTile.label}
                muted={secondaryTile.muted}
                aspect={secondaryTile.aspect}
                className="absolute top-2 right-2 w-24 border border-slate-700/70 shadow-sm sm:w-28 lg:top-3 lg:right-3 lg:w-40"
                notice={secondaryTile.notice}
              />
            </div>
          </div>

          <StageRecoveryOverlay
            status={displayStatus}
            detail={statusDetail}
            onRetry={retryConnection}
          />

          {mediaBlocked && (
            <p className="absolute inset-x-3 top-3 max-w-96 rounded-lg bg-slate-900/90 px-3 py-2 text-xs text-slate-300 lg:inset-x-6 lg:top-6">
              카메라·마이크를 사용할 수 없어 수신 전용으로 입장했어요. 브라우저
              주소창의 권한 아이콘에서 카메라와 마이크를 허용한 뒤 다시 연결해
              주세요.
            </p>
          )}

          {/* 하자 후보가 잡히기 시작하면 건수로 바뀌어 검수가 돌고 있음을 알린다 */}
          {isBroker && !mediaBlocked && status === "connected" && (
            <p className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-200 lg:top-6 lg:left-6">
              <ScanSearch className="size-3.5" />
              {candidateCount > 0
                ? `곰팡이 의심 ${candidateCount}건 감지`
                : "AI 하자 검수 중"}
            </p>
          )}

          {/* 컨트롤은 영상 위에 얹는다 — 별도 바를 두면 영상 높이를 그만큼 빼앗긴다 */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent px-3 pt-10 pb-4 lg:pb-6",
              // 모바일에서는 시트가 컨트롤을 덮어 나가기까지 못 누르게 되므로 시트 위로 올린다.
              // 여백이 아니라 bottom을 옮겨야 스크림이 같이 커져 영상을 덮지 않는다
              showPanel &&
                (sheetOpen ? "max-lg:bottom-90" : "max-lg:bottom-12"),
            )}
          >
            <CaptureStrip captures={captures} onSelect={setPreviewCapture} />

            {captureError && (
              <p
                role="alert"
                className="mx-auto mb-2 w-fit rounded-md bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200"
              >
                {captureError}
              </p>
            )}

            <div className="flex items-center justify-center gap-2">
              <ControlButton
                on={micOn}
                label={micOn ? "마이크 끄기" : "마이크 켜기"}
                disabled={mediaBlocked}
                onClick={handleToggleMic}
              >
                {micOn ? <Mic /> : <MicOff />}
              </ControlButton>
              <ControlButton
                on={camOn}
                label={camOn ? "카메라 끄기" : "카메라 켜기"}
                disabled={mediaBlocked}
                onClick={handleToggleCam}
              >
                {camOn ? <Video /> : <VideoOff />}
              </ControlButton>
              {/* 캡처는 이 화면에서 유일한 primary — 남길 것을 남기는 동작이다 */}
              <form action={captureAction} className="contents">
                <Button
                  type="submit"
                  size="icon-lg"
                  aria-label="화면 캡처"
                  title="화면 캡처"
                  disabled={capturing}
                  className="rounded-full"
                >
                  {capturing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Camera />
                  )}
                </Button>
              </form>
              <Button
                variant="destructive"
                size="lg"
                className="ml-2 rounded-full"
                onClick={() => setLeaveOpen(true)}
              >
                <PhoneOff /> 나가기
              </Button>
            </div>
          </div>
        </section>

        {showPanel && (
          <Card
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 gap-0 rounded-b-none py-0 transition-[height] duration-200",
              "lg:relative lg:inset-auto lg:h-full lg:max-h-none lg:rounded-xl lg:py-4",
              // 펼침 높이는 뷰포트 비율이 아니라 내용 기준 — 항목 4개 + 입력창이 보이는 353px에
              // 여유를 조금 더한 값. 가로 모드처럼 낮은 화면에서는 max-h가 대신 막는다.
              // 접힘 높이는 peek 버튼(h-12) + 카드 위 테두리 1px — 안 더하면 1px 넘친다
              sheetOpen ? "h-90 max-h-[70%]" : "h-[calc(3rem+1px)]",
            )}
          >
            <button
              type="button"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((open) => !open)}
              className="flex h-12 w-full shrink-0 items-center justify-between px-4 text-sm font-medium lg:hidden"
            >
              <span className="flex items-center gap-1.5">
                <ListChecks className="size-4" /> {completedCount}/
                {checklistItems.length}
              </span>
              <ChevronUp
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  sheetOpen && "rotate-180",
                )}
              />
            </button>
            <CardContent
              className={cn(
                "min-h-0 flex-1 overflow-hidden px-4 pb-4 lg:block lg:pb-0",
                sheetOpen ? "block" : "hidden",
              )}
            >
              <ChecklistPanel meetingId={meeting?.meetingId} />
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={previewCapture !== null}
        onOpenChange={(open) => !open && setPreviewCapture(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {previewCapture && formatCaptureTime(previewCapture.createdAt)}{" "}
              캡처
            </DialogTitle>
            <DialogDescription className="sr-only">
              이번 세션에서 남긴 캡처를 원본 크기로 봅니다.
            </DialogDescription>
          </DialogHeader>
          {previewCapture && (
            <img
              src={previewCapture.url}
              alt=""
              className="max-h-[60svh] w-full rounded-lg bg-slate-900 object-contain"
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={deletePreviewCapture}>
              <Trash2 /> 삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 상대가 남아 있으면 퇴장(leave)만 묻고, 혼자 남았으면 자리 비움(leave)과
          미팅 종료(end) 중에서 고르게 한다 */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {peerPresent
                ? "미팅에서 나가겠습니까?"
                : "미팅을 종료하시겠습니까?"}
            </DialogTitle>
            <DialogDescription>
              {peerPresent
                ? "나가면 통화가 끊기고 상대방은 세션에 남습니다. 세션이 끝나기 전에는 다시 입장할 수 있어요."
                : "자리 비움을 누르면 세션을 유지한 채 나가서 다시 입장할 수 있고, 미팅 종료를 누르면 세션이 끝나고 캡처와 AI 리포트가 저장됩니다."}
              {showPanel && " 체크리스트는 그대로 저장돼 있어요."}
              {peerPresent &&
                captures.length > 0 &&
                ` 이번 세션에서 남긴 캡처 ${captures.length}장은 사라집니다.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {reportError && (
              <div className="flex flex-col items-start gap-2">
                <p role="alert" className="text-sm text-destructive">
                  {reportError}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/reservations")}
                >
                  저장 없이 나가기
                </Button>
              </div>
            )}
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>
              {peerPresent ? "아니요" : "취소"}
            </Button>
            {peerPresent ? (
              <Button
                variant="destructive"
                disabled={sessionActionPending}
                onClick={() => void leaveMeeting()}
              >
                {isLeavingSession ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <PhoneOff />
                )}
                {isLeavingSession ? "나가는 중..." : "예"}
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  disabled={sessionActionPending}
                  onClick={() => void leaveMeeting()}
                >
                  {isLeavingSession ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <LogOut />
                  )}
                  {isLeavingSession ? "나가는 중..." : "자리 비움"}
                </Button>
                <Button
                  variant="destructive"
                  disabled={sessionActionPending}
                  onClick={() => void endMeeting()}
                >
                  {isClosingSession ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <PhoneOff />
                  )}
                  {isClosingSession ? "종료 처리 중..." : "미팅 종료"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default ReservationLivePage;
