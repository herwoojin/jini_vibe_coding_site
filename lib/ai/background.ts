// MacroSignal — 장시간 작업을 Netlify Background Function 으로 넘긴다
//
// ⚠️ 배경: 섹터 스캔 50~70초, 종목 분석 30~60초가 걸리는데 Netlify 일반 함수는
// 무료 티어 10초에서 종료된다. after() 로 백그라운드에 돌려도 함수 자체가 죽으면
// 같이 끊긴다. Background Function(-background 접미사)은 15분까지 실행되므로
// 배포 환경에서는 그쪽으로 넘기고, 로컬 개발에서는 그냥 인라인으로 실행한다.

/**
 * 배포된 사이트 URL. 이게 있으면 백그라운드 함수를 호출할 수 있다.
 *
 * ⚠️ process.env.NETLIFY 로 판별하면 안 된다. Netlify 의 Next.js 런타임에는
 * 그 변수가 설정되지 않아(배포본에서 실측: false) 항상 인라인 경로로 빠지고,
 * 결국 10초 함수 제한에 걸려 죽었다. URL 은 정상적으로 주입된다.
 */
function siteUrl(): string | null {
  return process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? process.env.DEPLOY_URL ?? null;
}

/**
 * 백그라운드 함수를 호출한다. 성공하면 true.
 * false 를 돌려주면 호출부가 직접(인라인) 실행해야 한다 — 로컬 개발 경로다.
 */
export async function triggerBackground(
  name: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const base = siteUrl();
  if (!base) {
    // 로컬 개발 — 호출부가 인라인으로 실행한다.
    return false;
  }

  try {
    const res = await fetch(`${base}/.netlify/functions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // Background Function 은 즉시 202 를 돌려준다.
    if (res.status === 202 || res.ok) return true;
    console.warn(`[background] ${name} 호출 실패 HTTP ${res.status} — 인라인으로 대체`);
    return false;
  } catch (err) {
    console.warn(`[background] ${name} 호출 예외 — 인라인으로 대체:`, err);
    return false;
  }
}
