/**
 * test-uniqueness.mjs — 하나의 트리에 대해 "형제(sibling) 서브트리를 통째로 맞바꾸는" 128가지 조합이
 * 전부 정답 처리되는지(트리는 좌우 구분이 없으므로), 그리고 완전 무작위 순열(엉뚱한 부모 밑으로 가는
 * 경우)은 걸러지는지 확인한다. (checkArrangement가 값 기준 "진짜 부모" 비교로 바뀐 뒤의 기대 동작)
 */
import { generateTree, checkArrangement, TOTAL_NODES } from '../src/generator/treeGenerator.js';

const INTERNAL_NODES = [0, 1, 2, 3, 4, 5, 6]; // 자식을 갖는 노드 7개

function subtreeIndices(root) {
  const out = [root];
  const l = 2 * root + 1, r = 2 * root + 2;
  if (l < TOTAL_NODES) out.push(...subtreeIndices(l));
  if (r < TOTAL_NODES) out.push(...subtreeIndices(r));
  return out;
}

/** 노드 i의 두 자식 서브트리를 통째로 맞바꾼 새 배열을 반환 */
function swapChildSubtrees(tiles, i) {
  const l = 2 * i + 1, r = 2 * i + 2;
  const next = [...tiles];
  const leftIdxs = subtreeIndices(l), rightIdxs = subtreeIndices(r);
  // 왼쪽 서브트리 모양 == 오른쪽 서브트리 모양(완전이진트리라 대칭)이므로 자리만 1:1로 맞바꾸면 됨
  for (let k = 0; k < leftIdxs.length; k++) {
    [next[leftIdxs[k]], next[rightIdxs[k]]] = [next[rightIdxs[k]], next[leftIdxs[k]]];
  }
  return next;
}

const result = generateTree('daily:2026-09-13');
console.log('기준 트리:', result.tiles.join(' '));

let allVariants = [result.tiles];
for (const node of INTERNAL_NODES) {
  allVariants = allVariants.flatMap((t) => [t, swapChildSubtrees(t, node)]);
}
console.log(`생성된 변형 개수: ${allVariants.length} (이론값 2^7=128)`);

const uniqueArrangements = new Set(allVariants.map((t) => t.join(',')));
console.log(`서로 다른 배치 수(중복 제거): ${uniqueArrangements.size}`);

let validCount = 0;
for (const t of allVariants) {
  if (checkArrangement(t, result.tiles).solved) validCount++;
}
console.log(`그중 실제로 "전부 정답" 처리되는 배치 수: ${validCount} / ${allVariants.length} (기대값: 128 — 전부, 트리는 좌우 구분 없음)`);

// 참고: 완전 무작위 순열도 우연히 맞을 수 있는지 대조군으로 몇 개 확인
let randomHits = 0;
for (let i = 0; i < 5000; i++) {
  const t = [...result.tiles];
  for (let k = t.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [t[k], t[j]] = [t[j], t[k]];
  }
  if (checkArrangement(t, result.tiles).solved) randomHits++;
}
console.log(`대조군: 완전 무작위 순열 5000개 중 우연히 정답인 것: ${randomHits}개 (기대값: 0)`);
