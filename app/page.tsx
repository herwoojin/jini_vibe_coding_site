import SignalHero from '@/components/dashboard/SignalHero';
import MarketTabs from '@/components/dashboard/MarketTabs';
import MacroCards from '@/components/dashboard/MacroCards';
import CorrelationHeatmap from '@/components/dashboard/CorrelationHeatmap';
import OvernightPanel from '@/components/dashboard/OvernightPanel';
import { getDashboardData } from '@/lib/data/dashboard';
import { markets, indicators } from '@/lib/mock/data';

// 무료 소스(FRED/ECOS)는 전일 종가 기반이므로 시간당 1회 재계산이면 충분하다.
export const revalidate = 3600;

export default async function Dashboard() {
  const data = await getDashboardData();

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
