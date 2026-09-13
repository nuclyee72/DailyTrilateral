/**
 * pyramidGame.js — 한 판의 게임 상태 + 규칙(§1.4~1.8)을 다루는 순수 로직. DOM 의존 없음.
 */
import { checkArrangement, TREE_EDGES, edgeIndexOf } from '../generator/treeGenerator.js';
import { planGroupMove, applyGroupMove } from './pyramidGroups.js';
import { MAX_GUESSES } from '../daily/storage.js';

export { MAX_GUESSES };

/**
 * @typedef {object} GuessRecord
 * @property {boolean[]} correct  그 시도 시점의 TREE_EDGES별 정오표
 * @property {string[]} positions 그 시도 시점의 배치 스냅샷 (broken-link 판정에 필요)
 *
 * @typedef {object} GameState
 * @property {string} date
 * @property {string[]} solution
 * @property {string[]} positions
 * @property {Set<number>} marked  사용자가 주황으로 표시한 TREE_EDGES 인덱스
 * @property {Set<number>} locked  초록(확정)된 TREE_EDGES 인덱스
 * @property {GuessRecord[]} guesses
 * @property {'playing'|'solved'|'failed'} status
 * @property {number} startedAt
 * @property {number|null} finishedAt
 */

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 새 판 시작 (positions를 안 주면 solution을 섞어서 시작 배치를 만듦) */
export function createGameState(date, solution, positions = null) {
  return {
    date,
    solution,
    positions: positions ?? shuffled(solution),
    marked: new Set(),
    locked: new Set(),
    guesses: [],
    status: 'playing',
    startedAt: Date.now(),
    finishedAt: null,
  };
}

/** localStorage에서 복원한 progress(§1.11, 순수 객체)를 GameState로 되살림 */
export function reviveGameState(progress) {
  return {
    ...progress,
    marked: new Set(progress.marked ?? []),
    locked: new Set(progress.locked ?? []),
  };
}

/** GameState → localStorage에 저장할 순수 객체(Set은 배열로) */
export function serializeGameState(state) {
  return {
    ...state,
    marked: [...state.marked],
    locked: [...state.locked],
  };
}

function activeEdgeSet(state) {
  const s = new Set(state.marked);
  for (const k of state.locked) s.add(k);
  return s;
}

/**
 * 그룹이 이동한 뒤, 그 그룹 내부의 마킹/확정 엣지들을 "새 자리"로 다시 붙인다.
 * 엣지는 원래 고정된 슬롯 쌍을 가리키는데, 그룹 전체가 다른 곳으로 옮겨가면 그 슬롯들이
 * 더 이상 그 관계를 나타내지 않게 되므로(그 자리는 이제 다른 값이 차지) — 그대로 두면
 * "선이 안 따라오고 원래 자리에 남는" 버그가 생긴다. mapping으로 옮겨간 새 슬롯 쌍이 실제
 * 트리 엣지로 존재하면 거기로 옮기고, 존재하지 않으면(예: 그룹 안에서 부모-자식이 자리를
 * 맞바꿔 방향이 뒤집혀버린 경우) 원래 엣지 인덱스를 그대로 둔다 — 그 자리는 여전히 유효한
 * 슬롯 쌍이고 값만 바뀐 것이므로.
 */
function remapEdgeSet(edgeSet, mapping) {
  const next = new Set();
  for (const k of edgeSet) {
    const { parent, child } = TREE_EDGES[k];
    const p2 = mapping.has(parent) ? mapping.get(parent) : parent;
    const c2 = mapping.has(child) ? mapping.get(child) : child;
    const k2 = (p2 === parent && c2 === child) ? k : edgeIndexOf(p2, c2);
    next.add(k2 !== undefined ? k2 : k);
  }
  return next;
}

/** @returns {boolean} 이동이 실제로 일어났는지 */
export function tryMove(state, fromSlot, toSlot) {
  if (state.status !== 'playing') return false;
  const mapping = planGroupMove(activeEdgeSet(state), fromSlot, toSlot);
  if (!mapping) return false;
  state.positions = applyGroupMove(state.positions, mapping);
  state.marked = remapEdgeSet(state.marked, mapping);
  state.locked = remapEdgeSet(state.locked, mapping);
  return true;
}

/** @returns {boolean} 실제로 토글됐는지 (이미 확정된 링크·끊어짐 표시된 링크는 마킹 불가) */
export function toggleMark(state, edgeIdx) {
  if (state.status !== 'playing') return false;
  if (state.locked.has(edgeIdx)) return false;
  // §6.20 [요청] "빨간 색 처리되었을 경우 눌러서 연결 못하도록" — 지난 게스에서 이미 틀렸다고
  // 확인된 조합(빨강/브로큰)은 마킹으로 묶어서 그룹으로 만들 수 없게 막는다. brokenEdges는
  // state만으로 계산되는 순수 함수라 여기서 그때그때 다시 구해도 비용이 적다(엣지 14개뿐).
  if (brokenEdges(state).has(edgeIdx)) return false;
  if (state.marked.has(edgeIdx)) state.marked.delete(edgeIdx);
  else state.marked.add(edgeIdx);
  return true;
}

/** @returns {{solved:boolean, correct:boolean[]}|null} 제출 불가 상태면 null */
export function submitGuess(state) {
  if (state.status !== 'playing') return null;
  if (state.guesses.length >= MAX_GUESSES) return null;

  const { solved, correct } = checkArrangement(state.positions, state.solution);
  state.guesses.push({ correct, positions: [...state.positions] });
  correct.forEach((ok, k) => { if (ok) state.locked.add(k); });
  // 맞은 링크는 locked로 넘어가고, 틀린 링크에 걸려 있던 마킹(주황)도 이번 게스로 다 써버린
  // 것이므로 전부 풀어준다 — 다음 게스는 깨끗한 상태(잠긴 링크 + 브로큰 표시만 남고, 마킹은
  // 없음)에서 다시 표시하도록 함.
  state.marked.clear();

  if (solved) { state.status = 'solved'; state.finishedAt = Date.now(); }
  else if (state.guesses.length >= MAX_GUESSES) { state.status = 'failed'; state.finishedAt = Date.now(); }

  return { solved, correct };
}

/**
 * §1.8 Broken Links — 지금까지의 모든 게스에서 한 번이라도 틀렸던 "글자 조합"이 지금도
 * 어딘가에 그대로 있으면 끊어짐(빨강)으로 표시한다.
 *
 * 자리(슬롯) 기준이 아니라 값(글자) 기준으로 봐야 한다 — 틀렸던 두 글자를 그룹으로 묶어
 * 다른 위치로 옮겼을 때도(§1.4 그룹 이동으로 완전히 다른 슬롯 쌍이 됨) 그 조합 자체는
 * 여전히 "이미 틀렸다고 확인된" 조합이므로 계속 빨갛게 보여야 한다 — 자리만 보고 판정하면
 * 옮긴 순간 빨간불이 꺼져버려서, 사실상 이미 검증된 오답 조합을 다시 못 알아보게 된다.
 *
 * "마지막 게스"만이 아니라 **모든** 게스를 누적해서 봐야 한다 — n번째 게스에서 틀렸다고
 * 확인된 조합이, 그 다음 게스 땐 다른 자리로 옮겨져 있어서 재검증이 안 됐더라도(즉 마지막
 * 게스의 correct[]엔 그 조합이 등장조차 안 함), 나중에 그 조합이 다시 인접하게 되면 여전히
 * "이미 틀렸다고 확인된" 조합이므로 계속 빨갛게 보여야 한다.
 * @returns {Set<number>} TREE_EDGES 인덱스 집합
 */
export function brokenEdges(state) {
  if (!state.guesses.length) return new Set();
  const wrongPairs = new Set();
  for (const g of state.guesses) {
    TREE_EDGES.forEach(({ parent, child }, k) => {
      if (!g.correct[k]) wrongPairs.add(`${g.positions[parent]}|${g.positions[child]}`);
    });
  }
  const out = new Set();
  TREE_EDGES.forEach(({ parent, child }, k) => {
    if (state.locked.has(k)) return;
    if (wrongPairs.has(`${state.positions[parent]}|${state.positions[child]}`)) out.add(k);
  });
  return out;
}

export function guessesLeft(state) {
  return MAX_GUESSES - state.guesses.length;
}
