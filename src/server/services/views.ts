import "server-only";
import type { Store } from "../store";

// 클라이언트로 나가는 DTO. 파트너에게도 같은 형태가 나가므로 이메일·세션·정밀 시각·
// 열람 여부 같은 필드를 넣지 않는다(tests/partner-view.test.ts가 이를 검사한다).

export interface MemberView {
  id: string;
  displayName: string;
  color: string;
  isMe: boolean;
}

export function memberView(store: Store, userId: string, meId: string): MemberView {
  const u = store.users.find((x) => x.id === userId);
  if (!u) return { id: userId, displayName: "이전 구성원", color: "gray", isMe: false };
  return { id: u.id, displayName: u.displayName, color: u.color, isMe: u.id === meId };
}
