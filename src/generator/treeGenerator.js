/**
 * treeGenerator.js — 15노드(1-2-4-8) 이진 피라미드 트리를, 음절 그래프 위에서 백트래킹으로 찾아낸다.
 * DOM 의존이 없어 브라우저(자유 연습 모드의 즉석 생성)와 Node(데일리 생성 스크립트) 양쪽에서 쓴다.
 *
 * 트리는 완전 이진트리를 배열 인덱스 0..14로 표현한다 (표준적인 "배열 힙" 인덱싱):
 *   0                              레벨0 (루트)
 *   1  2                           레벨1
 *   3  4  5  6                     레벨2
 *   7  8  9  10 11 12 13 14        레벨3 (리프)
 * 인덱스 i의 부모 = floor((i-1)/2), 자식 = [2i+1, 2i+2]. 부모→자식 간선이 곧 "링크" 14개.
 */
import { seedRng, shuffle } from './random.js';
import { commonGraph, allGraph, extendedGraph } from './wordGraph.js';

export const TOTAL_NODES = 15;
export const LEVEL_SIZES = [1, 2, 4, 8];

export const parentIndex = (i) => (i === 0 ? null : Math.floor((i - 1) / 2));
export const childIndices = (i) => {
  const l = 2 * i + 1, r = 2 * i + 2;
  return l < TOTAL_NODES ? [l, r] : [];
};

/** 14개 (부모, 자식) 인덱스 쌍 — 트리 모양은 항상 고정이라 상수로 미리 계산해둔다 */
export const TREE_EDGES = Array.from({ length: TOTAL_NODES - 1 }, (_, k) => k + 1)
  .map((child) => ({ parent: parentIndex(child), child }));

const EDGE_INDEX_BY_PAIR = new Map(TREE_EDGES.map(({ parent, child }, k) => [`${parent},${child}`, k]));
/** (parent,child) 슬롯 쌍이 실제 트리 엣지면 그 TREE_EDGES 인덱스, 아니면 undefined. */
export function edgeIndexOf(parent, child) {
  return EDGE_INDEX_BY_PAIR.get(`${parent},${child}`);
}

const DEFAULT_STEP_BUDGET = 20000; // 시도 하나당 후보 배치 횟수 상한 — 넘으면 포기하고 다음 시드로

/**
 * 그래프 위에서 인덱스 0→14 순서로 음절을 배정하는 백트래킹.
 * 부모가 항상 자기보다 먼저 배정되므로(0..14 순서 = 부모가 자식보다 인덱스가 작음) 재귀 없이
 * 순차 백트래킹으로 충분하다. 실패(또는 예산 초과)하면 null.
 *
 * `stepBudget`이 필요한 이유: 그래프가 성긴 곳(일상 어휘 그래프는 평균 연결 5개 수준)으로 빠지면
 * 막다른 길을 몇만 번씩 되짚는 경우가 생겨 드물게 수 초~수십 초까지 걸릴 수 있다(실측함). 한 시도의
 * 최대 소요를 이 예산으로 못박고, 못 찾으면 `generateTree`가 다른 시드로 새로 시도하는 편이
 * "이 시드 하나를 무한정 팜" 것보다 항상 더 빠르고 예측 가능하다.
 */
function backtrack(graph, stepBudget = DEFAULT_STEP_BUDGET) {
  const syllables = new Array(TOTAL_NODES).fill(null);
  const used = new Set();
  let steps = 0;

  function place(index) {
    if (index === TOTAL_NODES) return true;
    if (++steps > stepBudget) return false;

    const candidates = index === 0
      ? shuffle([...graph.syllables])
      : shuffle(graph.childrenOf(syllables[parentIndex(index)]));

    for (const c of candidates) {
      if (used.has(c)) continue;
      syllables[index] = c;
      used.add(c);
      if (place(index + 1)) return true;
      used.delete(c);
      syllables[index] = null;
      if (steps > stepBudget) return false;
    }
    return false;
  }

  return place(0) ? syllables : null;
}

/**
 * @param {string} seed 결정적 시드(예: 'daily:2026-09-13'). 생략하면 매번 다른 결과(자유 연습용).
 * @param {{ tries?: number, stepBudget?: number, extended?: boolean }} [opts]
 *   extended: true면 익스텐디드 그래프(빈도 조사로 거른 실사용 단어 풀)를 1순위로 쓰고, 그래도
 *   모자라면 전체 사전(allGraph)으로 확장 — "익스텐디드 모드"용. 생략(false)이면 기존 그대로
 *   일상 어휘 그래프(commonGraph)를 1순위로 쓰고 모자라면 전체 사전으로 확장.
 * @returns {{ seed: string|null, tiles: string[], words: string[] } | null}
 *   tiles[i] = 인덱스 i 자리의 정답 음절. words[k] = TREE_EDGES[k]에 대응하는 실제 단어(부모+자식).
 */
export function generateTree(seed, { tries = 30, stepBudget = DEFAULT_STEP_BUDGET, extended = false } = {}) {
  for (let attempt = 0; attempt < tries; attempt++) {
    seedRng(seed === undefined ? undefined : `${seed}:${attempt}`);
    // 1순위 그래프. 다 써버리면(간혹 시드 운이 나쁘면) 전체 사전 그래프로 확장.
    const primary = extended ? extendedGraph : commonGraph;
    const graph = attempt < tries / 2 ? primary : allGraph;
    const tiles = backtrack(graph, stepBudget);
    if (!tiles) continue;

    const words = TREE_EDGES.map(({ parent, child }) => tiles[parent] + tiles[child]);
    return { seed: seed ?? null, tiles, words };
  }
  return null;
}

/**
 * 현재 배치(positions[i] = i번 자리의 음절)가 퍼즐을 완성했는지 검사.
 *
 * 판정 기준은 "사전에 있는 단어인지"가 아니라 **그 글자가 solution에서 진짜로 그 부모의 자식이었는지**
 * (값 기준, 자리 기준 아님). 트리는 애초에 "형제 순서"라는 개념이 없는 구조라 —
 *
 *   사              사
 *  과 자    ==     자 과      (둘 다 정답이어야 함 — 같은 트리를 좌우만 바꿔 그린 것뿐)
 *
 * — 같은 부모 밑 자식끼리(혹은 그 서브트리 전체가 통째로) 자리를 바꾼 건 "다른 관계"가 아니라
 * "같은 관계를 다르게 그린 것"이므로 정답으로 인정한다. 반면 어떤 글자가 **원래 자기 부모가 아닌
 * 다른 부모** 밑에 가 있으면(설령 그 조합이 사전에 있는 진짜 단어라도) 오답으로 끊는다.
 *
 * 구현: solution에서 "이 글자의 진짜 부모 글자가 뭐였는지"만 값 기준으로 뽑아두고
 * (`trueParentOf`), 현재 배치에서 각 자리의 부모 칸에 그 글자가 실제로 놓여 있는지만 비교한다 —
 * 왼쪽/오른쪽 어느 자리에 있는지는 아예 안 봄. 값이 전부 서로 다르므로(중복 음절 없음) 이 비교만으로
 * 형제 뒤바뀜은 전부 통과하고, 엉뚱한 부모 밑으로 간 경우는 전부 걸러진다 (수학적으로 루트도 자동으로
 * 강제됨 — 루트 글자는 solution에서 "누군가의 자식"이 아니므로 자리 0이 아닌 곳에 놓이면 반드시
 * 자기 자리의 부모-검사에서 걸림).
 *
 * @param {string[]} positions 현재 배치, 길이 15
 * @param {string[]} solution  generateTree()가 반환한 tiles(정답 배치), 길이 15
 * @returns {{ solved: boolean, correct: boolean[] }} correct[k] = TREE_EDGES[k] 링크가 맞는지
 */
export function checkArrangement(positions, solution) {
  const trueParentOf = new Map(); // 자식 글자 -> solution 상의 진짜 부모 글자
  for (const { parent, child } of TREE_EDGES) trueParentOf.set(solution[child], solution[parent]);

  const correct = TREE_EDGES.map(
    ({ parent, child }) => trueParentOf.get(positions[child]) === positions[parent],
  );
  return { solved: correct.every(Boolean), correct };
}
