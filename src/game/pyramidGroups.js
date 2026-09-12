/**
 * pyramidGroups.js — §1.4 "고정 그룹 이동 규칙"의 순수 로직 (DOM 의존 없음, 테스트 가능).
 *
 * - 초록(확정, locked) + 주황(마킹, marked) 엣지가 "그룹"을 만든다 — 이 둘을 합친 게 activeEdgeIdxSet.
 * - 그룹 내 아무 슬롯이나 드래그해서 다른 슬롯에 놓으면, 그 그룹 전체가 "같은 상대 모양"을 유지한 채
 *   목적지로 옮겨간다 (draggedSlot이 targetSlot 자리에 오도록, 나머지는 그 상대 위치 그대로) — 목적지가
 *   그룹 자신의 다른 슬롯과 겹치더라도(예: 부모를 자기 자식 자리로) 상관없이 통째로 옮긴다.
 * - 옮긴 자리들 중 그룹 소속이 아니었던 자리(밀려난 자유 타일, 또는 크기가 꼭 맞아 통째로 함께
 *   딸려가는 "다른" 고정 그룹)는, 그룹이 비운 자리로 자동으로 맞바뀐다.
 * - 유일하게 막히는 경우: 밀려나야 할 자리가 **다른** 고정 그룹(자기 그룹이 아닌 marked/locked
 *   뭉치)의 일부만 걸칠 때 — 그 그룹이 반쪽나버리므로 금지. 그 그룹 전체가 통째로 목적지 안에
 *   들어온다면(크기가 같든 다르든, 자기 것과 안 겹치기만 하면) 함께 스왑되는 걸로 허용한다.
 */
import { TREE_EDGES, TOTAL_NODES, parentIndex, childIndices } from '../generator/treeGenerator.js';

/** 활성 엣지 인덱스 집합 → 인접 리스트 */
export function buildAdjacency(activeEdgeIdxSet) {
  const adj = new Map();
  for (let i = 0; i < TOTAL_NODES; i++) adj.set(i, new Set());
  for (const k of activeEdgeIdxSet) {
    const { parent, child } = TREE_EDGES[k];
    adj.get(parent).add(child);
    adj.get(child).add(parent);
  }
  return adj;
}

/** slot이 속한 연결 성분(그 슬롯만 있으면 크기 1) */
export function connectedComponent(slot, adj) {
  const seen = new Set([slot]);
  const stack = [slot];
  while (stack.length) {
    const cur = stack.pop();
    for (const nb of adj.get(cur)) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
  }
  return seen;
}

/** ancestor에서 slot까지 내려가는 길 ('L'/'R' 배열). slot이 ancestor의 자손이 아니면 null. */
function pathFromAncestor(ancestor, slot) {
  const steps = [];
  let cur = slot;
  while (cur !== ancestor) {
    const p = parentIndex(cur);
    if (p === null) return null;
    steps.push(cur === 2 * p + 1 ? 'L' : 'R');
    cur = p;
  }
  return steps.reverse();
}

/** slot에서 steps번 위로 올라간 조상. 루트 위로 넘어가면 null. */
function ancestorAt(slot, steps) {
  let cur = slot;
  for (let i = 0; i < steps; i++) {
    cur = parentIndex(cur);
    if (cur === null) return null;
  }
  return cur;
}

/** root에서 path('L'/'R' 배열)를 따라 내려간 자리. 트리 밖으로 나가면 null. */
function descendantVia(root, path) {
  let cur = root;
  for (const step of path) {
    const [l, r] = childIndices(cur);
    if (l === undefined) return null; // 리프인데 더 내려가야 함 — 모양이 안 맞음
    cur = step === 'L' ? l : r;
  }
  return cur;
}

/**
 * draggedPath(그룹 루트→draggedSlot 경로)와 targetPath(같은 길이, 새 루트→targetSlot 실제 경로)를
 * 자리마다 비교해 "이 단에서 방향이 바뀌었는지" 배열을 만든다. 길이는 항상 draggedPath와 같다
 * (newRoot을 draggedPath 길이만큼 걸어 올라가 구했으므로 targetPath도 항상 그 길이).
 */
function computeReflect(draggedPath, targetPath) {
  return draggedPath.map((step, i) => step !== targetPath[i]);
}

/**
 * memberPath(그룹 루트→어떤 멤버 경로)에 reflect를 적용한다 — draggedSlot과 "같은 조상을
 * 거쳐가는" 구간(경로가 갈라지는 지점까지, 그 지점 포함)에서만 방향을 뒤집고, 그 뒤로 갈라진
 * 뒤(혹은 draggedSlot보다 더 깊이 내려간 나머지 구간)는 원래 방향 그대로 둔다.
 *
 * 왜 필요한가: 그룹의 다른 멤버가 draggedSlot과 같은 부모의 "반대쪽 형제"인 경우(예: 그룹
 * {3,7,8}에서 7을 드래그하는데 8은 7의 형제), 7의 경로만 보고 무작정 그대로 재적용하면 8이
 * 엉뚱한 자리(심지어 목표 자리 자신)로 쏠려 다른 멤버와 자리가 겹치는 계산 오류가 생겼었다.
 * "그 형제 관계를 만드는 조상 지점까지는 같이 뒤집고, 그 이후 각자 갈라진 방향은 안 건드린다"가
 * 정답 — 형제 관계 자체가 뒤집히는 게(발↔정처럼) 원래 하려던 일이기 때문.
 */
function reorientPath(memberPath, draggedPath, reflect, forceFlipAt = -1) {
  const out = [...memberPath];
  let stillWithDragged = true;
  for (let i = 0; i < out.length; i++) {
    if (!stillWithDragged) break;
    if (i < reflect.length) {
      if (reflect[i]) out[i] = out[i] === 'L' ? 'R' : 'L';
    } else if (i === forceFlipAt) {
      // reflect가 끝난 바로 다음 자리(=draggedPath 길이만큼 지난 지점)는 draggedSlot 쪽에서
      // 아무 방향 정보도 안 주는 "완전히 자유로운" 갈림이다 — 예를 들어 draggedSlot 자신이
      // 그룹의 맨 위 멤버면(draggedPath가 비어있음) 그 아래 자식이 새 자리의 왼쪽/오른쪽 어느
      // 쪽으로 가든 모양상 똑같이 맞다. planGroupMove가 기본(안 뒤집음)으로 먼저 시도했다가
      // 막히면, 이 자유 지점 하나를 뒤집은 대안을 다시 시도해서 다른 배치를 만들어본다.
      out[i] = out[i] === 'L' ? 'R' : 'L';
    }
    if (i >= draggedPath.length || memberPath[i] !== draggedPath[i]) stillWithDragged = false;
  }
  return out;
}

/** planGroupMove 한 번의 시도(고정된 flip 선택 하나로). 실패하면 null. */
function tryPlanOnce(adj, group, root, draggedPath, newRoot, reflect, forceFlipAt) {
  const mapping = new Map();
  for (const m of group) {
    const memberPath = pathFromAncestor(root, m);
    const dest = descendantVia(newRoot, reorientPath(memberPath, draggedPath, reflect, forceFlipAt));
    if (dest === null) return null;
    mapping.set(m, dest);
  }
  const destSet = new Set(mapping.values());

  const seenForeign = new Set();
  for (const d of destSet) {
    if (group.has(d) || seenForeign.has(d)) continue;
    const foreign = connectedComponent(d, adj);
    if (foreign.size <= 1) continue;
    for (const f of foreign) {
      if (!destSet.has(f)) return null;
      seenForeign.add(f);
    }
  }

  const sources = [...mapping.keys()].filter((g) => !destSet.has(g));
  for (const src of sources) {
    let cur = src;
    while (mapping.has(cur)) cur = mapping.get(cur);
    if (cur !== src) mapping.set(cur, src);
  }

  return mapping;
}

/**
 * @param {Set<number>} activeEdgeIdxSet TREE_EDGES 인덱스 중 초록(locked) + 주황(marked) 전부
 * @param {number} draggedSlot 드래그를 시작한 슬롯
 * @param {number} targetSlot 드롭한 슬롯
 * @returns {Map<number,number>|null} oldSlot→newSlot 매핑(성공 시). 불가능하면 null(스냅백).
 */
export function planGroupMove(activeEdgeIdxSet, draggedSlot, targetSlot) {
  if (draggedSlot === targetSlot) return null; // 제자리 — 무시

  const adj = buildAdjacency(activeEdgeIdxSet);
  const group = connectedComponent(draggedSlot, adj);

  // 그룹의 "상대 모양"을 유지한 채, draggedSlot이 targetSlot 자리에 오도록 전체를 재배치.
  // 그룹 전체의 공통 기준점(그룹 안에서 가장 위쪽인 멤버)에서 draggedSlot까지의 경로를 구하고,
  // 그 경로 길이만큼 targetSlot에서 거슬러 올라간 자리를 "새 기준점"으로 삼는다. 이때
  // draggedSlot의 경로와 targetSlot의 실제 경로가 단 몇 군데서 다르면(예: 형제 사이 이동)
  // 그 다른 지점들을 "뒤집혔다"고 기록해뒀다가, 다른 멤버들의 경로에도 그 뒤집힘을 그대로
  // 적용한다 — 그래야 형제 관계 자체가 자연스럽게 뒤집히면서도 서로 다른 멤버가 같은 자리로
  // 쏠리는 충돌 없이 항상 올바른 순열이 나온다 (자세한 이유는 reorientPath 주석 참고).
  const root = Math.min(...group);
  const draggedPath = pathFromAncestor(root, draggedSlot);
  const newRoot = ancestorAt(targetSlot, draggedPath.length);
  if (newRoot === null) return null;
  const targetPath = pathFromAncestor(newRoot, targetSlot);
  const reflect = computeReflect(draggedPath, targetPath);

  return tryPlanOnce(adj, group, root, draggedPath, newRoot, reflect, -1)
    ?? tryPlanOnce(adj, group, root, draggedPath, newRoot, reflect, draggedPath.length);
}

/**
 * mapping(oldSlot→newSlot, 자기 자신의 슬롯 집합 안에서 완전한 순열)대로 옮긴 새 positions 배열.
 * mapping은 planGroupMove가 그룹 이동분 + 밀려난 자유 타일의 되돌림분까지 합쳐서 이미 완전한
 * 순열로 만들어 반환하므로, 항목마다 한 번씩만 옮기면 된다(원본 positions에서만 읽음).
 */
export function applyGroupMove(positions, mapping) {
  const next = [...positions];
  for (const [oldSlot, newSlot] of mapping) next[newSlot] = positions[oldSlot];
  return next;
}
