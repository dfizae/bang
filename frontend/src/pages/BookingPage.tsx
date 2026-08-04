import { useActionState, useState } from "react";
import { Check, Home, MapPin } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { isApiError } from "@/api/error";
import MeetingTimePicker, {
  PreferredTimeList,
} from "@/components/MeetingTimePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateMeeting } from "@/hooks/queries/meetingQueries";
import { usePropertyDetail } from "@/hooks/queries/propertyQueries";

// PAGE-08 예약 요청 — RES-01 가능 시간 조회 + RES-02 회의 가능 시간 등록
function BookingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const propertyId = Number(id);
  const [preferredTimes, setPreferredTimes] = useState<string[]>([]);
  const { mutateAsync } = useCreateMeeting(propertyId);

  const [error, requestAction, isSubmitting] = useActionState<string | null>(
    async () => {
      try {
        await mutateAsync(preferredTimes);
        navigate("/reservations");
        return null;
      } catch (requestError) {
        return isApiError(requestError)
          ? requestError.message
          : "예약 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      }
    },
    null,
  );

  if (!Number.isInteger(propertyId)) {
    return (
      <div className="p-12 text-center">매물 정보를 찾을 수 없습니다.</div>
    );
  }

  return (
    <main className="min-h-[calc(100svh-3.5rem)] bg-slate-50 px-4 py-4">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <Badge variant="secondary">온라인 매물 투어</Badge>
            <h1 className="mt-2 text-2xl font-semibold">미팅 예약</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              달력에서 날짜를 고르고 원하는 시간을 선택하세요.
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigate("/properties")}>
            목록으로 돌아가기
          </Button>
        </div>

        <BookingPropertySummary propertyId={propertyId} />

        <form action={requestAction}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <MeetingTimePicker
              propertyId={propertyId}
              value={preferredTimes}
              onChange={setPreferredTimes}
            />

            <Card className="border-primary/30 bg-primary/[0.03] py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-base">예약 내용</CardTitle>
              </CardHeader>
              <CardContent className="flex h-full flex-col gap-4 px-5">
                <div>
                  <p className="text-sm text-muted-foreground">희망 시간</p>
                  <div className="mt-2">
                    <PreferredTimeList
                      value={preferredTimes}
                      onRemove={(slot) =>
                        setPreferredTimes((previous) =>
                          previous.filter((picked) => picked !== slot),
                        )
                      }
                    />
                  </div>
                </div>
                <p className="rounded-lg bg-background p-3 text-xs leading-5 text-muted-foreground">
                  선택한 시간 중 중개사가 가능한 일정을 확인해 최종 시간을
                  확정합니다.
                </p>
                {error && (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="mt-auto w-full"
                  disabled={preferredTimes.length === 0 || isSubmitting}
                >
                  <Check />
                  {isSubmitting ? "요청 중…" : "예약 요청하기"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </form>
      </div>
    </main>
  );
}

function BookingPropertySummary({ propertyId }: { propertyId: number }) {
  const { data: property, isPending } = usePropertyDetail(propertyId);

  if (isPending) {
    return <Skeleton className="mb-3 h-[104px] rounded-xl" />;
  }
  if (!property) {
    return (
      <Card className="mb-3 py-0">
        <CardContent className="p-4 text-sm text-muted-foreground">
          매물 정보를 불러오지 못했습니다. 희망 시간 등록은 계속 진행할 수
          있어요.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-3 overflow-hidden py-0">
      <CardContent className="flex items-center gap-4 p-3">
        {property.imageUrl && (
          <img
            src={property.imageUrl}
            alt={`${property.title} 매물 사진`}
            className="h-20 w-32 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge>{property.transactionType}</Badge>
            <Badge variant="secondary">{property.roomType}</Badge>
          </div>
          <h2 className="mt-2 font-semibold">{property.title}</h2>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-4" /> {property.sigungu} {property.dong}
            </span>
            <span className="flex items-center gap-1">
              <Home className="size-4" /> {property.area}㎡
              {property.rooms !== undefined && ` · 방 ${property.rooms}개`}
            </span>
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-xs text-muted-foreground">미팅 방식</p>
          <p className="mt-1 text-sm font-semibold">
            온라인 영상 투어 · 약 30분
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default BookingPage;
