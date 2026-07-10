'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';
import type { MacroCardData } from '@/lib/types';
import DataBadge from './DataBadge';

interface MacroCardsProps {
  cards: MacroCardData[];
}

const categoryLabels: Record<string, string> = {
  rate: '💰 금리',
  fx: '💱 환율',
  oil: '🛢️ 유가',
  index: '📊 지수',
};

const categoryOrder = ['rate', 'fx', 'oil', 'index'];

export default function MacroCards({ cards }: MacroCardsProps) {
  // 카테고리별 그룹핑
  const grouped = categoryOrder
    .map(cat => ({
      label: categoryLabels[cat] || cat,
      items: cards.filter(c => c.indicator.category === cat),
    }))
    .filter(g => g.items.length > 0);

  return (
    <section className="animate-fade-in animate-fade-in-delay-3">
      <h2 className="text-lg font-bold mb-4">거시지표 현황</h2>

      <div className="space-y-5">
        {grouped.map((group) => (
          <div key={group.label}>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">{group.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map((card) => (
                <MacroCard key={card.indicator.code} card={card} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MacroCard({ card }: { card: MacroCardData }) {
  const isPositive = card.changePct >= 0;
  const sparkData = card.sparkline.map((v, i) => ({ v, i }));

  return (
    <div className="glass-card p-4 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--text-secondary)] truncate">{card.indicator.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          {card.stale && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--accent-yellow-dim)] text-[var(--accent-yellow)]">
              ⚠️ 지연
            </span>
          )}
          <DataBadge origin={card.origin} />
        </div>
      </div>

      {/* Value + Change */}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold font-mono">
          {formatValue(card.current, card.indicator.unit)}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">{card.indicator.unit}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className={`text-sm font-mono ${isPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
          {isPositive ? '▲' : '▼'} {formatChange(card.changeAbs)}
        </span>
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${isPositive ? 'bg-[var(--accent-green-dim)] text-[var(--positive)]' : 'bg-[var(--accent-red-dim)] text-[var(--negative)]'}`}>
          {isPositive ? '+' : ''}{card.changePct.toFixed(2)}%
        </span>
      </div>

      {/* 관측일 — 값이 언제 기준인지 숨기지 않는다 */}
      {card.origin === 'live' && (
        <span className="text-[10px] text-[var(--text-secondary)] font-mono">
          기준일 {card.asOf}
        </span>
      )}

      {/* Sparkline */}
      <div className="h-10 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={isPositive ? 'var(--positive)' : 'var(--negative)'}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * 소수점 2자리로 고정하면 국고채(3자리)의 -0.005 변화가 "0.00" 으로 뭉개져
 * 변화율(-0.13%)과 모순된다. 0 이 아닌 값은 0 처럼 보이지 않게 자릿수를 늘린다.
 */
function formatChange(changeAbs: number): string {
  const abs = Math.abs(changeAbs);
  if (abs === 0) return '0.00';
  if (abs < 0.001) return abs.toExponential(1);
  if (abs < 0.01) return abs.toFixed(3);
  return abs.toFixed(2);
}

function formatValue(value: number, unit: string): string {
  if (unit === 'KRW' || unit === 'JPY' || unit === 'pt') {
    if (value >= 1000) {
      return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
    }
  }
  if (unit === '%') return value.toFixed(2);
  if (unit === 'USD/bbl') return value.toFixed(2);
  return value.toFixed(2);
}
