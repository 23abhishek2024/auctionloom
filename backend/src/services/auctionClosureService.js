const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const bidModel = require('../models/bidModel');
const emailService = require('./emailService');

/**
 * Auction Closure Service
 * Provides atomic, just-in-time and worker-driven auction lot closure.
 */
async function closeAuction(auctionId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const auction = await auctionModel.findByIdForUpdate(client, auctionId);
    if (!auction) {
      await client.query('ROLLBACK');
      return null;
    }

    // If already closed, return existing state
    if (auction.status === 'CLOSED') {
      await client.query('ROLLBACK');
      return auction;
    }

    // Determine highest winning bid
    const highestBid = await bidModel.findHighestBid(client, auctionId);
    const winnerId = highestBid ? highestBid.bidder_id : null;

    // 1. Close auction and set winner
    const closedAuction = await auctionModel.close(client, auctionId, winnerId);

    // 2. If auction concluded with a winner, calculate 5% platform fee
    if (winnerId && highestBid) {
      const commission = parseFloat((highestBid.amount * 0.05).toFixed(2));
      await client.query(
        `UPDATE auctions 
         SET commission_amount = $1, commission_calculated = TRUE 
         WHERE id = $2`,
        [commission, auctionId]
      );

      console.log(`[AuctionClosure] Lot ${auctionId} closed. Winner: ${winnerId}, 5% Platform Fee: $${commission} (recorded for escrow settlement)`);
    } else {
      console.log(`[AuctionClosure] Lot ${auctionId} closed with no bids placed.`);
    }

    await client.query('COMMIT');

    // 2b. Attempt immediate auto-settlement if winner has sufficient wallet balance
    if (winnerId && highestBid) {
      try {
        const walletService = require('./walletService');
        const winnerWallet = await walletService.getOrCreateWallet(winnerId);
        if (parseFloat(winnerWallet.balance) >= parseFloat(highestBid.amount)) {
          console.log(`[AuctionClosure] ⚡ Auto-settling lot ${auctionId} from winner's wallet ($${winnerWallet.balance} >= $${highestBid.amount})...`);
          await walletService.settleLotEscrow({
            auctionId,
            winnerId,
            sellerId: auction.seller_id,
            hammerPrice: highestBid.amount,
            idempotencyPrefix: 'auto_settle',
          });
          console.log(`[AuctionClosure] ✅ Lot ${auctionId} successfully auto-settled! Winner debited, seller credited (+95%), admin credited (+5%).`);
        } else {
          console.log(`[AuctionClosure] Winner wallet ($${winnerWallet.balance}) below hammer price ($${highestBid.amount}). Awaiting manual settlement.`);
        }
      } catch (settleErr) {
        console.warn(`[AuctionClosure] Auto-settle note for lot ${auctionId}:`, settleErr.message);
      }
    }

    // 3. Dispatch transactional emails non-critically
    if (winnerId && highestBid) {
      Promise.resolve().then(async () => {
        try {
          const winnerRes = await pool.query('SELECT * FROM users WHERE id = $1', [winnerId]);
          const sellerRes = await pool.query('SELECT * FROM users WHERE id = $1', [auction.seller_id]);
          const winner = winnerRes.rows[0];
          const seller = sellerRes.rows[0];

          if (winner && seller) {
            const winnerResult = await emailService.sendAuctionWonNotification({
              winnerEmail: winner.email,
              winnerName: winner.name || winner.email.split('@')[0],
              auction: {
                id: auctionId,
                title: auction.title,
                current_price: highestBid.amount,
                seller_id: auction.seller_id,
              },
              seller,
              hammerPrice: highestBid.amount,
            });

            if (winnerResult?.previewUrl) {
              await pool.query(
                `UPDATE auctions SET winner_email_preview_url = $1 WHERE id = $2`,
                [winnerResult.previewUrl, auctionId]
              );
            }

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
        } catch (mailErr) {
          console.warn('[AuctionClosure] Email dispatch notification non-critical notice:', mailErr.message);
        }
      });
    }

    return { ...closedAuction, winner_id: winnerId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check and close any auctions whose end_time has passed but are still ACTIVE
 */
async function closeExpiredAuctions() {
  try {
    const expired = await auctionModel.findEndedActive();
    if (!expired || expired.length === 0) return 0;

    let count = 0;
    for (const a of expired) {
      try {
        await closeAuction(a.id);
        count++;
      } catch (err) {
        console.error(`[AuctionClosure] Failed to auto-close auction ${a.id}:`, err.message);
      }
    }
    return count;
  } catch (err) {
    console.error('[AuctionClosure] Error checking expired auctions:', err.message);
    return 0;
  }
}

module.exports = {
  closeAuction,
  closeExpiredAuctions,
};
