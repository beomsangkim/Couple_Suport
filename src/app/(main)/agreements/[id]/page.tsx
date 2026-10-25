import Link from "next/link";
import { notFound } from "next/navigation";
import { load } from "@/server/page";
import { overview } from "@/server/services/household";
import { listAgreements, type VersionView } from "@/server/services/agreements";
import { describeContent, formatDate } from "@/components/agreement-format";
import { ApproveButtons, WithdrawButton } from "@/components/AgreementActions";

const STATUS: Record<VersionView["status"], string> = {
  proposed: "합의 중",
  scheduled: "적용 예정",
  active: "적용 중",
  superseded: "새 버전으로 대체됨",
  withdrawn: "철회됨",
  cancelled: "제안 거둠",
};

export default async function AgreementDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { o, a } = await load((ctx) => {
    const o = overview(ctx);
    return { o, a: o.partner ? listAgreements(ctx).find((x) => x.agreementId === id) : undefined };
  });
  if (!a) notFound(); // 다른 공간의 ID여도 같은 결과(존재 여부를 드러내지 않음)
  const partner = o.partner!;
  const template = (a.pending ?? a.current ?? a.history[0]!).content.type;
  const withdrawn = a.history.find((v) => v.status === "withdrawn");

  return (
    <div className="stack">
      <Link href="/agreements" className="btn btn-ghost btn-sm">‹ 약속 목록</Link>
      <h1>{a.title}</h1>

      {a.pending && (
        <section className="panel stack" aria-labelledby="pending-title">
          <h2 id="pending-title">
            {a.pending.createdByMe ? "내가 보낸 제안" : `${partner.displayName} 님의 제안`}
          </h2>
          <div className="diff">
            <div>
              <div className="label">지금</div>
              <p>{a.pendingBase && a.pendingBase.status === "active" ? describeContent(a.pendingBase.content, o.members) : "적용 중인 약속 없음"}</p>
            </div>
            <div className="new">
              <div className="label">제안</div>
              <p>{describeContent(a.pending.content, o.members)}</p>
            </div>
          </div>
          <p className="small">
            적용 시작일 <strong>{formatDate(a.pending.effectiveFrom)}</strong>
            {a.pending.reviewOn && <> · 다시 이야기할 날 {formatDate(a.pending.reviewOn)}</>}
          </p>
          <p className="small muted">
            나: {a.pending.approvedByMe ? "동의함" : "답변 전"} · {partner.displayName}: {a.pending.approvedByPartner ? "동의함" : "답변 전"}
          </p>
          <ApproveButtons
            versionId={a.pending.versionId}
            contentHash={a.pending.contentHash}
            approvedByMe={a.pending.approvedByMe}
            createdByMe={a.pending.createdByMe}
            isMoney={a.pending.content.type === "split"}
            reviseHref={`/agreements/new?template=${template}&agreement=${a.agreementId}`}
          />
          {!a.pending.approvedByMe && (
            <p className="small muted">지금 결정하지 않아도 괜찮아요. 답하기 전까지는 지금 약속이 그대로 유지돼요.</p>
          )}
        </section>
      )}

      {a.current && (
        <section className="panel stack-sm" aria-labelledby="current-title">
          <div className="row-between">
            <h2 id="current-title">적용 중인 약속</h2>
            <span className="badge badge-accent">적용 중</span>
          </div>
          <p>{describeContent(a.current.content, o.members)}</p>
          <p className="small muted">
            {formatDate(a.current.effectiveFrom)}부터 적용
            {a.current.reviewOn && <> · {formatDate(a.current.reviewOn)}에 다시 이야기하기로 했어요</>}
          </p>
          <WithdrawButton versionId={a.current.versionId} isMoney={a.current.content.type === "split"} />
        </section>
      )}

      {a.scheduled && (
        <section className="panel stack-sm" aria-labelledby="scheduled-title">
          <div className="row-between">
            <h2 id="scheduled-title">적용 예정</h2>
            <span className="badge">{formatDate(a.scheduled.effectiveFrom)}부터</span>
          </div>
          <p>{describeContent(a.scheduled.content, o.members)}</p>
          <p className="small muted">두 사람이 동의했어요. 적용일 전까지는 지금 약속이 유지돼요.</p>
          <WithdrawButton versionId={a.scheduled.versionId} isMoney={a.scheduled.content.type === "split"} />
        </section>
      )}

      {a.state === "withdrawn" && withdrawn && (
        <div className="notice notice-warn">
          {withdrawn.withdrawnByMe ? "내가" : `${partner.displayName} 님이`} {formatDate(withdrawn.withdrawnOn!)}에 철회했어요. 다시 이야기해 볼까요?{" "}
          <Link href={`/agreements/new?template=${template}&agreement=${a.agreementId}`}>새로 제안하기</Link>
        </div>
      )}

      {!a.pending && a.state !== "withdrawn" && (
        <Link href={`/agreements/new?template=${template}&agreement=${a.agreementId}`} className="btn btn-secondary">
          바꾸자고 제안하기
        </Link>
      )}

      <details>
        <summary>이전 버전 {a.history.length}개</summary>
        <ul className="list">
          {a.history.map((v) => (
            <li key={v.versionId} className="stack-sm">
              <span className="row-between">
                <span className="badge">{STATUS[v.status]}</span>
                <span className="small muted">{formatDate(v.effectiveFrom)} 적용 기준</span>
              </span>
              <span className="small">{describeContent(v.content, o.members)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
