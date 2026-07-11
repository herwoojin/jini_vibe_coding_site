/**
 * AI 분석 결과 영속 저장소.
 *
 * 백엔드 우선순위:
 *  1. Netlify Blobs — 배포 환경. 서버리스 인스턴스가 갈려도 유지된다.
 *  2. 로컬 파일(.cache/ai-analysis.json) — 개발/자체 호스팅. dev 재시작에도 유지.
 *  3. 인메모리 — 위 둘 다 불가할 때의 최후 수단 (워밍된 프로세스 안에서만 유효).
 *
 * unstable_cache 를 쓰지 않는 이유: Netlify 서버리스에서의 지속성이 보장되지
 * 않고, "마지막 성공본" 폴백을 위해 키를 나열/갱신할 수단이 필요하기 때문.
 */
import { promises as fs } from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), '.cache', 'ai-analysis.json');
const BLOB_STORE = 'ai-analysis';

const memory = new Map<string, unknown>();

async function blobs() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore(BLOB_STORE);
  } catch {
    return null; // Netlify 밖이거나 패키지/환경 미구성
  }
}

async function readFileMap(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function storeGet<T>(key: string): Promise<T | null> {
  if (memory.has(key)) return memory.get(key) as T;

  const b = await blobs();
  if (b) {
    try {
      const v = await b.get(key, { type: 'json' });
      if (v != null) { memory.set(key, v); return v as T; }
    } catch { /* 다음 백엔드로 */ }
  }

  const map = await readFileMap();
  if (key in map) { memory.set(key, map[key]); return map[key] as T; }
  return null;
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);

  const b = await blobs();
  if (b) {
    try { await b.setJSON(key, value); return; } catch { /* 파일로 폴백 */ }
  }

  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const map = await readFileMap();
    map[key] = value;
    await fs.writeFile(FILE, JSON.stringify(map), 'utf8');
  } catch {
    // 읽기 전용 FS(서버리스 로컬 폴백 실패 등) — 인메모리만으로 동작
  }
}
