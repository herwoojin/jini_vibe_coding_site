import type { SlottedAnalysis } from '@/lib/ai/analysis';
import type { AiUsMarket } from '@/lib/ai/gemini';

/** 05:30 슬롯 — 미 증시 마감 직후 주도 흐름 */
function UsMarketBlock({ us }: { us: AiUsMarket }) {
  const dirColor =
    us.nasdaq_direction === '상승'
      ? 'var(--positive)'
      : us.nasdaq_direction === '하락'
        ? 'var(--negative)'
        : 'var(--accent-yellow)';
  const riskColor =
    us.risk_appetite === '개선'
      ? 'var(--positive)'
      : us.risk_appetite === '악화'
        ? 'var(--negative)'
        : 'var(--accent-yellow)';

  return (
    <div className="mb-4 p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[var(--card-border)]">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm font-semibold">🇺🇸 밤사이 미 증시 주도 흐름</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: dirColor }}>
          나스닥 {us.nasdaq_direction}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.05)]">
          {us.leadership}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: riskColor }}>
          위험선호 {us.risk_appetite}
        </span>
      </div>
      <ul className="space-y-1">
        {us.notes.map((n, i) => (
          <li key={i} className="text-xs text-[var(--text-secondary)] leading-relaxed">
            · {n}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-[var(--text-tertiary)] mt-2">
        ※ 무료 데이터에 야간 선물지수·업종별 ETF가 없어, 나스닥100(성장) vs 다우(가치) 상대
        강도와 VIX로 주도 스타일을 추정합니다.
      </p>
    </div>
  );
}

const OPINION_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  매수: { bg: 'var(--accent-green-dim)', fg: 'var(--positive)', icon: '▲' },
  중립: { bg: 'var(--accent-yellow-dim)', fg: 'var(--accent-yellow)', icon: '─' },
  매도: { bg: 'var(--accent-red-dim)', fg: 'var(--negative)', icon: '▼' },
};

export default function AIAnalysisPanel({ data }: { data: SlottedAnalysis | null }) {
  return (
    <section className="glass-card p-5 animate-fade-in animate-fade-in-delay-2">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-lg">🤖</span>
        <h2 className="text-lg font-bold">AI 시장 분석</h2>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent-green-dim)] text-[var(--positive)]">
          Gemini
        </span>
        {data && (
          <span className="text-xs text-[var(--text-secondary)] ml-auto font-mono">
            {data.slot.label}
          </span>
        )}
      </div>
      {data?.stale && (
        <p className="text-xs mb-3 px-2 py-1.5 rounded bg-[var(--accent-yellow-dim)] text-[var(--accent-yellow)]">
          ⚠️ 이번 슬롯 분석이 아직 없어 가장 최근 분석({data.slot.label})을 보여드립니다. 다음
          방문 시 자동으로 재시도합니다.
        </p>
      )}

      {!data ? (
        <p className="text-sm text-[var(--text-secondary)]">
          아직 첫 AI 분석이 없습니다. 다음 방문 시 자동으로 시도합니다.
        </p>
      ) : (
        <>
          {data.analysis.us_market && <UsMarketBlock us={data.analysis.us_market} />}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {data.analysis.markets.map(m => {
              const st = OPINION_STYLE[m.opinion] ?? OPINION_STYLE['중립'];
              return (
                <div
                  key={m.market_code}
                  className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[var(--card-border)]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{m.market_name}</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: st.bg, color: st.fg }}
                    >
                      {st.icon} {m.opinion}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-2">
                    확신도 {m.confidence}
                  </div>
                  <ul className="space-y-1">
                    {m.reasons.map((r, i) => (
                      <li key={i} className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        · {r}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed border-t border-[var(--card-border)] pt-3">
            {data.analysis.overall}
          </p>
        </>
      )}
    </section>
  );
}
