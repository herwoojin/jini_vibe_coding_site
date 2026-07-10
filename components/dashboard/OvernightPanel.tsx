'use client';

import type { DataOrigin } from '@/lib/types';
import type { OvernightMetric } from '@/lib/data/dashboard';
import DataBadge from './DataBadge';

interface OvernightPanelProps {
  metrics: OvernightMetric[];
  date: string;
  origin: DataOrigin;
}

export default function OvernightPanel({ metrics, date, origin }: OvernightPanelProps) {
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
    </section>
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
