/**
 * wordGraph.js — 2음절 단어 목록을 "음절 그래프"로: 노드=음절 한 글자, 간선 a→b는 `a+b`가 실존 단어.
 * treeGenerator.js가 이 그래프 위에서 15노드짜리 유효한 트리를 탐색한다.
 */
import commonWords from '../data/words-common-2syl.json' with { type: 'json' };
import allWords from '../data/words-all-2syl.json' with { type: 'json' };

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

/** a+b가 (일상 어휘든 사전 전체든) 실존하는 2음절 단어인지 — 링크 최종 검증용 */
export function isValidWord(a, b) {
  return commonGraph.has(a, b) || allGraph.has(a, b);
}
