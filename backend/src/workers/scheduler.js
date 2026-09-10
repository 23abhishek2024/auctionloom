const pool = require('../db');
const auctionModel = require('../models/auctionModel');

/**
 * Auction Scheduler — Phase 6 (Distributed Background Workers)
 *
 * Runs every 30 seconds. Finds auctions that have expired but
 * are still marked ACTIVE. For each one, inserts a CLOSE_AUCTION
 * job into the jobs table for a worker to pick up.
 */
const runScheduler = async () => {
  try {
    const endedAuctions = await auctionModel.findEndedActive();

    if (endedAuctions.length === 0) return;

    console.log(`[Scheduler] Found ${endedAuctions.length} auction(s) to close.`);

    for (const auction of endedAuctions) {
      // Insert a job into the queue. Use ON CONFLICT DO NOTHING to prevent
      // duplicate jobs if the scheduler runs again before the worker picks it up.
      await pool.query(
        `INSERT INTO jobs (type, payload)
         VALUES ('CLOSE_AUCTION', $1)
         ON CONFLICT DO NOTHING`,
        [JSON.stringify({ auction_id: auction.id })]
      );
      console.log(`[Scheduler] Queued CLOSE_AUCTION job for auction: ${auction.id}`);
    }
  } catch (err) {
    console.error('[Scheduler] Error:', err.message);
  }
};

// Start polling every 30 seconds
const POLL_INTERVAL_MS = 30 * 1000;
console.log(`[Scheduler] Started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
setInterval(runScheduler, POLL_INTERVAL_MS);
runScheduler(); // Run immediately on startup too
