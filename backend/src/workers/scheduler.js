const pool = require('../db');
const auctionModel = require('../models/auctionModel');

// A worker commits its claim before doing the work, so if it crashes mid-job the job would stay
// IN_PROGRESS forever. The reaper hands such jobs back to the queue (closing is idempotent, so
// running a job twice is safe). After MAX_ATTEMPTS claims it gives up and marks the job FAILED,
// so one job that keeps crashing workers can't loop forever.
const STUCK_AFTER_MINUTES = 5;
const MAX_ATTEMPTS = 3;

const reapStuckJobs = async () => {
  const result = await pool.query(
    `UPDATE jobs
     SET status = CASE WHEN attempts >= $1::int THEN 'FAILED' ELSE 'PENDING' END,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = NOW()
     WHERE status = 'IN_PROGRESS'
       AND locked_at < NOW() - ($2::int * INTERVAL '1 minute')
     RETURNING id, status, attempts`,
    [MAX_ATTEMPTS, STUCK_AFTER_MINUTES]
  );
  for (const job of result.rows) {
    console.warn(`[Scheduler] Job ${job.id} was stuck IN_PROGRESS; set to ${job.status} after ${job.attempts} claim(s).`);
  }
};

/**
 * Auction Scheduler — Phase 6 (Distributed Background Workers)
 *
 * Runs every 30 seconds. First hands stuck jobs back to the queue (see above).
 * Then finds auctions that have expired but are still marked ACTIVE, and for
 * each one inserts a CLOSE_AUCTION job into the jobs table for a worker to pick up.
 */
const runScheduler = async () => {
  try {
    await reapStuckJobs();

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
