/**
 * test-pyramid-groups.mjs — planGroupMove/applyGroupMove가 §1.4 규칙대로 동작하는지 확인.
 *   node scripts/test-pyramid-groups.mjs
 *
 * 조합 테스트는 A~O 기호로(값 자체는 무의미, 이동 결과 추적이 쉬우라고), 정답 유효성만 보는
 * 테스트는 실제 생성된 한글 정답으로 확인한다.
 */
import { generateTree, checkArrangement, TREE_EDGES } from '../src/generator/treeGenerator.js';
import { planGroupMove, applyGroupMove } from '../src/game/pyramidGroups.js';

function assert(name, cond) {
  console.log(cond ? `✅ ${name}` : `❌ ${name}`);
}

const SYM = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];
const edgeOf = (p, c) => TREE_EDGES.findIndex((e) => e.parent === p && e.child === c);

// 1) 자유 타일끼리 단순 스왑 (마킹/확정 없음, 리프 7과 8)
{
  const mapping = planGroupMove(new Set(), 7, 8);
  assert('자유 타일 단순 스왑 — 허용됨, 매핑 2개(양방향)', mapping && mapping.size === 2);
  const next = applyGroupMove(SYM, mapping);
  assert('스왑 결과: 7,8 값이 실제로 바뀜', next[7] === 'I' && next[8] === 'H');
}

// 2) 마킹된 쌍({3,7})을 완전히 자유로운 다른 엣지 자리(부모=4 자식=9)로 이동 — 밀려난 4,9는 3,7로 되돌아옴
{
  const marked = new Set([edgeOf(3, 7)]);
  const mapping = planGroupMove(marked, 3, 4); // 3을 드래그해서 4 자리로
  assert('마킹된 쌍 → 다른 빈 엣지 자리로 이동 허용, 매핑 4개(이동2+되돌림2)', mapping && mapping.size === 4);
  const next = applyGroupMove(SYM, mapping);
  assert('부모(3→4), 자식(7→9) 이동', next[4] === 'D' && next[9] === 'H');
  assert('밀려난 자유 타일이 원래 그룹 자리로 되돌아옴', next[3] === 'E' && next[7] === 'J');
}

// 3) 형제 서브트리 전체 뒤집기: 1(왼쪽, 서브트리 1,3,4,7,8,9,10)의 marked 그룹을
//    반대편(2, 오른쪽) 자리로 — 두 서브트리(7칸씩)가 완전히 disjoint하게 통째로 스왑돼야 함
{
  const leftEdges = TREE_EDGES.map((e, i) => i).filter((i) => [1, 3, 4].includes(TREE_EDGES[i].parent));
  const active = new Set(leftEdges);
  const mapping = planGroupMove(active, 7, 11); // 7(1의 자손)을 11(2의 자손)로
  assert('서브트리 전체 뒤집기 — 허용, 매핑 14개(7칸씩 통째로 맞교환)', mapping && mapping.size === 14);

  const { tiles: solution } = generateTree('daily:2026-09-13');
  const next = applyGroupMove(solution, mapping);
  assert('서브트리 뒤집은 뒤에도 여전히 전체 정답(§1.17 대칭성)', checkArrangement(next, solution).solved);
}

// 4) 장애물: 마킹된 2인 그룹이 있는 자리로 다른(자유) 타일을 옮기려 하면 막혀야 함
{
  const marked = new Set([edgeOf(3, 7)]); // {3,7} 그룹 존재
  const mapping = planGroupMove(marked, 14, 7); // 자유타일 14를 그룹의 7 자리로 옮기려 함
  assert('다른 그룹 자리로는 이동 불가(장애물)', mapping === null);
}

// 5) [버그 리포트] 같은 그룹 안의 다른 멤버 위로 드롭 — 그룹 전체가 "한 단 내려가는" 식으로
//    통째로 재배치돼야 함(단순 2칸 스왑이 아님). 예시: 실(0)-구(1)-발(2) 마킹, 실을 구 자리로.
{
  const marked = new Set([edgeOf(0, 1), edgeOf(0, 2)]); // 그룹 = {0,1,2}
  const mapping = planGroupMove(marked, 0, 1); // 0(실)을 1(구) 자리로
  assert('[버그] 그룹 안 드롭도 허용됨(차단 아님)', mapping !== null);
  assert('매핑 5개(그룹3 + 밀려난 자유타일2)', mapping.size === 5);
  const next = applyGroupMove(SYM, mapping);
  // 0(그룹루트)→1, 1(그룹 왼쪽)→1의 왼쪽자식(3), 2(그룹 오른쪽)→1의 오른쪽자식(4)
  // 밀려난 옛 3,4 값은 비워진 0,2로 되돌아옴
  assert('그룹 루트가 목표 자리로', next[1] === 'A');
  assert('그룹의 나머지도 그 아래로 함께 내려감(한 단 아래 자식 자리)', next[3] === 'B' && next[4] === 'C');
  assert('밀려난 자유 타일이 그룹이 비운 자리로', next[0] === 'D' && next[2] === 'E');
}

// 6) 자기 그룹 안(완전 제자리)으로 드롭하면 무시(null) — draggedSlot===targetSlot
{
  const mapping = planGroupMove(new Set([edgeOf(0, 1)]), 0, 0);
  assert('완전히 제자리 드롭은 무시(null)', mapping === null);
}

// 7) [버그 리포트] 그룹{3,7,8}에서 형제 있는 리프 7을 그룹 밖(4)으로 끌면, 그룹 루트(3)가
//    4의 부모(1) 자리로 옮겨가면서 그룹 전체가 "한 단 위로" 재배치돼야 함(전엔 잘못 차단).
//    +) 드래그한 7이 정확히 목표 자리(4)에 안착해야 함 — 형제(8)가 있는 상황에서 이게 한때
//    깨져 있었음(§8-9 참고, 8과 7이 같은 목적지로 쏠려 순열이 깨지는 버그).
{
  const marked = new Set([edgeOf(3, 7), edgeOf(3, 8)]); // 그룹 = {3,7,8}
  const mapping = planGroupMove(marked, 7, 4);
  assert('[버그] 조상 방향 이동도 허용됨(차단 아님)', mapping !== null);
  assert('결과가 완전한 순열(충돌 없음)', new Set(mapping.values()).size === mapping.size);
  const next = applyGroupMove(SYM, mapping);
  assert('드래그한 7(H)이 정확히 목표 자리(4)에 안착', next[4] === 'H');
  assert('그룹 루트(3=D)가 한 단 위(1)로', next[1] === 'D');
  assert('형제(8=I)는 반대편 자리(3)로(형제 관계가 반전됨)', next[3] === 'I');
  // 밀려난 옛 1('B'), 4('E')는 그룹이 비운 7,8로
  assert('밀려난 자유 타일이 그룹이 비운 자리로(7,8)', next[7] === 'E' && next[8] === 'B');
}

// 8) [버그 리포트] 형제(같은 부모, 방향이 반대)로의 이동 — 드래그한 슬롯이 반드시 목표 자리에
//    안착해야 함. 표(0)-발(1)-실(4)-상(10) 체인 + 별개로 길(5)-현(11) 그룹이 있는 상태에서
//    발을 정(2)으로 드래그. 발과 정은 같은 부모(0)의 서로 다른(L/R) 자식이라, 예전 알고리즘은
//    "둘 다 부모에서 1단 아래"라는 것만 보고 방향을 무시해 아무 것도 안 움직이는 버그가 있었음.
{
  const chain = new Set([edgeOf(0, 1), edgeOf(1, 4), edgeOf(4, 10)]); // 표-발-실-상
  const other = new Set([edgeOf(5, 11)]); // 길-현 (무관한 별개 그룹)
  const mapping = planGroupMove(new Set([...chain, ...other]), 1, 2); // 발(1)을 정(2)로
  assert('[버그] 형제 방향 이동도 허용됨', mapping !== null);
  assert('드래그한 발(1)이 정확히 목표(2)에 안착', mapping.get(1) === 2);
  assert('결과가 완전한 순열(충돌 없음)', new Set(mapping.values()).size === mapping.size);

  const next = applyGroupMove(SYM, mapping);
  assert('표(A)는 그대로(둘 다 표의 자식이라 안 움직여도 됨)', next[0] === 'A');
  assert('발(B)이 정 자리(2)로', next[2] === 'B');
  // 실(E, 발의 자식)과 상(K, 그 자식)도 정의 자식 자리(6, 14)로 함께 따라감(반전된 방향으로)
  assert('실(E)이 정의 자식 자리(6)로 함께 이동', next[6] === 'E');
  assert('상(K)도 그 자식 자리(14)로 함께 이동', next[14] === 'K');
  // 무관한 길-현 그룹은 안 건드림
  assert('무관한 다른 그룹(길-현)은 안 건드림', next[5] === 'F' && next[11] === 'L');
}

// 9) 무작위 유닛 테스트로도 재현: 그룹이 3개 이상이고 형제 관계가 섞여 있을 때도 항상
//    "드래그한 슬롯 = 목표 슬롯"이 보장돼야 함(핵심 계약)
{
  const marked = new Set([edgeOf(1, 3), edgeOf(1, 4), edgeOf(3, 7), edgeOf(3, 8)]); // 그룹={1,3,4,7,8}
  for (const target of [2, 5, 6, 9, 12]) {
    const mapping = planGroupMove(marked, 4, target); // 4(1의 오른쪽 자식, 리프)를 여기저기로
    if (mapping) {
      assert(`드래그(4)→목표(${target}) 안착 보장`, mapping.get(4) === target);
      assert(`드래그(4)→목표(${target}) 순열 무결성`, new Set(mapping.values()).size === mapping.size);
    }
  }
}

// 8) [신규 요청] 크기가 같고 서로 겹치지 않는 두 "다른" 그룹끼리 통째로 교체 — 이제 허용돼야 함
{
  const A = new Set([edgeOf(1, 3), edgeOf(1, 4)]); // 그룹A = {1,3,4}
  const B = new Set([edgeOf(2, 5), edgeOf(2, 6)]); // 그룹B = {2,5,6} (A와 완전히 disjoint, 같은 모양)
  const mapping = planGroupMove(new Set([...A, ...B]), 1, 2); // A의 루트(1)를 B의 루트(2) 자리로
  assert('[신규] 같은 크기 다른 그룹끼리 교체 — 허용됨', mapping !== null);
  const next = applyGroupMove(SYM, mapping);
  // A(1,3,4)와 B(2,5,6)가 통째로 자리를 맞바꿔야 함: 1↔2, 3↔5, 4↔6
  assert('그룹A,B가 통째로 자리를 맞바꿈', next[2] === 'B' && next[5] === 'D' && next[6] === 'E');
  assert('반대쪽도 정확히', next[1] === 'C' && next[3] === 'F' && next[4] === 'G');

  // B의 내부 관계(2-5, 2-6)도 새 자리(1-3, 1-4)로 정확히 따라가는지 — remapEdgeSet과 동일한 로직으로 확인
  const trueParentOfNewSlot = new Map();
  for (const k of [...A, ...B]) {
    const { parent, child } = TREE_EDGES[k];
    const p2 = mapping.get(parent) ?? parent, c2 = mapping.get(child) ?? child;
    trueParentOfNewSlot.set(k, TREE_EDGES.findIndex((e) => e.parent === p2 && e.child === c2));
  }
  assert('두 그룹 모두 새 자리에서도 유효한 실제 트리 엣지로 재배치됨', [...trueParentOfNewSlot.values()].every((v) => v !== -1));
}

// 9) 다른 그룹의 "일부만" 걸치면 여전히 금지 — 크기가 안 맞거나 절반만 겹치는 경우
{
  const A = new Set([edgeOf(1, 3), edgeOf(1, 4)]); // 그룹A = {1,3,4}
  const B = new Set([edgeOf(2, 5)]); // 그룹B = {2,5} (크기2, A와 다른 모양)
  // A(1)를 2 자리로 옮기면 destSet={2,5,6}인데 B={2,5}뿐이라 6은 자유칸 — 이 경우는 사실 허용돼야
  // 함(B 전체가 destSet 안에 포함됨, 6은 그냥 자유타일). 진짜 "일부만 걸침"을 보려면 B가
  // destSet 밖으로 삐져나가야 함 — B'={2,5,6}인데 destSet은 부모 모양이 안 맞아 6을 포함 안 하는 경우로 구성.
  const C = new Set([edgeOf(4, 9), edgeOf(4, 10)]); // 그룹C = {4,9,10} — 대상 그룹A의 자식4에 걸쳐 있음
  const mapping = planGroupMove(new Set([...A, ...C]), 1, 2); // A(1)를 2로 — destSet={2,5,6}, C={4,9,10}은 무관해야 정상
  // 이 경우는 C와 destSet이 안 겹치므로 사실 허용돼야 함. 진짜 "일부만 겹침"은 아래 D로 확인.
  assert('무관한 다른 그룹은 영향 없이 허용됨', mapping !== null);

  const D = new Set([edgeOf(2, 5)]); // 그룹D = {2,5} — destSet={2,5,6}에서 6만 빠짐(자유칸이라 OK여야 함)
  const mapping2 = planGroupMove(new Set([...A, ...D]), 1, 2);
  assert('그룹 전체(2,5)가 destSet 안에 다 들어오면 허용(6은 그냥 자유칸)', mapping2 !== null);

  // 진짜 "일부만 걸침": E={5,11,12}(5의 서브트리 전체)인데 목적지엔 5만 들어오고 11,12는 안 들어옴
  const E = new Set([edgeOf(5, 11), edgeOf(5, 12)]); // 그룹E = {5,11,12}
  const mapping3 = planGroupMove(new Set([...A, ...E]), 1, 2); // destSet={2,5,6} — E의 11,12는 밖
  assert('다른 그룹의 일부만 걸치면 금지', mapping3 === null);
}

// 10) 불변성 확인: 여러 그룹이 얽힌 상태에서 이동을 반복해도 "확정(locked)"된 링크는
//     이동 후에도 여전히 실제로 유효한 관계를 가리켜야 한다 (진짜 정답과 대조)
{
  const { tiles: solution } = generateTree('daily:2026-09-16');
  // 임의로 두 그룹을 확정(locked)했다고 가정: {1,3,4}와 {2,5,6} (둘 다 실제 정답 관계)
  const locked = new Set([edgeOf(1, 3), edgeOf(1, 4), edgeOf(2, 5), edgeOf(2, 6)]);
  let positions = [...solution];

  // 두 그룹을 통째로 맞바꿈
  const mapping = planGroupMove(locked, 1, 2);
  positions = applyGroupMove(positions, mapping);

  // remapEdgeSet과 같은 방식으로 locked 엣지들을 새 자리로 옮긴 뒤, 그 자리들이 실제로
  // solution 기준으로도 유효한 부모-자식 관계인지 checkArrangement로 대조
  const trueParentOf = new Map();
  for (const { parent, child } of TREE_EDGES) trueParentOf.set(solution[child], solution[parent]);
  let allStillValid = true;
  for (const k of locked) {
    const { parent, child } = TREE_EDGES[k];
    const p2 = mapping.get(parent) ?? parent, c2 = mapping.get(child) ?? child;
    if (trueParentOf.get(positions[c2]) !== positions[p2]) allStillValid = false;
  }
  assert('[불변성] 그룹 교체 후에도 옮겨간 자리의 확정 링크는 여전히 진짜로 유효함', allStillValid);
}

// 11) [버그 리포트] 부모+자식 하나만 잠근 그룹을 형제 쪽으로 옮기려는데, 기본 방향대로 가면
//     형제의 그 자식 자리가 "다른" 잠긴 그룹과 겹쳐서 막히는 경우 — 반대 방향(형제의 다른
//     자식 자리)은 안 겹치니 그쪽으로 자동으로 다시 시도해서 성공해야 함.
{
  // 그룹A = {1(정),4(도)}, 그룹B = {6(표),13(현)} — 정을 이(2)로 드래그
  const locked = new Set([edgeOf(1, 4), edgeOf(6, 13)]);
  const mapping = planGroupMove(locked, 1, 2);
  assert('[버그] 기본 방향이 막혀도 반대 방향으로 재시도해서 성공', mapping !== null);
  if (mapping) {
    assert('드래그한 정(1)이 정확히 목표(2)에 안착', mapping.get(1) === 2);
    assert('도(4)는 표(6)와 안 겹치는 반대쪽 자식 자리(5)로', mapping.get(4) === 5);
    assert('결과가 완전한 순열', new Set(mapping.values()).size === mapping.size);
  }
}

// 12) [버그 리포트] 자유 타일을 "그룹 쪽으로" 끌어다 놓는 방향이 막히던 문제.
//     그룹{0(사),1(건)}이 잠겨 있고 2(회)는 자유 타일일 때, 건→회는 원래도 됐지만
//     회→건(반대 방향)은 draggedSlot(2) 기준 그룹이 크기 1이라 "장애물 그룹({0,1})이
//     통째로 목적지 안에 들어와야 한다"는 조건에 걸려 막혔었음 — 물리적으로는 완전히
//     같은 스왑인데 어느 쪽에서 드래그를 시작하느냐에 따라 결과가 갈리는 비대칭이었다.
{
  const locked = new Set([edgeOf(0, 1)]);
  const forward = planGroupMove(locked, 1, 2);  // 건(그룹 멤버) → 회(자유타일): 원래도 됨
  const backward = planGroupMove(locked, 2, 1); // 회(자유타일) → 건(그룹 멤버): 원래는 막혔음
  assert('[버그] 그룹 멤버 → 자유 타일 방향은 허용됨', forward !== null);
  assert('[버그] 반대로 자유 타일 → 그룹 멤버 방향도 이제 허용됨', backward !== null);
  if (forward && backward) {
    assert('양방향 결과가 동일한 스왑(사는 그대로, 건↔회만 교환)',
      forward.get(0) === 0 && forward.get(1) === 2 && forward.get(2) === 1
      && backward.get(0) === 0 && backward.get(1) === 2 && backward.get(2) === 1);
  }
}

// 13) [버그 리포트] draggedSlot 자신도 여러 칸짜리 그룹의 일부일 때, 11)의 안전장치가
//     "내 그룹 동료까지 같이 움직이는 것"을 "제3자 침범"으로 오인해서 막던 문제.
//     그룹A={메(1),모(3),레(7)} 3칸 체인(잠금), 그룹B={월(4),말(9)} 2칸(마킹, 시=10은 자유).
//     모→월은 원래도 됐지만, 월→모는 draggedSlot(4)이 속한 그룹B의 동료 9(말)까지 같이
//     옮겨지는 게 정상인데 이걸 "제3자"로 오인해 막혔었다.
{
  const locked = new Set([edgeOf(1, 3), edgeOf(3, 7)]);
  const marked = new Set([edgeOf(4, 9)]);
  const active = new Set([...locked, ...marked]);
  const forward = planGroupMove(active, 3, 4);  // 모(그룹A 멤버) → 월(그룹B 자리)
  const backward = planGroupMove(active, 4, 3); // 월(그룹B 멤버) → 모(그룹A 자리)
  assert('[버그] 3칸 체인 쪽에서 드래그하는 방향은 허용됨', forward !== null);
  assert('[버그] 반대로 2칸 그룹 쪽에서 드래그하는 방향도 이제 허용됨', backward !== null);
  if (forward && backward) {
    const same = forward.size === backward.size
      && [...forward].every(([k, v]) => backward.get(k) === v);
    assert('양방향 결과가 완전히 동일한 재배치', same);
    assert('메(1)는 그대로, 모(3)↔월(4)/레(7)↔말(9) 교환', forward.get(1) === 1 && forward.get(3) === 4 && forward.get(4) === 3 && forward.get(7) === 9 && forward.get(9) === 7);
  }
}

console.log('\n모든 검증 끝.');
