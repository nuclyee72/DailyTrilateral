/**
 * share.js — 데일리 결과 공유 텍스트(§1.6, 이모지 4칸) + 월별 캘린더 공유(§1.9, 3색).
 * (DailySudoku/src/daily/share.js의 캘린더 공유 부분을 그대로 이식, 결과 공유는 훨씬 단순화)
 */
import { MAX_GUESSES, EXTENDED_MAX_GUESSES } from './storage.js';

/**
 * 시도 기록(pyramidGame.js의 GuessRecord[])으로 🟥/🟩/⬜ N칸을 만든다(N=maxGuesses, 기본 4).
 * 성공한 시도(전부 true)가 나오면 그 칸이 🟩이고 그 뒤는 전부 ⬜. 실패한 시도는 🟥.
 * N번 다 썼는데 못 맞췄으면 🟥이 N개.
 * @param {{correct: boolean[]}[]} guesses
 * @param {number} [maxGuesses]
 */
export function buildGuessEmojiSequence(guesses, maxGuesses = MAX_GUESSES) {
  const cells = [];
  for (const g of guesses) {
    const ok = g.correct.every(Boolean);
    cells.push(ok ? '🟩' : '🟥');
    if (ok) break; // 성공하면 그 시점에서 끝
  }
  while (cells.length < maxGuesses) cells.push('⬜');
  return cells.join('');
}

const modeLabel = (variant) => (variant === 'extended' ? ' · 익스텐디드' : '');

/** 데일리 결과 공유용 전체 텍스트 */
export function buildShareText({ date, guesses, url, variant = 'standard', maxGuesses }) {
  const seq = buildGuessEmojiSequence(guesses, maxGuesses ?? (variant === 'extended' ? EXTENDED_MAX_GUESSES : MAX_GUESSES));
  const parts = [`데일리 삼각관계${modeLabel(variant)} · ${date}`, seq, ''];
  if (url) parts.push(url);
  return parts.join('\n');
}

/** 자유 연습 연속 도전 성공 공유용 전체 텍스트 — 이번 판의 결과보다 "몇 연속째인지"가 핵심. */
export function buildFreePlayShareText({ streak, guesses, url, variant = 'standard', maxGuesses }) {
  const seq = buildGuessEmojiSequence(guesses, maxGuesses ?? (variant === 'extended' ? EXTENDED_MAX_GUESSES : MAX_GUESSES));
  const parts = [`데일리 삼각관계${modeLabel(variant)} · 자유 연습 ${streak}연속 도전 성공!`, seq, ''];
  if (url) parts.push(url);
  return parts.join('\n');
}

const CAL_EMOJI = { solved: '🟩', fail: '🟥', miss: '⬜', pad: '⬛' };

/**
 * 통계 달력을 이모지 텍스트로. results = { 'YYYY-MM-DD': { status, ... } }
 * 성공 🟩 · 실패 🟥 · 안 함 ⬜ · 달 밖(주 정렬용) ⬛ — §1.9와 동일한 3색 체계.
 */
export function buildCalendarShareText({ results, year, month, url }) {
  const firstDow    = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(CAL_EMOJI.pad);
  let wins = 0, fails = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const r = results[ds];
    if (r && r.status === 'solved') { cells.push(CAL_EMOJI.solved); wins++; }
    else if (r) { cells.push(CAL_EMOJI.fail); fails++; }
    else cells.push(CAL_EMOJI.miss);
  }
  while (cells.length % 7 !== 0) cells.push(CAL_EMOJI.pad);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join(''));

  const head = `데일리 삼각관계 · ${year}-${String(month).padStart(2, '0')}`;
  const parts = [head, `✅ ${wins}  ❌ ${fails}`, '', ...rows, ''];
  if (url) parts.push(url);
  return parts.join('\n');
}
