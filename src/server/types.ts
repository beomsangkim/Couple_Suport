// 서버 내부 모델. 이 타입은 클라이언트로 그대로 내보내지 않는다(→ views.ts의 DTO만 내보냄).

export type ISODate = string; // YYYY-MM-DD (Asia/Seoul)

export interface User {
  id: string;
  displayName: string;
  color: string;
  // 아래는 본인만 볼 수 있는 정보(profiles_private에 해당)
  email: string;
  inviteBlocks: string[]; // 초대를 받지 않을 사용자 ID
}

export interface Session {
  id: string;
  userId: string;
  device: string;
  createdAt: number;
  stepUpAt: number | null; // 마지막 단계 인증 시각(패스키 시뮬레이션)
  revoked: boolean;
}

export type HouseholdStatus = "active" | "ended";

export interface Household {
  id: string;
  status: HouseholdStatus;
  createdAt: number;
  endedAt: number | null;
  endedOn: ISODate | null;
  redactText: boolean; // 연결 해제 시 자유 본문 즉시 숨기기를 선택했는지
}

export interface Membership {
  householdId: string;
  userId: string;
  status: "active" | "ended";
}

/** 분담 규칙. weights는 사용자별 가중치(반반=1:1, 비율=퍼센트, 금액=원). */
export interface SplitRule {
  kind: "equal" | "ratio" | "amount";
  weights: Record<string, number>;
}

export type AgreementContent =
  | { type: "split"; rule: SplitRule }
  | { type: "text"; body: string };

export type VersionStatus =
  | "proposed"
  | "scheduled"
  | "active"
  | "superseded"
  | "withdrawn"
  | "cancelled";

export interface AgreementVersion {
  id: string;
  agreementId: string;
  householdId: string;
  title: string;
  content: AgreementContent;
  effectiveFrom: ISODate;
  reviewOn: ISODate | null;
  contentHash: string;
  status: VersionStatus;
  createdBy: string;
  createdOn: ISODate;
  previousVersionId: string | null;
  withdrawnBy: string | null;
  withdrawnOn: ISODate | null;
}

export interface Approval {
  versionId: string;
  userId: string;
  contentHash: string;
}

export interface Expense {
  id: string;
  householdId: string;
  amount: number; // 원 단위 정수
  description: string;
  paidBy: string;
  createdBy: string;
  spentOn: ISODate;
  weights: Record<string, number>; // 배분 기준(수정 시 다시 계산하는 데 사용)
  shares: Record<string, number>; // 배분 스냅샷
  ruleVersionId: string | null; // 적용한 약속 버전(직접 정했으면 null)
  disputedBy: string | null;
  settlementId: string | null;
  version: number;
  idempotencyKey: string;
}

export interface Settlement {
  id: string;
  householdId: string;
  month: string; // YYYY-MM
  expenseIds: string[];
  snapshotHash: string;
  confirmedBy: string[];
  status: "pending" | "confirmed";
}

export interface Task {
  id: string;
  householdId: string;
  title: string;
  assignee: string;
  criteria: string;
  weekdays: number[]; // 0=일 ~ 6=토
  completions: { on: ISODate; by: string }[]; // 완료 '날짜'만 저장한다. 시각은 저장하지 않는다.
  swapRequest: { from: string; to: string } | null;
}

export interface Invitation {
  id: string;
  householdId: string;
  inviterId: string;
  tokenHash: string;
  expiresAt: number;
  pendingAcceptorId: string | null;
  codeHash: string | null;
  confirmAttempts: number;
  confirmedAt: number | null;
  revokedAt: number | null;
}
