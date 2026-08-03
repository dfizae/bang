import type { DealType } from "@/types";

// 가격 표기에 필요한 필드만 추린 입력 (목록 카드·상세 어느 쪽에서든 만든다)
interface PriceInput {
  dealType: DealType;
  deposit: number;
  monthlyRent: number;
}

// 금액(만원 단위)을 "8억 2,000" / "5,000" 형태로 변환
export function formatManwon(man: number) {
  const eok = Math.floor(man / 10000);
  const rest = man % 10000;
  if (eok > 0 && rest > 0) {
    return `${eok}억 ${rest.toLocaleString()}`;
  }
  if (eok > 0) {
    return `${eok}억`;
  }
  return rest.toLocaleString();
}

// 가격 표기 (거래유형은 뱃지·라벨로 별도 표시하므로 숫자만 반환, 단위는 만원)
// 전세·매매: "5억 5,000" / 월세: "1,000/65" (보증금/월세)
export function formatPrice({ dealType, deposit, monthlyRent }: PriceInput) {
  if (dealType === "월세") {
    return `${formatManwon(deposit)}/${formatManwon(monthlyRent)}`;
  }
  return formatManwon(deposit);
}

// 만원 금액을 "9억 2,000만원"·"9억"·"5,000만원" 완결 표기로 변환 (폼 미리보기용)
export function formatManwonLabel(man: number) {
  const hasManwonTail = man % 10000 !== 0 || man < 10000;
  return hasManwonTail ? `${formatManwon(man)}만원` : formatManwon(man);
}

// 상세 페이지 대표 가격 — 만원 단위 숫자로 끝나면 "만"을 붙인다
// 전세·매매: "5억 5,000만" / "9억" / 월세: "2,000/90만"
export function formatPriceLabel({
  dealType,
  deposit,
  monthlyRent,
}: PriceInput) {
  if (dealType === "월세") {
    return `${formatManwon(deposit)}/${formatManwon(monthlyRent)}만`;
  }
  const endsWithEok = deposit % 10000 === 0 && deposit >= 10000;
  return endsWithEok ? formatManwon(deposit) : `${formatManwon(deposit)}만`;
}

// 전용면적 → 평 (반올림 1자리)
export function toPyeong(m2: number) {
  return Math.round((m2 / 3.3058) * 10) / 10;
}

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// ISO 시각을 "2026. 08. 01. 14:30"으로 — 값이 없거나 깨진 경우 대시로 대체한다
export function formatDateTime(isoDateTime?: string) {
  if (!isoDateTime) {
    return "—";
  }
  const date = new Date(isoDateTime);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

// 바이트 → "1.2 MB" (소수 1자리, KB부터)
export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
