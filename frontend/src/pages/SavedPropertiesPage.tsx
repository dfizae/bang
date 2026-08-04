import { useState } from "react";
import { Heart, HeartOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

import PropertyCard, { toPropertyCardItem } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useFavoritePropertyList,
  useToggleFavorite,
} from "@/hooks/queries/favoriteQueries";

const PAGE_SIZE = 12;
const SKELETON_COUNT = 6;

function SavedPropertyCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="h-44 w-full rounded-none" />
      <CardHeader className="px-5 pt-5">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-11 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-5 w-2/3" />
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-3 h-4 w-24" />
        <Skeleton className="mt-2 h-4 w-40" />
      </CardContent>
    </Card>
  );
}

// PAGE-06 저장 매물 — 저장한 매물 조회(PROP-06)와 저장 취소(PROP-05).
// 저장 목록은 서버가 페이지 단위로 내려주므로 페이지 이동만 화면 상태로 들고 있다.
function SavedPropertiesPage() {
  const [page, setPage] = useState(0);
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useFavoritePropertyList({
    page,
    size: PAGE_SIZE,
  });
  const { mutate: toggleFavorite } = useToggleFavorite();

  return (
    <main className="mx-auto min-h-[calc(100svh-3.5rem)] max-w-6xl px-4 py-8">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Heart />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">관심 매물</h1>
          {isPending ? (
            <Skeleton className="mt-1 h-5 w-48" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {isError
                ? "목록을 불러오지 못했습니다."
                : `저장한 매물 ${data.totalElements}건을 모아봤어요.`}
            </p>
          )}
        </div>
      </div>

      {isPending ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <SavedPropertyCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="font-medium">관심 매물을 불러오지 못했습니다</p>
          <p className="text-sm text-muted-foreground">
            잠시 후 다시 시도해 주세요.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        </div>
      ) : data.content.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <HeartOff className="size-10 text-muted-foreground" />
          <p className="font-medium">저장한 매물이 없습니다</p>
          <p className="text-sm text-muted-foreground">
            마음에 드는 매물의 하트를 눌러 저장해 보세요.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/properties")}
          >
            매물 보러가기
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.content.map((property) => (
              <PropertyCard
                key={property.propertyId}
                property={toPropertyCardItem(property)}
                onToggleSave={(propertyId) =>
                  toggleFavorite({ propertyId, saved: !property.saved })
                }
                onOpen={(propertyId) => navigate(`/properties/${propertyId}`)}
              />
            ))}
          </div>
          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={data.first}
                onClick={() => setPage((current) => current - 1)}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {data.number + 1} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.last}
                onClick={() => setPage((current) => current + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default SavedPropertiesPage;
