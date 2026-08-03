'use client';

import { useEffect, useState } from 'react';
import type { StockAnalysis } from '@/lib/ai/stock-research';

/** 한국 증시 관례: 상승·매수 = 빨강, 하락·매도 = 파랑 */
const SIGNAL_STYLE: Record<string, { color: string; label: string; dot: string }> = {
  buy: { color: '#FF3B30', label: '매수', dot: '🔴' },
  sell: { color: '#0A84FF', label: '매도', dot: '🔵' },
  hold: { color: '#8E8E93', label: '관망', dot: '⚪' },
};

const CHECK_ICONS: [keyof StockAnalysis['signal']['checklist'], string, string][] = [
  ['volume_profile', '📊', '매물대'],
  ['moving_avg', '📈', '이평선'],
  ['news', '📰', '뉴스'],
  ['disclosure', '📋', '공시'],
  ['momentum', '⚡', '모멘텀'],
  ['leading_sector', '🔥', '주도주'],
  ['closing_bet', '⏰', '종가베팅'],
];

export default function StockAnalysisModal({
  symbol,
  name,
  onClose,
}: {
  symbol: string;
  name: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; data: StockAnalysis; warning?: string }
  >({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/stock-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, name }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '분석에 실패했습니다.');
        setState({ kind: 'done', data: json.analysis, warning: json.warning });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : '분석 실패' });
      }
    })();
    return () => controller.abort();
  }, [symbol, name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const money = (n: number | null, cur: string) =>
    n === null ? '—' : `${Math.round(n).toLocaleString('ko-KR')}${cur === 'KRW' ? '원' : ''}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} 매매 타이밍 분석`}
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="glass-card w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'var(--background)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--card-border)] sticky top-0 z-10"
             style={{ background: 'var(--background)' }}>
          <div className="flex items-center gap-2">
            <span className="text-lg">📈</span>
            <div>
              <div className="text-sm font-bold">AI 매수·매도 타이밍 분석</div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                {name} · 실시간 뉴스/공시/주도섹터 검색
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded border border-[var(--card-border)] text-[var(--text-secondary)]"
          >
            닫기 (Esc)
          </button>
        </div>

        <div className="p-4">
          {state.kind === 'loading' && (
            <div className="py-10 text-center">
              <div className="text-sm animate-pulse">
                ⏳ 시세 조회 + 매수·매도 타이밍 분석 중…
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-2">
                Google 검색으로 뉴스·공시·주도섹터를 조사합니다 (최대 60초)
              </div>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--negative)' }}>
                ⚠️ {state.message}
              </p>
            </div>
          )}

          {state.kind === 'done' && (
            <Result data={state.data} warning={state.warning} money={money} />
          )}
        </div>
      </div>
    </div>
  );
}

function Result({
  data,
  warning,
  money,
}: {
  data: StockAnalysis;
  warning?: string;
  money: (n: number | null, cur: string) => string;
}) {
  const { quote: q, signal: s } = data;
  const st = SIGNAL_STYLE[s.signal] ?? SIGNAL_STYLE.hold;
  const up = q.changePct >= 0;

  return (
    <>
      {/* 검색 실패 경고 — 가장 위험한 상태이므로 최상단 */}
      {data.ungrounded && (
        <div className="mb-3 p-2 rounded text-xs" style={{ background: 'var(--accent-red-dim)', color: 'var(--negative)' }}>
          ⚠️ 실시간 검색 근거를 확보하지 못했습니다. 뉴스·공시 항목은 비워졌으며 판단 신뢰도가 낮습니다.
        </div>
      )}
      {warning && (
        <div className="mb-3 p-2 rounded text-xs" style={{ background: 'var(--accent-yellow-dim)', color: 'var(--accent-yellow)' }}>
          ⚠️ {warning}
        </div>
      )}

      {/* 신호 헤더 */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xl font-bold" style={{ color: st.color }}>
          {st.dot} {st.label}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)]">방금 분석</span>
        <span className="text-xs text-[var(--text-secondary)] ml-auto">
          신뢰도 {Math.round(s.confidence * 100)}%
        </span>
      </div>

      {/* 시세 (실측) */}
      <div className="flex flex-wrap items-baseline gap-2 mb-1">
        <span className="text-sm text-[var(--text-secondary)]">현재가</span>
        <span className="text-xl font-bold font-mono">{money(q.price, q.currency)}</span>
        <span className="text-sm font-mono" style={{ color: up ? 'var(--positive)' : 'var(--negative)' }}>
          ({up ? '+' : ''}
          {q.changePct.toFixed(2)}%)
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-green-dim)]"
          style={{ color: 'var(--positive)' }}
          title="Yahoo Finance 실측 시세이며 AI 가 생성한 값이 아닙니다"
        >
          ● 실측
        </span>
      </div>
      <div className="text-[11px] text-[var(--text-tertiary)] mb-3 font-mono">
        52주 {Math.round(q.week52High).toLocaleString()} / {Math.round(q.week52Low).toLocaleString()} · 이평
        5·20·60: {q.ma5 ? Math.round(q.ma5).toLocaleString() : '—'} ·{' '}
        {q.ma20 ? Math.round(q.ma20).toLocaleString() : '—'} ·{' '}
        {q.ma60 ? Math.round(q.ma60).toLocaleString() : '—'} · 기준일 {q.asOf}
      </div>

      {/* 가격 3분할 */}
      {(s.entry_price || s.target_price || s.stop_loss || s.exit_price) && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <PriceBox label={s.signal === 'sell' ? '🔵 매도가' : '🔻 진입가'}
                    value={money(s.signal === 'sell' ? s.exit_price : s.entry_price, q.currency)} />
          <PriceBox label="🎯 익절목표" value={money(s.target_price, q.currency)} tone="var(--positive)" />
          <PriceBox label="🛑 손절가" value={money(s.stop_loss, q.currency)} tone="var(--negative)" />
        </div>
      )}

      {/* 근거 */}
      <div className="rounded-lg p-3 mb-3 text-xs leading-relaxed bg-[rgba(255,255,255,0.03)]">
        💡 {s.reasoning}
      </div>

      {/* 뱃지 */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Badge
          on={s.leading_sector_today}
          onText={`🔥 오늘 주도주${s.leading_sector_name ? ` · ${s.leading_sector_name}` : ''}`}
          offText="주도주 아님"
        />
        <Badge on={s.closing_bet?.recommended} onText="🕒 종가베팅 권고" offText="종가베팅 비권고" />
      </div>

      {/* 체크리스트 */}
      <div className="space-y-1 mb-3">
        {CHECK_ICONS.map(([key, icon, label]) => (
          <div key={key} className="flex gap-2 text-[11px]">
            <span className="shrink-0">{icon}</span>
            <span className="shrink-0 text-[var(--text-secondary)] w-14">{label}:</span>
            <span className="text-[var(--text-tertiary)] leading-relaxed">
              {s.checklist?.[key] ?? '—'}
            </span>
          </div>
        ))}
      </div>

      {/* 출처 */}
      {data.sources.length > 0 && (
        <details className="mb-2">
          <summary className="text-[11px] text-[var(--text-tertiary)] cursor-pointer">
            🔍 검색 출처 {data.sources.length}개 보기
          </summary>
          <ul className="mt-2 space-y-1">
            {data.sources.slice(0, 10).map((src, i) => (
              <li key={i} className="text-[10px] truncate">
                <a href={src.uri} target="_blank" rel="noopener noreferrer"
                   className="text-[var(--text-secondary)] underline">
                  {src.title || src.uri}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[10px] text-[var(--text-tertiary)] pt-2 border-t border-[var(--card-border)]">
        업데이트: {new Date(data.analyzedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST ·
        출처 {data.sources.length}개
        <br />
        시세·이평선은 Yahoo Finance 실측이며, 뉴스·공시·주도섹터 판단은 AI 가 Google 검색으로 조사한
        결과입니다. <strong>AI 분석 결과이며 투자 권유가 아닙니다. 투자 판단과 책임은 본인에게 있습니다.</strong>
      </p>
    </>
  );
}

function PriceBox({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="text-center py-2 rounded bg-[rgba(255,255,255,0.03)]">
      <div className="text-[10px] text-[var(--text-tertiary)]">{label}</div>
      <div className="text-xs font-mono font-bold" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function Badge({ on, onText, offText }: { on?: boolean; onText: string; offText: string }) {
  return (
    <span
      className="text-[11px] px-2 py-1 rounded-full"
      style={{
        background: on ? 'var(--accent-yellow-dim)' : 'rgba(255,255,255,0.04)',
        color: on ? 'var(--accent-yellow)' : 'var(--text-tertiary)',
      }}
    >
      {on ? onText : offText}
    </span>
  );
}
