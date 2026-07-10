'use client';

import type { Correlation, DataOrigin, Market, Indicator } from '@/lib/types';
import DataBadge from './DataBadge';

interface CorrelationHeatmapProps {
  correlations: Correlation[];
  markets: Market[];
  indicators: Indicator[];
  origin: DataOrigin;
}

export default function CorrelationHeatmap({ correlations, markets, indicators, origin }: CorrelationHeatmapProps) {
  // 상관계수에 포함된 지표만
  const indicatorIds = [...new Set(correlations.map(c => c.indicator_id))];
  const filteredIndicators = indicatorIds
    .map(id => indicators.find(i => i.id === id))
    .filter((i): i is Indicator => !!i);

  return (
    <section className="glass-card p-5 animate-fade-in animate-fade-in-delay-4">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold">거시×시장 상관관계</h2>
        <DataBadge origin={origin} />
      </div>
      <p className="text-xs text-[var(--text-tertiary)] mb-4">90일 롤링 상관계수 (−1 ~ +1)</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px]">
          <thead>
            <tr>
              <th className="text-left text-xs text-[var(--text-secondary)] pb-3 pr-4">지표</th>
              {markets.map(m => (
                <th key={m.code} className="text-center text-xs text-[var(--text-secondary)] pb-3 px-2">
                  {m.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredIndicators.map(ind => (
              <tr key={ind.code}>
                <td className="text-sm py-1.5 pr-4 text-[var(--text-secondary)]">{ind.name}</td>
                {markets.map(m => {
                  const corr = correlations.find(
                    c => c.market_id === m.id && c.indicator_id === ind.id
                  );
                  // 미계산 칸을 0.00 으로 그리면 "상관없음"으로 오독된다. 명시적으로 비운다.
                  if (!corr) {
                    return (
                      <td key={m.code} className="text-center py-1.5 px-2">
                        <div
                          className="heatmap-cell inline-flex items-center justify-center w-14 h-8 text-xs font-mono text-[var(--text-tertiary)]"
                          title={`${ind.name} × ${m.name}: 데이터 부족으로 미계산`}
                        >
                          ·
                        </div>
                      </td>
                    );
                  }
                  const coef = corr.coef;
                  return (
                    <td key={m.code} className="text-center py-1.5 px-2">
                      <div
                        className="heatmap-cell inline-flex items-center justify-center w-14 h-8 text-xs font-mono font-medium"
                        style={{
                          background: getHeatmapColor(coef),
                          color: Math.abs(coef) > 0.5 ? 'white' : 'var(--text-secondary)',
                        }}
                        title={`${ind.name} × ${m.name}: ${coef.toFixed(2)}`}
                      >
                        {coef.toFixed(2)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1 mt-4">
        <span className="text-xs text-[var(--text-tertiary)]">−1.0</span>
        <div className="flex h-3 rounded-full overflow-hidden">
          {[-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map(v => (
            <div
              key={v}
              className="w-6 h-3"
              style={{ background: getHeatmapColor(v) }}
            />
          ))}
        </div>
        <span className="text-xs text-[var(--text-tertiary)]">+1.0</span>
      </div>
    </section>
  );
}

function getHeatmapColor(coef: number): string {
  // -1 → deep red, 0 → neutral dark, +1 → deep green
  if (coef >= 0) {
    const intensity = Math.min(coef, 1);
    const r = Math.round(17 - intensity * 17);
    const g = Math.round(24 + intensity * 200);
    const b = Math.round(43 - intensity * 43);
    const a = 0.3 + intensity * 0.5;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } else {
    const intensity = Math.min(Math.abs(coef), 1);
    const r = Math.round(17 + intensity * 238);
    const g = Math.round(24 - intensity * 24);
    const b = Math.round(43 + intensity * 44);
    const a = 0.3 + intensity * 0.5;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
}
