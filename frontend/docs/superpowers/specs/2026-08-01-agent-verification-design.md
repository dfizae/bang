# 중개사 인증 신청·심사 API 연동 설계

작성일: 2026-08-01

## 배경

중개사 인증은 지금까지 목데이터로만 동작했다. `/mypage`의 인증 신청은 `authStore.applyBrokerVerification`이 로컬 User 객체만 바꿨고, `/admin`의 심사 화면은 `src/data/brokerApplications.ts`의 정적 배열을 읽었다. 백엔드에 실제 엔드포인트가 열려 두 화면을 실제 계약에 맞춰 연결한다.

## 실측한 API 계약

Swagger(`http://i15a504.p.ssafy.io:8081/v3/api-docs`) 2026-08-01 기준.

### 중개사 인증 (신청자)

| 메서드 | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/agent-verifications/license-check` | query `licenseNumber` | `LicenseCheckResponse` |
| POST | `/api/agent-verifications` | multipart `licenseNumber`, `document` | `AgentVerificationResponse` |
| GET | `/api/agent-verifications/me` | — | `AgentVerificationResponse` |

### 중개사 인증-admin (관리자)

| 메서드 | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/admin/agent-verifications` | query `status`, `page`, `size`, `sort` | `Page<AgentVerificationResponse>` |
| GET | `/api/admin/agent-verifications/{verificationId}` | — | `AgentVerificationDetailResponse` |
| PATCH | `/api/admin/agent-verifications/{verificationId}/review` | `{ decision: "APPROVED" \| "REJECTED" }` | `AgentVerificationResponse` |

### 스키마

- `AgentVerificationResponse`: `verificationId`, `userId`, `licenseNumber`, `brokerName`, `officeName`, `officeAddress`, `officePhone`, `businessStatus`, `status`(`PENDING`/`APPROVED`/`REJECTED`), `externalCheckedAt`, `submittedAt`, `reviewedAt`, `createdAt`, `updatedAt`
- `AgentVerificationDetailResponse`: 위 필드 + `document`(`originalName`, `contentType`, `fileSize`, `fileUrl`, `urlExpiresAt`)
- `LicenseCheckResponse`: `licenseNumber`, `valid`, `brokerName`, `officeName`, `officeAddress`, `officePhone`, `businessStatus`, `checkedAt`

### 계약에서 나온 제약

1. **반려 사유 필드가 없다.** `AgentVerificationReviewRequest`는 `decision` 하나만 받고, 응답에도 사유가 없다. 따라서 관리자 화면의 사유 입력과 마이페이지의 사유 표시를 제거한다. 서버에 저장되지 않는 값을 입력받아 사라지게 두는 쪽이 더 나쁘다.
2. **신청자 신원 정보가 없다.** 목데이터에 있던 닉네임·이메일·연락처가 응답에 없고 `userId`만 있다. 관리자 상세는 사람 신원이 아니라 **등록번호 외부 조회 결과**(`businessStatus`, `externalCheckedAt`)와 **제출 서류**를 근거로 판정하는 화면으로 재구성한다.
3. **서류는 1건, presigned URL이다.** `fileUrl`은 `urlExpiresAt`이 지나면 만료된다. 만료 상태를 감지해 다시 불러올 수단을 제공한다.
4. **`document.contentType`이 이미지일 수도 PDF일 수도 있다.** 뷰어는 타입별로 분기한다.

## 설계

### 도메인 모델 (`src/types.ts`)

추가:

```ts
export type AgentVerificationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AgentVerificationDecision = "APPROVED" | "REJECTED";

export interface LicenseCheck { licenseNumber, valid, brokerName, officeName, officeAddress, officePhone, businessStatus, checkedAt }
export interface AgentVerification { verificationId, userId, licenseNumber, brokerName, officeName, officeAddress, officePhone, businessStatus, status, externalCheckedAt, submittedAt, reviewedAt }
export interface VerificationDocument { originalName, contentType, fileSize, fileUrl, urlExpiresAt }
export interface AgentVerificationDetail extends AgentVerification { document?: VerificationDocument }
export interface AgentVerificationListParams { status: AgentVerificationStatus; page?: number; size?: number }
```

제거: `BrokerApplication`, `BrokerApplicationDocument`, `BrokerApplicationStatus`, `BrokerVerificationStatus`, `BrokerVerificationRequest`, `User.brokerVerification`, `User.brokerVerificationRejectReason`.

`User`에서 인증 상태를 없애는 이유: 승인되면 서버가 계정 role을 `AGENT`로 바꾼다. 즉 role이 곧 승인 여부이고, `User`에 인증 상태를 따로 두면 같은 사실을 두 곳에 저장하게 된다. 신청 진행 상태(`PENDING`/`REJECTED`)는 화면에서만 필요하므로 쿼리로 조회한다.

따라서 `isApprovedBroker(user)`는 `user?.role === "중개사"`로 단순해진다.

### 역할 매핑 수정 (`src/api/user.ts`)

지금은 서버 role `ADMIN`을 `중개사`로 매핑하는데, `/admin` 라우트 가드는 `관리자`를 요구한다. 실제 관리자 계정으로 심사 화면에 들어갈 수 없는 상태다. `TENANT → 세입자`, `AGENT → 중개사`, `ADMIN → 관리자`로 1:1 매핑한다.

### API 계층

- `src/api/agentVerification.ts` (신규): `checkLicense`, `getMyAgentVerification`, `submitAgentVerification`
  - `getMyAgentVerification`은 신청 이력이 없을 때 서버가 404 또는 빈 data로 응답할 수 있어 **`null`로 정규화**한다. 그 외 오류는 그대로 던져 화면이 재시도 UI를 띄운다.
- `src/api/admin.ts` (교체): `getAgentVerifications`, `getAgentVerificationDetail`, `reviewAgentVerification`

### 서버 상태 (`src/hooks/queries/agentVerificationQueries.ts`, 신규)

키 팩토리 `agentVerificationKeys` 하나로 신청자·관리자 쿼리를 모두 관리한다.

| 훅 | 종류 | 비고 |
| --- | --- | --- |
| `useMyAgentVerification()` | query | 마이페이지 패널의 진실 공급원 |
| `useCheckLicense()` | mutation | 사용자가 [조회]를 눌러야 실행되는 온디맨드 검증이라 query가 아니다 |
| `useSubmitAgentVerification()` | mutation | 성공 시 `me` 캐시를 응답으로 직접 갱신 |
| `useAdminAgentVerifications(params)` | query | `placeholderData: keepPreviousData`로 탭·페이지 이동 시 깜빡임 방지 |
| `useAdminAgentVerificationDetail(id)` | query | `enabled: id !== null` |
| `useReviewAgentVerification()` | mutation | 성공 시 상세 캐시 갱신 + 목록 전체 무효화(탭 카운트가 같이 움직인다) |

### `/mypage` 중개사 인증 패널

`user.brokerVerification` 대신 `useMyAgentVerification()`을 읽는다.

| 상태 | 화면 |
| --- | --- |
| 로딩 | Skeleton |
| 조회 실패 | "인증 상태를 불러오지 못했어요" + [다시 시도] |
| 미신청(`null`) | 안내 문구 + [인증 신청] |
| `PENDING` | 심사 중 배지 + 제출 요약(등록번호·사무소명·신청일시), 액션 없음 |
| `APPROVED` | 승인 배지 + 사무소 정보 + 승인일시. `user.role`이 아직 중개사가 아니면 [중개사 기능 사용하기]로 세션 갱신 |
| `REJECTED` | 반려 배지 + 재확인 안내 + [다시 신청] |

`APPROVED`인데 세션 role이 낡은 경우가 실제로 생긴다(관리자가 승인한 시점과 사용자가 화면을 보는 시점이 다르므로). `useEffect`로 몰래 고치지 않고 사용자가 누르는 버튼으로 처리한다 — 무엇이 일어나는지 보이고, 실패 시 재시도 지점이 명확하다.

#### 신청 다이얼로그 (2단계)

1. 등록번호 입력 → [조회] → `license-check`
   - `valid: true` → 사무소 정보 결과 카드(상호·대표·영업상태·주소·전화)를 보여주고 서류 첨부와 [신청하기]를 연다
   - `valid: false` → "조회되지 않는 등록번호입니다" 인라인 안내, 제출 차단
   - 번호를 수정하면 결과를 초기화해 재조회를 요구한다 (조회한 번호와 제출한 번호가 어긋나지 않게)
2. 서류 첨부(이미지·PDF) → [신청하기]
   - `useActionState`로 실패 시 입력값 유지, 성공 시 닫고 패널이 `PENDING`으로 전환

접근성: 조회 결과는 `aria-live="polite"`, 조회·제출 중 중복 실행 차단, 파일 입력에 라벨 연결.

### `/admin` 인증 심사

좌 목록 / 우 상세 2단 구조는 유지하고 내용을 실제 계약에 맞춘다.

- **탭**(심사 대기·승인 완료·반려)과 **페이지**는 `useSearchParams`로 URL에 둔다. 새로고침·공유해도 보던 자리가 유지되고, 필터링은 클라이언트가 아니라 서버 `status` 파라미터로 한다.
- **목록**: 등록번호(강조) · 사무소명 · 대표자 · 신청일시. 페이지네이션은 이전/다음 + `n / m`.
- **상세**:
  - **국가 조회 대조** — 등록번호, 영업상태 배지, `externalCheckedAt`. 심사 판단의 근거라 최상단.
  - **사무소 정보** — 대표자 / 상호 / 주소 / 전화
  - **신청 정보** — 신청자 ID, 신청일시, 처리일시
  - **서류 뷰어** — `contentType` 분기(이미지 인라인 + 확대, PDF 임베드, 그 외 파일 카드), 파일명·용량 표시, [다운로드]. `urlExpiresAt` 경과 시 만료 안내 + [다시 불러오기](상세 refetch)
  - **판정** — `PENDING`일 때만 [승인]/[반려]. 각각 확인 다이얼로그로 오조작 방지. 사유 입력 없음.
  - 처리 완료 건은 결과 배너(승인/반려 + 처리일시)
- 제거: 등록번호 형식 검증 배지, V-World 외부 링크, 중복 등록번호 경고. 셋 다 목데이터 전제였고 서버의 외부 조회 결과가 대체한다.

### 삭제하는 파일

- `src/data/brokerApplications.ts` — 목데이터, 사용처 없음
- `src/lib/brokerRegistration.ts` — 등록번호 형식 검증, `AdminPage`에서만 쓰였고 서버 조회가 대체

## 오류 처리

- 조회 실패: 영역 단위 폴백 + [다시 시도] (`refetch`)
- 제출·심사 실패: `ApiError.message`를 인라인 표시, 입력값 유지, 중복 제출 차단
- 서류 링크 만료: 만료를 감지해 [다시 불러오기] 제공
- 관리자 권한 없음: 기존 `AdminRoute` 가드가 랜딩으로 돌려보낸다

## 검증

`pnpm lint`, `pnpm build`, `pnpm exec tsc -b`.
