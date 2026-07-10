import type { DataOrigin } from '@/lib/types';

/**
 * 화면의 숫자가 실제 API 응답인지 목업인지 구분한다.
 * 목업 값을 실제 시세로 오인하면 투자 판단이 왜곡되므로 항상 노출한다.
 */
export default function DataBadge({ origin }: { origin: DataOrigin }) {
  if (origin === 'live') {
    return (
      <span
        title="외부 API에서 실제로 받아온 값입니다"
        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent-green-dim)] text-[var(--positive)] whitespace-nowrap"
      >
        ● LIVE
      </span>
    );
  }

  return (
    <span
      title="실제 데이터가 아닙니다. 하드코딩된 목업 값이므로 투자 판단에 사용하지 마세요."
      className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent-yellow-dim)] text-[var(--accent-yellow)] whitespace-nowrap"
    >
      ⚠ 목업
    </span>
  );
}
