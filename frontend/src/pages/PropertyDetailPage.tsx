import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageIcon,
  Pencil,
  Store,
  TrainFront,
  Trash2,
  WashingMachine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper";
import "swiper/css";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/api/error";
import { useToggleFavorite } from "@/hooks/queries/favoriteQueries";
import { usePropertyDetail } from "@/hooks/queries/propertyQueries";
import {
  formatManwonLabel,
  formatPrice,
  formatPriceLabel,
  toPyeong,
} from "@/lib/format";
import {
  FACILITY_CATEGORIES,
  getNearestFacilities,
  NEAREST_FACILITY_LIMIT,
} from "@/lib/nearbyFacilities";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { FacilityCategory, Memo, NearbyFacility } from "@/types";

// shadcn Textarea 미설치 → Input과 동일 토큰으로 스타일링한 로컬 textarea
function MemoTextarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      className="min-h-12 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      {...props}
    />
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

const FACILITY_META: Record<
  FacilityCategory,
  {
    icon: LucideIcon;
    color: string;
    markerColor: string;
    markerGlyph: string;
  }
> = {
  지하철: {
    icon: TrainFront,
    color: "bg-blue-50 text-blue-700",
    markerColor: "#2563eb",
    markerGlyph: "🚇",
  },
  편의점: {
    icon: Store,
    color: "bg-emerald-50 text-emerald-700",
    markerColor: "#059669",
    markerGlyph: "🏪",
  },
  빨래방: {
    icon: WashingMachine,
    color: "bg-violet-50 text-violet-700",
    markerColor: "#7c3aed",
    markerGlyph: "🧺",
  },
};

type KakaoPoint = object;
type KakaoMap = {
  panTo: (position: KakaoPoint) => void;
  setBounds: (bounds: { extend: (position: KakaoPoint) => void }) => void;
};
type KakaoSdk = {
  load: (callback: () => void) => void;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoPoint; level: number },
  ) => KakaoMap;
  LatLng: new (latitude: number, longitude: number) => KakaoPoint;
  LatLngBounds: new () => { extend: (position: KakaoPoint) => void };
  Marker: new (options: {
    map: KakaoMap;
    position: KakaoPoint;
    title: string;
  }) => object;
  CustomOverlay: new (options: {
    map: KakaoMap;
    position: KakaoPoint;
    content: HTMLElement;
    yAnchor: number;
  }) => object;
  event: {
    addListener: (target: object, type: "click", handler: () => void) => void;
  };
  services: {
    Status: { OK: string };
    SortBy: { DISTANCE: string };
    Geocoder: new () => {
      addressSearch: (
        address: string,
        callback: (
          result: Array<{ x: string; y: string }>,
          status: string,
        ) => void,
      ) => void;
    };
    Places: new () => {
      categorySearch: (
        categoryCode: string,
        callback: (
          result: Array<{
            id: string;
            place_name: string;
            distance: string;
            address_name: string;
            road_address_name: string;
            x: string;
            y: string;
          }>,
          status: string,
          pagination: {
            hasNextPage: boolean;
            nextPage: () => void;
          },
        ) => void,
        options: {
          location: KakaoPoint;
          radius: number;
          sort: string;
        },
      ) => void;
      keywordSearch: (
        keyword: string,
        callback: (
          result: Array<{
            id: string;
            place_name: string;
            distance: string;
            address_name: string;
            road_address_name: string;
            x: string;
            y: string;
          }>,
          status: string,
          pagination: {
            hasNextPage: boolean;
            nextPage: () => void;
          },
        ) => void,
        options: {
          location: KakaoPoint;
          radius: number;
          sort: string;
        },
      ) => void;
    };
  };
};

function getKakaoMaps() {
  return (window as Window & { kakao?: { maps: KakaoSdk } }).kakao?.maps;
}

let kakaoDetailMapLoader: Promise<void> | null = null;

function loadKakaoMap(appKey: string) {
  if (getKakaoMaps()) {
    return Promise.resolve();
  }
  if (kakaoDetailMapLoader) {
    return kakaoDetailMapLoader;
  }

  kakaoDetailMapLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services,clusterer`;
    script.async = true;
    script.onload = () => getKakaoMaps()?.load(resolve);
    script.onerror = () => reject(new Error("카카오맵을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });

  return kakaoDetailMapLoader;
}

function createMapPin({
  color,
  glyph,
  label,
  ariaLabel,
  onClick,
}: {
  color: string;
  glyph: string;
  label?: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", ariaLabel);
  Object.assign(button.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    border: "0",
    background: "transparent",
    cursor: "pointer",
    transition: "transform 160ms ease, filter 160ms ease",
    transformOrigin: "center bottom",
  });

  const pin = document.createElement("span");
  Object.assign(pin.style, {
    display: "grid",
    width: label ? "36px" : "32px",
    height: label ? "36px" : "32px",
    placeItems: "center",
    border: "3px solid white",
    borderRadius: "50% 50% 50% 0",
    background: color,
    boxShadow: "0 3px 9px rgba(15, 23, 42, 0.32)",
    transform: "rotate(-45deg)",
  });

  const icon = document.createElement("span");
  icon.textContent = glyph;
  Object.assign(icon.style, {
    display: "block",
    color: "white",
    fontSize: label ? "16px" : "14px",
    fontWeight: "800",
    lineHeight: "1",
    transform: "rotate(45deg)",
  });
  pin.append(icon);
  button.append(pin);

  if (label) {
    const caption = document.createElement("span");
    caption.textContent = label;
    caption.title = label;
    Object.assign(caption.style, {
      marginTop: "4px",
      maxWidth: "132px",
      overflow: "hidden",
      padding: "4px 8px",
      borderRadius: "9999px",
      background: "#0f172a",
      color: "white",
      fontSize: "11px",
      fontWeight: "700",
      lineHeight: "1",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      boxShadow: "0 1px 4px rgba(15, 23, 42, 0.24)",
    });
    button.append(caption);
  }

  button.addEventListener("click", onClick);
  return button;
}

function KakaoNearbyMap({
  address,
  propertyTitle,
  facilities,
  selectedId,
  onSelect,
}: {
  address: string;
  propertyTitle: string;
  facilities: NearbyFacility[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const positionsRef = useRef(new Map<string, KakaoPoint>());
  const markerElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const [mapError, setMapError] = useState<string | null>(null);
  const appKey = import.meta.env.VITE_KAKAO_KEY;

  useEffect(() => {
    const container = containerRef.current;
    const positions = positionsRef.current;
    const markerElements = markerElementsRef.current;
    if (!container || !appKey) {
      return;
    }

    let cancelled = false;
    setMapError(null);

    loadKakaoMap(appKey)
      .then(() => {
        const maps = getKakaoMaps();
        if (!maps || cancelled) {
          return;
        }

        const geocoder = new maps.services.Geocoder();
        geocoder.addressSearch(address, (result, status) => {
          if (cancelled) {
            return;
          }
          if (status !== maps.services.Status.OK || !result[0]) {
            setMapError("매물 위치를 지도에서 찾지 못했습니다.");
            return;
          }

          const latitude = Number(result[0].y);
          const longitude = Number(result[0].x);
          const center = new maps.LatLng(latitude, longitude);
          const map = new maps.Map(container, { center, level: 5 });
          const bounds = new maps.LatLngBounds();
          mapRef.current = map;
          positions.clear();
          positions.set("property", center);

          const propertyMarker = createMapPin({
            color: "#0f172a",
            glyph: "⌂",
            label: propertyTitle,
            ariaLabel: `${propertyTitle} 매물 위치`,
            onClick: () => {
              map.panTo(center);
              onSelect("property");
            },
          });
          markerElements.set("property", propertyMarker);

          new maps.CustomOverlay({
            map,
            position: center,
            content: propertyMarker,
            yAnchor: 1.35,
          });
          bounds.extend(center);

          facilities.forEach((facility, index) => {
            const angle =
              (index / Math.max(facilities.length, 1)) * Math.PI * 2;
            const latitudeOffset =
              (Math.cos(angle) * facility.distanceM) / 111_320;
            const longitudeOffset =
              (Math.sin(angle) * facility.distanceM) /
              (111_320 * Math.cos((latitude * Math.PI) / 180));
            const position =
              facility.latitude !== undefined &&
              facility.longitude !== undefined
                ? new maps.LatLng(facility.latitude, facility.longitude)
                : new maps.LatLng(
                    latitude + latitudeOffset,
                    longitude + longitudeOffset,
                  );

            const markerMeta = FACILITY_META[facility.category];
            const facilityMarker = createMapPin({
              color: markerMeta.markerColor,
              glyph: markerMeta.markerGlyph,
              ariaLabel: `${facility.name}, 도보 ${facility.walkingMinutes}분`,
              onClick: () => {
                map.panTo(position);
                onSelect(facility.id);
              },
            });
            facilityMarker.title = `${facility.name} · 도보 ${facility.walkingMinutes}분`;
            markerElements.set(facility.id, facilityMarker);

            new maps.CustomOverlay({
              map,
              position,
              content: facilityMarker,
              yAnchor: 0.5,
            });
            positions.set(facility.id, position);
            bounds.extend(position);
          });

          map.setBounds(bounds);
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapError(
            error instanceof Error
              ? error.message
              : "카카오맵을 불러오지 못했습니다.",
          );
        }
      });

    return () => {
      cancelled = true;
      mapRef.current = null;
      positions.clear();
      markerElements.clear();
      container.replaceChildren();
    };
  }, [address, appKey, facilities, onSelect, propertyTitle]);

  useEffect(() => {
    const position = positionsRef.current.get(selectedId);
    if (position) {
      mapRef.current?.panTo(position);
    }
    markerElementsRef.current.forEach((element, id) => {
      const selected = id === selectedId;
      element.style.transform = selected ? "scale(1.16)" : "scale(1)";
      element.style.filter = selected ? "none" : "saturate(0.82)";
      element.style.zIndex = selected ? "2" : "1";
    });
  }, [selectedId]);

  const selectedFacility = facilities.find(
    (facility) => facility.id === selectedId,
  );

  return (
    <div
      className="relative h-56 overflow-hidden rounded-xl border bg-muted"
      aria-label={`${propertyTitle} 주변 카카오맵`}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {(!appKey || mapError) && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-muted p-6 text-center">
          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <p className="font-semibold">카카오맵을 표시할 수 없습니다</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {mapError ?? "카카오맵 API 키를 확인해 주세요."}
            </p>
          </div>
        </div>
      )}
      {!mapError && selectedFacility && (
        <button
          type="button"
          className="absolute bottom-2 left-2 right-2 z-10 rounded-lg border bg-background/95 px-3 py-2 text-left text-xs shadow-md"
          onClick={() => {
            const position = positionsRef.current.get(selectedId);
            if (position) {
              mapRef.current?.panTo(position);
            }
          }}
        >
          <span className="block font-semibold">{selectedFacility.name}</span>
          <span className="mt-0.5 block truncate text-muted-foreground">
            {selectedFacility.direction} · 도보{" "}
            {selectedFacility.walkingMinutes}분
          </span>
        </button>
      )}
    </div>
  );
}

const KAKAO_CATEGORY_CODES: Partial<Record<FacilityCategory, string>> = {
  지하철: "SW8",
  편의점: "CS2",
};

function useNearbyFacilities(address: string, category: FacilityCategory) {
  const [result, setResult] = useState<{
    category: FacilityCategory;
    facilities: NearbyFacility[];
  } | null>(null);
  const [searchError, setSearchError] = useState<{
    category: FacilityCategory;
    message: string;
  } | null>(null);
  const appKey = import.meta.env.VITE_KAKAO_KEY;

  useEffect(() => {
    if (!appKey) {
      setSearchError({
        category,
        message: "카카오맵 API 키를 확인해 주세요.",
      });
      return;
    }

    let cancelled = false;
    loadKakaoMap(appKey)
      .then(() => {
        const maps = getKakaoMaps();
        if (!maps || cancelled) {
          return;
        }

        const geocoder = new maps.services.Geocoder();
        geocoder.addressSearch(address, (addressResult, addressStatus) => {
          if (
            cancelled ||
            addressStatus !== maps.services.Status.OK ||
            !addressResult[0]
          ) {
            setSearchError({
              category,
              message: "매물 주변의 시설을 찾지 못했습니다.",
            });
            return;
          }

          const center = new maps.LatLng(
            Number(addressResult[0].y),
            Number(addressResult[0].x),
          );
          const places = new maps.services.Places();
          const handleSearch = (
            placesResult: Array<{
              id: string;
              place_name: string;
              distance: string;
              address_name: string;
              road_address_name: string;
              x: string;
              y: string;
            }>,
            status: string,
          ) => {
            if (cancelled) {
              return;
            }
            if (status !== maps.services.Status.OK) {
              setSearchError({
                category,
                message: `주변 ${category} 검색에 실패했습니다.`,
              });
              return;
            }

            setResult({
              category,
              facilities: placesResult
                .map((place) => {
                  const distanceM = Number(place.distance);
                  return {
                    id: `kakao-${category}-${place.id}`,
                    category,
                    name: place.place_name,
                    distanceM,
                    walkingMinutes: Math.max(1, Math.ceil(distanceM / 67)),
                    direction: "매물에서 가까운 순",
                    address: place.road_address_name || place.address_name,
                    latitude: Number(place.y),
                    longitude: Number(place.x),
                  };
                })
                .filter((facility) => facility.distanceM <= 5_000)
                .sort((a, b) => a.distanceM - b.distanceM)
                .slice(0, NEAREST_FACILITY_LIMIT),
            });
            setSearchError(null);
          };
          const searchOptions = {
            location: center,
            radius: 5_000,
            sort: maps.services.SortBy.DISTANCE,
          };

          if (category === "빨래방") {
            places.keywordSearch("셀프빨래방", handleSearch, searchOptions);
            return;
          }

          const categoryCode = KAKAO_CATEGORY_CODES[category];
          if (categoryCode) {
            places.categorySearch(categoryCode, handleSearch, searchOptions);
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSearchError({
            category,
            message: `주변 ${category} 검색에 실패했습니다.`,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, appKey, category]);

  return {
    facilities: result?.category === category ? result.facilities : null,
    error: searchError?.category === category ? searchError.message : null,
  };
}

function NearbyFacilitiesSection({
  facilities,
  propertyTitle,
  propertyAddress,
}: {
  facilities: NearbyFacility[];
  propertyTitle: string;
  propertyAddress: string;
}) {
  const [category, setCategory] = useState<FacilityCategory>("지하철");
  const [selectedId, setSelectedId] = useState("property");
  const { facilities: searchedFacilities, error: facilitySearchError } =
    useNearbyFacilities(propertyAddress, category);
  const filtered = useMemo(
    () => getNearestFacilities(searchedFacilities ?? facilities, category),
    [category, facilities, searchedFacilities],
  );

  return (
    <Card className="gap-3 overflow-hidden py-4">
      <CardHeader className="gap-0 px-4">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="text-base">주변 편의시설</CardTitle>
          <p className="text-xs text-muted-foreground">
            카테고리별 가까운 {NEAREST_FACILITY_LIMIT}곳
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-1.5" aria-label="시설 종류">
          {FACILITY_CATEGORIES.map((item) => (
            <Button
              key={item}
              type="button"
              variant={category === item ? "default" : "outline"}
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs"
              aria-pressed={category === item}
              onClick={() => {
                setCategory(item);
                setSelectedId("property");
              }}
            >
              {item}
            </Button>
          ))}
        </div>

        <KakaoNearbyMap
          address={propertyAddress}
          propertyTitle={propertyTitle}
          facilities={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {searchedFacilities === null && !facilitySearchError && (
          <p className="text-xs text-muted-foreground">
            반경 5km 내 {category}을 찾고 있어요.
          </p>
        )}
        {facilitySearchError && (
          <p className="text-xs text-destructive" role="alert">
            {facilitySearchError}
          </p>
        )}

        {filtered.length === 0 && searchedFacilities !== null && (
          <p className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
            반경 5km 내 {category} 정보를 찾지 못했습니다.
          </p>
        )}

        <ol className="grid min-h-0 flex-1 gap-2 sm:grid-cols-3">
          {filtered.map((facility, index) => {
            const meta = FACILITY_META[facility.category];
            return (
              <li key={facility.id}>
                <button
                  type="button"
                  className={cn(
                    "flex h-full w-full items-center gap-2 rounded-xl border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedId === facility.id && "border-primary bg-primary/5",
                  )}
                  onClick={() => setSelectedId(facility.id)}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      meta.color,
                    )}
                  >
                    <span className="text-xs font-bold">{index + 1}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {facility.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {facility.distanceM}m · 도보 {facility.walkingMinutes}분
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-muted-foreground">
          도보 시간은 실제 경로에 따라 달라질 수 있어요.
        </p>
      </CardContent>
    </Card>
  );
}

function formatMemoDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface MemoSectionProps {
  memos: Memo[];
  onAdd: (text: string) => void;
  onUpdate: (memoId: number, text: string) => void;
  onDelete: (memoId: number) => void;
}

// MEMO-01~04: 메모 작성·조회·수정·삭제
function MemoSection({ memos, onAdd, onUpdate, onDelete }: MemoSectionProps) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    onAdd(text);
    setDraft("");
  };

  const startEdit = (memo: Memo) => {
    setEditingId(memo.id);
    setEditText(memo.text);
  };

  const submitEdit = () => {
    const text = editText.trim();
    if (!text || editingId === null) {
      return;
    }
    onUpdate(editingId, text);
    setEditingId(null);
  };

  return (
    <Card className="gap-2 py-3">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">메모</CardTitle>
          <span className="text-xs text-muted-foreground">
            {memos.length}개
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        {memos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            작성한 메모가 없습니다.
          </p>
        ) : (
          <ul className="max-h-24 space-y-1.5 overflow-y-auto">
            {memos.map((memo) => (
              <li key={memo.id} className="rounded-md border bg-muted/40 p-2">
                {editingId === memo.id ? (
                  <div className="flex flex-col gap-2">
                    <MemoTextarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      aria-label="메모 수정"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </Button>
                      <Button
                        size="sm"
                        onClick={submitEdit}
                        disabled={!editText.trim()}
                      >
                        저장
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="line-clamp-2 text-xs whitespace-pre-wrap">
                      {memo.text}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {formatMemoDate(memo.createdAt)}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="메모 수정"
                          onClick={() => startEdit(memo)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          aria-label="메모 삭제"
                          onClick={() => onDelete(memo.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <MemoTextarea
            placeholder="이 매물에 대한 메모를 남겨보세요"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="메모 작성"
          />
          <Button
            className="h-7 self-end px-3 text-xs"
            size="sm"
            onClick={submitDraft}
            disabled={!draft.trim()}
          >
            메모 작성
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// PROP-08·09 중개사 전용 수정·삭제 — 삭제는 확인 다이얼로그를 거친다
function BrokerActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  // 삭제에 실패하면 다이얼로그를 닫지 않고 이유를 보여준다 (성공하면 상위가 목록으로 이동)
  const requestDelete = () =>
    startDelete(async () => {
      try {
        setDeleteError(null);
        await onDelete();
      } catch (failure) {
        setDeleteError(
          isApiError(failure)
            ? failure.message
            : "매물을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    });

  return (
    <div className="ml-auto flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil />
        수정
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/5 hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 />
        삭제
      </Button>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>매물을 삭제하시겠어요?</DialogTitle>
            <DialogDescription>
              삭제하면 매물 정보와 연결된 예약, 세입자가 저장한 매물에서 함께
              사라지며 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeleteOpen(false)}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={requestDelete}
            >
              {isDeleting ? "삭제 중..." : "삭제하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PhotoCarouselProps {
  title: string;
  imageUrls: string[];
  onPhotoClick: (url: string) => void;
}

// 매물 사진 인라인 캐러셀 — 스와이프·좌우 버튼으로 넘기고, 사진 클릭 시 크게 보기
function PhotoCarousel({ title, imageUrls, onPhotoClick }: PhotoCarouselProps) {
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="relative">
      {/* loop: 마지막 사진에서 다음 → 첫 사진, 첫 사진에서 이전 → 마지막 사진 */}
      <Swiper
        loop={imageUrls.length > 1}
        onSwiper={setSwiper}
        onSlideChange={(instance) => setActiveIndex(instance.realIndex)}
      >
        {imageUrls.map((url, index) => (
          <SwiperSlide key={url}>
            <button
              type="button"
              className="block w-full cursor-zoom-in"
              aria-label={`${title} 사진 ${index + 1} 크게 보기`}
              onClick={() => onPhotoClick(url)}
            >
              <img
                src={url}
                alt={`${title} 사진 ${index + 1}`}
                className="h-52 w-full object-cover"
              />
            </button>
          </SwiperSlide>
        ))}
      </Swiper>
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full opacity-80 hover:opacity-100"
        aria-label="이전 사진"
        onClick={() => swiper?.slidePrev()}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full opacity-80 hover:opacity-100"
        aria-label="다음 사진"
        onClick={() => swiper?.slideNext()}
      >
        <ChevronRight />
      </Button>
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
        {imageUrls.map((url, index) => (
          <button
            key={url}
            type="button"
            aria-label={`${index + 1}번째 사진 보기`}
            aria-current={index === activeIndex}
            className={cn(
              "size-2 rounded-full transition-colors",
              index === activeIndex
                ? "bg-white"
                : "bg-white/50 hover:bg-white/70",
            )}
            onClick={() => swiper?.slideToLoop(index)}
          />
        ))}
      </div>
    </div>
  );
}

interface PhotoDialogProps {
  title: string;
  photoUrl: string | null;
  onClose: () => void;
}

// 캐러셀에서 클릭한 사진 한 장을 크게 보여주는 모달
function PhotoDialog({ title, photoUrl, onClose }: PhotoDialogProps) {
  return (
    <Dialog
      open={photoUrl !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {/* 기본 grid 레이아웃에선 원본 크기 이미지가 트랙을 밀어내므로 flex로 폭을 고정 */}
      <DialogContent className="flex flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>매물 사진</DialogTitle>
          <DialogDescription className="sr-only">
            {title} 사진을 크게 보여줍니다.
          </DialogDescription>
        </DialogHeader>
        {photoUrl && (
          <img
            src={photoUrl}
            alt={`${title} 사진 크게 보기`}
            className="max-h-[70svh] w-full rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-7 w-1/2" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    </div>
  );
}

interface PropertyDetailPageProps {
  propertyId: number;
  canManage: boolean;
  onBack: () => void;
  onReserve: (id: number) => void;
  onEdit: () => void;
  // 삭제 실패를 다이얼로그에서 알려야 하므로 완료를 기다릴 수 있게 Promise를 받는다
  onDelete: () => Promise<void>;
  memos: Memo[];
  onAddMemo: (text: string) => void;
  onUpdateMemo: (memoId: number, text: string) => void;
  onDeleteMemo: (memoId: number) => void;
}

// PAGE-05 매물 상세 — 매물 정보(PROP-03, GET /api/properties/{id}), 저장(PROP-04·05), 예약,
// 메모(MEMO-01~04), 중개사 전용 수정·삭제(PROP-08·09)
function PropertyDetailPage({
  propertyId,
  canManage,
  onBack,
  onReserve,
  onEdit,
  onDelete,
  memos,
  onAddMemo,
  onUpdateMemo,
  onDeleteMemo,
}: PropertyDetailPageProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const {
    data: property,
    isPending,
    error,
    refetch,
  } = usePropertyDetail(propertyId);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { mutate: toggleFavorite, isError: isSaveError } = useToggleFavorite();

  // 저장은 로그인 사용자만 가능 — 비로그인 상태에서는 401 대신 로그인 화면으로 보낸다
  const handleToggleSave = (propertyId: number, saved: boolean) => {
    if (!user) {
      navigate("/login");
      return;
    }
    toggleFavorite({ propertyId, saved });
  };

  const priceLabel = property
    ? { 매매: "매매가", 전세: "전세 보증금", 월세: "보증금 / 월세" }[
        property.transactionType
      ]
    : "";
  const price = property && {
    dealType: property.transactionType,
    deposit: property.deposit,
    monthlyRent: property.monthlyRent,
  };

  const photoUrls =
    property?.imageUrls ?? (property?.imageUrl ? [property.imageUrl] : []);
  const isNotFound = isApiError(error) && error.status === 404;

  return (
    <div className="min-h-svh bg-background">
      {/* top-14: 공통 GNB(h-14) 아래에 고정 */}
      <header className="sticky top-14 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="목록으로"
            onClick={onBack}
          >
            <ChevronLeft />
          </Button>
          <h1 className="text-lg font-semibold">매물 상세</h1>
          {canManage && property && (
            <BrokerActions onEdit={onEdit} onDelete={onDelete} />
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        {isPending ? (
          <DetailSkeleton />
        ) : !property ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="font-medium">
              {isNotFound
                ? "매물을 찾을 수 없습니다"
                : "매물 정보를 불러오지 못했습니다"}
            </p>
            {isNotFound ? (
              <Button variant="outline" size="sm" onClick={onBack}>
                목록으로 돌아가기
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                다시 시도
              </Button>
            )}
          </div>
        ) : (
          <>
            <Card className="gap-0 overflow-hidden py-0">
              {photoUrls.length > 0 ? (
                <PhotoCarousel
                  title={property.title}
                  imageUrls={photoUrls}
                  onPhotoClick={setSelectedPhoto}
                />
              ) : (
                <div
                  aria-hidden
                  className="grid h-64 w-full place-items-center bg-muted"
                >
                  <ImageIcon className="size-10 text-muted-foreground" />
                </div>
              )}
              <CardHeader className="pt-4">
                <div className="flex items-center gap-1.5">
                  <Badge>{property.transactionType}</Badge>
                  <Badge variant="secondary">{property.roomType}</Badge>
                  {property.status && (
                    <Badge variant="outline">{property.status}</Badge>
                  )}
                </div>
                <CardTitle className="text-xl">{property.title}</CardTitle>
              </CardHeader>
              <CardContent className="pb-6">
                <p className="text-3xl font-bold text-primary">
                  {price && formatPriceLabel(price)}
                </p>
                <dl className="mt-4 divide-y">
                  <InfoRow label={priceLabel}>
                    {price && formatPrice(price)}
                  </InfoRow>
                  <InfoRow label="위치">
                    {property.sigungu} {property.dong}
                  </InfoRow>
                  {property.roadAddress && (
                    <InfoRow label="주소">{property.roadAddress}</InfoRow>
                  )}
                  {property.complexName && (
                    <InfoRow label="단지명">{property.complexName}</InfoRow>
                  )}
                  {property.area !== undefined && (
                    <InfoRow label="전용면적">
                      {property.area}㎡ ({toPyeong(property.area)}평)
                    </InfoRow>
                  )}
                  {property.floor !== undefined && (
                    <InfoRow label="층수">
                      {property.floor}층
                      {property.totalFloor
                        ? ` / 전체 ${property.totalFloor}층`
                        : ""}
                    </InfoRow>
                  )}
                  {property.rooms !== undefined && (
                    <InfoRow label="방 개수">방{property.rooms}</InfoRow>
                  )}
                  {property.maintenanceFee !== undefined && (
                    <InfoRow label="관리비">
                      {formatManwonLabel(property.maintenanceFee)}
                    </InfoRow>
                  )}
                  {property.builtYear !== undefined && (
                    <InfoRow label="준공연도">{property.builtYear}년</InfoRow>
                  )}
                </dl>
                {property.description && (
                  <div className="mt-6 border-t pt-4">
                    <h2 className="text-sm font-semibold">상세 설명</h2>
                    <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                      {property.description}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {isSaveError && (
              <p role="alert" className="text-sm text-destructive">
                저장 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1"
                aria-pressed={property.saved}
                onClick={() =>
                  handleToggleSave(property.propertyId, !property.saved)
                }
              >
                <Heart
                  className={
                    property.saved
                      ? "fill-primary text-primary"
                      : "text-muted-foreground"
                  }
                />
                {property.saved ? "저장됨" : "저장"}
              </Button>
              <Button
                className="h-11 flex-1"
                onClick={() => onReserve(property.propertyId)}
              >
                <CalendarPlus />
                미팅 예약
              </Button>
            </div>

            <NearbyFacilitiesSection
              facilities={property.nearbyFacilities ?? []}
              propertyTitle={property.title}
              propertyAddress={
                property.roadAddress ?? `${property.sigungu} ${property.dong}`
              }
            />

            <MemoSection
              memos={memos}
              onAdd={onAddMemo}
              onUpdate={onUpdateMemo}
              onDelete={onDeleteMemo}
            />

            <PhotoDialog
              title={property.title}
              photoUrl={selectedPhoto}
              onClose={() => setSelectedPhoto(null)}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default PropertyDetailPage;
