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

/*
 * 공유 텍스트 형식 (ProjectDaily 네 게임 공통 — 제목 · 결과 줄 · 그림 · 허브 링크):
 *   데일리 삼각관계 · 스탠다드 · 2026-10-02
 *   ✅ 3/4                       (몇 번째 시도에 맞혔나 / 못 맞혔으면 ❌ X/4)
 *   (빈 줄)
 *   🟥🟥🟩⬜
 *   (빈 줄)
 *   <허브 링크>
 */
export const GAME_TITLE = '데일리 삼각관계';
/** 공유 링크 — 허브의 이 게임 카드 (네 게임 공통) */
export const SHARE_URL = 'https://nuclyee72.github.io/ProjectDaily/#trilateral';
const MODE_LABEL = { standard: '스탠다드', extended: '익스텐디드' };
const modeLabel = (variant) => MODE_LABEL[variant] ?? MODE_LABEL.standard;
const maxFor = (variant, maxGuesses) => maxGuesses ?? (variant === 'extended' ? EXTENDED_MAX_GUESSES : MAX_GUESSES);

/** 결과 줄 — '✅ 3/4' (3번째 시도에 성공) · '❌ X/4' (실패) */
function summaryLine(guesses, max) {
  const at = guesses.findIndex((g) => g.correct.every(Boolean));
  return at >= 0 ? `✅ ${at + 1}/${max}` : `❌ X/${max}`;
}

/** 결과 공유용 전체 텍스트. date = 날짜 (자유 연습이면 '자유 연습') */
export function buildShareText({ date, guesses, variant = 'standard', maxGuesses }) {
  const max = maxFor(variant, maxGuesses);
  return [[GAME_TITLE, modeLabel(variant), date].join(' · '), summaryLine(guesses, max), '', buildGuessEmojiSequence(guesses, max), '', SHARE_URL].join('\n');
}

/** 자유 연습 연속 도전 성공 공유용 — 결과 줄에 몇 연속째인지 붙인다 */
export function buildFreePlayShareText({ streak, guesses, variant = 'standard', maxGuesses }) {
  const max = maxFor(variant, maxGuesses);
  return [[GAME_TITLE, modeLabel(variant), '자유 연습'].join(' · '), `${summaryLine(guesses, max)} · 🔥 ${streak}연속 도전 성공`, '', buildGuessEmojiSequence(guesses, max), '', SHARE_URL].join('\n');
}

const CAL_EMOJI = { solved: '🟩', fail: '🟥', miss: '⬜', pad: '⬛' };

/**
 * 통계 달력을 이모지 텍스트로. results = { 'YYYY-MM-DD': { status, ... } }
 * 성공 🟩 · 실패 🟥 · 안 함 ⬜ · 달 밖(주 정렬용) ⬛ — §1.9와 동일한 3색 체계.
 */
export function buildCalendarShareText({ results, year, month, variant = 'standard' }) {
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

  const head = [GAME_TITLE, modeLabel(variant), `${year}-${String(month).padStart(2, '0')}`].join(' · ');
  return [head, `✅ ${wins}  ❌ ${fails}`, '', ...rows, '', SHARE_URL].join('\n');
}
