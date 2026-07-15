import SignalHero from '@/components/dashboard/SignalHero';
import MarketTabs from '@/components/dashboard/MarketTabs';
import MacroCards from '@/components/dashboard/MacroCards';
import CorrelationHeatmap from '@/components/dashboard/CorrelationHeatmap';
import OvernightPanel from '@/components/dashboard/OvernightPanel';
import { after } from 'next/server';
import AIAnalysisPanel from '@/components/dashboard/AIAnalysisPanel';
import { getDashboardData } from '@/lib/data/dashboard';
import { readAnalysis, needsGeneration, generateIfMissing } from '@/lib/ai/analysis';
import { currentSlot } from '@/lib/ai/slots';
import { markets, indicators } from '@/lib/mock/data';

// 요청마다 렌더한다(no-store). ISR 로 캐싱하면 슬롯 경계(05:30/12:00/15:10) 직후
// 새로고침해도 CDN·모바일 브라우저가 옛 HTML 을 돌려줘 "갱신이 안 보이는" 문제가 생긴다.
//
// 외부 호출은 늘지 않는다: revalidate=0 은 양수 revalidate 를 지정한 fetch 를 그대로 두므로
// 어댑터의 1시간 fetch 캐시가 유지되고, Gemini 는 자체 슬롯 저장소가 1일 3회로 묶는다.
export const revalidate = 0;
// after() 의 백그라운드 생성이 플랫폼 상한까지 돌 수 있게 한다 (지원 플랫폼에서만 적용).
export const maxDuration = 60;

export default async function Dashboard() {
  const slot = currentSlot();
  const [data, ai, mustGenerate] = await Promise.all([
    getDashboardData(),
    readAnalysis(slot), // 저장소만 읽는다 — Gemini 를 기다리지 않아 렌더가 빠르다
    needsGeneration(slot),
  ]);

  // 현재 슬롯 분석이 없으면 응답을 보낸 뒤 생성한다 (사용자 렌더를 막지 않음).
  // 이번 방문자는 직전 분석(stale)을 즉시 보고, 다음 방문자는 새 분석을 본다.
  if (mustGenerate) {
    after(() => generateIfMissing(slot, data));
  }

  const liveCards = data.macroCards.filter(c => c.origin === 'live');
  const liveSources = [...new Set(liveCards.map(c => c.indicator.source))];
  const mockSections = [
    data.signalsOrigin === 'mock' && '시장 진단',
    data.correlationsOrigin === 'mock' && '상관관계',
    data.overnight.origin === 'mock' && '밤사이 종합',
  ].filter((s): s is string => Boolean(s));

  return (
    <div className="dashboard-container space-y-6 pb-6">
      <DataOriginBanner
        liveCount={liveCards.length}
        totalCount={data.macroCards.length}
        liveSources={liveSources}
        mockSections={mockSections}
      />

      {/* 3시장 신호 히어로 */}
      <SignalHero signals={data.signals} origin={data.signalsOrigin} asOf={data.signalsAsOf} />

      {/* AI 시장 분석 (Gemini, 일 3회 슬롯 갱신) */}
      <AIAnalysisPanel data={ai} />

      {/* 2열 레이아웃: 상세분석 + 거시지표 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MarketTabs signals={data.signals} origin={data.signalsOrigin} />
        <MacroCards cards={data.macroCards} />
      </div>

      {/* 2열 레이아웃: 히트맵 + 밤사이 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CorrelationHeatmap
          correlations={data.correlations}
          markets={markets}
          indicators={indicators}
          origin={data.correlationsOrigin}
        />
        <OvernightPanel
          metrics={data.overnight.metrics}
          date={data.overnight.date}
          origin={data.overnight.origin}
          impact={data.overnight.impact}
        />
      </div>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  fred: 'FRED',
  ecos: '한국은행 ECOS',
  twelvedata: 'Twelve Data',
  kis: '한국투자증권',
};

/** 대시보드 상단에 실데이터/목업 현황을 명시한다. */
function DataOriginBanner({
  liveCount,
  totalCount,
  liveSources,
  mockSections,
}: {
  liveCount: number;
  totalCount: number;
  liveSources: string[];
  mockSections: string[];
}) {
  const allLive = liveCount === totalCount && mockSections.length === 0;
  const sourceText = liveSources.map(s => SOURCE_LABELS[s] ?? s).join(' · ');

  return (
    <div
      role="status"
      className="glass-card p-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm border-l-4"
      style={{ borderLeftColor: allLive ? 'var(--positive)' : 'var(--accent-yellow)' }}
    >
      <span className="font-bold">
        {allLive ? '✅ 전 섹션 실데이터 (전일 종가 기반)' : '⚠️ 일부 목업 데이터가 섞여 있습니다'}
      </span>
      <span className="text-[var(--text-secondary)]">
        거시지표 {totalCount}개 중{' '}
        <strong className="text-[var(--positive)]">{liveCount}개가 실제 API 값</strong>
        {sourceText && ` (${sourceText})`}입니다.{' '}
        {mockSections.length > 0 ? (
          <>
            <strong className="text-[var(--accent-yellow)]">{mockSections.join(' · ')}</strong> 섹션은
            아직 목업입니다.{' '}
          </>
        ) : (
          '시장 진단·상관관계·밤사이 종합은 실데이터로 계산된 규칙 기반 결과입니다. '
        )}
        무료 소스 특성상 실시간이 아닌 전일 종가 기준이며, 투자 권유가 아닙니다.
      </span>
    </div>
  );
}
