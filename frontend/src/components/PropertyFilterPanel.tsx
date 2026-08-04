import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEAL_TYPES,
  MONTHLY_DEPOSIT_BANDS,
  PRICE_BANDS,
  ROOM_TYPES,
} from "@/data/properties";
import { usePropertyFilterOptions } from "@/hooks/queries/propertyQueries";
import type { Filters } from "@/types";

export const DEFAULT_FILTERS: Filters = {
  query: "",
  dealType: "all",
  region: "all",
  price: "all",
  rent: "all",
  buildingType: "all",
};

// 검색어는 지도 위 검색창이 따로 소유하므로 필터 개수·초기화 대상에서 제외한다
const PANEL_FIELD_KEYS = [
  "dealType",
  "region",
  "price",
  "buildingType",
] as const;

// "+ 필터" 버튼에 붙는 뱃지 숫자 — 몇 개를 좁혀 놓았는지 패널을 열지 않고도 알 수 있게 한다
export function countActiveFilters(filters: Filters) {
  return PANEL_FIELD_KEYS.filter((key) => filters[key] !== "all").length;
}

export function resetPanelFilters(filters: Filters): Filters {
  return { ...DEFAULT_FILTERS, query: filters.query };
}

interface FilterOption {
  value: string;
  label: string;
}

interface FilterField {
  key: "region" | "price" | "buildingType";
  title: string;
  options: FilterOption[];
}

const ALL_REGIONS_OPTION: FilterOption = { value: "all", label: "지역 전체" };

// 유형 선택지는 백엔드 roomType enum이 받는 값만 노출한다
const ROOM_TYPE_OPTIONS: FilterOption[] = [
  { value: "all", label: "유형 전체" },
  ...ROOM_TYPES.map((type) => ({ value: type, label: type })),
];

// 지역은 매물이 등록된 시군구만 보여준다 — 특정 지역으로 한정하지 않고 백엔드 목록을 그대로 쓴다.
// 랜딩 검색·목록 로딩 중이라 목록에 없는 지역이 선택돼 있으면 선택 상태가 보이도록 덧붙인다
function getRegionOptions(region: string, sigungus: string[]): FilterOption[] {
  const options = [
    ALL_REGIONS_OPTION,
    ...sigungus.map((sigungu) => ({ value: sigungu, label: sigungu })),
  ];
  if (region === "all" || options.some((option) => option.value === region)) {
    return options;
  }
  return [...options, { value: region, label: region }];
}

// 월세 탭에서 가격 축은 매매가가 아니라 보증금 구간이 된다
function getFilterFields(
  dealType: string,
  region: string,
  sigungus: string[],
): FilterField[] {
  const isMonthlyRent = dealType === "월세";

  return [
    {
      key: "region",
      title: "지역",
      options: getRegionOptions(region, sigungus),
    },
    {
      key: "price",
      title: isMonthlyRent ? "보증금" : "가격",
      options: isMonthlyRent ? MONTHLY_DEPOSIT_BANDS : PRICE_BANDS,
    },
    { key: "buildingType", title: "유형", options: ROOM_TYPE_OPTIONS },
  ];
}

interface FilterRowProps {
  title: string;
  children: ReactNode;
}

function FilterRow({ title, children }: FilterRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-sm text-muted-foreground">
        {title}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

interface PropertyFilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  resultCount?: number;
}

// 지도 위 "+ 필터" 버튼이 여는 패널의 본문. 데스크탑에서는 카드, 모바일에서는 바텀시트가
// 이 컴포넌트를 감싼다. 값은 고르는 즉시 적용되고, 결과 건수가 바로 아래에서 갱신된다
function PropertyFilterPanel({
  filters,
  onChange,
  resultCount,
}: PropertyFilterPanelProps) {
  const { data: filterOptions } = usePropertyFilterOptions();
  const fields = getFilterFields(
    filters.dealType,
    filters.region,
    filterOptions?.sigungus ?? [],
  );
  const activeCount = countActiveFilters(filters);

  const set = (key: keyof Filters) => (value: string) =>
    onChange({ ...filters, [key]: value });

  // 거래유형이 바뀌면 가격 축 의미가 달라지므로 가격 구간을 초기화한다
  const changeDealType = (dealType: string) =>
    onChange({ ...filters, dealType, price: "all", rent: "all" });

  return (
    <div className="flex flex-col gap-4">
      <FilterRow title="거래유형">
        <Tabs value={filters.dealType} onValueChange={changeDealType}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">전체</TabsTrigger>
            {DEAL_TYPES.map((dealType) => (
              <TabsTrigger key={dealType} value={dealType}>
                {dealType}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </FilterRow>

      {fields.map((field) => (
        <FilterRow key={field.key} title={field.title}>
          <Select value={filters[field.key]} onValueChange={set(field.key)}>
            <SelectTrigger
              className="w-full"
              aria-label={`${field.title} 필터`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterRow>
      ))}

      <div className="flex items-center justify-between border-t pt-3">
        <p className="text-sm text-muted-foreground">
          {resultCount === undefined ? (
            "매물을 세는 중"
          ) : (
            <>
              조건에 맞는 매물{" "}
              <span className="font-semibold text-foreground">
                {resultCount}
              </span>
              건
            </>
          )}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={activeCount === 0}
          onClick={() => onChange(resetPanelFilters(filters))}
        >
          <RotateCcw />
          초기화
        </Button>
      </div>
    </div>
  );
}

export default PropertyFilterPanel;
