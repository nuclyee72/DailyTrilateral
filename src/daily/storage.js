/**
 * storage.js — 데일리 진행 상태 + 통계 localStorage 저장/복원.
 * (DailySudoku/src/daily/storage.js를 이식 — variant 차원 제거, "시도 횟수만 기록"(§1.6)에 맞게 단순화)
 * 모든 접근은 try/catch로 감싼다(프라이빗 모드/차단 브라우저에서도 게임은 되게).
 */
import { shiftDateStr } from './dateUtil.js';

export const MAX_GUESSES = 4; // §1.5 — 항상 고정 4회

const PROGRESS_KEY = (date) => `trilateral:progress:${date}`;
const STATS_KEY = 'trilateral:stats';

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
export function loadProgress(date) {
  return readJSON(PROGRESS_KEY(date));
}

export function saveProgress(progress) {
  writeJSON(PROGRESS_KEY(progress.date), progress);
}

// ── 통계 ──

/** { results: { [date]: { status: 'solved'|'failed', attempt: number|null } } }
 *  attempt = 성공한 시도 번호(1~4). 실패면 null(항상 4번 다 씀). */
export function loadStats() {
  const s = readJSON(STATS_KEY);
  return s && s.results ? s : { results: {} };
}

/**
 * 그 날의 결과를 기록한다. 진행 기록을 지우고 다시 푼 경우엔 마지막 결과로 덮어써서
 * 통계가 실제와 어긋나지 않게 한다. 아카이브(지난 퍼즐) 재도전은 이 함수를 호출하지 않는다 — §1.7.
 */
export function recordResult(date, status, attempt = null) {
  const s = loadStats();
  s.results[date] = { status, attempt };
  writeJSON(STATS_KEY, s);
  return s;
}

// ── 집계 (통계창) ──

// §1.12 — "완성 시간 분포" 대신 "시도 분포": 1~4번째 성공 + 실패, 5칸 고정.
export const DIST_BUCKETS = ['1번째', '2번째', '3번째', '4번째', '실패'];

export function bucketIndexFor(status, attempt) {
  if (status === 'solved') return Math.min(DIST_BUCKETS.length - 2, Math.max(0, attempt - 1));
  return DIST_BUCKETS.length - 1;
}

/**
 * @param {string} todayStr 현재 KST 날짜 — 연승 계산 기준
 * @returns {{ played, wins, winRate, curStreak, maxStreak, distribution: number[],
 *   results: Record<string,{status,attempt}> }}
 */
export function summarize(todayStr) {
  const { results } = loadStats();
  const dates = Object.keys(results).sort();
  const played = dates.length;
  let wins = 0;
  const distribution = DIST_BUCKETS.map(() => 0);
  for (const d of dates) {
    const r = results[d];
    if (r.status === 'solved') wins++;
    distribution[bucketIndexFor(r.status, r.attempt)]++;
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
