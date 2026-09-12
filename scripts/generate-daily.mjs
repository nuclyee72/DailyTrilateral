/**
 * generate-daily.mjs — 그 날의 피라미드 정답을 생성해 daily/<date>.json 으로 저장.
 * (DailySudoku/scripts/generate-daily.mjs와 같은 패턴 — 멱등, 며칠치 버퍼, GitHub Actions 크론이 호출)
 *
 *   node scripts/generate-daily.mjs                # KST 오늘 + 앞으로 3일 (버퍼)
 *   node scripts/generate-daily.mjs 2026-09-13     # 특정 날짜
 *   node scripts/generate-daily.mjs 2026-09-13 30  # 2026-09-13부터 30일치
 *
 * 이미 파일이 있으면 건너뛴다(멱등) — 단어 데이터가 나중에 바뀌어도 이미 커밋된 날짜의 정답은
 * 절대 안 바뀌어야 하기 때문(§1.7 아카이브 재플레이가 그 날 그 정답을 그대로 다시 보여줘야 함).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateTree } from '../src/generator/treeGenerator.js';
import { dateStrKST, shiftDateStr } from '../src/daily/dateUtil.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAILY_DIR = path.join(__dirname, '..', 'daily');

async function generateForDate(dateStr) {
  const outPath = path.join(DAILY_DIR, `${dateStr}.json`);
  if (existsSync(outPath)) {
    console.log(`· ${dateStr} 이미 있음 — 건너뜀`);
    return false;
  }

  const result = generateTree(`daily:${dateStr}`);
  if (!result) throw new Error(`${dateStr}: 트리 생성 실패`);

  const payload = {
    date: dateStr,
    tiles: result.tiles,
    words: result.words,
    generatedAt: new Date().toISOString(),
  };

  await mkdir(DAILY_DIR, { recursive: true });
  await writeFile(outPath, JSON.stringify(payload) + '\n', 'utf8');
  console.log(`✓ ${dateStr} 저장 (${result.words.join(', ')})`);
  return true;
}

async function main() {
  const [arg1, arg2] = process.argv.slice(2);
  const startDate = arg1 || dateStrKST();
  const count = arg1 ? (Number(arg2) || 1) : 4;

  let wrote = 0;
  for (let i = 0; i < count; i++) {
    const dateStr = shiftDateStr(startDate, i);
    try {
      if (await generateForDate(dateStr)) wrote++;
    } catch (err) {
      console.error(`✗ ${dateStr} 실패:`, err.message);
      process.exitCode = 1;
    }
  }
  console.log(`완료 — ${wrote}개 새로 생성`);
}

main();
