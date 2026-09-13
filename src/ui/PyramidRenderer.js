/**
 * PyramidRenderer.js — 피라미드 15타일 + 14링크를 그리고, 드래그(스왑/그룹이동)와
 * 링크 클릭(마킹 토글)을 처리한다. 게임 규칙 자체는 모른다 — 콜백으로만 바깥(main.js)에 위임한다.
 */
import { TREE_EDGES, TOTAL_NODES, LEVEL_SIZES, childIndices } from '../generator/treeGenerator.js';
import { buildAdjacency, connectedComponent } from '../game/pyramidGroups.js';

const PAD_X = 7;   // % — 좌우 여백 (타일이 잘리지 않도록)
const PAD_Y = 10;  // % — 상하 여백

const level = (i) => Math.floor(Math.log2(i + 1));
const MAX_LEVEL = level(TOTAL_NODES - 1);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function computeLayout() {
  const x = new Array(TOTAL_NODES);
  // 리프부터: 배열 인덱스 순서가 곧 왼쪽→오른쪽 순서
  const leafCount = LEVEL_SIZES[LEVEL_SIZES.length - 1];
  const leafStart = TOTAL_NODES - leafCount;
  for (let i = 0; i < leafCount; i++) x[leafStart + i] = i + 0.5;
  // 안쪽 노드는 자식 x의 평균 — 인덱스 역순(자식이 항상 더 큰 인덱스)으로 가면 항상 준비돼 있음
  for (let i = leafStart - 1; i >= 0; i--) {
    const [l, r] = childIndices(i);
    x[i] = (x[l] + x[r]) / 2;
  }

  // 세로 간격은 매 단 균등(레벨0~3을 PAD_Y~100-PAD_Y에 고르게 분배) — 자기 닮은꼴로 줄이는
  // 실험을 해봤지만(리프 삼각형 크기까지 위쪽과 똑같이 만들 수는 없음 — 8개 리프 자리가
  // 3단 분기만으로는 서로 다른 4가지 위치값에만 몰리는 조합론적 한계 때문) 원래 방식으로 되돌림.
  const layout = new Array(TOTAL_NODES);
  for (let i = 0; i < TOTAL_NODES; i++) {
    layout[i] = {
      leftPct: PAD_X + (x[i] / leafCount) * (100 - 2 * PAD_X),
      topPct: PAD_Y + (level(i) / MAX_LEVEL) * (100 - 2 * PAD_Y),
    };
  }
  return layout;
}

const LAYOUT = computeLayout();

export class PyramidRenderer {
  /**
   * @param {HTMLElement} root 이 안에 SVG + 타일들을 그린다
   * @param {object} handlers
   * @param {(from:number, to:number) => void} handlers.onDrop 타일을 드래그해서 다른 슬롯에 놓았을 때
   * @param {(edgeIdx:number) => void} handlers.onToggleMark 링크(호)를 클릭했을 때
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.root.classList.add('pyramid-stage');

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 100 100');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.svg.classList.add('pyramid-links');
    this.root.appendChild(this.svg);

    // 타일이 그룹째로 들려서 옮겨 다니는 동안, 원래 있던 자리가 텅 비어 보이지 않도록 글자
    // 없는 빈 원 하나씩을 깔아둔다 — 평소엔 숨겨져 있다가 드래그 중인 슬롯만 보여준다.
    // 실제 타일 레이어보다 먼저(=아래에) 두어서, 실제 타일과 겹쳐도 항상 뒤에 깔리게 한다.
    this.ghostLayer = document.createElement('div');
    this.ghostLayer.className = 'pyramid-tiles';
    this.root.appendChild(this.ghostLayer);
    this.ghostEls = Array.from({ length: TOTAL_NODES }, (_, i) => {
      const el = document.createElement('div');
      el.className = 'pyramid-tile-ghost';
      el.style.left = `${LAYOUT[i].leftPct}%`;
      el.style.top = `${LAYOUT[i].topPct}%`;
      this.ghostLayer.appendChild(el);
      return el;
    });

    this.tilesLayer = document.createElement('div');
    this.tilesLayer.className = 'pyramid-tiles';
    this.root.appendChild(this.tilesLayer);

    // 링크(엣지)마다 선 2개: 눈에 보이는 얇은 색선(pyramid-link) + 그 위에 겹친 두꺼운 투명
    // 히트박스(pyramid-link-hit) — 대각선을 손가락/마우스로 정확히 맞히기 어려우니 클릭 판정
    // 영역만 훨씬 넓게 잡는다. 클릭 리스너는 히트박스 쪽에만 붙인다.
    this.lineEls = [];
    this.hitEls = [];
    TREE_EDGES.forEach(({ parent, child }, k) => {
      const a = LAYOUT[parent], b = LAYOUT[child];
      const makeLine = (cls) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', a.leftPct);
        line.setAttribute('y1', a.topPct);
        line.setAttribute('x2', b.leftPct);
        line.setAttribute('y2', b.topPct);
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.classList.add(cls);
        this.svg.appendChild(line);
        return line;
      };
      this.lineEls.push(makeLine('pyramid-link'));
      const hit = makeLine('pyramid-link-hit');
      hit.addEventListener('click', () => this.handlers.onToggleMark?.(k));
      this.hitEls.push(hit);
    });

    this.tileEls = Array.from({ length: TOTAL_NODES }, (_, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pyramid-tile';
      el.style.left = `${LAYOUT[i].leftPct}%`;
      el.style.top = `${LAYOUT[i].topPct}%`;
      el.dataset.slot = String(i);
      this._bindDrag(el, i);
      this.tilesLayer.appendChild(el);
      return el;
    });

    // render()가 호출될 때마다 최신 marked/locked를 기억해뒀다가, 드래그 시작 시 "지금 이
    // 타일이 속한 그룹이 뭔지" 계산하는 데 쓴다(그룹 전체 + 연결선을 같이 움직이기 위해).
    this._view = { marked: new Set(), locked: new Set() };
    // 이동 완료(§6.17) 시 "글자가 바뀐 자리"만 부드러운 교체 효과를 주기 위해 직전 render()의
    // 배치를 기억해둔다. null이면 "아직 비교할 이전 상태가 없다"(최초 그리기/새 판 시작)는
    // 뜻이라 애니메이션을 걸지 않는다.
    this._prevPositions = null;
    // 드롭 직후 한 번의 render()에서만 "방금 드래그한 슬롯들"을 알려주는 임시 값(§ 참고).
    this._justDraggedFromSlots = null;
  }

  /** slot이 지금(this._view 기준) 속한 그룹의 슬롯 목록 */
  _groupOf(slot) {
    const active = new Set([...this._view.marked, ...this._view.locked]);
    return [...connectedComponent(slot, buildAdjacency(active))];
  }

  _bindDrag(el, slot) {
    let dragging = false;
    let startX = 0, startY = 0;
    let lastClientX = 0, lastClientY = 0; // 마지막으로 알려진 실제 커서 좌표(rAF 루프가 참조)
    let pointerId = null;
    let groupSlots = [slot];
    let cloneEls = new Map(); // TREE_EDGES 인덱스 -> 내부 엣지의 "움직이는 분신" <line>
    let stageRect = null;
    let basePx = null; // Map<slot, {x,y}> — 그 슬롯의 쉴 때(정지) 픽셀 위치(스테이지 기준)
    let smoothedDepth = null; // 세로 위치가 가리키는 "깊이"를 부드럽게 뒤쫓는 값(반동 효과)
    let rafId = null;

    // [§6.22] 얼마나 빨리 목표 깊이를 따라잡을지 — 낮을수록 더 부드럽고(반동이 오래감),
    // 1에 가까울수록 즉각 반응. CSS 트랜지션이 아니라 매 프레임 직접 보간하는 방식이라
    // "레벨 경계에서 값이 툭 튀며 트랜지션이 재시작되는" 종류의 출렁임이 애초에 생길 수 없다.
    const DEPTH_EASE = 0.25;

    const applyFrame = () => {
      const dx = lastClientX - startX, dy = lastClientY - startY;

      // [§6.23] "위치 단에 따라 계단 느낌으로" — 목표 깊이를 정수 레벨(단)로 딱딱 끊어서
      // 계단처럼 나오게 하되(§6.9의 반올림 스냅과 동일), §6.20/6.21에서 출렁거림의 진짜
      // 원인이었던 "CSS 트랜지션이 경계 근처 떨림마다 매번 재시작되는" 문제는 CSS 트랜지션을
      // 아예 안 쓰고 §6.22의 rAF+지수감쇠로 목표(계단 값)를 향해 부드럽게 다가가는 방식이라
      // 재발하지 않는다 — 값 자체는 계단식(정수)이지만 그 계단 "사이"를 오가는 움직임은
      // 매끄러운 하나의 보간이라 경계에서 떨어도 "천천히 다음 칸으로 정착"할 뿐 재시작되며
      // 튀지 않는다. 이 값은 오직 가로 폭(scale) 계산에만 쓰이고 세로(dy)는 항상 커서를
      // 그대로 따라가는 원시값이라, 계단/반동은 좌우 움직임에만 영향을 준다.
      const cursorYPct = ((lastClientY - stageRect.top) / stageRect.height) * 100;
      const rowSpan = (100 - 2 * PAD_Y) / MAX_LEVEL;
      const rawDepth = clamp((cursorYPct - PAD_Y) / rowSpan, 0, MAX_LEVEL);
      const targetDepth = Math.round(rawDepth);
      smoothedDepth = smoothedDepth === null ? targetDepth : smoothedDepth + (targetDepth - smoothedDepth) * DEPTH_EASE;
      const scale = 2 ** (level(slot) - smoothedDepth);

      const draggedBase = basePx.get(slot);
      const deltaOf = new Map([[slot, { dx, dy }]]);
      for (const s of groupSlots) {
        if (s === slot) continue;
        const base = basePx.get(s);
        const targetX = draggedBase.x + dx + scale * (base.x - draggedBase.x);
        const targetY = base.y + dy; // 세로는 스케일 없이 항상 그대로 같이 이동만
        deltaOf.set(s, { dx: targetX - base.x, dy: targetY - base.y });
      }

      for (const s of groupSlots) {
        const d = deltaOf.get(s);
        this.tileEls[s].style.transform = `translate(calc(-50% + ${d.dx}px), calc(-50% + ${d.dy}px))`;
      }
      for (const [k, clone] of cloneEls) {
        const { parent, child } = TREE_EDGES[k];
        const dp = deltaOf.get(parent), dc = deltaOf.get(child);
        clone.setAttribute('x1', LAYOUT[parent].leftPct + (dp.dx / stageRect.width) * 100);
        clone.setAttribute('y1', LAYOUT[parent].topPct + (dp.dy / stageRect.height) * 100);
        clone.setAttribute('x2', LAYOUT[child].leftPct + (dc.dx / stageRect.width) * 100);
        clone.setAttribute('y2', LAYOUT[child].topPct + (dc.dy / stageRect.height) * 100);
      }
    };

    const tick = () => {
      rafId = null;
      if (!dragging) return;
      applyFrame();
      // 커서가 잠깐 멈춰 있어도 smoothedDepth가 목표에 수렴할 때까지는 계속 프레임을 갱신해야
      // "반동" 효과가 끝까지 재생된다 — pointermove가 안 와도 매 프레임 계속 스스로 예약함.
      rafId = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      if (e.pointerId !== pointerId) return;
      lastClientX = e.clientX; lastClientY = e.clientY;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > 4) {
        dragging = true;
        // 드래그가 실제로 시작되는 순간 그룹을 확정. "선택된 원들끼리"를 잇는 연결선
        // (양쪽 끝 다 그룹 안 = internalEdgeIdx)은 원본은 원래 자리에 그대로 두고
        // (§6.20: "원래 있던 자리에도 있고, 움직이는 것도 있고 두 개 있어야 함"), 그
        // 자리에서 복제한 분신만 그룹과 함께 움직인다 — 원본이 계속 고스트끼리 이어주니
        // "고스트 뒤에 선이 아예 없다"는 문제도 같이 해결됨. 그룹 밖 타일과 이어지는
        // "경계 엣지"는 여전히 손대지 않는다(§6.18) — 그쪽은 애초부터 문제였던 적이 없다.
        groupSlots = this._groupOf(slot);
        const groupSet = new Set(groupSlots);
        const internalEdgeIdx = TREE_EDGES
          .map((edge, k) => k)
          .filter((k) => groupSet.has(TREE_EDGES[k].parent) && groupSet.has(TREE_EDGES[k].child));

        cloneEls = new Map(internalEdgeIdx.map((k) => {
          const clone = this.lineEls[k].cloneNode(false); // 지금 색(마킹/확정/브로큰)까지 그대로 복제
          this.svg.appendChild(clone);
          return [k, clone];
        }));

        stageRect = this.root.getBoundingClientRect();
        basePx = new Map(groupSlots.map((s) => [s, {
          x: (LAYOUT[s].leftPct / 100) * stageRect.width,
          y: (LAYOUT[s].topPct / 100) * stageRect.height,
        }]));
        smoothedDepth = null; // 다음 applyFrame에서 현재 깊이로 즉시 초기화(시작할 때 훅 튀지 않게)

        for (const s of groupSlots) {
          this.tileEls[s].classList.add('dragging');
          this.tileEls[s].style.zIndex = '10';
          this.ghostEls[s].classList.add('show');
        }
        rafId = requestAnimationFrame(tick);
      }
    };

    const onUp = (e) => {
      if (e.pointerId !== pointerId) return;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      try { el.releasePointerCapture(pointerId); } catch { /* 무시 */ }
      pointerId = null;

      if (dragging) {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        for (const s of groupSlots) {
          this.tileEls[s].classList.remove('dragging');
          this.tileEls[s].style.transform = '';
          this.tileEls[s].style.zIndex = '';
          this.ghostEls[s].classList.remove('show');
        }
        // 분신을 지우기만 하면 끝 — 원본은 애초에 한 번도 안 건드렸으니 되돌릴 것도 없다.
        for (const clone of cloneEls.values()) clone.remove();
        cloneEls = new Map();
        const target = this._hitTest(e.clientX, e.clientY, slot);
        if (target !== null) {
          // 방금 실제로 드래그했던 그룹(들고 있던 슬롯들)은 드래그하는 내내 이미 부드럽게
          // 움직이는 걸 보여줬으니, 다음 render()에서 또 "슝" 날아오게 하면 중복이다 —
          // 그 자리들은 곧바로 고정(순간 배치)하고, 그 대신 밀려난 쪽만 날아오게 한다.
          this._justDraggedFromSlots = new Set(groupSlots);
          this.handlers.onDrop?.(slot, target);
        }
      }
      dragging = false;
      groupSlots = [slot];
    };

    el.addEventListener('pointerdown', (e) => {
      // disabled(게임 종료 후 등)여도 브라우저가 pointerdown 자체는 그냥 통과시켜서,
      // 최종 이동은 tryMove가 막아주더라도 드래그하는 "동작"(따라다니는 애니메이션)은
      // 그대로 재생되는 문제가 있었다 — 여기서 아예 시작조차 안 되게 막는다.
      if (el.disabled) return;
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      lastClientX = e.clientX; lastClientY = e.clientY;
      el.setPointerCapture(pointerId);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  /** (clientX,clientY) 아래에 있는 다른 타일의 slot 번호 (없으면 null) */
  _hitTest(clientX, clientY, excludeSlot) {
    for (let i = 0; i < TOTAL_NODES; i++) {
      if (i === excludeSlot) continue;
      const r = this.tileEls[i].getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return i;
    }
    return null;
  }

  /** 타일 하나에 "팝" 교체 효과를 (재생 중이었으면 처음부터 다시) 튼다 — fromSlot을 못 찾았을 때의 대체용. */
  _playSwapEffect(el) {
    // 클래스를 지웠다가 바로 다시 붙이면 브라우저가 "변화 없음"으로 보고 애니메이션을 다시
    // 재생하지 않을 수 있어서, 중간에 강제로 리플로우를 한 번 일으켜 재시작을 보장한다.
    el.classList.remove('pyramid-tile--swap');
    void el.offsetWidth;
    el.classList.add('pyramid-tile--swap');
    el.addEventListener('animationend', () => el.classList.remove('pyramid-tile--swap'), { once: true });
  }

  /**
   * slot(toSlot)의 글자가 fromSlot에 있던 값으로 바뀌었을 때, "그 글자가 fromSlot 자리에서
   * toSlot 자리로 슝 하고 날아온" 것처럼 보이게 한다 — 실제로 두 자리(DOM 엘리먼트)는 고정돼
   * 있으니, toSlot 엘리먼트를 순간적으로 fromSlot의 화면 위치에 겹쳐 놓았다가(transition 끔)
   * 바로 원래 위치로 트랜지션을 걸어 되돌린다. 드래그 중인 그룹이 커서를 따라 움직이는 것과
   * 같은 translate 방식이라, 자유 스왑이든(§1.4) 여러 칸짜리 그룹 이동이든 — 바뀐 자리 전부에
   * 똑같이 적용되므로 단체 이동도 자연히 같은 효과를 받는다.
   */
  _playFlyEffect(el, fromSlot, toSlot) {
    const stageRect = this.root.getBoundingClientRect();
    const dx = ((LAYOUT[fromSlot].leftPct - LAYOUT[toSlot].leftPct) / 100) * stageRect.width;
    const dy = ((LAYOUT[fromSlot].topPct - LAYOUT[toSlot].topPct) / 100) * stageRect.height;
    el.style.transition = 'none';
    el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    el.style.zIndex = '5';
    void el.offsetWidth; // 강제 리플로우 — 위 위치를 실제로 한 프레임 반영시킨 뒤에 트랜지션을 건다
    el.style.transition = 'transform 0.22s cubic-bezier(.25, .46, .45, .94)';
    el.style.transform = 'translate(-50%, -50%)';
    el.addEventListener('transitionend', () => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.zIndex = '';
    }, { once: true });
  }

  /**
   * @param {object} view
   * @param {string[]} view.positions 길이 15
   * @param {Set<number>} view.marked
   * @param {Set<number>} view.locked
   * @param {Set<number>} view.broken
   * @param {Set<number>} [view.dashedNeutral] 정답 보기에서 "끝까지 확정 못 한" 관계 표시용(중립 점선)
   * @param {boolean} [view.interactive=true] false면 타일 드래그/마킹 비활성 (결과 확정 후 등)
   * @param {boolean} [view.animate=true] false면 배치가 바뀌어도 교체 효과 없이 그냥 그림
   *   (새 판을 처음 열 때처럼 "직전 상태"와 비교하는 게 의미 없을 때 호출 쪽에서 끈다)
   */
  render({ positions, marked, locked, broken, dashedNeutral = new Set(), interactive = true, animate = true }) {
    this._view = { marked, locked };
    const prev = this._prevPositions;
    // 방금 드래그로 직접 옮긴 그룹의 "원래 있던 슬롯들" — 그 값들은 드래그하는 동안 이미
    // 부드럽게 움직이는 걸 보여줬으니 이번 render()에서는 순간 배치하고, 그 값이 아닌(=밀려난
    // 쪽) 나머지만 슝 하고 날아오게 한다. 이번 한 번의 render()에만 적용하고 바로 비운다.
    const justDraggedFrom = this._justDraggedFromSlots;
    this._justDraggedFromSlots = null;
    for (let i = 0; i < TOTAL_NODES; i++) {
      const el = this.tileEls[i];
      // 이동(그룹 이동/스왑)이 실제로 끝나 이 자리의 글자가 바뀐 경우에만(§6.17) "슝" 하고
      // 원래 있던 자리에서 날아온 것처럼 보이게 한다 — 마킹 토글이나 추측 제출처럼 배치
      // 자체는 그대로인 갱신에서는 아무 자리도 바뀌지 않으니 자연히 효과가 안 걸린다.
      // fromSlot을 못 찾는(있을 수 없지만 방어적으로) 경우에만 예전의 "팝" 효과로 대체.
      if (animate && prev && prev[i] !== positions[i]) {
        const fromSlot = prev.indexOf(positions[i]);
        if (fromSlot !== -1 && justDraggedFrom && justDraggedFrom.has(fromSlot)) {
          // 방금 내가 직접 끌고 온 값 — 이미 드래그로 여기까지 왔으니 추가 연출 없이 고정.
        } else if (fromSlot !== -1 && fromSlot !== i) {
          this._playFlyEffect(el, fromSlot, i);
        } else {
          this._playSwapEffect(el);
        }
      }
      el.textContent = positions[i];
      el.disabled = !interactive;
    }
    this._prevPositions = [...positions];
    TREE_EDGES.forEach((_, k) => {
      const line = this.lineEls[k];
      line.classList.toggle('is-locked', locked.has(k));
      line.classList.toggle('is-marked', !locked.has(k) && marked.has(k));
      line.classList.toggle('is-broken', !locked.has(k) && broken.has(k));
      line.classList.toggle('is-answer-dashed', !locked.has(k) && dashedNeutral.has(k));
      // §6.20 — 끊어짐(빨강)으로 확인된 조합은 클릭해도 마킹으로 연결할 수 없으므로(게임
      // 로직도 이미 막아두지만) 클릭 자체를 못 받게 해서 "눌러도 안 되는구나"가 바로
      // 느껴지게 한다.
      const clickable = interactive && !locked.has(k) && !broken.has(k);
      this.hitEls[k].style.pointerEvents = clickable ? 'stroke' : 'none';
    });
    // 잠긴 링크의 두 타일에 확정 표시(더 이상 못 옮기는 건 아니지만 시각적으로 안심시켜줌)
    const lockedSlots = new Set();
    TREE_EDGES.forEach(({ parent, child }, k) => {
      if (locked.has(k)) { lockedSlots.add(parent); lockedSlots.add(child); }
    });
    for (let i = 0; i < TOTAL_NODES; i++) this.tileEls[i].classList.toggle('is-locked', lockedSlots.has(i));
  }
}

export { LAYOUT as PYRAMID_LAYOUT };
