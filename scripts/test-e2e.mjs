/**
 * test-e2e.mjs — 실제 브라우저(Playwright)로 랜딩→플레이→드래그→마킹→제출까지 한 바퀴 확인.
 * `npm install -D playwright && npx playwright install chromium` 한 번 해두면 됨.
 *
 *   node scripts/test-e2e.mjs
 */
import { chromium } from 'playwright';
import { startServer } from './dev-server.mjs';

function assert(name, cond) {
  console.log(cond ? `✅ ${name}` : `❌ ${name}`);
  if (!cond) process.exitCode = 1;
}

const server = await startServer(0); // 0 = 빈 포트 자동 할당
const port = server.address().port;
const base = `http://localhost:${port}`;
const consoleErrors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto(`${base}/index.html`);
  // 랜딩 타이틀이 "Pyralinks_kr"(placeholder)에서 실제 한글 타이틀 "데일리 삼각관계"로
  // 바뀌어서 예전 텍스트 셀렉터가 더는 안 맞았음 — 화면 요소(.landing-title) 기준으로 확인.
  await page.waitForSelector('.landing-title');
  assert('랜딩 화면 표시', true);

  await page.click('#btn-daily-play');
  await page.waitForSelector('.pyramid-tile', { timeout: 10000 });
  const tileCount = await page.locator('.pyramid-tile').count();
  const linkCount = await page.locator('.pyramid-link').count();
  assert(`타일 15개 그려짐 (실제 ${tileCount})`, tileCount === 15);
  assert(`링크 14개 그려짐 (실제 ${linkCount})`, linkCount === 14);

  const tiles = page.locator('.pyramid-tile');
  const before = await tiles.allTextContents();
  const b0 = await tiles.nth(7).boundingBox();
  const b1 = await tiles.nth(8).boundingBox();
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await tiles.allTextContents();
  assert('드래그로 두 타일 스왑됨', before[7] === after[8] && before[8] === after[7]);

  await page.locator('.pyramid-link-hit').first().click({ force: true });
  await page.waitForTimeout(100);
  const markedClass = await page.locator('.pyramid-link').first().getAttribute('class');
  assert('링크 클릭 → 마킹(주황) 표시', markedClass.includes('is-marked'));

  await page.click('#btn-submit-guess');
  await page.waitForTimeout(200);
  const pip0 = await page.locator('.pyra-guess-pip').first().getAttribute('class');
  assert('추측 제출 후 첫 게스 핍이 채워짐', /used-(ok|fail)/.test(pip0));

  assert(`콘솔 에러 없음 (${consoleErrors.length}개)`, consoleErrors.length === 0);
  if (consoleErrors.length) console.log(consoleErrors.join('\n'));
} finally {
  await browser.close();
  server.close();
}
