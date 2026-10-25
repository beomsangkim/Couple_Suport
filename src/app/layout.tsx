import type { Metadata, Viewport } from "next";
import { ActionProvider } from "@/components/ActionProvider";
import "./globals.css";

// 모든 화면은 사용자별이고 CSP nonce가 요청마다 달라서 정적 생성·공유 캐시를 쓰지 않는다.
export const dynamic = "force-dynamic";

// 미리보기·검색 결과에 관계 정보나 사용자 이름이 드러나지 않도록 고정 문구만 둔다.
export const metadata: Metadata = {
  title: "함께살이",
  description: "생활 약속 정리 도구",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="demo-banner">프로토타입 · 모든 데이터는 가상이며 실제 로그인이 아니에요</div>
        <ActionProvider>{children}</ActionProvider>
      </body>
    </html>
  );
}
