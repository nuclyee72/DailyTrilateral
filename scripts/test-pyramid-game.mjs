/**
 * test-pyramid-game.mjs — pyramidGame.js의 한 판 전체 흐름(마킹→이동→제출→잠금→브로큰→공유)을 확인.
 */
import { generateTree, TREE_EDGES, checkArrangement } from '../src/generator/treeGenerator.js';
import {
  createGameState, tryMove, toggleMark, submitGuess, brokenEdges, guessesLeft,
} from '../src/game/pyramidGame.js';
import { buildGuessEmojiSequence } from '../src/daily/share.js';

function assert(name, cond) { console.log(cond ? `✅ ${name}` : `❌ ${name}`); }

const { tiles: solution } = generateTree('daily:2026-09-13');
// 일부러 섞인 상태로 시작 — 7(부모=3)과 9(부모=4)는 서로 다른 부모의 자식이라 맞바꾸면
// 정확히 그 두 링크만 깨짐 (7,8처럼 같은 부모의 형제를 바꾸면 §1.17 규칙상 여전히 정답이라 안 됨)
const start = [...solution];
[start[7], start[9]] = [start[9], start[7]];
const state = createGameState('2026-09-13', solution, { positions: start });

assert('시작 시 4번 남음', guessesLeft(state) === 4);

// 1차 제출 — 대부분 맞고 딱 2개(부모=3의 두 자식)만 틀려야 함
const g1 = submitGuess(state);
const wrongCount = g1.correct.filter((c) => !c).length;
assert('1차 제출: 정확히 2개 링크만 틀림', wrongCount === 2);
assert('1차 제출 후 3번 남음', guessesLeft(state) === 3);
assert('맞은 링크는 locked에 들어감', state.locked.size === 12);

const broken1 = brokenEdges(state);
assert('브로큰 링크 2개 표시됨', broken1.size === 2);

// 틀린 두 자리를 원위치로 되돌림(자유 타일끼리 드래그 스왑 시뮬레이션)
const moved = tryMove(state, 7, 9);
assert('그룹 없이 자유 타일 스왑은 허용됨(둘 다 자유)', moved === true);

const broken2 = brokenEdges(state);
assert('배치를 바꾸면 브로큰 표시가 사라짐(같은 조합 아니므로)', broken2.size === 0);

// 이제 정답 배치이므로 2차 제출하면 성공해야 함
const g2 = submitGuess(state);
assert('2차 제출 성공', g2.solved === true);
assert('상태가 solved로 바뀜', state.status === 'solved');

const emoji = buildGuessEmojiSequence(state.guesses);
assert('공유 이모지 = 🟥🟩⬜⬜', emoji === '🟥🟩⬜⬜');
console.log('실제 이모지:', emoji);

// ── 버그 리포트 재현: "그룹 이동 시 선(마킹)이 안 따라옴" + "그룹 안으로는 이동 불가" ──
{
  const s2 = createGameState('2026-09-14', solution, { positions: [...solution] }); // 정답 그대로 시작
  const e01 = TREE_EDGES.findIndex((e) => e.parent === 0 && e.child === 1);
  const e02 = TREE_EDGES.findIndex((e) => e.parent === 0 && e.child === 2);
  toggleMark(s2, e01);
  toggleMark(s2, e02); // 실(0)-구(1)-발(2) 마킹 — 버그 리포트 예시와 동일한 그룹

  // 1) 그룹 안(구, slot1) 위로 실(slot0)을 드래그 — 그룹 전체가 "한 단 내려가는" 식으로
  //    통째로 재배치돼야 함(단순 2칸 스왑 아님) — scripts/test-pyramid-groups.mjs #5와 동일한 사례
  const moved = tryMove(s2, 0, 1);
  assert('[버그 재현] 그룹 안 멤버 위로 이동 가능', moved === true);
  assert('[버그 재현] 그룹 루트(실)가 목표 자리로', s2.positions[1] === solution[0]);
  assert(
    '[버그 재현] 그룹 나머지(구,발)도 한 단 아래 자식 자리로 함께 이동',
    s2.positions[3] === solution[1] && s2.positions[4] === solution[2],
  );
  assert(
    '[버그 재현] 밀려난 자유 타일이 그룹이 비운 자리로',
    s2.positions[0] === solution[3] && s2.positions[2] === solution[4],
  );
  const e13 = TREE_EDGES.findIndex((e) => e.parent === 1 && e.child === 3);
  const e14 = TREE_EDGES.findIndex((e) => e.parent === 1 && e.child === 4);
  assert('[버그 재현] 마킹(선)도 새 자리(1-3, 1-4)로 따라옴', s2.marked.has(e13) && s2.marked.has(e14));
  assert('[버그 재현] 옛 자리(0-1, 0-2)엔 더 이상 마킹 없음', !s2.marked.has(e01) && !s2.marked.has(e02));

  // 2) 그룹을 완전히 다른 곳(형제 서브트리)으로 옮기면 마킹(선)도 새 자리로 따라가야 함
  const s3 = createGameState('2026-09-15', solution, { positions: [...solution] });
  const eA = TREE_EDGES.findIndex((e) => e.parent === 1 && e.child === 3);
  const eB = TREE_EDGES.findIndex((e) => e.parent === 1 && e.child === 4);
  toggleMark(s3, eA);
  toggleMark(s3, eB); // 그룹 = {1,3,4} (1의 서브트리)
  tryMove(s3, 1, 2); // 1을 2(형제) 자리로 — 그룹 {1,3,4} 전체가 {2,5,6}으로 이동해야 함
  const eA2 = TREE_EDGES.findIndex((e) => e.parent === 2 && e.child === 5);
  const eB2 = TREE_EDGES.findIndex((e) => e.parent === 2 && e.child === 6);
  assert('[버그 재현] 그룹 이동 후 옛 마킹은 사라짐', !s3.marked.has(eA) && !s3.marked.has(eB));
  assert('[버그 재현] 마킹(선)이 새 자리로 따라옴', s3.marked.has(eA2) && s3.marked.has(eB2));
}

// ── 버그 리포트: "한 곳에서 빨간색(브로큰)이었던 조합을, 옮겨서 다른 자리에서 다시 만나면
//    빨간색으로 안 뜬다" — 브로큰 판정이 자리(슬롯) 기준이라 생긴 문제였음 ──
//
// submitGuess를 그대로 쓰면 대부분의 링크가 맞아서 자동으로 locked가 돼버려(거의 다
// 잠기면 자유롭게 스왑할 자리가 없어짐) 테스트가 꼬이므로, 여기서는 "1차 게스에서 (3,7)·
// (4,9) 두 링크만 틀렸다"는 기록만 직접 만들고 locked는 비워둔 채(전부 자유 타일) 확인한다.
{
  const s4 = createGameState('2026-09-16', solution, { positions: [...solution] });
  const wrongPositions = [...solution];
  [wrongPositions[7], wrongPositions[9]] = [wrongPositions[9], wrongPositions[7]];
  const { correct } = checkArrangement(wrongPositions, solution);
  s4.guesses.push({ correct, positions: wrongPositions });
  s4.positions = [...wrongPositions];

  const broken1 = brokenEdges(s4);
  assert('[버그 재현] 1차 게스 직후 브로큰 2곳', broken1.size === 2);

  // 그 틀린 조합(자리7의 값, 자리9의 값)을 완전히 다른 자리(11,12)로 옮긴다 — 전부 자유
  // 타일이라 단순 스왑됨
  tryMove(s4, 7, 11);
  tryMove(s4, 9, 12);
  const brokenAfterMove = brokenEdges(s4);
  assert('[버그 재현] 다른 자리로 옮기면 옛 자리는 더 이상 브로큰 아님', brokenAfterMove.size === 0);

  // 이제 그 두 값(원래 3-7 조합의 자식 쪽 값, 원래 4-9 조합의 부모 쪽 값 등)을 "부모-자식
  // 관계가 되는 새 자리"로 다시 모아서 같은 조합을 재현한다: 5의 값을 원래 3자리 값으로,
  // 11의 값을 원래 7자리 값으로 만들면 (5,11) 엣지가 "3의 값 + 7의 값" 그 조합이 된다.
  const wrongParentVal = wrongPositions[3];
  const wrongChildVal = wrongPositions[7];
  tryMove(s4, s4.positions.indexOf(wrongParentVal), 5);
  tryMove(s4, s4.positions.indexOf(wrongChildVal), 11);
  const brokenReunited = brokenEdges(s4);
  const e5_11 = TREE_EDGES.findIndex((e) => e.parent === 5 && e.child === 11);
  assert('[버그 재현] 같은 틀린 조합이 다른 자리에서 다시 만나면 브로큰으로 뜸', brokenReunited.has(e5_11));
}

// ── §6.17 [요청]: 추측 제출 후에는 마킹(주황)이 맞았든 틀렸든 전부 풀려야 함 ──
{
  const s5 = createGameState('2026-09-17', solution, { positions: [...solution] });
  [s5.positions[7], s5.positions[9]] = [s5.positions[9], s5.positions[7]]; // 두 링크만 틀리게
  const eOk = TREE_EDGES.findIndex((e) => e.parent === 0 && e.child === 1); // 맞을 링크
  const eWrong = TREE_EDGES.findIndex((e) => e.parent === 3 && e.child === 7); // 틀릴 링크
  toggleMark(s5, eOk);
  toggleMark(s5, eWrong);
  assert('[사전조건] 제출 전 마킹 2개', s5.marked.size === 2);

  submitGuess(s5);
  assert('[6.17] 제출 후 마킹이 전부 풀림(맞은 것도 틀린 것도)', s5.marked.size === 0);
  assert('[6.17] 맞은 링크는 그래도 locked로 들어감', s5.locked.has(eOk));
  assert('[6.17] 틀린 링크는 locked에 안 들어감(자유 상태로 풀림)', !s5.locked.has(eWrong));
}

// ── §6.20 [요청]: 브로큰(빨강)으로 뜬 링크는 눌러서 마킹으로 묶을 수 없어야 함 ──
{
  const s6 = createGameState('2026-09-18', solution, { positions: [...solution] });
  [s6.positions[7], s6.positions[9]] = [s6.positions[9], s6.positions[7]]; // (3,7)/(4,9) 틀리게
  submitGuess(s6);
  const eBroken = TREE_EDGES.findIndex((e) => e.parent === 3 && e.child === 7);
  assert('[사전조건] (3,7)이 브로큰으로 뜸', brokenEdges(s6).has(eBroken));
  const toggled = toggleMark(s6, eBroken);
  assert('[6.20] 브로큰 링크는 마킹 토글이 거부됨', toggled === false);
  assert('[6.20] 실제로 마킹되지 않음', !s6.marked.has(eBroken));
}

console.log('\n모든 검증 끝.');
