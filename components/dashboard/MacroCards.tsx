'use client';

import { useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import type { MacroCardData } from '@/lib/types';
import { INDICATOR_GUIDES } from '@/lib/engine/indicator-guide';
import DataBadge from './DataBadge';

interface MacroCardsProps {
  cards: MacroCardData[];
}

/** 지표 설명 팝업 — 오르내림이 경제·증시에 어떤 흐름을 만드는지 쉬운 말로 */
function GuideModal({ card, onClose }: { card: MacroCardData; onClose: () => void }) {
  const g = INDICATOR_GUIDES[card.indicator.code];
  if (!g) return null;

  const rising = card.changePct >= 0;
  const nowText = rising ? g.up : g.down;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${card.indicator.name} 설명`}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="glass-card w-full sm:max-w-lg max-h-[85vh] overflow-y-auto p-5 rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'var(--background)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-bold">{card.indicator.name}</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-mono font-bold">
                {formatValue(card.current, card.indicator.unit)}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">{card.indicator.unit}</span>
              <span
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: rising ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)',
                  color: rising ? 'var(--positive)' : 'var(--negative)',
                }}
              >
                {rising ? '▲' : '▼'} {card.changePct >= 0 ? '+' : ''}
                {card.changePct.toFixed(2)}%
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-[var(--text-secondary)] hover:text-[var(--foreground)] text-xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <Section title="이게 뭔가요?" body={g.what} />
        <Section title="왜 중요한가요?" body={g.why} />

        {/* 지금 방향에 해당하는 해석을 강조 */}
        <div
          className="rounded-lg p-3 my-3 border-l-2"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderLeftColor: rising ? 'var(--positive)' : 'var(--negative)',
          }}
        >
          <div className="text-xs font-semibold mb-1">
            📍 지금은 {rising ? '오르는' : '내리는'} 중 — 이런 흐름이 생깁니다
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{nowText}</p>
        </div>

        <details className="mb-3">
          <summary className="text-xs text-[var(--text-tertiary)] cursor-pointer">
            반대로 {rising ? '내릴' : '오를'} 때는?
          </summary>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
            {rising ? g.down : g.up}
          </p>
        </details>

        <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.03)]">
          <div className="text-xs font-semibold mb-1">🇰🇷 한국 증시에서는</div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{g.koreaTip}</p>
        </div>

        <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
          ※ 일반적인 경제 흐름 설명이며, 실제 시장은 여러 요인이 겹쳐 다르게 움직일 수 있습니다.
          투자 권유가 아닙니다.
        </p>
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold mb-1">{title}</div>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{body}</p>
    </div>
  );
}

const categoryLabels: Record<string, string> = {
  rate: '💰 금리',
  fx: '💱 환율',
  oil: '🛢️ 유가',
  commodity: '🥇 원자재',
  index: '📊 지수',
};

const categoryOrder = ['rate', 'fx', 'oil', 'commodity', 'index'];

export default function MacroCards({ cards }: MacroCardsProps) {
  const [selected, setSelected] = useState<MacroCardData | null>(null);

  // 카테고리별 그룹핑
  const grouped = categoryOrder
    .map(cat => ({
      label: categoryLabels[cat] || cat,
      items: cards.filter(c => c.indicator.category === cat),
    }))
    .filter(g => g.items.length > 0);

  return (
    <section className="animate-fade-in animate-fade-in-delay-3">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-lg font-bold">거시지표 현황</h2>
        <span className="text-[11px] text-[var(--text-tertiary)]">
          카드를 누르면 쉬운 설명이 나옵니다
        </span>
      </div>

      <div className="space-y-5">
        {grouped.map((group) => (
          <div key={group.label}>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">{group.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map((card) => (
                <MacroCard
                  key={card.indicator.code}
                  card={card}
                  onSelect={INDICATOR_GUIDES[card.indicator.code] ? setSelected : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && <GuideModal card={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function MacroCard({
  card,
  onSelect,
}: {
  card: MacroCardData;
  onSelect?: (c: MacroCardData) => void;
}) {
  const isPositive = card.changePct >= 0;
  const sparkData = card.sparkline.map((v, i) => ({ v, i }));
  const clickable = Boolean(onSelect);

  return (
    <div
      className={`glass-card p-4 flex flex-col gap-2 ${clickable ? 'cursor-pointer transition-transform hover:-translate-y-0.5' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? `${card.indicator.name} 설명 보기` : undefined}
      onClick={() => onSelect?.(card)}
      onKeyDown={e => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect?.(card);
        }
      }}
    >
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
