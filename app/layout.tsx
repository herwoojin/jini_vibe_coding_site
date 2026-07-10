import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MacroSignal — 거시지표 기반 3시장 어드바이저",
  description: "한·미 금리, 환율, 유가를 종합해 코스피·코스닥·나스닥 3개 시장의 오늘 장 흐름을 매일 아침 진단합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-[var(--card-border)] bg-[var(--background)]/80 backdrop-blur-xl">
          <div className="dashboard-container flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center text-white font-bold text-sm">
                M
              </div>
              <h1 className="text-lg font-bold gradient-text">MacroSignal</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">
                {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
              </span>
              {/* 장중 실시간이 아니므로 LIVE 로 표시하지 않는다. 갱신 주기는 상단 배너가 설명한다. */}
              <span
                title="무료 공공 데이터(FRED·한국은행 ECOS) 기반. 전일 종가 기준이며 장중 실시간이 아닙니다."
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]"></span>
                일별 데이터
              </span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">
          {children}
        </main>

        {/* Disclaimer */}
        <footer className="disclaimer-bar">
          <div className="dashboard-container py-3">
            <p className="text-xs text-[var(--accent-yellow)] text-center leading-relaxed">
              ⚠️ 본 내용은 투자 참고 정보이며 투자 권유가 아닙니다. 실제 투자 판단과 책임은 이용자 본인에게 있습니다.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
