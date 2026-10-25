import { redirect } from "next/navigation";
import { load } from "@/server/page";
import { overview } from "@/server/services/household";
import { listAgreements } from "@/server/services/agreements";
import { today } from "@/server/services/access";
import { addDays } from "@/server/store";
import { ProposeForm } from "@/components/ProposeForm";

export default async function NewAgreementPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; agreement?: string }>;
}) {
  const sp = await searchParams;
  const data = await load((ctx) => {
    const o = overview(ctx);
    const t = today(ctx);
    const list = o.partner ? listAgreements(ctx) : [];
    return { o, t, list };
  });
  if (!data.o.partner) redirect("/agreements");

  // 생활비 약속은 하나만 둔다. 이미 있으면 그 약속의 새 버전으로 제안한다.
  const template = sp.template === "text" ? "text" : "split";
  const existing =
    data.list.find((a) => a.agreementId === sp.agreement) ??
    (template === "split" ? data.list.find((a) => (a.current ?? a.history[0])?.content.type === "split") : undefined);
  const base = existing ? (existing.pending ?? existing.current ?? existing.history[0]) : undefined;
  const nextMonth = addDays(`${data.t.slice(0, 7)}-01`, 31).slice(0, 7) + "-01";

  return (
    <div className="stack">
      <h1>{template === "split" ? "생활비를 어떻게 나눌까요?" : existing ? `‘${existing.title}’ 바꾸기` : "새 약속 제안하기"}</h1>
      <ProposeForm
        template={template}
        agreementId={existing?.agreementId ?? null}
        members={data.o.members}
        today={data.t}
        defaultEffective={template === "split" ? nextMonth : data.t}
        base={base ? { title: base.title, content: base.content } : null}
      />
    </div>
  );
}
