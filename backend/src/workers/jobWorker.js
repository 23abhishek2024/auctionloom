const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const bidModel = require('../models/bidModel');
const emailService = require('../services/emailService');

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

    // 1. Close auction and record winner
    await auctionModel.close(client, auctionId, winnerId);

    // 2. If auction concluded with a winner, calculate 5% platform commission (Piyush Garg / Sachin Reference)
    if (winnerId && highestBid) {
      const commission = parseFloat((highestBid.amount * 0.05).toFixed(2));
      await client.query(
        `UPDATE auctions 
         SET commission_amount = $1, commission_calculated = TRUE 
         WHERE id = $2`,
        [commission, auctionId]
      );

      console.log(`[Worker] Recorded $${commission} (5% platform commission) on Lot ${auctionId} for escrow settlement`);
    }

    await client.query('COMMIT');

    console.log(
      `[Worker] Auction ${auctionId} closed. Winner: ${winnerId || 'No bids placed'}`
    );

    // 3. Dispatch Winner & Seller Transactional Notifications via EmailService
    if (winnerId && highestBid) {
      try {
        const winnerRes = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [winnerId]);
        const sellerRes = await pool.query('SELECT id, name, email, payout_methods FROM users WHERE id = $1', [auction.seller_id]);
        const winner = winnerRes.rows[0];
        const seller = sellerRes.rows[0];

        if (winner && seller) {
          const emailResult = await emailService.sendAuctionWonNotification({
            winnerEmail: winner.email,
            winnerName: winner.name || winner.email.split('@')[0],
            auction: {
              id: auctionId,
              title: auction.title,
              current_price: highestBid.amount,
            },
            seller: {
              name: seller.name || seller.email.split('@')[0],
              email: seller.email,
              payout_methods: seller.payout_methods || {},
            },
            hammerPrice: highestBid.amount,
          });

          if (emailResult && emailResult.previewUrl) {
            await pool.query(
              'UPDATE auctions SET winner_email_preview_url = $1 WHERE id = $2',
              [emailResult.previewUrl, auctionId]
            );
            console.log(`[Worker] ✉️ Stored Ethereal email preview URL for auction ${auctionId}`);
          }

          // Also notify seller
          await emailService.sendAuctionSoldNotification({
            sellerEmail: seller.email,
            sellerName: seller.name || seller.email.split('@')[0],
            auction: {
              id: auctionId,
              title: auction.title,
              current_price: highestBid.amount,
            },
            winner: {
              name: winner.name || winner.email.split('@')[0],
              email: winner.email,
            },
            hammerPrice: highestBid.amount,
          });
        }
      } catch (emailErr) {
        console.error('[Worker] ⚠️ Transactional email notification failed non-critically:', emailErr.message);
      }
    }

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
