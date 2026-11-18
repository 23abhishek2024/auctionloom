/**
 * AuctionLoom concurrency stress tests
 *
 * Fires many requests at the same moment against a running server and checks the database
 * afterwards. Each scenario creates its own users and lots, so it can run on any database
 * (CI runs it after `npm test`). Exit code 1 if any check fails.
 *
 * Usage (server running on API_URL, database in the usual DB_* or DATABASE_URL env vars):
 *   npm run stress
 *
 * Scenarios
 *   1. Bid race: 100 bids at once, amounts in equal pairs   -> no lost update, no duplicate winners
 *   2. Double spend: 30 withdrawals of $10 from $100 at once -> never overdrawn
 *   3. Double settlement: 20 settle requests for one lot      -> winner charged exactly once
 *   4. Republish a sold-and-paid lot                          -> refused
 *   5. Cross settlement: users buying from each other at once -> no deadlock, no money lost
 *   6. Bid vs delete: a bid and the seller's delete at the same moment -> never both succeed
 */
const pool = require('./src/db');

const API = process.env.API_URL || 'http://localhost:5000/api';
const tag = Date.now().toString(36);

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* not JSON */ }
  return { status: res.status, data };
}

async function register(name, role) {
  const r = await call('POST', '/auth/register', null, { email: `stress_${name}_${tag}@test.com`, password: 'Passw0rd!', role, name: `${name} ${tag}` });
  if (!r.data.token) throw new Error(`register ${name} failed: ${JSON.stringify(r.data)}`);
  return { token: r.data.token, id: r.data.user.id, name };
}

async function createAuction(seller, price, title) {
  const r = await call('POST', '/auctions', seller.token, { title: `${title} ${tag}`, starting_price: price, duration_minutes: 60 });
  if (!r.data.auction) throw new Error(`create auction failed: ${JSON.stringify(r.data)}`);
  return r.data.auction.id;
}

const balance = async (user) => parseFloat((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [user.id])).rows[0]?.balance ?? 0);
const cents = (n) => Math.round(n * 100) / 100;
// Move the end time into the past, then open the auction once: the server closes it just in time
const endAndClose = async (ids) => {
  await pool.query(`UPDATE auctions SET end_time = NOW() - INTERVAL '1 second' WHERE id = ANY($1)`, [ids]);
  for (const id of ids) await call('GET', `/auctions/${id}`);
};
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const results = [];
const report = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'} | ${name}\n         ${detail}`);
};

async function main() {
  const health = await fetch(API.replace(/\/api$/, '') + '/health').catch(() => null);
  if (!health || !health.ok) {
    console.error(`Server not reachable at ${API}. Start it first (npm start).`);
    process.exit(1);
  }

  const seller = await register('seller', 'auctioneer');
  const bidders = [await register('bidder1', 'bidder'), await register('bidder2', 'bidder'), await register('bidder3', 'bidder')];
  const [b1, b2, b3] = bidders;

  // ── 1. Bid race ──────────────────────────────────────────────
  {
    const id = await createAuction(seller, 100, 'Stress bid race');
    // 50 different amounts, each sent twice, all 100 at once: with a lost update two equal bids
    // could both be accepted, or the final price could end up below an accepted bid
    const amounts = shuffle(Array.from({ length: 100 }, (_, i) => 101 + Math.floor(i / 2)));
    const res = await Promise.all(amounts.map((amount, i) => call('POST', `/auctions/${id}/bids`, bidders[i % 3].token, { amount })));
    const accepted = res.filter((r) => r.status === 201).map((r) => parseFloat(r.data.bid.amount));
    const errors = res.filter((r) => r.status >= 500).length;
    const rows = (await pool.query('SELECT amount FROM bids WHERE auction_id = $1', [id])).rows.map((r) => parseFloat(r.amount));
    const finalPrice = parseFloat((await pool.query('SELECT current_price FROM auctions WHERE id = $1', [id])).rows[0].current_price);
    const duplicates = rows.length - new Set(rows).size;
    const highest = Math.max(...amounts);
    report('Bid race: 100 simultaneous bids, no lost update',
      errors === 0 && duplicates === 0 && rows.length === accepted.length && finalPrice === Math.max(...rows) && finalPrice === highest,
      `${accepted.length} accepted, ${100 - accepted.length - errors} rejected as too low, ${errors} server errors; ` +
      `rows in DB = ${rows.length}, duplicate accepted amounts = ${duplicates}, final price $${finalPrice} (highest bid sent $${highest})`);
  }

  // ── 2. Double spend ──────────────────────────────────────────
  {
    await call('POST', '/wallet/topup', b1.token, { amount: 100 });
    const res = await Promise.all(Array.from({ length: 30 }, () => call('POST', '/wallet/withdraw', b1.token, { amount: 10 })));
    const ok = res.filter((r) => r.status === 200).length;
    const insufficient = res.filter((r) => r.data.code === 'INSUFFICIENT_FUNDS').length;
    const bal = await balance(b1);
    report('Double spend: 30 simultaneous $10 withdrawals from $100',
      ok === 10 && insufficient === 20 && bal === 0,
      `${ok} succeeded, ${insufficient} refused (insufficient funds); final balance $${bal}`);
  }

  // ── 3. Double settlement ─────────────────────────────────────
  let settledLot;
  {
    const id = await createAuction(seller, 40, 'Stress settlement race');
    await call('POST', `/auctions/${id}/bids`, b2.token, { amount: 50 });
    await endAndClose([id]); // b2's wallet is empty here, so nothing is auto-settled at closing
    await call('POST', '/wallet/topup', b2.token, { amount: 100 });
    const sellerBefore = await balance(seller);
    const res = await Promise.all(Array.from({ length: 20 }, () => call('POST', '/wallet/settle-lot', b2.token, { auctionId: id })));
    const debits = (await pool.query(`SELECT count(*)::int AS c FROM wallet_transactions WHERE type = 'SETTLEMENT_DEBIT' AND reference_id = $1`, [id])).rows[0].c;
    const credits = (await pool.query(`SELECT count(*)::int AS c FROM wallet_transactions WHERE type = 'SETTLEMENT_CREDIT' AND reference_id = $1`, [id])).rows[0].c;
    const errors = res.filter((r) => r.status >= 500).length;
    const bal = await balance(b2);
    const sellerGain = cents((await balance(seller)) - sellerBefore);
    report('Double settlement: 20 simultaneous settle requests for one lot',
      debits === 1 && credits === 1 && errors === 0 && bal === 50 && sellerGain === 47.5,
      `winner debited ${debits} time(s), seller credited ${credits} time(s), ${errors} server errors; winner $100 -> $${bal}, seller +$${sellerGain} (95% of $50)`);
    settledLot = id;
  }

  // ── 4. Republish a sold-and-paid lot ─────────────────────────
  {
    const r = await call('POST', `/auctions/${settledLot}/republish`, seller.token, { end_time: new Date(Date.now() + 3600e3).toISOString() });
    const row = (await pool.query('SELECT status, winner_id, is_settled FROM auctions WHERE id = $1', [settledLot])).rows[0];
    report('Republishing a lot that was already paid for is refused',
      r.status === 409 && row.status === 'CLOSED' && row.winner_id === b2.id && row.is_settled === true,
      `HTTP ${r.status} "${r.data.error}"; lot still CLOSED, same winner, still settled`);
  }

  // ── 5. Cross settlement (deadlock check) ─────────────────────
  {
    const U = await register('userU', 'auctioneer');
    const V = await register('userV', 'auctioneer');
    const pairs = 15;
    const p = [];
    const q = [];
    for (let i = 0; i < pairs; i++) {
      p.push(await createAuction(U, 10, `U sells ${i}`));
      q.push(await createAuction(V, 10, `V sells ${i}`));
    }
    for (let i = 0; i < pairs; i++) {
      await call('POST', `/auctions/${p[i]}/bids`, V.token, { amount: 20 });
      await call('POST', `/auctions/${q[i]}/bids`, U.token, { amount: 20 });
    }
    await endAndClose([...p, ...q]); // wallets still empty: nothing auto-settles
    await call('POST', '/wallet/topup', U.token, { amount: 10000 });
    await call('POST', '/wallet/topup', V.token, { amount: 10000 });
    // U pays V and V pays U at the same time: both lock the same two wallets
    const reqs = [];
    for (let i = 0; i < pairs; i++) {
      reqs.push(call('POST', '/wallet/settle-lot', V.token, { auctionId: p[i] }));
      reqs.push(call('POST', '/wallet/settle-lot', U.token, { auctionId: q[i] }));
    }
    const res = await Promise.all(reqs);
    const failed = res.filter((r) => r.status !== 200).length;
    const settled = (await pool.query(`SELECT count(*)::int AS c FROM auctions WHERE id = ANY($1) AND is_settled`, [[...p, ...q]])).rows[0].c;
    const total = cents((await balance(U)) + (await balance(V)));
    const expected = cents(20000 - settled * 20 * 0.05); // only the 5% fees leave the U+V pair
    report('Cross settlement: 30 simultaneous settlements locking the same wallets',
      failed === 0 && settled === pairs * 2 && total === expected,
      `${settled}/${pairs * 2} settled, ${failed} failed; U+V balance $${total} (expected $${expected})`);
  }

  // ── 6. Bid vs delete ─────────────────────────────────────────
  {
    // The seller may delete a lot only while it has no bids. Fire a bid and the delete together:
    // either the bid wins (delete refused, the bid stays) or the delete wins (the bid finds no lot).
    // Both succeeding would mean a bid was accepted and then silently deleted.
    const rounds = 20;
    let bothSucceeded = 0;
    let bidWon = 0;
    let deleteWon = 0;
    let other = 0;
    for (let i = 0; i < rounds; i++) {
      const id = await createAuction(seller, 10, `Bid vs delete ${i}`);
      const [bid, del] = await Promise.all([
        call('POST', `/auctions/${id}/bids`, b3.token, { amount: 11 }),
        call('DELETE', `/auctions/${id}`, seller.token),
      ]);
      if (bid.status === 201 && del.status === 200) bothSucceeded++;
      else if (bid.status === 201 && del.status === 400) bidWon++;
      else if (del.status === 200 && bid.status === 404) deleteWon++;
      else other++;
    }
    report('Bid vs delete: a bid and the seller\'s delete at the same moment never both succeed',
      bothSucceeded === 0 && other === 0,
      `${rounds} rounds -> bid first ${bidWon}, delete first ${deleteWon}, both succeeded ${bothSucceeded}, other ${other}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nStress tests passed: ${passed}/${results.length}`);
  return passed === results.length;
}

main()
  .then((ok) => pool.end().then(() => process.exit(ok ? 0 : 1)))
  .catch(async (err) => {
    console.error('Stress test error:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
