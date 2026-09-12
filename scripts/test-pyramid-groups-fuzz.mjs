/**
 * test-pyramid-groups-fuzz.mjs — planGroupMove를 무작위로 수천 번 돌려서 세 불변성을 확인:
 *   1) 이동이 성공하면 결과는 항상 15개 값의 완전한 순열이어야 함(값 손실/중복 없음)
 *   2) 이동 전에 locked였던 엣지는, 이동 후 새 자리에서도 여전히 "진짜 정답 관계"를 가리켜야 함
 *      (trueParentOf 기준 — checkArrangement와 동일한 판정)
 *   3) 드래그한 슬롯은 반드시 목표 슬롯에 정확히 안착해야 함 — 이게 한때 형제(방향이 다른)
 *      이동에서 깨져 있었는데, 1)·2)는 "아무것도 안 움직임"도 통과시켜버려서 못 잡았었음
 *      (identity 매핑도 엄연히 유효한 순열이고 locked 불변성도 자동으로 유지되니까).
 */
import { generateTree, TREE_EDGES, TOTAL_NODES } from '../src/generator/treeGenerator.js';
import { planGroupMove, applyGroupMove, buildAdjacency, connectedComponent } from '../src/game/pyramidGroups.js';

function assert(name, cond) {
  console.log(cond ? `✅ ${name}` : `❌ ${name}`);
  if (!cond) process.exitCode = 1;
}

const { tiles: solution } = generateTree('daily:2026-09-17');
const trueParentOf = new Map();
for (const { parent, child } of TREE_EDGES) trueParentOf.set(solution[child], solution[parent]);

function randInt(n) { return Math.floor(Math.random() * n); }

/** 무작위로 "타당한" locked 엣지 집합을 만든다: 몇 개의 무작위 부분트리를 골라 그 안의 실제 엣지들을 켠다 */
function randomLockedSet() {
  const on = new Set();
  const rootsToTry = randInt(3) + 1;
  for (let i = 0; i < rootsToTry; i++) {
    let node = randInt(TOTAL_NODES);
    // node에서 무작위로 몇 단 아래까지 전체 서브트리를 켠다(항상 "진짜 부분트리" 모양이 되도록)
    const depth = randInt(3);
    const queue = [[node, depth]];
    while (queue.length) {
      const [n, d] = queue.pop();
      if (d <= 0) continue;
      const l = 2 * n + 1, r = 2 * n + 2;
      if (l < TOTAL_NODES) {
        const k = TREE_EDGES.findIndex((e) => e.parent === n && e.child === l);
        on.add(k);
        queue.push([l, d - 1]);
      }
      if (r < TOTAL_NODES) {
        const k = TREE_EDGES.findIndex((e) => e.parent === n && e.child === r);
        on.add(k);
        queue.push([r, d - 1]);
      }
    }
  }
  return on;
}

let attempts = 0, accepted = 0, permutationOk = 0, invariantOk = 0, landedOk = 0;
const N = 3000;

for (let i = 0; i < N; i++) {
  const locked = randomLockedSet();
  const from = randInt(TOTAL_NODES);
  const to = randInt(TOTAL_NODES);
  if (from === to) continue;
  attempts++;

  const mapping = planGroupMove(locked, from, to);
  if (!mapping) continue;
  accepted++;

  if (mapping.get(from) === to) landedOk++;
  else console.log(`❌ 드래그(${from})가 목표(${to})에 안착 안 함! mapping.get(from)=${mapping.get(from)}`);

  const positions = applyGroupMove(solution, mapping);

  // 불변성 1: 완전한 순열인가
  const asSet = new Set(positions);
  if (asSet.size === TOTAL_NODES && positions.every((v) => solution.includes(v))) permutationOk++;
  else console.log(`❌ 순열 깨짐! locked=${[...locked]} from=${from} to=${to} mapping=${[...mapping]}`);

  // 불변성 2: 이동 전에 locked였던 엣지는, 이동 후 새 자리에서도 여전히 유효한 관계인가
  let ok = true;
  for (const k of locked) {
    const { parent, child } = TREE_EDGES[k];
    const p2 = mapping.get(parent) ?? parent;
    const c2 = mapping.get(child) ?? child;
    if (trueParentOf.get(positions[c2]) !== positions[p2]) {
      ok = false;
      console.log(`❌ 불변성 깨짐! locked=${[...locked]} from=${from} to=${to} 엣지(${parent},${child})→(${p2},${c2})`);
    }
  }
  if (ok) invariantOk++;
}

console.log(`\n총 시도 ${attempts}, 이동 허용 ${accepted}`);
assert(`허용된 이동 전부 드래그한 슬롯이 목표에 정확히 안착 (${landedOk}/${accepted})`, landedOk === accepted);
assert(`허용된 이동 전부 완전한 순열 (${permutationOk}/${accepted})`, permutationOk === accepted);
assert(`허용된 이동 전부 locked 불변성 유지 (${invariantOk}/${accepted})`, invariantOk === accepted);
assert('실제로 여러 케이스가 허용됨(전부 거부만 되진 않음)', accepted > attempts * 0.1);
