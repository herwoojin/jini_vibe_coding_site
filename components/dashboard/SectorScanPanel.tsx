'use client';

import { useState } from 'react';
import type { SectorScan, SectorLeader } from '@/lib/ai/sector-scan';
import StockAnalysisModal from './StockAnalysisModal';

const SENTIMENT: Record<string, { label: string; color: string }> = {
  risk_on: { label: '🔥 위험선호', color: 'var(--positive)' },
  risk_off: { label: '🧊 위험회피', color: 'var(--negative)' },
  neutral: { label: '⚖️ 중립', color: 'var(--accent-yellow)' },
};

const RANK_ICON = ['🥇', '🥈', '🥉', '4️⃣'];
const ROLE_COLOR: Record<string, string> = {
  대장주: '#ffd166',
  '2등주': '#c9d1d9',
  소외주: 'var(--text-tertiary)',
};

const ACTION_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  buy: { bg: 'var(--accent-red-dim)', fg: '#FF3B30', label: '매수' },
  sell: { bg: 'rgba(10,132,255,0.15)', fg: '#0A84FF', label: '매도' },
  watch: { bg: 'rgba(255,255,255,0.04)', fg: 'var(--text-secondary)', label: '관망' },
};

const num = (n: number | null, suffix = '') =>
  n === null || n === undefined ? '—' : `${Math.round(n).toLocaleString('ko-KR')}${suffix}`;
const pctText = (n: number | null) =>
  n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export default function SectorScanPanel() {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; scan: SectorScan; cached: boolean; stale?: boolean }
  >({ kind: 'idle' });
  const [analyzing, setAnalyzing] = useState<{ symbol: string; name: string } | null>(null);

  async function run() {
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/sector-scan');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '스캔에 실패했습니다.');
      setState({ kind: 'done', scan: json.scan, cached: json.cached, stale: json.stale });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : '스캔 실패' });
    }
  }

  /** 6자리 코드가 있는 종목만 개별 분석으로 연결한다 (없으면 버튼 비활성) */
  function openAnalysis(name: string, ticker: string) {
    if (!/^\d{6}$/.test(ticker)) return;
    // 코스피/코스닥 판별은 서버가 한다 (여기서 .KS 를 붙이면 코스닥 종목이 실패한다).
    setAnalyzing({ symbol: ticker, name });
  }

  return (
    <section className="glass-card p-5 animate-fade-in animate-fade-in-delay-2">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-lg">🔥</span>
        <h2 className="text-lg font-bold">오늘의 주도주 섹터</h2>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent-green-dim)] text-[var(--positive)]">
          Gemini + 검색
        </span>
        <button
          onClick={run}
          disabled={state.kind === 'loading'}
          className="ml-auto text-xs font-bold px-3 py-1.5 rounded disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)', color: '#fff' }}
        >
          {state.kind === 'loading' ? '⏳ 스캔 중…' : state.kind === 'done' ? '🔄 다시 스캔' : '✨ 스캔 시작'}
        </button>
      </div>
      <p className="text-[11px] text-[var(--text-tertiary)] mb-3">
        오늘 거래대금·등락률 상위 섹터와 그 안의 매매 후보를 Google 검색으로 조사합니다.
        장중 5분 · 장외 30분 캐시로 중복 호출을 막습니다.
      </p>

      {state.kind === 'idle' && (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">
          스캔 시작을 누르면 오늘의 주도 섹터를 분석합니다 (약 60초).
        </p>
      )}

      {state.kind === 'loading' && (
        <div className="py-8 text-center">
          <div className="text-sm animate-pulse">⏳ 오늘 장의 주도 섹터를 검색·분석 중…</div>
          <div className="text-[11px] text-[var(--text-tertiary)] mt-2">
            지수·거래대금·수급·촉매를 조사합니다 (최대 2분)
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <p className="py-6 text-sm text-center" style={{ color: 'var(--negative)' }}>
          ⚠️ {state.message}
        </p>
      )}

      {state.kind === 'done' && (
        <ScanResult
          scan={state.scan}
          cached={state.cached}
          stale={state.stale}
          onAnalyze={openAnalysis}
        />
      )}

      {analyzing && (
        <StockAnalysisModal
          symbol={analyzing.symbol}
          name={analyzing.name}
          onClose={() => setAnalyzing(null)}
        />
      )}
    </section>
  );
}

function ScanResult({
  scan,
  cached,
  stale,
  onAnalyze,
}: {
  scan: SectorScan;
  cached: boolean;
  stale?: boolean;
  onAnalyze: (name: string, ticker: string) => void;
}) {
  const m = scan.market_summary;
  const sent = SENTIMENT[m.sentiment] ?? SENTIMENT.neutral;
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell' | 'today'>('all');

  const filtered = scan.watch_list.filter(w =>
    filter === 'all' ? true : filter === 'today' ? w.urgency === 'today' : w.action === filter,
  );

  return (
    <>
      {scan.ungrounded && (
        <div className="mb-3 p-2 rounded text-xs" style={{ background: 'var(--accent-red-dim)', color: 'var(--negative)' }}>
          ⚠️ 실시간 검색에 실패했습니다. 수치를 신뢰하지 마십시오.
        </div>
      )}
      {stale && (
        <div className="mb-3 p-2 rounded text-xs" style={{ background: 'var(--accent-yellow-dim)', color: 'var(--accent-yellow)' }}>
          ⚠️ 이번 스캔에 실패해 직전 결과를 보여드립니다.
        </div>
      )}

      {/* 시장 요약 */}
      <div className="rounded-lg p-3 mb-3 bg-[rgba(255,255,255,0.03)]">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-semibold">{m.index_name}</span>
          {m.index_value !== null && (
            <span className="font-mono text-sm">{m.index_value.toLocaleString('ko-KR')}</span>
          )}
          {m.index_change_pct !== null && (
            <span
              className="font-mono text-xs"
              style={{ color: m.index_change_pct >= 0 ? 'var(--positive)' : 'var(--negative)' }}
            >
              {pctText(m.index_change_pct)}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: sent.color }}>
            {sent.label}
          </span>
          <span className="ml-auto text-[10px] text-[var(--text-tertiary)] font-mono">
            {scan.as_of}
            {cached && ' · 캐시'}
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{m.headline}</p>
        <p className="text-[11px] text-[var(--text-tertiary)] mt-1">💰 {m.foreign_net_buy}</p>
      </div>

      {/* 주도 섹터 */}
      {scan.leading_sectors.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
          오늘은 뚜렷한 주도 섹터가 확인되지 않았습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          {scan.leading_sectors.map(sec => (
            <div
              key={sec.rank}
              className="rounded-lg p-3 border"
              style={{
                background: 'rgba(255,255,255,0.02)',
                borderColor: sec.strength === 'strong' ? 'var(--accent-yellow)' : 'var(--card-border)',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span>{RANK_ICON[sec.rank - 1] ?? '•'}</span>
                <span className="text-sm font-bold">{sec.sector_name}</span>
                {sec.change_pct !== null && (
                  <span className="text-xs font-mono" style={{ color: 'var(--positive)' }}>
                    {pctText(sec.change_pct)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-2">
                {sec.catalyst}
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {sec.leaders.map((l: SectorLeader) => {
                  const clickable = /^\d{6}$/.test(l.ticker);
                  return (
                    <button
                      key={`${l.name}-${l.ticker}`}
                      onClick={() => onAnalyze(l.name, l.ticker)}
                      disabled={!clickable}
                      title={clickable ? `${l.name} 개별 분석` : '종목코드를 확인하지 못해 분석할 수 없습니다'}
                      className="text-[10px] px-1.5 py-0.5 rounded border disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        borderColor: 'var(--card-border)',
                        color: ROLE_COLOR[l.role] ?? 'var(--text-secondary)',
                      }}
                    >
                      {l.name}
                      {l.change_pct !== null && ` ${pctText(l.change_pct)}`}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)]">{sec.sustainability}</p>
            </div>
          ))}
        </div>
      )}

      {/* 매매 후보 */}
      {scan.watch_list.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold">매매 후보 {scan.watch_list.length}개</h3>
            {(['all', 'buy', 'sell', 'today'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[10px] px-2 py-0.5 rounded-full border"
                style={{
                  borderColor: filter === f ? 'var(--positive)' : 'var(--card-border)',
                  color: filter === f ? 'var(--positive)' : 'var(--text-tertiary)',
                }}
              >
                {{ all: '전체', buy: '매수만', sell: '매도만', today: '오늘 급함' }[f]}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[560px]">
              <thead>
                <tr className="text-[var(--text-tertiary)]">
                  <th className="text-left pb-1">종목</th>
                  <th className="text-left pb-1">섹터</th>
                  <th className="text-center pb-1">액션</th>
                  <th className="text-right pb-1">진입</th>
                  <th className="text-right pb-1">목표</th>
                  <th className="text-right pb-1">손절</th>
                  <th className="text-right pb-1">여력</th>
                  <th className="text-right pb-1">신뢰도</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => {
                  const st = ACTION_STYLE[w.action] ?? ACTION_STYLE.watch;
                  const clickable = /^\d{6}$/.test(w.ticker);
                  return (
                    <tr key={`${w.name}-${w.ticker}`} style={{ background: st.bg }}>
                      <td className="py-1.5">
                        <button
                          onClick={() => onAnalyze(w.name, w.ticker)}
                          disabled={!clickable}
                          className="underline disabled:no-underline disabled:opacity-60"
                          title={clickable ? '개별 분석' : '종목코드 미확인'}
                        >
                          {w.urgency === 'today' && '🔴 '}
                          {w.name}
                        </button>
                      </td>
                      <td className="text-[var(--text-tertiary)]">{w.sector}</td>
                      <td className="text-center font-bold" style={{ color: st.fg }}>
                        {st.label}
                      </td>
                      <td className="text-right font-mono">{num(w.entry_price)}</td>
                      <td className="text-right font-mono">{num(w.target_price)}</td>
                      <td className="text-right font-mono">{num(w.stop_loss)}</td>
                      <td className="text-right font-mono">{pctText(w.upside_pct)}</td>
                      <td className="text-right font-mono">{Math.round(w.confidence * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <details className="mt-2">
            <summary className="text-[11px] text-[var(--text-tertiary)] cursor-pointer">
              후보별 근거·리스크 보기
            </summary>
            <ul className="mt-2 space-y-2">
              {filtered.map(w => (
                <li key={`d-${w.name}`} className="text-[11px]">
                  <strong>{w.name}</strong> — {w.reason}
                  <div className="text-[var(--text-tertiary)]">⚠️ {w.risk}</div>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {/* 회피 섹터 */}
      {scan.avoid_sectors.length > 0 && (
        <details className="mt-3">
          <summary className="text-[11px] text-[var(--text-tertiary)] cursor-pointer">
            🧊 오늘 자금이 빠진 섹터 {scan.avoid_sectors.length}개
          </summary>
          <ul className="mt-2 space-y-1">
            {scan.avoid_sectors.map(a => (
              <li key={a.sector_name} className="text-[11px] text-[var(--text-secondary)]">
                <strong>{a.sector_name}</strong> — {a.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {scan.sources.length > 0 && (
        <details className="mt-2">
          <summary className="text-[11px] text-[var(--text-tertiary)] cursor-pointer">
            🔍 검색 출처 {scan.sources.length}개
          </summary>
          <ul className="mt-1 space-y-0.5">
            {scan.sources.slice(0, 10).map((s, i) => (
              <li key={i} className="text-[10px] truncate">
                <a href={s.uri} target="_blank" rel="noopener noreferrer" className="underline text-[var(--text-secondary)]">
                  {s.title || s.uri}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[10px] text-[var(--text-tertiary)] mt-3 pt-2 border-t border-[var(--card-border)] leading-relaxed">
        본 화면은 AI 가 공개 정보를 검색·요약한 결과로 투자 권유가 아닙니다. 수치는 실제와 다를 수
        있으니 반드시 증권사 HTS/MTS 에서 확인 후 투자하십시오. 투자 판단과 그 결과에 대한 책임은
        투자자 본인에게 있습니다.
      </p>
    </>
  );
}
