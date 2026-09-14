/**
 * storage.js — 데일리 진행 상태 + 통계 localStorage 저장/복원.
 * (DailySudoku/src/daily/storage.js를 이식 — variant 차원 제거, "시도 횟수만 기록"(§1.6)에 맞게 단순화)
 * 모든 접근은 try/catch로 감싼다(프라이빗 모드/차단 브라우저에서도 게임은 되게).
 */
import { shiftDateStr } from './dateUtil.js';

export const MAX_GUESSES = 4; // §1.5 — 스탠다드는 항상 고정 4회
export const EXTENDED_MAX_GUESSES = 5; // 익스텐디드 모드(전체 단어) — 더 어려운 만큼 1번 더 줌

/** variant('standard'|'extended')에 맞는 최대 시도 횟수 */
export function maxGuessesFor(variant) {
  return variant === 'extended' ? EXTENDED_MAX_GUESSES : MAX_GUESSES;
}

// 스탠다드는 기존 사용자의 저장 기록과 호환되도록 키를 그대로 두고, 익스텐디드만 별도 키
// 아래에 새로 쌓는다(§ "필요하면 별도 키로 저장하도록 확장 가능"에서 예고했던 그 확장).
const PROGRESS_KEY = (date, variant) => (variant === 'extended' ? `trilateral:progress:extended:${date}` : `trilateral:progress:${date}`);
const STATS_KEY = (variant) => (variant === 'extended' ? 'trilateral:stats:extended' : 'trilateral:stats');

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 실패해도 진행엔 지장 없음 */ }
}

// ── 진행 상태 ──

/**
 * @typedef {object} Progress
 * @property {string} date
 * @property {'playing'|'solved'|'failed'} status
 * @property {string[]} solution   그 날의 정답 15칸 (checkArrangement에 필요)
 * @property {string[]} positions  현재 배치 15칸
 * @property {number[]} marked     사용자가 주황으로 표시한 TREE_EDGES 인덱스 목록
 * @property {number[]} lockedEdges 초록으로 확정된 TREE_EDGES 인덱스 목록(이전 게스에서 맞은 것 누적)
 * @property {boolean[][]} guesses 매 게스마다의 correct[] 스냅샷 — 길이가 곧 "사용한 시도 수"
 * @property {number} startedAt
 * @property {number|null} finishedAt
 */

/** @returns {Progress|null} */
export function loadProgress(date, variant = 'standard') {
  return readJSON(PROGRESS_KEY(date, variant));
}

export function saveProgress(progress, variant = 'standard') {
  writeJSON(PROGRESS_KEY(progress.date, variant), progress);
}

// ── 통계 ──

/** { results: { [date]: { status: 'solved'|'failed', attempt: number|null } } }
 *  attempt = 성공한 시도 번호(1~MAX_GUESSES). 실패면 null(항상 다 씀). */
export function loadStats(variant = 'standard') {
  const s = readJSON(STATS_KEY(variant));
  return s && s.results ? s : { results: {} };
}

/**
 * 그 날의 결과를 기록한다. 진행 기록을 지우고 다시 푼 경우엔 마지막 결과로 덮어써서
 * 통계가 실제와 어긋나지 않게 한다. 아카이브(지난 퍼즐) 재도전은 이 함수를 호출하지 않는다 — §1.7.
 */
export function recordResult(date, status, attempt = null, variant = 'standard') {
  const s = loadStats(variant);
  s.results[date] = { status, attempt };
  writeJSON(STATS_KEY(variant), s);
  return s;
}

// ── 집계 (통계창) ──

// §1.12 — "완성 시간 분포" 대신 "시도 분포": 1~N번째 성공 + 실패, N+1칸.
// 기존 기본값(스탠다드, 4회)은 그대로 상수로 남겨 호환성 유지 — 익스텐디드 등 다른 시도 횟수는
// distBucketsFor(maxGuesses)로 구한다.
export const DIST_BUCKETS = ['1번째', '2번째', '3번째', '4번째', '실패'];

export function distBucketsFor(maxGuesses) {
  return [...Array(maxGuesses)].map((_, i) => `${i + 1}번째`).concat('실패');
}

export function bucketIndexFor(status, attempt, maxGuesses = MAX_GUESSES) {
  if (status === 'solved') return Math.min(maxGuesses - 1, Math.max(0, attempt - 1));
  return maxGuesses;
}

/**
 * @param {string} todayStr 현재 KST 날짜 — 연승 계산 기준
 * @param {string} [variant] 'standard'|'extended'
 * @returns {{ played, wins, winRate, curStreak, maxStreak, distribution: number[],
 *   results: Record<string,{status,attempt}> }}
 */
export function summarize(todayStr, variant = 'standard') {
  const maxGuesses = maxGuessesFor(variant);
  const { results } = loadStats(variant);
  const dates = Object.keys(results).sort();
  const played = dates.length;
  let wins = 0;
  const distribution = new Array(maxGuesses + 1).fill(0);
  for (const d of dates) {
    const r = results[d];
    if (r.status === 'solved') wins++;
    distribution[bucketIndexFor(r.status, r.attempt, maxGuesses)]++;
  }

  // 최고 연승: 날짜가 하루씩 이어지면서 solved인 최장 구간
  let maxStreak = 0, run = 0, prev = null;
  for (const d of dates) {
    const consecutive = prev && shiftDateStr(prev, 1) === d;
    run = results[d].status === 'solved' ? (consecutive ? run + 1 : 1) : 0;
    if (run > maxStreak) maxStreak = run;
    prev = d;
  }

  // 현재 연승: 오늘(또는 어제)부터 뒤로 이어지는 solved
  let curStreak = 0;
  let cursor = results[todayStr] ? todayStr : shiftDateStr(todayStr, -1);
  while (results[cursor] && results[cursor].status === 'solved') {
    curStreak++;
    cursor = shiftDateStr(cursor, -1);
  }

  return {
    played,
    wins,
    winRate: played ? Math.round((wins / played) * 100) : 0,
    curStreak,
    maxStreak,
    distribution,
    results,
  };
}
