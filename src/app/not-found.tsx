import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <div className="stack section">
        <h1>이 기록에 접근할 수 없어요</h1>
        <p className="muted">주소가 바뀌었거나 볼 수 있는 권한이 없어요.</p>
        <Link href="/" className="btn">홈으로</Link>
      </div>
    </main>
  );
}
