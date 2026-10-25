export type ErrorCode =
  | "unauthenticated"
  | "not_found"
  | "invalid_state"
  | "stale_content"
  | "step_up_required"
  | "validation"
  | "conflict"
  | "access_revoked";

// 사용자에게 보여줄 문구. 내부 사유나 상태 코드를 노출하지 않는다.
const MESSAGES: Record<ErrorCode, string> = {
  unauthenticated: "다시 로그인해 주세요.",
  not_found: "이 기록에 접근할 수 없어요.",
  invalid_state: "지금은 이 작업을 할 수 없어요. 화면을 새로고침해 주세요.",
  stale_content: "그 사이 내용이 바뀌었어요. 바뀐 내용을 확인해 주세요.",
  step_up_required: "본인 확인이 필요해요.",
  validation: "입력한 내용을 확인해 주세요.",
  conflict: "다른 곳에서 먼저 바뀌었어요. 새 내용을 확인해 주세요.",
  access_revoked: "함께 쓰던 공간이 종료되어 접근할 수 없어요.",
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public detail?: string,
  ) {
    super(detail ? `${MESSAGES[code]} ${detail}` : MESSAGES[code]);
  }
}

export function fail(code: ErrorCode, detail?: string): never {
  throw new AppError(code, detail);
}
