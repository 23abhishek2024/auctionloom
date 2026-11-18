/**
 * ============================================================================
 * AuctionLoom: High-Concurrency Bidding Benchmark (latency + correctness)
 * ============================================================================
 *
 * Fires 100 bids over HTTP at the same moment at one fresh lot, measures latency, then CHECKS
 * the database (nothing here is assumed):
 *   - every 201 has a row in bids, and no other rows exist
 *   - no two accepted bids have the same amount (amounts are sent in equal pairs on purpose)
 *   - the final price equals the highest accepted bid
 * Exit code 1 if a check fails or the server returns an error.
 *
 * It creates its own seller and three bidders, so it runs on any database.
 *
 * Usage (server running):
 *   node benchmark_concurrency.js
 *   npm run benchmark
 */

const pool = require('./src/db');
const { performance } = require('perf_hooks');

const API_BASE = process.env.API_URL || 'http://localhost:5000/api';
const CONCURRENT_REQUESTS = 100;
const tag = Date.now().toString(36);

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const duration = performance.now() - start;
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, duration, ok: res.ok };
  } catch (err) {
    return { status: 0, error: err.message, duration: performance.now() - start, ok: false };
  }
}

async function register(name, role) {
  const res = await request('/auth/register', {
    method: 'POST',
    body: { email: `bench_${name}_${tag}@test.com`, password: 'Passw0rd!', role, name: `${name} ${tag}` },
  });
  if (!res.data?.token) throw new Error(`Could not register ${name}: ${JSON.stringify(res.data)}`);
  return { token: res.data.token, id: res.data.user.id };
}

function percentile(numbers, p) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] || 0;
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('⚡ AUCTIONLOOM: HIGH-CONCURRENCY BIDDING BENCHMARK');
  console.log('================================================================');
  console.log(`Target API: ${API_BASE}`);
  console.log(`Bids fired at once: ${CONCURRENT_REQUESTS} (amounts in equal pairs)\n`);

  const health = await request('/../health');
  if (!health.ok) {
    console.error('❌ Backend server is not reachable. Start it first (npm start).');
    process.exit(1);
  }

  // 1. Own accounts and a fresh lot
  const seller = await register('seller', 'auctioneer');
  const bidders = [await register('b1', 'bidder'), await register('b2', 'bidder'), await register('b3', 'bidder')];
  const startingPrice = 1000;
  const lot = await request('/auctions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${seller.token}` },
    body: { title: `Benchmark lot ${tag}`, starting_price: startingPrice, duration_minutes: 60 },
  });
  const auctionId = lot.data?.auction?.id;
  if (!auctionId) throw new Error(`Could not create the benchmark lot: ${JSON.stringify(lot.data)}`);

  // 2. Fire all bids at once
  const tasks = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    const amount = startingPrice + Math.floor(i / 2) * 10 + 5; // pairs: 1005, 1005, 1015, 1015, ...
    tasks.push(
      request(`/auctions/${auctionId}/bids`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bidders[i % bidders.length].token}` },
        body: { amount },
      }).then((res) => ({ ...res, amount }))
    );
  }
  const started = performance.now();
  const results = await Promise.all(tasks);
  const elapsed = performance.now() - started;

  // 3. Metrics
  const durations = results.map((r) => r.duration);
  const accepted = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 400).length;
  const errors = results.filter((r) => r.status >= 500 || r.status === 0).length;

  // 4. Check the database
  const finalPrice = parseFloat((await pool.query('SELECT current_price FROM auctions WHERE id = $1', [auctionId])).rows[0].current_price);
  const stored = (await pool.query('SELECT amount FROM bids WHERE auction_id = $1', [auctionId])).rows.map((r) => parseFloat(r.amount));
  const highestAccepted = accepted.length ? Math.max(...accepted.map((r) => r.amount)) : startingPrice;
  const checks = [
    ['Every accepted bid is stored, nothing else', stored.length === accepted.length],
    ['No two accepted bids share an amount', new Set(stored).size === stored.length],
    ['Final price equals the highest accepted bid', finalPrice === highestAccepted],
    ['No server errors', errors === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);

  console.log('📊 RESULTS');
  console.log(`  Elapsed           : ${elapsed.toFixed(2)} ms  (${(CONCURRENT_REQUESTS / (elapsed / 1000)).toFixed(2)} req/sec)`);
  console.log(`  201 accepted      : ${accepted.length}`);
  console.log(`  400 refused       : ${rejected} (not higher than the current price)`);
  console.log(`  5xx / no response : ${errors}`);
  console.log(`  Latency           : min ${Math.min(...durations).toFixed(1)} | p50 ${percentile(durations, 50).toFixed(1)} | p95 ${percentile(durations, 95).toFixed(1)} | p99 ${percentile(durations, 99).toFixed(1)} | max ${Math.max(...durations).toFixed(1)} ms`);
  console.log(`  Final price in DB : $${finalPrice.toFixed(2)} (highest accepted bid $${highestAccepted.toFixed(2)})`);
  console.log(`  Bid rows in DB    : ${stored.length}`);
  console.log('\n🔎 CHECKS');
  for (const [label, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  console.log(`\nRace conditions detected: ${failed.length}`);

  await pool.end();
  process.exit(failed.length === 0 ? 0 : 1);
}

runBenchmark().catch(async (err) => {
  console.error('❌ Benchmark failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
