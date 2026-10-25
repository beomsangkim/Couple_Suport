import type { AgreementContent } from "@/server/types";

type M = { id: string; displayName: string; isMe: boolean };

export function who(m: M | undefined) {
  if (!m) return "이전 구성원";
  return m.isMe ? "나" : m.displayName;
}

export function describeContent(content: AgreementContent, members: M[]): string {
  if (content.type === "text") return content.body;
  const { kind, weights } = content.rule;
  if (kind === "equal") return "생활비를 반반 나눠요";
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const parts = members.map((m) => {
    const w = weights[m.id] ?? 0;
    return kind === "ratio" ? `${who(m)} ${w}%` : `${who(m)} ${w.toLocaleString("ko-KR")}원(${Math.round((w / total) * 100)}%)`;
  });
  return kind === "ratio" ? `비율로 나눠요 · ${parts.join(" · ")}` : `금액으로 나눠요 · ${parts.join(" · ")}`;
}

export function formatDate(d: string): string {
  return `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
}
