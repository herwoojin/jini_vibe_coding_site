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
import os from 'os';
import path from 'path';

const BLOB_STORE = 'ai-analysis';

/**
 * 파일 폴백 경로.
 * 서버리스(Netlify Functions)에서는 프로젝트 디렉터리가 읽기 전용이라
 * process.cwd() 아래에 쓰면 조용히 실패한다 — 그러면 캐시가 인메모리로만 남고
 * 인스턴스가 바뀔 때마다 사라져 "생성 중" 문구가 영원히 뜬다.
 * 쓰기 가능한 임시 디렉터리를 쓴다 (로컬 개발에서는 프로젝트 .cache 를 유지).
 */
const FILE = process.env.NETLIFY
  ? path.join(os.tmpdir(), 'macrosignal-ai-analysis.json')
  : path.join(process.cwd(), '.cache', 'ai-analysis.json');

const memory = new Map<string, unknown>();

let blobWarned = false;

async function blobs() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore(BLOB_STORE);
  } catch (err) {
    // 원인을 삼키면 배포 환경에서 왜 캐시가 안 되는지 알 수 없다. 한 번만 남긴다.
    if (!blobWarned) {
      blobWarned = true;
      console.warn('[store] Netlify Blobs 사용 불가 — 파일/메모리로 폴백:', err);
    }
    return null;
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
  } catch (err) {
    // 여기까지 실패하면 인메모리로만 동작한다 — 인스턴스가 바뀌면 사라지므로
    // 원인을 반드시 남긴다 (배포 환경 디버깅의 유일한 단서).
    console.warn('[store] 파일 저장 실패, 인메모리로만 유지:', err);
  }
}
