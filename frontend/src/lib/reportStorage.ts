import type { ChecklistItem } from "@/types";

const DATABASE_NAME = "bangbangbwa-reports";
const STORE_NAME = "reports";
const DATABASE_VERSION = 1;

export interface PropertyReportCapture {
  id: string;
  createdAt: string;
  image?: Blob;
  imageUrl?: string;
}

export interface PropertyReport {
  reportId: string;
  userId: number;
  meetingId: number;
  propertyId: number;
  propertyTitle: string;
  propertyAddress: string;
  transactionType?: string;
  roomType?: string;
  deposit?: number;
  monthlyRent?: number;
  createdAt: string;
  checklistItems: ChecklistItem[];
  captures: PropertyReportCapture[];
  isMock?: boolean;
  evaluation: { score: number; summary: string };
}

const MOCK_REPORTS = [
  {
    propertyId: 9001,
    propertyTitle: "역삼역 도보 5분 신축 오피스텔",
    propertyAddress: "강남구 역삼동",
    daysAgo: 2,
    checklistItems: [
      {
        itemId: 1,
        content: "수압과 온수 상태 확인",
        status: "COMPLETED",
        memo: "주방과 욕실 모두 양호",
      },
      {
        itemId: 2,
        content: "창문 결로 및 외풍 확인",
        status: "COMPLETED",
        memo: null,
      },
      {
        itemId: 3,
        content: "벽지 곰팡이 흔적 확인",
        status: "COMPLETED",
        memo: "특이사항 없음",
      },
      {
        itemId: 4,
        content: "주차 공간 확인",
        status: "PENDING",
        memo: "관리실 추가 문의 필요",
      },
    ],
  },
  {
    propertyId: 9002,
    propertyTitle: "성수동 채광 좋은 투룸 빌라",
    propertyAddress: "성동구 성수동2가",
    daysAgo: 6,
    checklistItems: [
      {
        itemId: 1,
        content: "낮 시간대 채광 확인",
        status: "COMPLETED",
        memo: "거실 남향, 채광 좋음",
      },
      {
        itemId: 2,
        content: "층간소음 확인",
        status: "COMPLETED",
        memo: "방문 시간에는 소음 없음",
      },
      {
        itemId: 3,
        content: "보일러 연식 확인",
        status: "PENDING",
        memo: "중개사 확인 예정",
      },
      {
        itemId: 4,
        content: "분리수거 장소 확인",
        status: "COMPLETED",
        memo: null,
      },
    ],
  },
  {
    propertyId: 9003,
    propertyTitle: "공덕역 풀옵션 원룸",
    propertyAddress: "마포구 공덕동",
    daysAgo: 12,
    checklistItems: [
      {
        itemId: 1,
        content: "냉장고와 세탁기 작동 확인",
        status: "COMPLETED",
        memo: "정상 작동",
      },
      {
        itemId: 2,
        content: "휴대전화 수신 상태 확인",
        status: "COMPLETED",
        memo: null,
      },
      {
        itemId: 3,
        content: "콘센트 위치와 개수 확인",
        status: "COMPLETED",
        memo: "침대 옆 2구 포함 총 8구",
      },
    ],
  },
] as const;

export function createMockReports(userId: number): PropertyReport[] {
  return MOCK_REPORTS.map((mock, index) => ({
    reportId: `mock-${userId}-${mock.propertyId}`,
    userId,
    meetingId: 9000 + index,
    propertyId: mock.propertyId,
    propertyTitle: mock.propertyTitle,
    propertyAddress: mock.propertyAddress,
    createdAt: new Date(Date.now() - mock.daysAgo * 86_400_000).toISOString(),
    checklistItems: mock.checklistItems.map((item) => ({ ...item })),
    captures: [],
    isMock: true,
    evaluation: evaluateChecklist(
      mock.checklistItems.map((item) => ({ ...item })),
    ),
  }));
}

export function evaluateChecklist(checklistItems: ChecklistItem[]) {
  if (checklistItems.length === 0) {
    return {
      score: 0,
      summary: "작성된 체크리스트가 없어 추가 점검이 필요합니다.",
    };
  }
  const completed = checklistItems.filter(
    (item) => item.status === "COMPLETED",
  ).length;
  const issues = checklistItems.filter(
    (item) => item.status === "ISSUE_FOUND",
  ).length;
  const score = Math.max(
    0,
    Math.round((completed / checklistItems.length) * 100 - issues * 10),
  );
  if (issues > 0) {
    return {
      score,
      summary: `확인이 필요한 항목이 ${issues}건 있습니다. 메모와 현장 캡처를 확인해 주세요.`,
    };
  }
  return {
    score,
    summary:
      completed === checklistItems.length
        ? "모든 점검 항목을 확인했으며, 기록된 문제 항목이 없습니다."
        : `전체 ${checklistItems.length}개 중 ${completed}개를 확인했습니다. 남은 항목의 추가 점검이 필요합니다.`,
  };
}

function openReportDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "reportId",
        });
        store.createIndex("userId", "userId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePropertyReport(report: PropertyReport) {
  const database = await openReportDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(report);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function getPropertyReports(userId: number) {
  const database = await openReportDatabase();
  const reports = await new Promise<PropertyReport[]>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .index("userId")
      .getAll(userId);
    request.onsuccess = () => resolve(request.result as PropertyReport[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
