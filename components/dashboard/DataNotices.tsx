import type { DataNotice } from '@/lib/ai/notices';

const STYLE: Record<DataNotice['level'], { bg: string; fg: string; icon: string }> = {
  error: { bg: 'var(--accent-red-dim)', fg: 'var(--negative)', icon: '⛔' },
  warn: { bg: 'var(--accent-yellow-dim)', fg: 'var(--accent-yellow)', icon: '⚠️' },
  info: { bg: 'rgba(255,255,255,0.04)', fg: 'var(--text-secondary)', icon: 'ℹ️' },
};

const ORDER: DataNotice['level'][] = ['error', 'warn', 'info'];

/**
 * 데이터 신뢰도 알림 목록.
 * 값이 비거나 낮춰지거나 오래된 지점을 사용자가 추측하지 않도록 그때마다 화면에 띄운다.
 */
export default function DataNotices({ notices }: { notices?: DataNotice[] }) {
  if (!notices || notices.length === 0) return null;

  // 심각한 것부터 위로
  const sorted = [...notices].sort(
    (a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level),
  );

  return (
    <div className="space-y-1.5 mb-3">
      {sorted.map((n, i) => {
        const st = STYLE[n.level];
        return (
          <div
            key={`${n.title}-${i}`}
            role={n.level === 'error' ? 'alert' : 'status'}
            className="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed"
            style={{ background: st.bg }}
          >
            <div className="font-semibold" style={{ color: st.fg }}>
              {st.icon} {n.title}
            </div>
            <div className="text-[var(--text-tertiary)] mt-0.5">{n.detail}</div>
          </div>
        );
      })}
    </div>
  );
}
