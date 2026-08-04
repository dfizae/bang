import { Heart, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, toPyeong } from "@/lib/format";
import type { DealType, PropertySummary, RoomType } from "@/types";

// 목록 카드가 그리는 필드만 추린 뷰모델 — 매물 API 응답과 목데이터 어느 쪽에서든 만든다.
// 면적·층은 API에서 선택 값이라 없으면 해당 줄을 생략한다
export interface PropertyCardItem {
  id: number;
  title: string;
  dealType: DealType;
  roomType: RoomType;
  region: string;
  dong: string;
  deposit: number;
  monthlyRent: number;
  area?: number;
  floor?: number;
  totalFloor?: number;
  imageUrl?: string;
  saved: boolean;
}

// 매물 목록 응답 → 카드 뷰모델 (사진이 없는 매물은 imageUrl 없이 플레이스홀더를 그린다)
export function toPropertyCardItem(summary: PropertySummary): PropertyCardItem {
  return {
    id: summary.propertyId,
    title: summary.title,
    dealType: summary.transactionType,
    roomType: summary.roomType,
    region: summary.sigungu,
    dong: summary.dong,
    deposit: summary.deposit,
    monthlyRent: summary.monthlyRent,
    area: summary.area,
    floor: summary.floor,
    totalFloor: summary.totalFloor,
    imageUrl: summary.imageUrl,
    saved: summary.saved,
  };
}

interface PropertyCardProps {
  property: PropertyCardItem;
  onToggleSave: (id: number) => void;
  onOpen: (id: number) => void;
}

// PROP-02 목록 카드. 저장 토글(PROP-04·05)은 onToggleSave로, 상세 이동(PROP-03)은 onOpen으로 위임.
function PropertyCard({ property, onToggleSave, onOpen }: PropertyCardProps) {
  const {
    title,
    dealType,
    roomType,
    region,
    dong,
    area,
    floor,
    totalFloor,
    imageUrl,
    saved,
  } = property;

  const specs = [
    area !== undefined ? `${area}㎡(${toPyeong(area)}평)` : null,
    floor !== undefined
      ? totalFloor
        ? `${floor}/${totalFloor}층`
        : `${floor}층`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="group relative gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50">
      <div className="relative h-44 overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${title} 매물 사진`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span aria-hidden className="grid h-full w-full place-items-center">
            <ImageIcon className="size-8 text-muted-foreground" />
          </span>
        )}
      </div>
      <CardHeader className="px-5 pt-5">
        <div className="flex items-center gap-1.5">
          <Badge>{dealType}</Badge>
          <Badge variant="secondary">{roomType}</Badge>
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <p className="text-xl font-bold text-primary">
          {formatPrice(property)}
        </p>
        <p className="mt-2 text-sm text-foreground">
          {region} {dong}
        </p>
        {specs && <p className="mt-1 text-sm text-muted-foreground">{specs}</p>}
      </CardContent>

      {/* 카드 전체를 덮는 상세 이동 버튼 — 저장 버튼만 그 위로 올려 따로 누를 수 있게 한다 */}
      <button
        type="button"
        className="absolute inset-0 outline-none"
        aria-label={`${title} 상세 보기`}
        onClick={() => onOpen(property.id)}
      />
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-3 right-3 z-10 bg-white/95 shadow-sm"
        aria-label={saved ? "매물 저장 취소" : "매물 저장"}
        aria-pressed={saved}
        onClick={() => onToggleSave(property.id)}
      >
        <Heart
          className={
            saved ? "fill-primary text-primary" : "text-muted-foreground"
          }
        />
      </Button>
    </Card>
  );
}

export default PropertyCard;
