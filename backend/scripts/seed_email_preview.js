const pool = require('../src/db');
const emailService = require('../src/services/emailService');

async function seedClosedAuctions() {
  const auctionsRes = await pool.query(
    `SELECT id, title, current_price, seller_id, winner_id 
     FROM auctions 
     WHERE status = 'CLOSED' AND winner_id IS NOT NULL 
     LIMIT 5`
  );

  console.log(`Processing ${auctionsRes.rows.length} closed auctions...`);

  for (const a of auctionsRes.rows) {
    const winnerRes = await pool.query('SELECT name, email FROM users WHERE id = $1', [a.winner_id]);
    const sellerRes = await pool.query('SELECT name, email, payout_methods FROM users WHERE id = $1', [a.seller_id]);
    const winner = winnerRes.rows[0] || { name: 'Winner', email: 'test1@gmail.com' };
    const seller = sellerRes.rows[0] || { name: 'Seller', email: 'test5@gmail.com', payout_methods: {} };

    console.log(`Generating email preview for "${a.title}"...`);
    const emailRes = await emailService.sendAuctionWonNotification({
      winnerEmail: winner.email,
      winnerName: winner.name || winner.email.split('@')[0],
      auction: a,
      seller: {
        name: seller.name || seller.email.split('@')[0],
        email: seller.email,
        payout_methods: seller.payout_methods || {},
      },
      hammerPrice: a.current_price,
    });

    if (emailRes && emailRes.previewUrl) {
      await pool.query(
        'UPDATE auctions SET winner_email_preview_url = $1 WHERE id = $2',
        [emailRes.previewUrl, a.id]
      );
      console.log(`  ✅ Successfully updated auction ${a.id} with preview: ${emailRes.previewUrl}`);
    }
  }

  await pool.end();
}

seedClosedAuctions().catch(err => {
  console.error('Error:', err);
  pool.end();
});
