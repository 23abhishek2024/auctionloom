const pool = require('../db');
const auctionClosureService = require('../services/auctionClosureService');

/**
 * Job Worker — Phase 6 (Distributed Background Workers)
 *
 * Every 10 seconds it drains the queue: claims the oldest PENDING job, runs it, and repeats until
 * no job is left (at most MAX_JOBS_PER_TICK per tick). It used to take one job per 10 seconds, so
 * 100 auctions ending together needed over 16 minutes.
 * SELECT ... FOR UPDATE SKIP LOCKED lets several workers run in parallel without taking the same job.
 */
const POLL_INTERVAL_MS = 10 * 1000;
const MAX_JOBS_PER_TICK = 100;

// Claim the oldest pending job (committed right away, so other workers see it as taken). Null if none.
const claimNextJob = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // SKIP LOCKED is the key — if Worker 1 locks job A, Worker 2 instantly
    // skips it and grabs job B. No blocking, no duplicate processing.
    const result = await client.query(
      `SELECT * FROM jobs
       WHERE status = 'PENDING'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );

    const job = result.rows[0];
    if (!job) {
      await client.query('ROLLBACK');
      return null;
    }

    // Mark job as IN_PROGRESS and count the attempt (the scheduler's reaper uses both)
    await client.query(
      `UPDATE jobs SET status = 'IN_PROGRESS', locked_at = NOW(), locked_by = $1, attempts = attempts + 1, updated_at = NOW()
       WHERE id = $2`,
      [process.pid.toString(), job.id]
    );

    await client.query('COMMIT');
    return job;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[Worker ${process.pid}] Could not claim a job:`, err.message);
    return null;
  } finally {
    // The claim is committed, so give the connection back before doing the work
    client.release();
  }
};

// Run one claimed job and record the outcome
const runJob = async (job) => {
  console.log(`[Worker ${process.pid}] Processing job: ${job.type} (${job.id})`);
  try {
    if (job.type === 'CLOSE_AUCTION') {
      // Same closing function as the 15-second sweep and the lazy close:
      // it locks the row, re-checks status and end time, picks the winner,
      // records the 5% fee, auto-settles if the wallet covers it, and sends emails.
      await auctionClosureService.closeAuction(job.payload.auction_id);
    }

    await pool.query(`UPDATE jobs SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`, [job.id]);
    console.log(`[Worker ${process.pid}] Job completed: ${job.id}`);
  } catch (err) {
    // Mark the job FAILED so it can be inspected; the scheduler queues a new one later
    // (up to 3 failed jobs per auction), instead of leaving this one IN_PROGRESS forever.
    console.error(`[Worker ${process.pid}] Job ${job.id} failed:`, err.message);
    try {
      await pool.query(`UPDATE jobs SET status = 'FAILED', updated_at = NOW() WHERE id = $1`, [job.id]);
    } catch (markErr) {
      console.error(`[Worker ${process.pid}] Could not mark job ${job.id} as FAILED:`, markErr.message);
    }
  }
};

// Claim and run one job. Returns true if there was one.
const processNextJob = async () => {
  const job = await claimNextJob();
  if (!job) return false;
  await runJob(job);
  return true;
};

// Run jobs until the queue is empty (or MAX_JOBS_PER_TICK). A tick that starts while the previous
// one is still draining does nothing, so one process never runs two drain loops at once.
let draining = false;
const drainQueue = async () => {
  if (draining) return 0;
  draining = true;
  let done = 0;
  try {
    while (done < MAX_JOBS_PER_TICK && (await processNextJob())) done++;
  } finally {
    draining = false;
  }
  return done;
};

// Started as its own process (npm run worker). With --once it drains the queue once and exits
// (used by the test suite); required from another file it only exports the functions.
if (require.main === module) {
  if (process.argv.includes('--once')) {
    drainQueue()
      .then((n) => console.log(`[Worker ${process.pid}] One pass done: ${n} job(s) processed.`))
      .finally(() => pool.end().then(() => process.exit(0)));
  } else {
    console.log(`[Worker ${process.pid}] Started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
    setInterval(drainQueue, POLL_INTERVAL_MS);
    drainQueue(); // Run immediately on startup
  }
}

module.exports = { processNextJob, drainQueue };
