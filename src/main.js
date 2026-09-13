import { dateStrKST, shiftDateStr, msUntilNextReset, formatCountdown } from './daily/dateUtil.js';
import {
  loadProgress, saveProgress, recordResult, summarize, DIST_BUCKETS, MAX_GUESSES,
} from './daily/storage.js';
import { buildShareText, buildFreePlayShareText, buildCalendarShareText, buildGuessEmojiSequence } from './daily/share.js';
import {
  createGameState, reviveGameState, serializeGameState,
  tryMove, toggleMark, submitGuess, brokenEdges, guessesLeft,
} from './game/pyramidGame.js';
import { PyramidRenderer } from './ui/PyramidRenderer.js';
import { TREE_EDGES } from './generator/treeGenerator.js';

const SITE_URL = 'https://nuclyee72.github.io/DailyTrilateral/';
const DAILY_FIRST_DATE = '2026-09-01'; // 아카이브에서 고를 수 있는 가장 이른 날짜
const TODAY = () => dateStrKST();

// ── DOM ──
const $ = (id) => document.getElementById(id);
const landingScreen   = $('landing-screen');
const gameScreen      = $('game-screen');
const landingMain     = $('landing-main');
const landingArchive  = $('landing-archive');
const landingDate     = $('landing-date');
const dailyCardStatus = $('daily-card-status');
const dailyLoadNote   = $('daily-load-note');
const dailyErrorEl    = $('daily-error');

const btnDailyPlay   = $('btn-daily-play');
const btnFreePlay    = $('btn-free-play');
const btnArchive     = $('btn-archive');
const btnLandingStats = $('btn-landing-stats');
const btnLandingDark  = $('btn-landing-dark');
const btnGoLanding    = $('btn-go-landing');
const btnGameStats    = $('btn-game-stats');
const btnGameHelp     = $('btn-game-help');
const btnSubmitGuess  = $('btn-submit-guess');
const btnContinueStreak = $('btn-continue-streak');
const streakBadge = $('pyra-streak-badge');
const btnViewAnswer = $('btn-view-answer');

const gameHelpModal = $('game-help-modal');
const gameHelpClose = $('game-help-close');

const pyramidRoot  = $('pyramid-root');
const guessesEl    = $('pyra-guesses');

const archiveBack     = $('archive-back');
const archiveCalEl    = $('archive-cal');
const archiveCalTitle = $('archive-cal-title');
const archiveCalPrev  = $('archive-cal-prev');
const archiveCalNext  = $('archive-cal-next');
const archiveErrorEl  = $('archive-error');
const btnArchivePlay  = $('btn-archive-play');

const dailyResultModal  = $('daily-result-modal');
const dailyResultTitle  = $('daily-result-title');
const dailyResultDetail = $('daily-result-detail');
const dailyResultGrid   = $('daily-result-grid');
const btnDailyResultShare = $('btn-daily-result-share');
const btnDailyResultStats = $('btn-daily-result-stats');
const btnDailyResultClose = $('btn-daily-result-close');
const dailyShareNote      = $('daily-share-note');

const dailyStatsModal  = $('daily-stats-modal');
const dailyStatsClose  = $('daily-stats-close');
const statPlayed    = $('stat-played');
const statWinRate   = $('stat-winrate');
const statStreak    = $('stat-streak');
const statMaxStreak = $('stat-maxstreak');
const dailyStatsDist = $('daily-stats-dist');
const dailyStatsCal  = $('daily-stats-cal');
const dailyCalTitle  = $('daily-cal-title');
const dailyCalPrev   = $('daily-cal-prev');
const dailyCalNext   = $('daily-cal-next');
const btnCalShare    = $('btn-cal-share');
const calShareNote   = $('cal-share-note');
const dailyNextCountdown = $('daily-next-countdown');
const btnDailyStatsShare = $('btn-daily-stats-share');
const dailyStatsShareNote = $('daily-stats-share-note');

function openPanel(el) { el.classList.add('show'); }
function closePanel(el) { el.classList.remove('show'); }

// ── 화면 전환 ──
function showLanding() {
  gameScreen.classList.add('hidden');
  landingScreen.classList.remove('hidden');
  landingMain.hidden = false;
  landingArchive.hidden = true;
  refreshLandingCard();
}
function showGame() {
  landingScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
}

// ── 데일리 퍼즐 로딩(캐시) ──
const puzzleCache = new Map();
async function loadDailyPuzzle(date) {
  if (puzzleCache.has(date)) return puzzleCache.get(date);
  const res = await fetch(`daily/${date}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${date} 퍼즐을 찾을 수 없음`);
  const data = await res.json();
  puzzleCache.set(date, data);
  return data;
}

// ── 게임 세션 ──
let renderer = null;
let session = null; // { date, archive, freePlay, state }
let resultShown = false;
let freePlayStreak = 0; // 자유 연습 연속 성공 횟수(세션 한정, 저장 안 함) — "메인 화면"에서
                         // 새로 자유 연습을 시작하면 0으로 리셋, 연속 도전으로 이어가면 유지.
let viewingAnswer = false; // 게임 종료 후 "정답 보기"로 정답 배치를 보고 있는 중인지

function ensureRenderer() {
  if (renderer) return renderer;
  renderer = new PyramidRenderer(pyramidRoot, {
    onDrop: (from, to) => {
      if (!session) return;
      if (tryMove(session.state, from, to)) afterStateChange();
    },
    onToggleMark: (edgeIdx) => {
      if (!session) return;
      if (toggleMark(session.state, edgeIdx)) afterStateChange();
    },
  });
  return renderer;
}

function persist() {
  if (session && !session.archive) saveProgress(serializeGameState(session.state));
}

function renderGuessPips() {
  guessesEl.innerHTML = '';
  const { state } = session;
  for (let i = 0; i < MAX_GUESSES; i++) {
    const pip = document.createElement('span');
    pip.className = 'pyra-guess-pip';
    const g = state.guesses[i];
    if (g) pip.classList.add(g.correct.every(Boolean) ? 'used-ok' : 'used-fail');
    guessesEl.appendChild(pip);
  }
}

function renderGame({ animate = true } = {}) {
  const { state } = session;
  const gameOver = state.status !== 'playing';

  if (gameOver && viewingAnswer) {
    // 정답 보기 — 정답 배치(state.solution)로 그리되, 4번째 추측까지 실제로 확정(locked)된
    // "관계"만 실선, 끝까지 못 맞힌 관계는 중립 점선으로 구분한다. 오답(빨강) 표시는 의미 없음.
    //
    // state.locked는 "슬롯(자리)" 인덱스인데, 그 슬롯이 가리키는 자리는 플레이어의 최종
    // 배치(state.positions) 기준이지 정답의 표준 배치(state.solution) 기준이 아니다 — 형제
    // 순서가 자유라서(§1.17) 플레이어가 확정한 그 관계가 정답 배치에서는 좌우가 뒤집힌 다른
    // 슬롯 쌍에 있을 수 있다. 그래서 자리가 아니라 "그 조합(값)" 자체로 옮겨 다니며 맞춰야
    // 확정한 묶음이 그대로(같은 관계로) 정답 트리 위에 표시된다 — brokenEdges와 같은 원리.
    const confirmedPairs = new Set();
    state.locked.forEach((k) => {
      const { parent, child } = TREE_EDGES[k];
      confirmedPairs.add(`${state.positions[parent]}|${state.positions[child]}`);
    });
    const solidEdges = new Set();
    const dashedNeutral = new Set();
    TREE_EDGES.forEach(({ parent, child }, k) => {
      const pairKey = `${state.solution[parent]}|${state.solution[child]}`;
      if (confirmedPairs.has(pairKey)) solidEdges.add(k);
      else dashedNeutral.add(k);
    });
    ensureRenderer().render({
      positions: state.solution,
      marked: new Set(),
      locked: solidEdges,
      broken: new Set(),
      dashedNeutral,
      interactive: false,
      animate,
    });
  } else {
    ensureRenderer().render({
      positions: state.positions,
      marked: state.marked,
      locked: state.locked,
      broken: brokenEdges(state),
      interactive: state.status === 'playing',
      animate,
    });
  }
  renderGuessPips();

  // 자유 연습에서 성공하면 "추측 제출" 자리를 "연속 도전"으로 바꿔서 바로 다음 판으로
  // 이어갈 수 있게 한다. 그 외(데일리/아카이브, 또는 자유 연습 실패)에 게임이 끝나면
  // "추측 제출"은 더는 아무 쓸모가 없으니(늘 비활성) 자리만 차지하지 않게 아예 숨긴다 —
  // "정답 보기"가 새로 그 옆(상단 바)에 추가돼서 4개가 한 줄에 다 들어가기 빠듯하기도 하다.
  const offerContinue = session.freePlay && state.status === 'solved';
  btnSubmitGuess.hidden = offerContinue || gameOver;
  btnContinueStreak.hidden = !offerContinue;
  btnSubmitGuess.disabled = state.status !== 'playing';

  // 연속 도전 횟수는 버튼 라벨이 아니라, 상단 바 아래 오른쪽에 계속 떠 있는 배지로 보여준다 —
  // 지금 몇 연속째를 플레이 중인지(승리 화면뿐 아니라 그 다음 판을 푸는 동안에도) 알 수 있게.
  // 1승째는 아직 "연속"이라 부르기 애매하니 2연속부터만 띄운다(showResultModal의 같은 기준과 통일).
  const showStreakBadge = session.freePlay && freePlayStreak >= 2;
  streakBadge.hidden = !showStreakBadge;
  if (showStreakBadge) streakBadge.textContent = `${freePlayStreak}연속 도전중`;

  // 게임이 끝난 뒤에만 정답 보기를 제공 — 진행 중엔 안 보임. "연속 도전" 중엔 같이 안 띄운다
  // (버튼 4개가 좁은 화면에서 한 줄에 다 안 들어가기도 하고, 승리 화면은 이미 보드 전체가
  // 초록이라 정답 보기가 새로 보여줄 게 없다).
  btnViewAnswer.hidden = !gameOver || offerContinue;
  btnViewAnswer.textContent = viewingAnswer ? '내 결과 보기' : '정답 보기';
}

function afterStateChange() {
  persist();
  renderGame();
}

function openGame(newSession) {
  session = newSession;
  resultShown = false;
  viewingAnswer = false;
  showGame();
  // 새 판을 여는 첫 렌더는 "직전 상태"가 없는 최초 그리기라 §6.17의 교체 효과를 걸 대상이
  // 아님 — 이걸 안 끄면 새 판이 열릴 때마다 15칸이 전부 팝하며 그려지는 이상한 연출이 됨.
  renderGame({ animate: false });
}

// ── 정답 보기 ──
btnViewAnswer.addEventListener('click', () => {
  if (!session) return;
  viewingAnswer = !viewingAnswer;
  // 뷰만 바꾸는 것이지 타일이 실제로 움직인 게 아니므로 슝 하는 이동 효과는 걸지 않는다.
  renderGame({ animate: false });
});

// ── 추측 제출 ──
function handleSubmitGuess() {
  if (!session) return;
  const result = submitGuess(session.state);
  if (!result) return;
  if (session.freePlay) {
    freePlayStreak = result.solved ? freePlayStreak + 1 : 0;
  }
  afterStateChange();
  if (session.state.status !== 'playing' && !resultShown) {
    resultShown = true;
    if (!session.archive) {
      const attempt = result.solved ? session.state.guesses.length : null;
      recordResult(session.date, session.state.status, attempt);
    }
    showResultModal();
  }
}
btnSubmitGuess.addEventListener('click', handleSubmitGuess);

// 개발용 치트 — 콘솔에서 __solve() 호출하면 현재 판을 정답으로 채우고 그대로 제출까지 해버림
// (연속 도전 스트릭처럼 여러 판을 빠르게 이어가며 테스트할 때 직접 드래그하지 않아도 되게).
// 프로덕션에 남아있어도 콘솔에서 직접 호출해야만 동작하고, 어차피 로컬 저장 기록만 건드리는
// 개인 퍼즐이라 다른 사람에게 영향 없음.
window.__solve = () => {
  if (!session) return;
  session.state.positions = [...session.state.solution];
  handleSubmitGuess();
};

function showResultModal() {
  const { state, date, archive, freePlay } = session;
  const freePlayWin = freePlay && state.status === 'solved';
  // 1승째는 아직 "연속"이라 부르기 애매하니 배지와 같은 기준(2연속부터)으로 문구를 바꾼다.
  const showStreak = freePlayWin && freePlayStreak >= 2;
  dailyResultTitle.textContent = showStreak
    ? `🔥 ${freePlayStreak}연속 도전 성공!`
    : state.status === 'solved' ? '🎉 성공!' : '아쉬워요';
  dailyResultDetail.textContent = freePlayWin
    ? '연속 도전 기록은 저장되지 않아요 — 메인 화면으로 나가면 초기화돼요.'
    : archive
      ? `${date} · 연습 플레이 (기록에는 반영되지 않아요)`
      : `${date} · ${state.guesses.length}번째에 ${state.status === 'solved' ? '성공' : '실패'}`;
  dailyResultGrid.textContent = buildGuessEmojiSequence(state.guesses);
  dailyShareNote.textContent = '';
  openPanel(dailyResultModal);
}
btnDailyResultClose.addEventListener('click', () => closePanel(dailyResultModal));
dailyResultModal.addEventListener('click', (e) => { if (e.target === dailyResultModal) closePanel(dailyResultModal); });
btnDailyResultStats.addEventListener('click', () => { closePanel(dailyResultModal); openStatsModal(); });
btnDailyResultShare.addEventListener('click', async () => {
  const { state, freePlay } = session;
  // 결과창 문구와 같은 기준(2연속부터) — 1승째 공유 문구에 "1연속 도전 성공!"이라고 쓰면 어색하다.
  const text = freePlay && state.status === 'solved' && freePlayStreak >= 2
    ? buildFreePlayShareText({ streak: freePlayStreak, guesses: state.guesses, url: SITE_URL })
    : buildShareText({ date: session.date, guesses: state.guesses, url: SITE_URL });
  const ok = await copyText(text);
  dailyShareNote.textContent = ok ? '클립보드에 복사했어요!' : '복사에 실패했어요.';
});

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ── 오늘의 퍼즐 시작 ──
async function startDaily() {
  const date = TODAY();
  dailyLoadNote.hidden = false;
  dailyErrorEl.textContent = '';
  try {
    const puzzle = await loadDailyPuzzle(date);
    const saved = loadProgress(date);
    const state = (saved && saved.solution?.join(',') === puzzle.tiles.join(','))
      ? reviveGameState(saved)
      : createGameState(date, puzzle.tiles);
    if (!saved) saveProgress(serializeGameState(state));
    openGame({ date, archive: false, state });
  } catch (err) {
    dailyErrorEl.textContent = '오늘의 퍼즐을 불러오지 못했어요. 잠시 후 다시 시도해주세요.';
    console.error(err);
  } finally {
    dailyLoadNote.hidden = true;
  }
}
btnDailyPlay.addEventListener('click', startDaily);

function refreshLandingCard() {
  landingDate.textContent = TODAY();
  const s = summarize(TODAY());
  const today = s.results[TODAY()];
  if (today?.status === 'solved') { dailyCardStatus.textContent = '성공'; dailyCardStatus.dataset.status = 'solved'; }
  else if (today?.status === 'failed') { dailyCardStatus.textContent = '실패'; dailyCardStatus.dataset.status = 'timeout'; }
  else {
    const p = loadProgress(TODAY());
    if (p && p.status === 'playing') { dailyCardStatus.textContent = '진행 중'; dailyCardStatus.dataset.status = 'playing'; }
    else { dailyCardStatus.textContent = '플레이 전'; dailyCardStatus.dataset.status = 'new'; }
  }
}

// ── 자유 연습 ── (§1.16 — v1: 서버 생성기 없이 클라이언트에서 즉석 생성)
async function startFreePlay() {
  const { generateTree } = await import('./generator/treeGenerator.js');
  const result = generateTree(); // 시드 없음 = 매번 다른 트리
  const state = createGameState('free', result.tiles);
  openGame({ date: '자유 연습', archive: true, freePlay: true, state });
}
btnFreePlay.addEventListener('click', () => {
  freePlayStreak = 0; // 메인 화면에서 새로 시작하는 거라 연속 기록 리셋
  startFreePlay();
});
btnContinueStreak.addEventListener('click', startFreePlay); // 스트릭은 유지한 채 바로 다음 판으로

// ── 뒤로가기 ──
btnGoLanding.addEventListener('click', showLanding);

// ── 지난 퍼즐(아카이브) ──
function makeCalendar({ gridEl, titleEl, prevEl, nextEl, pick = false, onPick = null }) {
  const CAL_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  let monthOffset = 0;
  let sum = { results: {} };
  let selected = null;
  let minDate = null, maxDate = null;

  function monthYM() {
    const [ty, tm] = TODAY().split('-').map(Number);
    const b = new Date(Date.UTC(ty, tm - 1 + monthOffset, 1));
    return { y: b.getUTCFullYear(), m: b.getUTCMonth() + 1 };
  }

  function render() {
    const today = TODAY();
    const { y, m } = monthYM();
    const mm = String(m).padStart(2, '0');
    titleEl.textContent = `${y}년 ${m}월`;
    if (nextEl) nextEl.disabled = monthOffset >= 0;
    if (prevEl) prevEl.disabled = !!minDate && `${y}-${mm}` <= minDate.slice(0, 7);

    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    gridEl.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'cal-grid cal-head';
    for (const w of CAL_WEEKDAYS) {
      const c = document.createElement('span');
      c.className = 'cal-dow';
      c.textContent = w;
      head.appendChild(c);
    }
    gridEl.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'cal-grid';
    for (let i = 0; i < firstDow; i++) {
      const b = document.createElement('span');
      b.className = 'cal-cell cal-cell--blank';
      grid.appendChild(b);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${mm}-${String(d).padStart(2, '0')}`;
      const r = sum.results[dateStr];
      const cell = document.createElement('span');
      cell.className = 'cal-cell';
      if (dateStr === today) cell.classList.add('cal-cell--today');
      if (pick && dateStr === selected) cell.classList.add('cal-cell--picked');

      const dayNum = document.createElement('span');
      dayNum.className = 'cal-day';
      dayNum.textContent = d;
      cell.appendChild(dayNum);

      if (r) {
        cell.classList.add('cal-cell--filled', r.status === 'solved' ? 'cal-cell--solved' : 'cal-cell--fail');
      } else if (dateStr > today) {
        cell.classList.add('cal-cell--future');
      } else {
        cell.classList.add('cal-cell--miss');
      }

      if (pick && minDate && maxDate && dateStr >= minDate && dateStr <= maxDate) {
        cell.classList.add('cal-cell--pickable');
        cell.addEventListener('click', () => { selected = dateStr; render(); onPick?.(dateStr); });
      }
      grid.appendChild(cell);
    }
    gridEl.appendChild(grid);
  }

  prevEl?.addEventListener('click', () => { monthOffset -= 1; render(); });
  nextEl?.addEventListener('click', () => { if (monthOffset < 0) { monthOffset += 1; render(); } });

  return {
    render, monthYM,
    get selected() { return selected; },
    open(summary, { selected: sel = null, minDate: mn = null, maxDate: mx = null, resetMonth = true } = {}) {
      sum = summary; selected = sel; minDate = mn; maxDate = mx;
      if (resetMonth) monthOffset = 0;
      render();
    },
  };
}

let archiveSelected = null;
const archiveCal = makeCalendar({
  gridEl: archiveCalEl, titleEl: archiveCalTitle, prevEl: archiveCalPrev, nextEl: archiveCalNext,
  pick: true,
  onPick: (d) => { archiveSelected = d; btnArchivePlay.disabled = false; archiveErrorEl.textContent = ''; },
});

btnArchive.addEventListener('click', () => {
  landingMain.hidden = true;
  landingArchive.hidden = false;
  archiveSelected = null;
  btnArchivePlay.disabled = true;
  archiveCal.open(summarize(TODAY()), { minDate: DAILY_FIRST_DATE, maxDate: shiftDateStr(TODAY(), -1) });
});
archiveBack.addEventListener('click', () => { landingArchive.hidden = true; landingMain.hidden = false; });

btnArchivePlay.addEventListener('click', async () => {
  if (!archiveSelected) return;
  try {
    const puzzle = await loadDailyPuzzle(archiveSelected);
    const state = createGameState(archiveSelected, puzzle.tiles);
    openGame({ date: archiveSelected, archive: true, state });
  } catch (err) {
    archiveErrorEl.textContent = '그 날짜의 퍼즐을 불러오지 못했어요.';
    console.error(err);
  }
});

// ── 통계 모달 ──
const statsCal = makeCalendar({ gridEl: dailyStatsCal, titleEl: dailyCalTitle, prevEl: dailyCalPrev, nextEl: dailyCalNext });
let statsCountdownTimer = null;

function renderStatsModal(resetMonth) {
  const s = summarize(TODAY());
  statPlayed.textContent = s.played;
  statWinRate.textContent = s.winRate;
  statStreak.textContent = s.curStreak;
  statMaxStreak.textContent = s.maxStreak;
  statsCal.open(s, { minDate: DAILY_FIRST_DATE, resetMonth });

  dailyStatsDist.innerHTML = '';
  const max = Math.max(1, ...s.distribution);
  DIST_BUCKETS.forEach((label, i) => {
    const count = s.distribution[i];
    const row = document.createElement('div');
    row.className = 'pyra-dist-row';
    row.innerHTML = `<span class="pyra-dist-label">${label}</span>
      <span class="pyra-dist-track"><span class="pyra-dist-fill" style="width:${(count / max) * 100}%"></span></span>
      <span class="pyra-dist-count">${count}</span>`;
    dailyStatsDist.appendChild(row);
  });
}

function openStatsModal() {
  renderStatsModal(true);
  openPanel(dailyStatsModal);
  clearInterval(statsCountdownTimer);
  const tick = () => { dailyNextCountdown.textContent = formatCountdown(msUntilNextReset()); };
  tick();
  statsCountdownTimer = setInterval(tick, 1000);
}
function closeStatsModal() { closePanel(dailyStatsModal); clearInterval(statsCountdownTimer); }
dailyStatsClose.addEventListener('click', closeStatsModal);
dailyStatsModal.addEventListener('click', (e) => { if (e.target === dailyStatsModal) closeStatsModal(); });
btnLandingStats.addEventListener('click', openStatsModal);
btnGameStats.addEventListener('click', openStatsModal);

function openHelpModal() { openPanel(gameHelpModal); }
function closeHelpModal() { closePanel(gameHelpModal); }
gameHelpClose.addEventListener('click', closeHelpModal);
gameHelpModal.addEventListener('click', (e) => { if (e.target === gameHelpModal) closeHelpModal(); });
btnGameHelp.addEventListener('click', openHelpModal);

btnCalShare.addEventListener('click', async () => {
  const { y, m } = statsCal.monthYM();
  const s = summarize(TODAY());
  const text = buildCalendarShareText({ results: s.results, year: y, month: m, url: SITE_URL });
  const ok = await copyText(text);
  calShareNote.textContent = ok ? '복사했어요!' : '복사 실패';
});
btnDailyStatsShare.addEventListener('click', async () => {
  const p = loadProgress(TODAY());
  if (!p || p.status === 'playing') { dailyStatsShareNote.textContent = '오늘 퍼즐을 먼저 풀어주세요.'; return; }
  const text = buildShareText({ date: TODAY(), guesses: p.guesses, url: SITE_URL });
  const ok = await copyText(text);
  dailyStatsShareNote.textContent = ok ? '복사했어요!' : '복사 실패';
});

// ── 다크 모드 ──
const DARK_MODE_KEY = 'trilateral-dark-mode';
function applyDarkMode(on) {
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
  try { localStorage.setItem(DARK_MODE_KEY, on ? '1' : '0'); } catch { /* 무시 */ }
}
function toggleDarkMode() {
  applyDarkMode(document.documentElement.getAttribute('data-theme') !== 'dark');
}
btnLandingDark.addEventListener('click', toggleDarkMode);

// ── 시작 ──
showLanding();
