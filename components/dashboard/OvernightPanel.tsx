'use client';

import type { DataOrigin } from '@/lib/types';
import type { OvernightMetric } from '@/lib/data/dashboard';
import type { OvernightImpact } from '@/lib/engine/overnight-impact';
import DataBadge from './DataBadge';

interface OvernightPanelProps {
  metrics: OvernightMetric[];
  date: string;
  origin: DataOrigin;
  impact: OvernightImpact | null;
}

export default function OvernightPanel({ metrics, date, origin, impact }: OvernightPanelProps) {
  return (
    <section className="glass-card p-5 animate-fade-in animate-fade-in-delay-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🌙</span>
        <h2 className="text-lg font-bold">밤사이 미국 종합</h2>
        <DataBadge origin={origin} />
        <span className="text-xs text-[var(--text-tertiary)] ml-auto">{date}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[var(--card-border)]">
            <span className="text-xs text-[var(--text-secondary)]">{m.label}</span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono">
                {formatMetric(m.value, m.format)}
              </span>
              <span className="text-xs text-[var(--text-tertiary)] ml-1">{m.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {impact && <ImpactBlock impact={impact} />}
    </section>
  );
}

const TONE_COLOR: Record<OvernightImpact['tone'], string> = {
  positive: 'var(--positive)',
  negative: 'var(--negative)',
  mixed: 'var(--accent-yellow)',
};

/** 밤사이 미국 지표가 오늘 한국 증시에 미칠 영향 */
function ImpactBlock({ impact }: { impact: OvernightImpact }) {
  return (
    <div
      className="mt-4 pt-4 border-t border-[var(--card-border)] border-l-2 pl-3"
      style={{ borderLeftColor: TONE_COLOR[impact.tone] }}
    >
      <h3 className="text-sm font-semibold mb-1">🇰🇷 오늘 한국 증시에 미칠 영향</h3>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
        {impact.summary}
      </p>

      <div className="space-y-3">
        {impact.factors.map(f => (
          <div
            key={f.label}
            className="rounded-lg p-2.5 bg-[rgba(255,255,255,0.02)] border-l-2"
            style={{ borderLeftColor: f.positive ? 'var(--positive)' : 'var(--negative)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded"
                style={{
                  color: f.positive ? 'var(--positive)' : 'var(--negative)',
                  background: f.positive ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)',
                }}
              >
                {f.positive ? '▲ 호재' : '▼ 부담'}
              </span>
              <span className="text-xs font-semibold text-[var(--text-secondary)]">{f.label}</span>
            </div>
            <p className="text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              {f.move} — {f.detail}
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">{f.plain}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
        ※ 전일 종가 기준 규칙 엔진의 일반적 해석입니다. 실제 시장은 개별 종목·수급·뉴스에
        따라 다르게 움직일 수 있으며, 투자 권유가 아닙니다.
      </p>
    </div>
  );
}

function formatMetric(value: number, format?: string): string {
  switch (format) {
    case 'rate':
      return value.toFixed(2);
    case 'index':
      return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
    case 'price':
      return value.toFixed(2);
    case 'fx':
      return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    default:
      return value.toFixed(2);
  }
}
