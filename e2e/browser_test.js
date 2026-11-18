// End-to-end browser test: a real Chromium drives the built frontend against a running API, the
// way a user would (bidding, live updates, chat, password change, AI draft, admin pages).
//
// Needs a THROWAWAY database: it uses the seed accounts from backend/scripts/reset_and_seed.js
// and changes two of their passwords. How to run it: see "Browser test" in the README.
//
//   E2E_WEB_URL      the frontend, built with VITE_API_URL pointing at the API (default http://localhost:4173)
//   E2E_API_URL      the API (default http://localhost:5000/api)
//   DATABASE_URL, or DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME: the API's database,
//                    read to check what was really stored
//   E2E_OUTPUT_DIR   where screenshots go (default e2e/output)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { Pool } = require('pg');

const WEB = process.env.E2E_WEB_URL || 'http://localhost:4173';
const API = process.env.E2E_API_URL || 'http://localhost:5000/api';
const OUT = process.env.E2E_OUTPUT_DIR || path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const PASS = 'test@123'; // the seed accounts' password
const NEW_PASS = 'E2e-NewPass-2026';
const tag = Date.now().toString(36);
const db = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, max: 2 }
  : {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'auction_db',
    max: 2,
  });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? `\n       ${detail}` : ''}`);
};

async function api(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* empty body */ }
  return { status: res.status, data };
}

const consoleErrors = [];
const failedRequests = [];
async function newPage(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  return page;
}

async function uiLogin(page, email, password) {
  await page.fill('input[placeholder="name@example.com"]', email);
  await page.fill('input[placeholder="••••••••"]', password);
  await page.click('form button[type="submit"]');
}

async function openChat(page) {
  await page.getByRole('button', { name: /Live Room Chat/ }).click();
}

const bidInput = (page) => page.locator('form input[type="number"]').first();
const bidSubmit = (page) => page.locator('form button[type="submit"]').filter({ hasText: /Confirm Bid|Sign In to Bid|Placing/ }).first();
const bidCount = async (auctionId) => (await db.query('SELECT COUNT(*)::int AS n FROM bids WHERE auction_id = $1', [auctionId])).rows[0].n;

(async () => {
  // ── Setup through the API: two fresh lots owned by Test1 ──────────────────
  const seller = await api('POST', '/auth/login', null, { email: 'test1@gmail.com', password: PASS });
  const lotA = (await api('POST', '/auctions', seller.data.token, { title: `E2E lot A ${tag}`, starting_price: 100, duration_minutes: 30 })).data.auction;
  const lotB = (await api('POST', '/auctions', seller.data.token, { title: `E2E lot B ${tag}`, starting_price: 20.3, duration_minutes: 30 })).data.auction;
  check('setup: two lots created by Test1', lotA?.id && lotB?.id, `A=${lotA?.id} B=${lotB?.id} (B starts at $20.30)`);

  const browser = await chromium.launch();

  // ── 1. Guest view of an auction ────────────────────────────────────────────
  const guest = await newPage(browser, 'guest');
  await guest.goto(`${WEB}/auctions/${lotA.id}`);
  await guest.waitForSelector('text=Current Highest Bid');
  await openChat(guest);
  const guestHasInput = await guest.locator('#live-chat-input-box').count();
  const guestPrompt = await guest.getByText('to chat with bidders in this room.').count();
  check('guest: chat is read-only with a "Log in" prompt', guestHasInput === 0 && guestPrompt === 1, `input boxes: ${guestHasInput}, prompt shown: ${guestPrompt}`);
  check('guest: bid button asks to sign in', (await bidSubmit(guest).innerText()).includes('Sign In to Bid'));

  // "Log in" from the chat, then come back to the same auction
  await guest.getByRole('link', { name: 'Log in', exact: true }).click();
  await guest.waitForURL('**/login');
  await uiLogin(guest, 'test2@gmail.com', PASS);
  await guest.waitForURL((u) => !u.pathname.startsWith('/login'));
  await guest.waitForTimeout(800);
  const backPath = new URL(guest.url()).pathname;
  check('login from the auction chat returns to that auction', backPath === `/auctions/${lotA.id}`, `landed on ${backPath}`);
  const bidder = guest; // now logged in as Test2

  // ── 2. Bidding as Test2 ────────────────────────────────────────────────────
  await bidder.goto(`${WEB}/auctions/${lotA.id}`);
  await bidder.waitForSelector('text=Current Highest Bid');
  await bidInput(bidder).fill('150.005');
  await bidSubmit(bidder).click();
  await bidder.waitForTimeout(700);
  const v1 = await bidInput(bidder).evaluate((el) => ({ valid: el.validity.valid, stepMismatch: el.validity.stepMismatch }));
  const err1 = await bidder.locator('.text-rose-600 span').allInnerTexts();
  check('bid with 3 decimals is refused before it is sent', !v1.valid && (await bidCount(lotA.id)) === 0,
    `browser validity: ${JSON.stringify(v1)}; page error: ${JSON.stringify(err1)}; bids stored: ${await bidCount(lotA.id)}`);

  await bidInput(bidder).fill('150');
  await bidSubmit(bidder).click();
  await bidder.waitForSelector('text=Bid of $150.00 placed successfully!', { timeout: 5000 }).catch(() => {});
  const ok2 = await bidder.getByText('Bid of $150.00 placed successfully!').count();
  await bidder.waitForTimeout(800);
  const priceText = await bidder.locator('text=Current Highest Bid').locator('xpath=../..').innerText();
  check('valid bid of $150 is placed and the price updates live', ok2 === 1 && priceText.includes('150.00') && (await bidCount(lotA.id)) === 1,
    `success banner: ${ok2}; price box: ${priceText.replace(/\s+/g, ' ').slice(0, 60)}; bids stored: ${await bidCount(lotA.id)}`);

  // Lot B: current price $20.30, so the lowest legal bid is $20.31
  await bidder.goto(`${WEB}/auctions/${lotB.id}`);
  await bidder.waitForSelector('text=Current Highest Bid');
  const minAttr = await bidInput(bidder).getAttribute('min');
  await bidInput(bidder).fill('20.31');
  const v2 = await bidInput(bidder).evaluate((el) => ({ valid: el.validity.valid, rangeUnderflow: el.validity.rangeUnderflow, stepMismatch: el.validity.stepMismatch }));
  await bidSubmit(bidder).click();
  await bidder.waitForTimeout(1500);
  check('lowest legal bid (current $20.30 + 1 cent = $20.31) can be submitted', v2.valid && (await bidCount(lotB.id)) === 1,
    `input min="${minAttr}"; validity for 20.31: ${JSON.stringify(v2)}; bids stored: ${await bidCount(lotB.id)}`);

  // ── 2b. A dropped live connection, and a late price update ────────────────
  // The watcher's WebSocket goes through this route, so the test can mute it (a Wi-Fi drop),
  // close it (Socket.IO then reconnects by itself) and slip in an old message.
  const watcher = await newPage(browser, 'watcher');
  const link = { muted: false, page: null, server: null };
  await watcher.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    link.page = ws;
    link.server = server;
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => { if (!link.muted) ws.send(m); });
  });
  await watcher.goto(`${WEB}/auctions/${lotB.id}`);
  await watcher.waitForSelector('text=Current Highest Bid');
  await watcher.waitForTimeout(800); // joined the room
  const watchedPrice = async () => (await watcher.locator('text=Current Highest Bid').locator('xpath=../..').innerText()).replace(/\s+/g, ' ');

  link.muted = true; // the browser stops hearing the server
  const t3 = await api('POST', '/auth/login', null, { email: 'test3@gmail.com', password: PASS });
  const missedBid = await api('POST', '/bids', t3.data.token, { auction_id: lotB.id, amount: 25 });
  await watcher.waitForTimeout(800);
  const whileMuted = await watchedPrice();
  link.muted = false;
  link.page.close();
  link.server.close();
  await watcher.waitForFunction(() => /25\.00/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
  const afterReconnect = await watchedPrice();
  check('after a dropped connection the page catches up on the bid it missed',
    missedBid.status === 201 && !whileMuted.includes('25.00') && afterReconnect.includes('25.00'),
    `bid ${missedBid.status}; while muted: ${whileMuted.slice(0, 50)}; after reconnect: ${afterReconnect.slice(0, 50)}`);

  // An old PRICE_UPDATE arriving late (lower than the price shown) must not move the price back
  await watcher.waitForTimeout(1500); // the new connection is up and in the room again
  link.page.send(`42${JSON.stringify(['PRICE_UPDATE', {
    auction_id: lotB.id, new_price: '21.00', bidder_name: 'Late update', bidder_id: null, bid_id: `late-${tag}`,
  }])}`);
  await watcher.waitForTimeout(1500);
  const afterLate = await watchedPrice();
  const lateRows = await watcher.getByText('Late update').count();
  check('a late, lower price update does not move the price backwards',
    afterLate.includes('25.00') && !afterLate.includes('21.00') && lateRows === 0,
    `price box: ${afterLate.slice(0, 50)}; rows from the late update: ${lateRows}`);
  await watcher.close();

  // ── 3. Chat between two logged-in users and a guest ───────────────────────
  const other = await newPage(browser, 'test3');
  await other.goto(`${WEB}/login`);
  await uiLogin(other, 'test3@gmail.com', PASS);
  await other.waitForURL((u) => !u.pathname.startsWith('/login'));
  await other.goto(`${WEB}/auctions/${lotA.id}`);
  await other.waitForSelector('text=Current Highest Bid');
  await openChat(other);

  const reader = await newPage(browser, 'guest2');
  await reader.goto(`${WEB}/auctions/${lotA.id}`);
  await reader.waitForSelector('text=Current Highest Bid');
  await openChat(reader);

  await bidder.goto(`${WEB}/auctions/${lotA.id}`);
  await bidder.waitForSelector('text=Current Highest Bid');
  await openChat(bidder);
  await bidder.waitForTimeout(800); // socket joins the room
  const msg = `hello from test2 ${tag}`;
  await bidder.fill('#live-chat-input-box', msg);
  await bidder.press('#live-chat-input-box', 'Enter');
  await other.waitForSelector(`text=${msg}`, { timeout: 5000 }).catch(() => {});
  await reader.waitForSelector(`text=${msg}`, { timeout: 5000 }).catch(() => {});
  await bidder.waitForTimeout(500);

  const seenByOther = await other.getByText(msg).count();
  const otherBubble = seenByOther ? await other.getByText(msg).locator('xpath=..').innerText() : '';
  const seenByGuest = await reader.getByText(msg).count();
  const mineCount = await bidder.getByText(msg).count();
  const mineClass = mineCount ? await bidder.getByText(msg).locator('xpath=..').getAttribute('class') : '';
  check('chat message reaches the other user once, with the sender name from the server', seenByOther === 1 && /Test2/.test(otherBubble),
    `copies: ${seenByOther}; bubble: ${otherBubble.replace(/\s+/g, ' ')}`);
  check('guests can read the chat', seenByGuest === 1, `copies seen by the guest: ${seenByGuest}`);
  check('sender sees one confirmed copy styled as their own', mineCount === 1 && mineClass.includes('bg-indigo-600') && !mineClass.includes('opacity-60'),
    `copies: ${mineCount}; classes: ${mineClass}`);

  const reply = `reply from test3 ${tag}`;
  await other.fill('#live-chat-input-box', reply);
  await other.press('#live-chat-input-box', 'Enter');
  await bidder.waitForSelector(`text=${reply}`, { timeout: 5000 }).catch(() => {});
  const replyBubble = (await bidder.getByText(reply).count()) ? await bidder.getByText(reply).locator('xpath=..').innerText() : '';
  check('reply arrives the other way', /Test3/.test(replyBubble), replyBubble.replace(/\s+/g, ' '));
  await bidder.screenshot({ path: `${OUT}/e2e_chat.png` });

  // ── 4. Change password as Test4 ────────────────────────────────────────────
  const hub = await newPage(browser, 'test4');
  await hub.goto(`${WEB}/login`);
  await uiLogin(hub, 'test4@gmail.com', PASS);
  await hub.waitForURL((u) => !u.pathname.startsWith('/login'));
  const oldToken = await hub.evaluate(() => localStorage.getItem('token'));
  await hub.goto(`${WEB}/my-hub`);
  await hub.getByRole('button', { name: /Payout & Password/ }).click();
  const pw = hub.locator('form', { hasText: 'Change Password' }).locator('input[type="password"]');

  await pw.nth(0).fill(PASS); await pw.nth(1).fill(NEW_PASS); await pw.nth(2).fill(NEW_PASS + 'x');
  await hub.getByRole('button', { name: 'Change Password' }).click();
  check('mismatched new passwords are caught', (await hub.getByText('The two new passwords do not match.').count()) === 1);

  await pw.nth(0).fill('wrong-password-1'); await pw.nth(1).fill(NEW_PASS); await pw.nth(2).fill(NEW_PASS);
  await hub.getByRole('button', { name: 'Change Password' }).click();
  await hub.waitForTimeout(1000);
  const wrongMsg = await hub.locator('form', { hasText: 'Change Password' }).locator('.text-rose-600').allInnerTexts();
  check('wrong current password shows the server error', wrongMsg.length === 1, JSON.stringify(wrongMsg));

  await pw.nth(0).fill(PASS); await pw.nth(1).fill(NEW_PASS); await pw.nth(2).fill(NEW_PASS);
  await hub.getByRole('button', { name: 'Change Password' }).click();
  await hub.waitForTimeout(1200);
  const okMsg = await hub.locator('form', { hasText: 'Change Password' }).locator('.text-emerald-600').allInnerTexts();
  const newToken = await hub.evaluate(() => localStorage.getItem('token'));
  check('password change succeeds in the UI', okMsg.length === 1 && newToken && newToken !== oldToken, JSON.stringify(okMsg));
  const oldMe = await api('GET', '/auth/me', oldToken);
  const newMe = await api('GET', '/auth/me', newToken);
  check('old session token is rejected, the new one works', oldMe.status === 401 && newMe.status === 200, `old: ${oldMe.status} ${JSON.stringify(oldMe.data)}; new: ${newMe.status}`);
  const loginOld = await api('POST', '/auth/login', null, { email: 'test4@gmail.com', password: PASS });
  const loginNew = await api('POST', '/auth/login', null, { email: 'test4@gmail.com', password: NEW_PASS });
  check('login: old password refused, new password accepted', loginOld.status === 401 && loginNew.status === 200, `old: ${loginOld.status}; new: ${loginNew.status}`);
  await hub.reload();
  await hub.waitForTimeout(1000);
  check('the page that changed the password stays logged in', new URL(hub.url()).pathname === '/my-hub', hub.url());

  // ── 4b. A password change logs out the user's other devices, without a reload ──
  const devA = await newPage(browser, 'test5-A');
  const devB = await newPage(browser, 'test5-B');
  for (const p of [devA, devB]) {
    await p.goto(`${WEB}/login`);
    await uiLogin(p, 'test5@gmail.com', PASS);
    await p.waitForURL((u) => !u.pathname.startsWith('/login'));
  }
  const tokenA = await devA.evaluate(() => localStorage.getItem('token'));
  await new Promise((r) => setTimeout(r, 1100)); // tokens carry whole seconds: change in a later second
  const chg = await api('PUT', '/auth/password', tokenA, { currentPassword: PASS, newPassword: NEW_PASS });
  // Device B moves to My Hub inside the app (client-side, no reload): its next API call is refused
  await devB.evaluate(() => { window.history.pushState({}, '', '/my-hub'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await devB.waitForURL('**/login', { timeout: 5000 }).catch(() => {});
  const bToken = await devB.evaluate(() => localStorage.getItem('token'));
  check('other device is logged out after a password change (no reload needed)',
    chg.status === 200 && new URL(devB.url()).pathname === '/login' && bToken === null,
    `B is on ${new URL(devB.url()).pathname}, token ${bToken ? 'kept' : 'cleared'}`);

  // ── 4b. AI draft names its source ─────────────────────────────────────────
  const aiPage = await newPage(browser, 'seller-ai');
  await aiPage.goto(`${WEB}/login`);
  await uiLogin(aiPage, 'test1@gmail.com', PASS);
  await aiPage.waitForURL((u) => !u.pathname.startsWith('/login'));
  await aiPage.goto(`${WEB}/create`);
  await aiPage.fill('input[placeholder^="e.g. 1968 Rolex Submariner Ref 5513"]', 'vintage brass telescope');
  await aiPage.getByRole('button', { name: /Generate with AI/ }).click();
  const aiMsg = await aiPage.waitForSelector('text=/You can review and edit below/', { timeout: 40000 }).then((el) => el.innerText()).catch(() => '');
  const aiTitle = await aiPage.inputValue('input[placeholder="e.g. 1968 Vintage Rolex Submariner Ref. 5513"]').catch(() => '');
  check('AI draft fills the form and says which generator wrote it', /template|Gemini|OpenAI/.test(aiMsg) && /Telescope/i.test(aiTitle),
    `${aiMsg.trim()} | title: ${aiTitle}`);
  await aiPage.close();

  // ── 5. Admin dashboard ─────────────────────────────────────────────────────
  const admin = await newPage(browser, 'admin');
  await admin.goto(`${WEB}/login`);
  await uiLogin(admin, 'admin@gmail.com', PASS);
  await admin.waitForURL((u) => !u.pathname.startsWith('/login'));
  await admin.goto(`${WEB}/admin`);
  await admin.waitForSelector('text=Monthly Revenue', { timeout: 10000 });
  const adminToken = await admin.evaluate(() => localStorage.getItem('token'));
  const chart = await api('GET', '/admin/revenue-chart', adminToken);
  const badge = await admin.getByText('SAMPLE DATA', { exact: true }).count();
  check('revenue chart badge matches the API isSample flag', (badge === 1) === Boolean(chart.data.isSample),
    `isSample=${chart.data.isSample}, months=${chart.data.chartData?.length}, badge shown=${badge}`);
  await admin.getByRole('button', { name: /User Management/ }).click();
  await admin.waitForTimeout(500);
  check('user table column is called "Bid Volume"', (await admin.getByText('Bid Volume', { exact: true }).count()) === 1);

  // CSV export goes through the shared API client: a real CSV file, not an error page saved as .csv
  await admin.getByRole('button', { name: /Admin Commission & Money Transactions/ }).click();
  await admin.waitForSelector('#comm-export-csv', { timeout: 10000 });
  const [csvDownload] = await Promise.all([
    admin.waitForEvent('download', { timeout: 15000 }),
    admin.click('#comm-export-csv'),
  ]);
  const csvText = fs.readFileSync(await csvDownload.path(), 'utf8');
  check('commission CSV export downloads a CSV file', /^[^\n]*,/.test(csvText) && !csvText.trim().startsWith('{'),
    `${csvDownload.suggestedFilename()}: ${csvText.split('\n')[0].slice(0, 90)}`);

  await admin.getByRole('button', { name: /Test Concurrency/ }).click();
  await admin.waitForSelector('text=RACE CONDITIONS DETECTED', { timeout: 30000 });
  const modal = await admin.locator('text=High-Concurrency Stress Benchmark').locator('xpath=ancestor::div[contains(@class,"fixed")]').first().innerText();
  const crosses = (modal.match(/✗/g) || []).length;
  const ticks = (modal.match(/✓/g) || []).length;
  check('benchmark modal: 0 race conditions, all checks ticked', /\b0 RACE CONDITIONS DETECTED/.test(modal) && crosses === 0 && ticks >= 3,
    `ticks ${ticks}, crosses ${crosses}; ${modal.replace(/\s+/g, ' ').match(/Final Price in DB: \S+ Total Bids Recorded: \d+/)?.[0]}`);
  await admin.screenshot({ path: `${OUT}/e2e_benchmark.png` });
  const leftovers = (await db.query(`SELECT COUNT(*)::int AS n FROM auctions WHERE title ILIKE '%benchmark%'`)).rows[0].n;
  check('benchmark lot is cleaned up afterwards', leftovers === 0, `auctions with "benchmark" in the title: ${leftovers}`);

  // Admins can't bid: no bid form for them, and the API refuses too
  await admin.goto(`${WEB}/auctions/${lotA.id}`);
  await admin.waitForSelector('text=Current Highest Bid');
  await admin.waitForTimeout(500);
  const adminForms = await admin.locator('form input[type="number"]').count();
  const adminBid = await api('POST', '/bids', adminToken, { auction_id: lotA.id, amount: 999 });
  check('admin is stopped from bidding (UI and API)', adminForms === 0 && adminBid.status === 403, `bid inputs shown: ${adminForms}; API: ${adminBid.status} ${adminBid.data.error}`);
  await admin.screenshot({ path: `${OUT}/e2e_admin_auction.png` });

  // ── 6. Public pages render ─────────────────────────────────────────────────
  for (const path of ['/', '/leaderboard', '/how-it-works', '/about']) {
    await reader.goto(WEB + path);
    await reader.waitForTimeout(900);
    const text = await reader.innerText('body');
    check(`page ${path} renders`, text.length > 200 && !/Something went wrong/i.test(text), `${text.length} chars`);
  }

  // Requests to the app itself must not fail. Outside images and fonts can (offline machines)
  const appHosts = [new URL(WEB).host, new URL(API).host];
  const localFailures = failedRequests.filter((u) => appHosts.includes(new URL(u).host));
  const external = [...new Set(failedRequests.filter((u) => !localFailures.includes(u)).map((u) => new URL(u).host))];
  check('no failed requests to the app itself', localFailures.length === 0, `app: ${localFailures.slice(0, 5).join(', ') || 'none'}; unreachable outside hosts: ${external.join(', ') || 'none'}`);
  // Expected: 400/401 answers the tests provoke on purpose (wrong password, device B's ended session)
  const unexpected = consoleErrors.filter((e) => !/status of 40[01]|ERR_TUNNEL_CONNECTION_FAILED/.test(e) && !/^\[test5-B\].*status code 401/.test(e));
  check('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 8).join('\n       '));
  if (unexpected.length) console.log('Unexpected console errors:\n  ' + unexpected.join('\n  '));

  await browser.close();
  await db.end();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => {
  console.error('E2E crashed:', e);
  process.exit(2);
});
