import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePropertyFilterOptions } from "@/hooks/queries/propertyQueries";
import { parseRegionQuery } from "@/lib/regionSearch";
import { cn } from "@/lib/utils";

// 드롭다운(Viewport)을 약 5개 높이로 제한하고 초과분은 스크롤 (항목 1개 ≈ 32px).
// popper 모드 기본 Viewport의 고정 높이(h-[trigger-height])는 h-auto로 무력화하고,
// max-height는 important(!)로 radix 인라인 스타일보다 우선 적용.
const dropdownViewportClass = "h-auto max-h-[168px]!";

// 히어로 검색창 — 클릭 시 하얀 패널이 아래로 펼쳐지고 지역을 고른다 (매물이 등록된 시군구 목록).
// 검색하면 선택 지역과 키워드를 /properties?sigungu=&query=로 넘긴다 (역 이름 검색은 백엔드 미지원).
function HeroSearch() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: filterOptions } = usePropertyFilterOptions();

  const [open, setOpen] = useState(false);
  const [gu, setGu] = useState("");
  const [keyword, setKeyword] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);

  // 검색 영역 밖을 클릭하면 패널을 닫는다 (Select 드롭다운·모달 등 radix 포털은 예외).
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) {
        return;
      }
      if (rootRef.current?.contains(target)) {
        return;
      }
      const el = target instanceof Element ? target : target.parentElement;
      if (
        el?.closest(
          "[data-radix-popper-content-wrapper],[data-slot='select-content'],[data-slot='dialog-content'],[data-slot='dialog-overlay']",
        )
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const handleSearch = () => {
    // 지역·검색어 중 하나만 있어도 검색 — 둘 다 없을 때만 안내
    if (!gu && !keyword.trim()) {
      setAlertOpen(true);
      return;
    }

    // "서울시 강남구 역삼동" 같은 입력은 시군구 필터와 나머지 검색어로 분리한다.
    // sigungu 값은 목록 필터·백엔드와 같은 "강남구" 형태 (시/도 표기는 버린다)
    const parsed = parseRegionQuery(keyword);
    const params = new URLSearchParams();
    const sigungu = gu || parsed.sigungu;
    if (sigungu) {
      params.set("sigungu", sigungu);
    }
    if (parsed.query) {
      params.set("query", parsed.query);
    }
    navigate(`/properties?${params}`);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="rounded-[1.5rem] border border-white/15 bg-white/10 p-2 backdrop-blur-xl">
        <div className="overflow-hidden rounded-[1.1rem] bg-white text-slate-900">
          {/* 검색 트리거 행 */}
          <div className="flex items-center gap-3 p-3">
            <Search className="ml-1 size-5 shrink-0 text-slate-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                // 한글 조합 중 Enter는 무시 — 조합 확정용 keydown이 검색을 실행하지 않게
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  handleSearch();
                }
              }}
              placeholder="지역·매물명 검색 (예: 서울시 강남구 역삼동)"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              aria-label={open ? "검색 옵션 접기" : "검색 옵션 펼치기"}
              onClick={() => setOpen((v) => !v)}
              className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600"
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </div>

          {/* 펼쳐지는 하얀 패널 */}
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-2 border-t border-slate-100 p-4">
                <Select value={gu || undefined} onValueChange={setGu}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="지역 선택" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    viewportClassName={dropdownViewportClass}
                  >
                    {filterOptions?.sigungus.map((sigungu) => (
                      <SelectItem key={sigungu} value={sigungu}>
                        {sigungu}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button className="w-full rounded-xl" onClick={handleSearch}>
                  <Search /> 검색
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 필수 입력 안내 모달 */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>검색 조건이 필요해요</DialogTitle>
            <DialogDescription>
              지역을 선택하거나 검색어를 입력해 주세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAlertOpen(false)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default HeroSearch;
