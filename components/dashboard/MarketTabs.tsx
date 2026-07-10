'use client';

import { useState } from 'react';
import { levelEmoji } from '@/lib/engine/signal';
import type { DataOrigin, MarketScore } from '@/lib/types';
import DataBadge from './DataBadge';

interface MarketTabsProps {
  signals: MarketScore[];
  origin: DataOrigin;
}

export default function MarketTabs({ signals, origin }: MarketTabsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const signal = signals[activeTab];

  if (!signal) return null;

  const maxContrib = Math.max(...signal.contributors.map(c => Math.abs(c.contrib)));

  return (
    <section className="glass-card p-5 animate-fade-in animate-fade-in-delay-2">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold">시장별 상세 분석</h2>
        <DataBadge origin={origin} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {signals.map((s, idx) => (
          <button
            key={s.market_code}
            onClick={() => setActiveTab(idx)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200
              ${idx === activeTab ? 'tab-active' : 'tab-inactive'}`}
          >
            <span>{levelEmoji(s.level)}</span>
            <span>{s.market_name}</span>
          </button>
        ))}
      </div>

      {/* Briefing */}
      {signal.briefing && (
        <div className="mb-5 p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[var(--card-border)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]">
              AI 브리핑
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {signal.briefing}
          </p>
        </div>
      )}

      {/* Contributors Bar Chart */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">기여 지표 분석</h3>
        <div className="space-y-3">
          {signal.contributors.map((c) => {
            const barWidth = maxContrib > 0 ? (Math.abs(c.contrib) / maxContrib) * 100 : 0;
            const isPositive = c.contrib > 0;

            return (
              <div key={c.indicator_code} className="group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{c.indicator_name}</span>
                    <span className="text-xs text-[var(--text-tertiary)] font-mono">
                      z={c.z_score.toFixed(2)}
                    </span>
                  </div>
                  <span className={`text-sm font-mono font-medium ${isPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                    {isPositive ? '+' : ''}{c.contrib.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${isPositive ? 'contrib-bar-positive' : 'contrib-bar-negative'}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                {/* Hover detail */}
                <div className="hidden group-hover:flex items-center gap-3 mt-1 text-xs text-[var(--text-tertiary)]">
                  <span>가중치: {c.weight}</span>
                  <span>방향: {c.sign === 1 ? '우호(+)' : '역풍(−)'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
