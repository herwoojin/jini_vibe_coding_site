'use client';

import { useEffect, useState } from 'react';
import StockAnalysisModal from './StockAnalysisModal';

interface Match {
  code: string;
  name: string;
}

/**
 * 종목명으로 검색해 매매 타이밍 분석을 실행한다.
 * 후보는 DART 공식 상장사 목록에서만 나오므로 엉뚱한 회사를 고를 일이 없다.
 */
export default function StockSearchPanel() {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [selected, setSelected] = useState<Match | null>(null);
  const [recent, setRecent] = useState<Match[]>([]);

  // 입력이 멈추면 검색한다 (타이핑마다 호출하지 않는다).
  useEffect(() => {
    const q = query.trim();
    const controller = new AbortController();

    // 입력이 멈춘 뒤에만 상태를 바꾼다 (이펙트 본문에서 동기 setState 를 하지 않는다).
    const timer = setTimeout(async () => {
      if (q.length < 1) {
        setMatches([]);
        setError(null);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        setError(json.error ?? null);

        // 상장사 목록을 아직 받는 중이면(첫 1회, 8초 안팎) 상태를 알리고 재시도한다.
        if (json.preparing) {
          setPreparing(true);
          setMatches([]);
          setTimeout(() => setQuery(cur => (cur === q ? `${q} ` : cur)), 2500);
          return;
        }
        setPreparing(false);
        setMatches(json.matches ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError('검색에 실패했습니다.');
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function pick(m: Match) {
    setSelected(m);
    setRecent(prev => [m, ...prev.filter(p => p.code !== m.code)].slice(0, 6));
    setQuery('');
    setMatches([]);
  }

  return (
    <section className="glass-card p-5 animate-fade-in animate-fade-in-delay-2">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-lg">🔎</span>
        <h2 className="text-lg font-bold">종목 시세 분석</h2>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent-green-dim)] text-[var(--positive)]">
          Gemini + 검색
        </span>
      </div>
      <p className="text-[11px] text-[var(--text-tertiary)] mb-3">
        회사 이름이나 6자리 종목코드를 입력하면 현재 시세 · 이평선 · 뉴스 · 공시를 조사해 매수/매도
        타이밍을 분석합니다. 후보는 전자공시(DART) 상장사 목록에서만 나옵니다.
      </p>

      <div className="relative">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="예: 삼성전자, 카카오, 005930"
          aria-label="종목명 또는 종목코드"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[rgba(255,255,255,0.04)] border border-[var(--card-border)] focus:outline-none focus:border-[var(--positive)]"
        />

        {(matches.length > 0 || searching || preparing || error) && (
          <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-[var(--card-border)] overflow-hidden"
               style={{ background: 'var(--background)' }}>
            {preparing ? (
              <div className="px-3 py-2 text-xs text-[var(--accent-yellow)]">
                ⏳ 상장사 목록을 처음 불러오는 중입니다 (약 10초). 준비되면 자동으로 검색됩니다.
              </div>
            ) : (
              searching &&
              matches.length === 0 && (
                <div className="px-3 py-2 text-xs text-[var(--text-tertiary)]">검색 중…</div>
              )
            )}
            {error && (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--negative)' }}>
                ⚠️ {error}
              </div>
            )}
            {matches.map(m => (
              <button
                key={m.code}
                onClick={() => pick(m)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[rgba(255,255,255,0.05)] flex items-center gap-2"
              >
                <span>{m.name}</span>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{m.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {query.trim().length > 0 && !searching && !preparing && matches.length === 0 && !error && (
        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          일치하는 상장사가 없습니다. 정식 회사명(예: &quot;에스케이하이닉스&quot;가 아니라 &quot;SK하이닉스&quot;)이나
          6자리 종목코드로 다시 시도해 보세요.
        </p>
      )}

      {recent.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] text-[var(--text-tertiary)] mb-1">최근 분석</div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map(m => (
              <button
                key={m.code}
                onClick={() => setSelected(m)}
                className="text-[11px] px-2 py-1 rounded-full border border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[var(--positive)]"
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <StockAnalysisModal
          symbol={selected.code}
          name={selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
