import Link from "next/link";

// 민감 주제 대화 카드(개정안 S-6). 입력란·저장 기능이 없고, 어떤 카드를 열었는지 기록하지 않는다.
// 카드는 <details>로 브라우저 안에서만 펼쳐지므로 카드별 서버 요청이 생기지 않는다.

const CARDS: { title: string; note?: string; questions: string[] }[] = [
  {
    title: "스킨십과 친밀감",
    note: "앱의 어떤 기록도 그 순간의 동의를 대신하지 않아요.",
    questions: [
      "서로 원하는 빈도나 시점이 다를 때, 어떻게 말하면 편할까요?",
      "거절을 들었을 때 어떤 말이나 행동이 서운함을 덜어줄까요?",
      "피곤하거나 아플 때 어떻게 신호를 주고받을까요?",
    ],
  },
  {
    title: "아이와 가족 계획",
    note: "해당되는 경우에만 이야기해요. 정답은 없어요.",
    questions: [
      "지금 생각하는 방향은 무엇이고, 언제 다시 이야기해 보면 좋을까요?",
      "피임·건강 관리의 책임과 비용을 어떻게 나눌까요?",
      "가족이 이 주제를 물어올 때 어디까지 말할까요?",
    ],
  },
  {
    title: "건강과 돌봄",
    questions: [
      "한 사람이 아프거나 돌봄이 필요할 때 집안일과 비용은 어떻게 조정할까요?",
      "가족 돌봄이 필요해지면 시간·돈·역할을 어떻게 나눌까요?",
      "외부 도움(돌봄 서비스, 가사 서비스)은 언제 쓰기로 할까요?",
    ],
  },
  {
    title: "빚과 큰돈",
    note: "금액은 적지 않아도 돼요. 공유 범위를 먼저 정해 보세요.",
    questions: [
      "공동 계획에 영향을 주는 빚이나 지출은 어디까지 미리 알려줄까요?",
      "상의하고 쓰기로 할 금액 기준은 얼마일까요?",
      "각자 자유롭게 쓰는 돈은 설명하지 않아도 되는 걸로 할까요?",
    ],
  },
  {
    title: "휴대폰과 사생활",
    note: "비밀번호·메시지·위치를 공유하는 것은 사랑의 증거가 아니에요. 각자의 경계를 존중해요.",
    questions: [
      "서로 혼자만의 시간과 공간이 필요할 때 어떻게 알려줄까요?",
      "늦어질 때 연락은 어느 정도면 서로 편할까요?",
      "우리 이야기를 친구·SNS에 어디까지 공유해도 괜찮을까요?",
    ],
  },
];

export default function TalkPage() {
  return (
    <main className="shell">
      <div className="stack section">
        <Link href="/agreements" className="btn btn-ghost btn-sm">‹ 돌아가기</Link>
        <h1>대화 카드</h1>
        <p className="muted">
          둘이 이야기해 볼 질문들이에요. 답을 적는 곳이 없고, 어떤 카드를 열었는지도 기록하지 않아요.
        </p>
        {CARDS.map((c) => (
          <details key={c.title} className="card-talk">
            <summary>{c.title}</summary>
            {c.note && <p className="small muted">{c.note}</p>}
            <ul>
              {c.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </main>
  );
}
