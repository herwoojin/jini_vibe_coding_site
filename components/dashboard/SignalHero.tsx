'use client';

import { levelEmoji, levelLabel } from '@/lib/engine/signal';
import type { DataOrigin, MarketScore } from '@/lib/types';
import DataBadge from './DataBadge';

interface SignalHeroProps {
  signals: MarketScore[];
  origin: DataOrigin;
  /** 계산에 쓰인 데이터의 최신 관측일 (live 일 때) */
  asOf?: string;
}

export default function SignalHero({ signals, origin, asOf }: SignalHeroProps) {
  return (
    <section className="animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold">오늘의 시장 진단</h2>
        <span className="text-xs text-[var(--text-secondary)]">
          {origin === 'live' && asOf
            ? `전일 종가 기반 · 데이터 기준일 ${asOf}`
            : `${new Date().toLocaleDateString('ko-KR')} 기준`}
        </span>
        <DataBadge origin={origin} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {signals.map((signal, idx) => (
          <div
            key={signal.market_code}
            className={`glass-card p-5 border-l-4 signal-bg-${signal.level} signal-glow-${signal.level} animate-fade-in animate-fade-in-delay-${idx + 1}`}
          >
            {/* Market Name + Emoji */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{signal.market_name}</h3>
              <span className="text-2xl">{levelEmoji(signal.level)}</span>
            </div>

            {/* Score */}
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-3xl font-bold font-mono signal-${signal.level}`}>
                {signal.score > 0 ? '+' : ''}{signal.score.toFixed(2)}
              </span>
              <span className={`text-sm font-medium signal-${signal.level}`}>
                {levelLabel(signal.level)}
              </span>
            </div>

            {/* Top Contributors (상위 2개) */}
            <div className="space-y-1 mt-3">
              {signal.contributors.slice(0, 2).map((c) => (
                <div key={c.indicator_code} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className={c.contrib > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                    {c.contrib > 0 ? '▲' : '▼'}
                  </span>
                  <span>{c.indicator_name}</span>
                  <span className="ml-auto font-mono">
                    {c.contrib > 0 ? '+' : ''}{c.contrib.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
