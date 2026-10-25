"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "홈", icon: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /> },
  { href: "/money", label: "생활비", icon: <path d="M3 6h18v12H3zM3 10h18M7 15h4" /> },
  { href: "/agreements", label: "약속", icon: <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3" /> },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="주요 메뉴">
      <ul>
        {TABS.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                  {t.icon}
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
