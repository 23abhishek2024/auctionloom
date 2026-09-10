const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const bidModel = require('../models/bidModel');

/**
 * Job Worker — Phase 6 (Distributed Background Workers)
 *
 * Polls the jobs table every 10 seconds.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED so multiple workers
 * can run in parallel without processing the same job twice.
 */
const processNextJob = async () => {
  const client = await pool.connect();

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

    const job = result.rows[0];
    if (!job) {
      await client.query('ROLLBACK');
      return; // No pending jobs right now
    }

    // Mark job as IN_PROGRESS
    await client.query(
      `UPDATE jobs SET status = 'IN_PROGRESS', locked_at = NOW(), locked_by = $1
       WHERE id = $2`,
      [process.pid.toString(), job.id]
    );

    await client.query('COMMIT');

    console.log(`[Worker ${process.pid}] Processing job: ${job.type} (${job.id})`);

    // ── Process the job ─────────────────────────────────────────
    if (job.type === 'CLOSE_AUCTION') {
      await handleCloseAuction(job.payload.auction_id);
    }

    // Mark job as COMPLETED
    await pool.query(
      `UPDATE jobs SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
      [job.id]
    );
    console.log(`[Worker ${process.pid}] Job completed: ${job.id}`);
  } catch (err) {
    await client.query('ROLLBACK');
    // Mark job as FAILED so it can be retried or inspected
    if (err.jobId) {
      await pool.query(
        `UPDATE jobs SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
        [err.jobId]
      );
    }
    console.error(`[Worker ${process.pid}] Job error:`, err.message);
  } finally {
    client.release();
  }
};

/**
 * Handle the CLOSE_AUCTION job type:
 * 1. Find the highest bidder
 * 2. Mark the auction as CLOSED with the winner
 */
const handleCloseAuction = async (auctionId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const auction = await auctionModel.findByIdForUpdate(client, auctionId);
    if (!auction || auction.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return; // Already closed or doesn't exist
    }

    const highestBid = await bidModel.findHighestBid(client, auctionId);
    const winnerId = highestBid ? highestBid.bidder_id : null;

    await auctionModel.close(client, auctionId, winnerId);
    await client.query('COMMIT');

    console.log(
      `[Worker] Auction ${auctionId} closed. Winner: ${winnerId || 'No bids placed'}`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Poll every 10 seconds
const POLL_INTERVAL_MS = 10 * 1000;
console.log(`[Worker ${process.pid}] Started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
setInterval(processNextJob, POLL_INTERVAL_MS);
processNextJob(); // Run immediately on startup
