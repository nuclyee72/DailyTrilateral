/**
 * test-tree-generator.mjs — treeGenerator가 실제로 유효한 15노드 트리를 뽑아내는지 눈으로 확인.
 *   node scripts/test-tree-generator.mjs
 */
import { generateTree, checkArrangement, TREE_EDGES, LEVEL_SIZES } from '../src/generator/treeGenerator.js';

function printPyramid(tiles) {
  let i = 0;
  for (const size of LEVEL_SIZES) {
    const row = tiles.slice(i, i + size).join('  ');
    console.log(' '.repeat((8 - size) * 2) + row);
    i += size;
  }
}

function run(label, seed) {
  console.log(`\n=== ${label} (seed=${seed ?? '(무작위)'}) ===`);
  const t0 = performance.now();
  const result = generateTree(seed);
  const ms = (performance.now() - t0).toFixed(1);
  if (!result) { console.log(`생성 실패 (${ms}ms)`); return; }

  printPyramid(result.tiles);
  console.log(`단어 14개: ${result.words.join(', ')}`);
  console.log(`생성 시간: ${ms}ms`);

  const solved = checkArrangement(result.tiles, result.tiles);
  console.log('정답 배치 자체 검증 →', solved.solved ? '✅ 전부 유효' : `❌ 문제 있음 ${JSON.stringify(solved.correct)}`);

  // 리프 형제(같은 부모의 자식 2개, 둘 다 자손 없음)를 맞바꾸면 — 트리는 좌우 구분이 없으니 정답이어야 함
  // (주의: 자손이 있는 노드끼리 바꾸려면 그 밑 서브트리 전체를 통째로 옮겨야 함 — scripts/test-uniqueness.mjs 참고)
  const siblingSwap = [...result.tiles];
  [siblingSwap[13], siblingSwap[14]] = [siblingSwap[14], siblingSwap[13]]; // 6번(리프 부모)의 두 자식
  const siblingCheck = checkArrangement(siblingSwap, result.tiles);
  console.log('리프 형제 둘을 맞바꾼 배치 →', siblingCheck.solved ? '✅ 정답(예상대로, 좌우 구분 없음)' : '❌ 오답 처리됨(버그)');

  // 완전히 무관한 두 자리(루트↔리프)를 섞으면 — 진짜 다른 관계이므로 여전히 오답이어야 함
  const wrongSwap = [...result.tiles];
  [wrongSwap[0], wrongSwap[14]] = [wrongSwap[14], wrongSwap[0]];
  const wrongCheck = checkArrangement(wrongSwap, result.tiles);
  console.log('루트↔리프처럼 무관한 두 자리 맞바꾼 배치 →', wrongCheck.solved ? '❌ 정답 처리됨(버그)' : '✅ 오답(예상대로)');
}

run('데일리 시드 (2026-09-13)', 'daily:2026-09-13');
run('데일리 시드 (2026-09-14)', 'daily:2026-09-14');
run('자유 연습 (매번 다름)', undefined);

// 시드 하나로 100번 다시 생성해서 항상 같은 결과가 나오는지(결정성) 확인
const a = generateTree('daily:2026-09-13');
const b = generateTree('daily:2026-09-13');
console.log('\n같은 시드 재생성 결정성:', JSON.stringify(a.tiles) === JSON.stringify(b.tiles) ? '✅ 동일' : '❌ 다름(버그)');
