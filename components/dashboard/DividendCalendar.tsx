'use client';

import { useState } from 'react';
import type { CachedDividends } from '@/lib/data/dividend-cache';
import type { DividendStock } from '@/lib/engine/dividend';
import StockAnalysisModal from './StockAnalysisModal';
import DataNotices from './DataNotices';

const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

const SUSTAIN_BG: Record<string, string> = {
  안정: 'var(--accent-green-dim)',
  보통: 'rgba(255,255,255,0.03)',
  주의: 'var(--accent-red-dim)',
};
const SUSTAIN_FG: Record<string, string> = {
  안정: 'var(--positive)',
  보통: 'var(--text-secondary)',
  주의: 'var(--negative)',
};

/** 추정값임을 한눈에 알리는 배지 — 실측과 절대 섞이지 않게 한다. */
function EstBadge({ confidence }: { confidence: DividendStock['estConfidence'] }) {
  return (
    <span
      title="확정 공시가 아니라 과거 배당 월 패턴에서 추정한 값입니다. 실제 배당락일은 기업 공시(DART)로 반드시 확인하세요."
      className="text-[9px] font-medium px-1 py-0.5 rounded bg-[var(--accent-yellow-dim)] text-[var(--accent-yellow)] whitespace-nowrap"
    >
      추정 · 신뢰도 {confidence}
    </span>
  );
}

/** 이번 달 캘린더에 배당락일(추정)을 표시 */
function MonthGrid({ stocks, today }: { stocks: DividendStock[]; today: Date }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();

  // 일자 → 그날 배당락(추정)인 종목들
  const byDay = new Map<number, DividendStock[]>();
  for (const s of stocks) {
    if (!s.nextExDateEst) continue;
    const d = new Date(s.nextExDateEst);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      byDay.set(day, [...(byDay.get(day) ?? []), s]);
    }
  }

  const cells: (number | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div
            key={d}
            className="text-[10px] text-center py-1"
            style={{
              color: i === 0 ? 'var(--negative)' : i === 6 ? 'var(--accent-blue, #6ba3f5)' : 'var(--text-tertiary)',
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const hits = byDay.get(day) ?? [];
          const isToday = day === today.getDate();
          return (
            <div
              key={day}
              className="min-h-[52px] rounded-lg p-1 text-[10px] border"
              style={{
                background: hits.length ? 'var(--accent-yellow-dim)' : 'rgba(255,255,255,0.02)',
                borderColor: isToday ? 'var(--positive)' : 'var(--card-border)',
              }}
            >
              <div
                className="font-mono mb-0.5"
                style={{ color: isToday ? 'var(--positive)' : 'var(--text-tertiary)' }}
              >
                {day}
              </div>
              {hits.map(s => (
                <div
                  key={s.symbol}
                  className="truncate leading-tight text-[var(--accent-yellow)]"
                  title={`${s.name} 배당락일 추정 (신뢰도 ${s.estConfidence})`}
                >
                  {s.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StockRow({ s, onAnalyze }: { s: DividendStock; onAnalyze: (s: DividendStock) => void }) {
  return (
    <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[var(--card-border)]">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm font-semibold">{s.name}</span>
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{s.symbol}</span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ background: 'var(--accent-green-dim)', color: 'var(--positive)' }}
        >
          수익률 {s.yieldPct.toFixed(2)}%
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.05)]">
          {s.frequency}배당
        </span>
        <span className="ml-auto text-xs font-mono">{won(s.price)}원</span>
        <button
          onClick={() => onAnalyze(s)}
          className="text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap"
          style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)', color: '#fff' }}
          title="Google 검색으로 뉴스·공시·주도섹터를 조사해 매매 타이밍을 분석합니다"
        >
          ✨ 매매 분석
        </button>
      </div>

      {/* 실측 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] mb-2">
        <div>
          <div className="text-[var(--text-tertiary)]">최근 1년 배당</div>
          <div className="font-mono text-[var(--text-secondary)]">{won(s.ttmDividend)}원</div>
        </div>
        <div>
          <div className="text-[var(--text-tertiary)]">연속 배당</div>
          <div className="font-mono text-[var(--text-secondary)]">
            {s.consecutiveYears}년 · {s.payoutCount}회
          </div>
        </div>
        <div>
          <div className="text-[var(--text-tertiary)]">전년 동월 대비</div>
          <div
            className="font-mono"
            style={{
              color:
                s.growthPct === null
                  ? 'var(--text-secondary)'
                  : s.growthPct >= 0
                    ? 'var(--positive)'
                    : 'var(--negative)',
            }}
          >
            {s.growthPct === null ? '비교 불가' : pct(s.growthPct)}
          </div>
        </div>
        <div>
          <div className="text-[var(--text-tertiary)]">직전 배당락일(확정)</div>
          <div className="font-mono text-[var(--text-secondary)]">
            {s.lastExDate} · {won(s.lastAmount)}원
          </div>
        </div>
      </div>

      {/* 공시(DART) 기반 배당 지속가능성 */}
      {s.sustainability && s.dart && (
        <div
          className="flex flex-wrap items-start gap-2 text-[11px] py-1.5 px-2 rounded mb-2"
          style={{ background: SUSTAIN_BG[s.sustainability.level] }}
        >
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ color: SUSTAIN_FG[s.sustainability.level] }}
            title="DART 전자공시 사업보고서의 배당성향(순이익 중 배당 비율)에 근거한 판정입니다"
          >
            공시 · 지속성 {s.sustainability.level}
          </span>
          <span className="text-[var(--text-secondary)] leading-relaxed flex-1 min-w-[200px]">
            {s.sustainability.note}
            <span className="text-[var(--text-tertiary)]">
              {' '}
              ({s.dart.year} 사업보고서
              {s.dart.dividendPerShare !== null && ` · 주당 ${won(s.dart.dividendPerShare)}원`})
            </span>
          </span>
        </div>
      )}

      {/* 추정 일정 */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] py-1.5 px-2 rounded bg-[rgba(255,255,255,0.02)] mb-2">
        <EstBadge confidence={s.estConfidence} />
        <span className="text-[var(--text-secondary)]">
          다음 배당락일 <strong className="font-mono">{s.nextExDateEst ?? '판단 불가'}</strong>
        </span>
        {s.buyByEst && (
          <span className="text-[var(--text-secondary)]">
            → 매수 마감 <strong className="font-mono text-[var(--accent-yellow)]">{s.buyByEst}</strong>
          </span>
        )}
      </div>

      {/* 규칙 계산 */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="text-center py-1 rounded bg-[rgba(255,255,255,0.02)]">
          <div className="text-[var(--text-tertiary)]">진입(종가)</div>
          <div className="font-mono">{won(s.plan.entry)}</div>
        </div>
        <div className="text-center py-1 rounded" style={{ background: 'var(--accent-red-dim)' }}>
          <div className="text-[var(--text-tertiary)]">손절</div>
          <div className="font-mono" style={{ color: 'var(--negative)' }}>
            {won(s.plan.stop)} ({s.plan.stopPct.toFixed(1)}%)
          </div>
        </div>
        <div className="text-center py-1 rounded" style={{ background: 'var(--accent-green-dim)' }}>
          <div className="text-[var(--text-tertiary)]">익절</div>
          <div className="font-mono" style={{ color: 'var(--positive)' }}>
            {won(s.plan.target)} (+{s.plan.targetPct.toFixed(1)}%)
          </div>
        </div>
      </div>

      <div className="text-[10px] text-[var(--text-tertiary)] mt-2 leading-relaxed">
        시나리오 — 최소(주가 변동 없이 배당만):{' '}
        <strong style={{ color: 'var(--positive)' }}>{pct(s.scenario.minimum)}</strong> · 적정(배당+익절
        도달): <strong style={{ color: 'var(--positive)' }}>{pct(s.scenario.fair)}</strong> · 손절 시:{' '}
        <strong style={{ color: 'var(--negative)' }}>{pct(s.scenario.downside)}</strong>
      </div>
    </div>
  );
}

export default function DividendCalendar({ data }: { data: CachedDividends | null }) {
  const [analyzing, setAnalyzing] = useState<DividendStock | null>(null);
  const today = new Date();
  const monthLabel = `${today.getFullYear()}년 ${today.getMonth() + 1}월`;

  return (
    <section className="glass-card p-5 animate-fade-in animate-fade-in-delay-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-lg">📅</span>
        <h2 className="text-lg font-bold">배당주 캘린더 · {monthLabel}</h2>
        {data && (
          <>
            <span
              title="Yahoo Finance 에서 실제로 받아온 종가·배당 이력입니다"
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent-green-dim)] text-[var(--positive)]"
            >
              ● 실데이터
            </span>
            <span className="ml-auto text-xs text-[var(--text-tertiary)] font-mono">
              종가 {data.asOf} 기준 · {data.generatedFor} 갱신
            </span>
          </>
        )}
      </div>

      {!data ? (
        <p className="text-sm text-[var(--text-secondary)] mt-3">
          배당 데이터를 불러오는 중입니다. 잠시 후 새로고침하면 표시됩니다.
        </p>
      ) : (
        <>
          <DataNotices notices={data.notices} />

          <p className="text-[11px] text-[var(--text-tertiary)] mb-3 leading-relaxed">
            종가·배당금·직전 배당락일은 <strong className="text-[var(--positive)]">실측</strong>입니다.
            달력에 표시된 배당락일은{' '}
            <strong className="text-[var(--accent-yellow)]">과거 배당 월 패턴 기반 추정</strong>이며 확정
            공시가 아닙니다 — 국내 배당락일은 해마다 수 주씩 이동하므로 반드시 DART 공시로 확인하세요.
          </p>

          <MonthGrid stocks={data.stocks} today={today} />

          <h3 className="text-sm font-semibold mt-4 mb-2">
            배당수익률 순 ({data.stocks.length}종목
            {data.failed > 0 && `, 조회 실패 ${data.failed}종목 제외`})
          </h3>
          <div className="space-y-2">
            {data.stocks.map(s => (
              <StockRow key={s.symbol} s={s} onAnalyze={setAnalyzing} />
            ))}
          </div>

          <div className="text-[10px] text-[var(--text-tertiary)] mt-3 pt-3 border-t border-[var(--card-border)] leading-relaxed">
            <p className="mb-1">
              <strong>배당수익률</strong>은 최근 12개월 <em>실제 지급된</em> 배당 합계 ÷ 종가입니다
              (예상 배당이 아님). <strong>진입·손절·익절</strong>은 ATR(14일 평균 변동폭) 기반 기계적
              계산으로, 진입=종가 · 손절=진입−2×ATR · 익절=진입+3×ATR 입니다. 미래 주가 예측이
              아닙니다.
            </p>
            <p>
              ※ 출처: Yahoo Finance(종가·배당 이력) · DART 전자공시(배당성향·주당 배당금). 배당은 기업 실적에 따라 줄거나 중단될 수 있으며,
              배당락일에는 통상 배당금만큼 주가가 하락합니다. 본 내용은 투자 참고 정보이며 투자
              권유가 아닙니다.
            </p>
          </div>
        </>
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
