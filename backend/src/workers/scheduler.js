const pool = require('../db');

// A worker commits its claim before doing the work, so if it crashes mid-job the job would stay
// IN_PROGRESS forever. The reaper hands such jobs back to the queue (closing is idempotent, so
// running a job twice is safe). After MAX_ATTEMPTS claims it gives up and marks the job FAILED,
// so one job that keeps crashing workers can't loop forever.
const STUCK_AFTER_MINUTES = 5;
const MAX_ATTEMPTS = 3;
// An auction whose close job has FAILED this many times is not queued again (it needs a human)
const MAX_FAILED_JOBS_PER_AUCTION = 3;

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
 * Queue one CLOSE_AUCTION job for every auction that has ended but is still ACTIVE, in one statement.
 * The unique index unique_open_job (type, payload) WHERE status IN ('PENDING', 'IN_PROGRESS') makes
 * ON CONFLICT DO NOTHING skip auctions that already have an open job. Finished (COMPLETED or FAILED)
 * jobs don't block a new one, so a republished auction gets a fresh close job when its new end time
 * passes, and a failed close is retried, up to MAX_FAILED_JOBS_PER_AUCTION times.
 * Returns the ids of the auctions that got a job.
 */
const queueEndedAuctions = async () => {
  const result = await pool.query(
    `INSERT INTO jobs (type, payload)
     SELECT 'CLOSE_AUCTION', jsonb_build_object('auction_id', a.id)
     FROM auctions a
     WHERE a.status = 'ACTIVE'
       AND a.end_time <= NOW()
       AND (SELECT COUNT(*) FROM jobs j
            WHERE j.type = 'CLOSE_AUCTION' AND j.payload->>'auction_id' = a.id::text AND j.status = 'FAILED') < $1
     ON CONFLICT DO NOTHING
     RETURNING payload->>'auction_id' AS auction_id`,
    [MAX_FAILED_JOBS_PER_AUCTION]
  );
  return result.rows.map((r) => r.auction_id);
};

/**
 * Auction Scheduler — Phase 6 (Distributed Background Workers)
 *
 * Runs every 30 seconds. First hands stuck jobs back to the queue (see above),
 * then queues a CLOSE_AUCTION job for each auction that has expired but is still ACTIVE.
 */
const runScheduler = async () => {
  try {
    await reapStuckJobs();
    const queued = await queueEndedAuctions();
    for (const auctionId of queued) {
      console.log(`[Scheduler] Queued CLOSE_AUCTION job for auction: ${auctionId}`);
    }
    return queued.length;
  } catch (err) {
    console.error('[Scheduler] Error:', err.message);
    return 0;
  }
};

const POLL_INTERVAL_MS = 30 * 1000;

// Started as its own process (npm run scheduler). With --once it runs a single pass and exits
// (used by the test suite); required from another file it only exports the functions.
if (require.main === module) {
  if (process.argv.includes('--once')) {
    runScheduler()
      .then((n) => console.log(`[Scheduler] One pass done: ${n} job(s) queued.`))
      .finally(() => pool.end().then(() => process.exit(0)));
  } else {
    console.log(`[Scheduler] Started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
    setInterval(runScheduler, POLL_INTERVAL_MS);
    runScheduler(); // Run immediately on startup too
  }
}

module.exports = { runScheduler, queueEndedAuctions, reapStuckJobs };
