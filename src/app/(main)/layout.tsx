import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { TabBar } from "@/components/TabBar";
import { load } from "@/server/page";
import { overview } from "@/server/services/household";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const o = await load(overview);
  if (!o.householdId) redirect(o.endedSnapshotUntil ? "/ended" : "/start");
  return (
    <>
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brand">함께살이</Link>
          <Link href="/settings" className="row" aria-label="내 설정">
            <Avatar name={o.me.displayName} color={o.me.color} />
          </Link>
        </header>
        <main>{children}</main>
      </div>
      <TabBar />
    </>
  );
}
