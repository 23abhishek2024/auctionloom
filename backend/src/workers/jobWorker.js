const pool = require('../db');
const auctionClosureService = require('../services/auctionClosureService');

/**
 * Job Worker — Phase 6 (Distributed Background Workers)
 *
 * Polls the jobs table every 10 seconds.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED so multiple workers
 * can run in parallel without processing the same job twice.
 */
const processNextJob = async () => {
  // ── 1. Claim one job ─────────────────────────────────────────────
  const client = await pool.connect();
  let job = null;

  try {
    await client.query('BEGIN');

    // SKIP LOCKED is the key — if Worker 1 locks job A, Worker 2 instantly
    // skips it and grabs job B. No blocking, no duplicate processing.
    const result = await client.query(
      `SELECT * FROM jobs
       WHERE status = 'PENDING'
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );

    job = result.rows[0];
    if (!job) {
      await client.query('ROLLBACK');
      return; // No pending jobs right now
    }

    // Mark job as IN_PROGRESS and count the attempt (the scheduler's reaper uses both)
    await client.query(
      `UPDATE jobs SET status = 'IN_PROGRESS', locked_at = NOW(), locked_by = $1, attempts = attempts + 1
       WHERE id = $2`,
      [process.pid.toString(), job.id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Worker ${process.pid}] Could not claim a job:`, err.message);
    return;
  } finally {
    // The claim is committed, so give the connection back before doing the work
    client.release();
  }

  // ── 2. Do the work ───────────────────────────────────────────────
  console.log(`[Worker ${process.pid}] Processing job: ${job.type} (${job.id})`);

  try {
    if (job.type === 'CLOSE_AUCTION') {
      // Same closing function as the 15-second sweep and the lazy close:
      // it locks the row, re-checks status and end time, picks the winner,
      // records the 5% fee, auto-settles if the wallet covers it, and sends emails.
      await auctionClosureService.closeAuction(job.payload.auction_id);
    }

    await pool.query(
      `UPDATE jobs SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
      [job.id]
    );
    console.log(`[Worker ${process.pid}] Job completed: ${job.id}`);
  } catch (err) {
    // Mark the job FAILED (using the job we claimed) so it can be inspected or retried,
    // instead of leaving it IN_PROGRESS forever.
    console.error(`[Worker ${process.pid}] Job ${job.id} failed:`, err.message);
    try {
      await pool.query(
        `UPDATE jobs SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
        [job.id]
      );
    } catch (markErr) {
      console.error(`[Worker ${process.pid}] Could not mark job ${job.id} as FAILED:`, markErr.message);
    }
  }
};

// Poll every 10 seconds
const POLL_INTERVAL_MS = 10 * 1000;
console.log(`[Worker ${process.pid}] Started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
setInterval(processNextJob, POLL_INTERVAL_MS);
processNextJob(); // Run immediately on startup
