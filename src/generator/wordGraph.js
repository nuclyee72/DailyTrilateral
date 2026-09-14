/**
 * wordGraph.js — 2음절 단어 목록을 "음절 그래프"로: 노드=음절 한 글자, 간선 a→b는 `a+b`가 실존 단어.
 * treeGenerator.js가 이 그래프 위에서 15노드짜리 유효한 트리를 탐색한다.
 */
import commonWords from '../data/words-common-2syl.json' with { type: 'json' };
import allWords from '../data/words-all-2syl.json' with { type: 'json' };
import extendedWords from '../data/words-extended-2syl.json' with { type: 'json' };

/**
 * @param {string[]} words 2음절 단어 목록 (예: ["사과", "과일", ...])
 * @returns {{ has(a:string,b:string):boolean, childrenOf(a:string):string[], syllables:string[] }}
 */
export function buildGraph(words) {
  const children = new Map(); // 앞글자 -> Set(뒷글자)
  for (const w of words) {
    if (w.length !== 2) continue;
    const [a, b] = w;
    if (!children.has(a)) children.set(a, new Set());
    children.get(a).add(b);
  }
  return {
    has(a, b) { return children.get(a)?.has(b) ?? false; },
    childrenOf(a) { return [...(children.get(a) ?? [])]; },
    get syllables() { return [...children.keys()]; },
  };
}

/** 퍼즐 출제 1순위 — 일상 어휘만으로 만든 그래프 */
export const commonGraph = buildGraph(commonWords);
/** 보조 풀 — 표준국어대사전 전체 (common으로 못 찾을 때 확장용, 정답 검증용) */
export const allGraph = buildGraph(allWords);
/**
 * 익스텐디드 모드용 그래프 — 표준국어대사전 전체(allGraph)는 사어/고어/전문용어가 너무 많이
 * 섞여서 그대로 쓰면 처음 보는 단어투성이가 됨. 국립국어원 "현대 국어 사용 빈도 조사"(900만
 * 어절 실제 말뭉치)에서 한 번이라도 등장한 2음절 명사만 추려 — "사전에만 있는 단어"가 아니라
 * "실제로 쓰인 단어"로 걸러낸 풀. words-common-2syl.json(2,185개)보다는 훨씬 넓고, 전체
 * 사전(75,333개)보다는 훨씬 정제돼 있다 — src/data/README.md 참고.
 */
export const extendedGraph = buildGraph(extendedWords);

/** a+b가 (일상 어휘든 사전 전체든) 실존하는 2음절 단어인지 — 링크 최종 검증용 */
export function isValidWord(a, b) {
  return commonGraph.has(a, b) || allGraph.has(a, b);
}
