import { Avatar } from "@/components/Avatar";
import { demoLoginAction, resetDemoAction } from "@/app/actions";
import { DEMO_PERSONAS, getStore } from "@/server/store";

export default function LoginPage() {
  const store = getStore();
  return (
    <main className="shell">
      <div className="stack section">
        <h1>함께살이 둘러보기</h1>
        <p className="muted">
          가상 사용자를 골라 들어가요. 두 사람의 화면을 번갈아 보려면 다른 브라우저(또는 시크릿 창)에서 각각 로그인해 보세요.
        </p>
        <ul className="stack-sm">
          {DEMO_PERSONAS.map((p) => {
            const u = store.users.find((x) => x.id === p.id)!;
            return (
              <li key={p.id} className="row">
                <form action={demoLoginAction.bind(null, p.id)} className="btn-block">
                  <button className="persona" type="submit">
                    <Avatar name={u.displayName} color={u.color} />
                    <span className="stack-sm">
                      <strong>{u.displayName}</strong>
                      <span className="small muted">{p.note}</span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        <div className="notice small">
          실제 서비스는 패스키를 우선하는 관리형 인증을 써요. 이 화면은 프로토타입 전용이에요.
        </div>
        <form action={resetDemoAction}>
          <button className="btn btn-ghost" type="submit">가상 데이터 처음 상태로 되돌리기</button>
        </form>
      </div>
    </main>
  );
}
