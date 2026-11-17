const bcrypt = require('bcrypt');
const { performance } = require('perf_hooks');
const pool = require('../db');
const walletService = require('./walletService');
const bidService = require('./bidService');
const { AppError } = require('../utils/AppError');

/**
 * System Service
 * Admin-only maintenance: wiping the database to a known demo state, and a live
 * concurrency benchmark of the bid locking.
 */

/**
 * Wipe all tables, then create admin@gmail.com + test1..test5@gmail.com (password: test@123)
 * with $0.00 wallets. With runTestAuctions, also run 3 sold-and-paid test auctions through the
 * real lot settlement (settleLotEscrow) and add 2 live auctions to browse.
 * Returns the created users and their final wallet balances.
 */
async function purgeAndReset({ runTestAuctions }) {
  const userMap = {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Wipe all existing auctions, bids, and ledger history
    await client.query('TRUNCATE TABLE bids CASCADE;');
    await client.query('TRUNCATE TABLE jobs CASCADE;');
    await client.query('TRUNCATE TABLE auctions CASCADE;');
    await client.query('TRUNCATE TABLE commission_proofs CASCADE;');
    await client.query('TRUNCATE TABLE payment_requests CASCADE;');
    await client.query('TRUNCATE TABLE wallet_transactions CASCADE;');
    await client.query('TRUNCATE TABLE wallets CASCADE;');
    await client.query('TRUNCATE TABLE users CASCADE;');

    const passwordHash = await bcrypt.hash('test@123', 10);

    const userDefs = [
      { name: 'Admin', email: 'admin@gmail.com', role: 'admin' },
      { name: 'Test 1', email: 'test1@gmail.com', role: 'auctioneer' },
      { name: 'Test 2', email: 'test2@gmail.com', role: 'auctioneer' },
      { name: 'Test 3', email: 'test3@gmail.com', role: 'bidder' },
      { name: 'Test 4', email: 'test4@gmail.com', role: 'bidder' },
      { name: 'Test 5', email: 'test5@gmail.com', role: 'bidder' },
    ];

    for (const u of userDefs) {
      const uRes = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role`,
        [u.name, u.email, passwordHash, u.role]
      );
      userMap[u.email] = uRes.rows[0];

      await client.query(
        `INSERT INTO wallets (user_id, balance, currency, version)
         VALUES ($1, 0.00, 'USD', 0)`,
        [uRes.rows[0].id]
      );
    }

    // Platform Treasury Account (Internal System Account)
    await client.query(`
      INSERT INTO users (id, email, password_hash, role, name)
      VALUES ('00000000-0000-0000-0000-000000000000', 'treasury@auctionloom.internal', 'SYSTEM_ACCOUNT_DO_NOT_LOGIN', 'admin', 'AuctionLoom Treasury')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO wallets (user_id, balance, currency, version)
      VALUES ('00000000-0000-0000-0000-000000000000', 0.00, 'USD', 0)
      ON CONFLICT (user_id) DO UPDATE SET balance = 0.00;
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (runTestAuctions) {
    await seedTestAuctions(userMap);
  }

  // Fetch final balances
  const balances = {};
  for (const email of Object.keys(userMap)) {
    const w = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userMap[email].id]);
    balances[email] = parseFloat(w.rows[0]?.balance || 0);
  }

  return { users: Object.values(userMap), balances };
}

/**
 * Three sold lots, each funded, closed and settled through settleLotEscrow, plus two live auctions
 */
async function seedTestAuctions(userMap) {
  // 1. Fund Buyer 3 with +$400
  await walletService.creditWallet({
    userId: userMap['test3@gmail.com'].id,
    amount: 400.00,
    type: 'TOPUP',
    referenceType: 'TOPUP_REQUEST',
    idempotencyKey: `topup_test3_${Date.now()}`,
    metadata: { note: 'Initial test topup for Omega Seamaster' }
  });

  // Auction 1: 1968 Omega Seamaster Vintage ($200 hammer)
  const a1Res = await pool.query(`
    INSERT INTO auctions (seller_id, title, description, starting_price, current_price, end_time, status, winner_id, commission_amount, commission_calculated, is_settled, settled_at, image_url, category)
    VALUES ($1, '1968 Omega Seamaster Vintage', 'Rare original dial luxury vintage timepiece.', 100.00, 200.00, NOW() - INTERVAL '1 minute', 'CLOSED', $2, 10.00, TRUE, FALSE, NULL, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30', 'Watches')
    RETURNING id
  `, [userMap['test1@gmail.com'].id, userMap['test3@gmail.com'].id]);

  await pool.query(`
    INSERT INTO bids (auction_id, bidder_id, amount)
    VALUES ($1, $2, 200.00)
  `, [a1Res.rows[0].id, userMap['test3@gmail.com'].id]);

  await walletService.settleLotEscrow({
    auctionId: a1Res.rows[0].id,
    winnerId: userMap['test3@gmail.com'].id,
    sellerId: userMap['test1@gmail.com'].id,
    hammerPrice: 200.00,
    idempotencyPrefix: `settle_${a1Res.rows[0].id}`
  });

  // 2. Fund Buyer 4 with +$500
  await walletService.creditWallet({
    userId: userMap['test4@gmail.com'].id,
    amount: 500.00,
    type: 'TOPUP',
    referenceType: 'TOPUP_REQUEST',
    idempotencyKey: `topup_test4_${Date.now()}`,
    metadata: { note: 'Initial test topup for Charizard' }
  });

  // Auction 2: 1st Edition Charizard Holographic 1999 ($300 hammer)
  const a2Res = await pool.query(`
    INSERT INTO auctions (seller_id, title, description, starting_price, current_price, end_time, status, winner_id, commission_amount, commission_calculated, is_settled, settled_at, image_url, category)
    VALUES ($1, '1st Edition Charizard Holographic 1999', 'Shadowless Base Set Gem Mint condition collectible.', 150.00, 300.00, NOW() - INTERVAL '1 minute', 'CLOSED', $2, 15.00, TRUE, FALSE, NULL, 'https://images.unsplash.com/photo-1613771404784-3a5686aa2be3', 'Collectibles')
    RETURNING id
  `, [userMap['test2@gmail.com'].id, userMap['test4@gmail.com'].id]);

  await pool.query(`
    INSERT INTO bids (auction_id, bidder_id, amount)
    VALUES ($1, $2, 300.00)
  `, [a2Res.rows[0].id, userMap['test4@gmail.com'].id]);

  await walletService.settleLotEscrow({
    auctionId: a2Res.rows[0].id,
    winnerId: userMap['test4@gmail.com'].id,
    sellerId: userMap['test2@gmail.com'].id,
    hammerPrice: 300.00,
    idempotencyPrefix: `settle_${a2Res.rows[0].id}`
  });

  // 3. Fund Buyer 5 with +$600
  await walletService.creditWallet({
    userId: userMap['test5@gmail.com'].id,
    amount: 600.00,
    type: 'TOPUP',
    referenceType: 'TOPUP_REQUEST',
    idempotencyKey: `topup_test5_${Date.now()}`,
    metadata: { note: 'Initial test topup for Apple-1' }
  });

  // Auction 3: Apple-1 Motherboard Operational Replica ($400 hammer)
  const a3Res = await pool.query(`
    INSERT INTO auctions (seller_id, title, description, starting_price, current_price, end_time, status, winner_id, commission_amount, commission_calculated, is_settled, settled_at, image_url, category)
    VALUES ($1, 'Apple-1 Motherboard Operational Replica', 'Fully working hand-built replica with cassette interface.', 200.00, 400.00, NOW() - INTERVAL '1 minute', 'CLOSED', $2, 20.00, TRUE, FALSE, NULL, 'https://images.unsplash.com/photo-1550745165-9bc0b252726f', 'Electronics')
    RETURNING id
  `, [userMap['test1@gmail.com'].id, userMap['test5@gmail.com'].id]);

  await pool.query(`
    INSERT INTO bids (auction_id, bidder_id, amount)
    VALUES ($1, $2, 400.00)
  `, [a3Res.rows[0].id, userMap['test5@gmail.com'].id]);

  await walletService.settleLotEscrow({
    auctionId: a3Res.rows[0].id,
    winnerId: userMap['test5@gmail.com'].id,
    sellerId: userMap['test1@gmail.com'].id,
    hammerPrice: 400.00,
    idempotencyPrefix: `settle_${a3Res.rows[0].id}`
  });

  // Seed 2 active ongoing live auctions for testing and browsing
  await pool.query(`
    INSERT INTO auctions (seller_id, title, description, starting_price, current_price, end_time, status, image_url, category)
    VALUES
    ($1, '1962 Ferrari 250 GTO Scaglietti Berlinetta', 'Iconic competition berlinetta in Rosso Corsa with Colombo V12 engine.', 1500.00, 1500.00, NOW() + INTERVAL '48 hours', 'ACTIVE', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80', 'Automotive'),
    ($2, 'Rolex Cosmograph Daytona Reference 6239', 'Authentic vintage Paul Newman exotic tri-color step dial chronograph.', 850.00, 850.00, NOW() + INTERVAL '24 hours', 'ACTIVE', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80', 'Watches')
  `, [userMap['test1@gmail.com'].id, userMap['test2@gmail.com'].id]);
}

const BENCHMARK_MAX_IN_FLIGHT = 10; // leave the rest of the 20-connection pool for real users

/**
 * Fire `count` bids at a throw-away lot through the real bidService.placeBid (the same code a
 * user's bid runs: one transaction, SELECT ... FOR UPDATE, checks, insert, price update), up to
 * 10 at a time, then CHECK the database instead of assuming it is right:
 *   - every accepted bid is in the bids table, and nothing else is
 *   - no two accepted bids have the same amount (amounts are sent in equal pairs on purpose)
 *   - the final price equals the highest accepted bid
 * raceConditionsDetected is the number of those checks that failed (0 when all hold).
 * The lot and its bids are deleted afterwards, so the benchmark never clutters the marketplace.
 */
async function runBidBenchmark(count) {
  // 1. A seller and up to 3 bidders that are not the seller. Anyone but an admin may bid
  //    (auctioneers too: the seed script makes every test user an auctioneer), so plain bidder
  //    accounts come first and auctioneers fill in.
  const sellerRes = await pool.query(
    `SELECT id FROM users
     WHERE role IN ('auctioneer', 'admin') AND id <> '00000000-0000-0000-0000-000000000000'
     ORDER BY created_at ASC LIMIT 1`
  );
  const sellerId = sellerRes.rows[0]?.id;
  const biddersRes = await pool.query(
    `SELECT id, email, name FROM users
     WHERE role <> 'admin' AND id <> $1
     ORDER BY (role = 'bidder') DESC, created_at ASC LIMIT 3`,
    [sellerId || '00000000-0000-0000-0000-000000000000']
  );
  const bidders = biddersRes.rows;
  if (!sellerId || bidders.length < 2) {
    throw new AppError(400, 'The benchmark needs one seller (auctioneer or admin) and at least two other non-admin accounts to bid.');
  }

  // 2. A fresh lot just for this run
  const startingPrice = 1000;
  const lotRes = await pool.query(
    `INSERT INTO auctions (seller_id, title, description, starting_price, current_price, end_time, status, category)
     VALUES ($1, 'Benchmark lot ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'), 'Temporary lot for the concurrency benchmark (deleted after the run).', $2, $2, NOW() + INTERVAL '1 hour', 'ACTIVE', 'Benchmark')
     RETURNING id`,
    [sellerId, startingPrice]
  );
  const auctionId = lotRes.rows[0].id;

  try {
    // 3. Fire the bids: amounts come in equal pairs, so the second of each pair must be refused
    let nextIndex = 0;
    const results = new Array(count);
    const worker = async () => {
      while (nextIndex < count) {
        const i = nextIndex++;
        const bidder = bidders[i % bidders.length];
        const amount = startingPrice + Math.floor(i / 2) * 10 + 5;
        const started = performance.now();
        try {
          await bidService.placeBid({ auctionId, bidder, amount });
          results[i] = { status: 201, duration: performance.now() - started, amount };
        } catch (err) {
          const expected = err instanceof AppError;
          if (!expected) console.error('[Benchmark] Unexpected bid error:', err.message);
          results[i] = {
            status: expected ? err.statusCode : 500,
            duration: performance.now() - started,
            amount,
            reason: expected ? err.message : 'Unexpected server error (see server log)',
          };
        }
      }
    };
    const benchmarkStart = performance.now();
    await Promise.all(Array.from({ length: Math.min(BENCHMARK_MAX_IN_FLIGHT, count) }, () => worker()));
    const totalDuration = performance.now() - benchmarkStart;

    // 4. Latency percentiles and throughput
    const durations = results.map((r) => r.duration).sort((a, b) => a - b);
    const calcP = (p) => parseFloat((durations[Math.max(0, Math.ceil((p / 100) * durations.length) - 1)] || 0).toFixed(2));
    const accepted = results.filter((r) => r.status === 201);
    const rejectedBids = results.filter((r) => r.status === 400).length;
    const serverErrors = results.filter((r) => r.status >= 500).length;

    // 5. Check the database
    const finalPrice = parseFloat((await pool.query('SELECT current_price FROM auctions WHERE id = $1', [auctionId])).rows[0].current_price);
    const storedAmounts = (await pool.query('SELECT amount FROM bids WHERE auction_id = $1', [auctionId])).rows.map((r) => parseFloat(r.amount));
    const highestAccepted = accepted.length ? Math.max(...accepted.map((r) => r.amount)) : startingPrice;
    const checks = {
      everyAcceptedBidStored: storedAmounts.length === accepted.length,
      noDuplicateAcceptedAmounts: new Set(storedAmounts).size === storedAmounts.length,
      finalPriceEqualsHighestAcceptedBid: finalPrice === highestAccepted,
    };
    const raceConditionsDetected = Object.values(checks).filter((ok) => !ok).length;

    return {
      totalRequests: count,
      maxInFlight: Math.min(BENCHMARK_MAX_IN_FLIGHT, count),
      elapsedMs: parseFloat(totalDuration.toFixed(2)),
      throughputReqSec: parseFloat((count / (totalDuration / 1000)).toFixed(2)),
      successfulBids: accepted.length,
      rejectedBids,
      serverErrors,
      latencies: {
        min: parseFloat(durations[0].toFixed(2)),
        mean: parseFloat((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)),
        median: calcP(50),
        p90: calcP(90),
        p95: calcP(95),
        p99: calcP(99),
        max: parseFloat(durations[durations.length - 1].toFixed(2)),
      },
      dbState: {
        auctionId,
        finalPrice,
        highestAcceptedBid: highestAccepted,
        totalBidsInDb: storedAmounts.length,
        checks,
        raceConditionsDetected,
        lockingMechanism: 'PostgreSQL SELECT ... FOR UPDATE (pessimistic row lock) via bidService.placeBid',
        lotDeletedAfterRun: true,
      },
    };
  } finally {
    // 6. Remove the throw-away lot and its bids
    await pool.query('DELETE FROM bids WHERE auction_id = $1', [auctionId]);
    await pool.query('DELETE FROM auctions WHERE id = $1', [auctionId]);
  }
}

module.exports = { purgeAndReset, runBidBenchmark };
