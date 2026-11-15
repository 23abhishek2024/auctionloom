const pool = require('../db');

/**
 * Report Service
 * Read-only numbers for the admin dashboard: platform metrics, the monthly revenue chart,
 * the per-auction commission ledger and the list of every commission payment.
 * (Turning these into CSV files is the controller's job.)
 */

/**
 * High-level platform health & financial metrics
 */
async function getPlatformMetrics() {
  // 1. Total platform volume (sum of winning bids on closed auctions)
  const volumeRes = await pool.query(`
    SELECT COALESCE(SUM(current_price), 0)::numeric AS total_volume,
           COUNT(id)::int AS settled_auctions
    FROM auctions
    WHERE status = 'CLOSED' AND winner_id IS NOT NULL
  `);

  // 2. Auction counts
  const auctionCountsRes = await pool.query(`
    SELECT
      COUNT(*)::int AS total_auctions,
      COUNT(CASE WHEN status = 'ACTIVE' AND end_time > NOW() THEN 1 END)::int AS active_auctions,
      COUNT(CASE WHEN status = 'CLOSED' THEN 1 END)::int AS closed_auctions
    FROM auctions
  `);

  // 3. User counts
  const userCountsRes = await pool.query(`
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(CASE WHEN role = 'admin' THEN 1 END)::int AS admin_count,
      COUNT(CASE WHEN role = 'auctioneer' THEN 1 END)::int AS auctioneer_count,
      COUNT(CASE WHEN role = 'bidder' THEN 1 END)::int AS bidder_count
    FROM users
  `);

  // 4. Commission metrics
  const commissionRes = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN commission_amount > 0 THEN commission_amount ELSE ROUND(current_price * 0.05, 2) END), 0)::numeric AS accrued_commission
    FROM auctions
    WHERE status = 'CLOSED' AND winner_id IS NOT NULL
  `);

  const collectedRes = await pool.query(`
    SELECT
      (
        COALESCE((SELECT SUM(COALESCE(NULLIF(commission_amount, 0), ROUND(current_price * 0.05, 2))) FROM auctions WHERE is_settled = TRUE), 0) +
        COALESCE((SELECT SUM(amount) FROM wallet_transactions WHERE type = 'COMMISSION' AND reference_type != 'AUCTION' AND status = 'COMPLETED'), 0) +
        COALESCE((SELECT SUM(amount) FROM commission_proofs WHERE status = 'APPROVED' AND (payment_method IS NULL OR payment_method = 'MANUAL_WIRE')), 0)
      )::numeric AS collected_commission
  `);

  const treasuryRes = await pool.query(`
    SELECT COALESCE(balance, 0)::numeric AS treasury_balance
    FROM wallets
    WHERE user_id = '00000000-0000-0000-0000-000000000000'
  `);

  const adminWalletRes = await pool.query(`
    SELECT w.balance, u.email
    FROM wallets w
    JOIN users u ON u.id = w.user_id
    WHERE u.role = 'admin' AND u.email != 'treasury@auctionloom.internal'
    ORDER BY u.created_at ASC
    LIMIT 1
  `);

  const pendingProofsRes = await pool.query(`
    SELECT COUNT(*)::int AS pending_proofs_count
    FROM commission_proofs
    WHERE status = 'PENDING'
  `);

  const totalBidsRes = await pool.query(`SELECT COUNT(*)::int AS total_bids FROM bids`);

  return {
    totalVolume: parseFloat(volumeRes.rows[0].total_volume || 0),
    settledAuctions: volumeRes.rows[0].settled_auctions || 0,
    totalAuctions: auctionCountsRes.rows[0].total_auctions || 0,
    activeAuctions: auctionCountsRes.rows[0].active_auctions || 0,
    closedAuctions: auctionCountsRes.rows[0].closed_auctions || 0,
    totalUsers: userCountsRes.rows[0].total_users || 0,
    userBreakdown: userCountsRes.rows[0],
    accruedCommission: parseFloat(commissionRes.rows[0].accrued_commission || 0),
    collectedCommission: parseFloat(collectedRes.rows[0].collected_commission || 0),
    treasuryBalance: parseFloat(treasuryRes.rows[0]?.treasury_balance || 0),
    adminWalletBalance: parseFloat(adminWalletRes.rows[0]?.balance || 0),
    adminEmail: adminWalletRes.rows[0]?.email || 'admin@gmail.com',
    pendingProofsCount: pendingProofsRes.rows[0].pending_proofs_count || 0,
    totalBids: totalBidsRes.rows[0].total_bids || 0,
  };
}

/**
 * Monthly gross volume and platform commission (last 12 months with sales), for the chart.
 * With no sales yet it returns sample months, so the chart has something to preview.
 */
async function getRevenueChart() {
  const result = await pool.query(`
    SELECT
      TO_CHAR(created_at, 'Mon YYYY') AS month_label,
      DATE_TRUNC('month', created_at) AS month_date,
      COUNT(id)::int AS auction_count,
      COALESCE(SUM(current_price), 0)::numeric AS gross_volume,
      COALESCE(SUM(CASE WHEN commission_amount > 0 THEN commission_amount ELSE ROUND(current_price * 0.05, 2) END), 0)::numeric AS platform_commission
    FROM auctions
    WHERE status = 'CLOSED' AND winner_id IS NOT NULL
    GROUP BY DATE_TRUNC('month', created_at), TO_CHAR(created_at, 'Mon YYYY')
    ORDER BY month_date ASC
    LIMIT 12
  `);

  let chartData = result.rows;
  if (chartData.length === 0) {
    const months = ['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'];
    chartData = months.map((m, idx) => ({
      month_label: m,
      auction_count: (idx + 1) * 3,
      gross_volume: (idx + 1) * 2400,
      platform_commission: (idx + 1) * 120,
    }));
  }

  return chartData.map((d) => ({
    month: d.month_label,
    grossVolume: parseFloat(d.gross_volume),
    commission: parseFloat(d.platform_commission),
    auctionsCount: d.auction_count,
  }));
}

/**
 * Per-auction commission ledger: every settled auction with its hammer price, seller, winner and 5% fee.
 * Filters: search (title, seller or winner name/email), from / to (dates of settlement).
 * - groupBySeller: one row per seller with their totals → { grouped: true, rows }
 * - otherwise one page of auctions (limit, offset) → { rows, total, summary }
 *   (the summary covers all settled auctions, ignoring the filters and the page)
 */
async function getCommissionLedger({ search, from, to, groupBySeller, limit, offset }) {
  const conditions = [`a.is_settled = TRUE`, `a.winner_id IS NOT NULL`];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(
      `(a.title ILIKE $${idx} OR seller.name ILIKE $${idx} OR seller.email ILIKE $${idx} OR winner.name ILIKE $${idx} OR winner.email ILIKE $${idx})`
    );
  }
  if (from) {
    params.push(from);
    conditions.push(`COALESCE(a.settled_at, a.updated_at, a.created_at) >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`COALESCE(a.settled_at, a.updated_at, a.created_at) <= ($${params.length}::date + INTERVAL '1 day')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  if (groupBySeller) {
    // Group by seller — aggregate total commission per seller
    const groupRes = await pool.query(
      `SELECT
         seller.id            AS seller_id,
         COALESCE(seller.name, seller.email) AS seller_name,
         seller.email         AS seller_email,
         COUNT(a.id)::int     AS auctions_count,
         SUM(COALESCE(NULLIF(a.commission_amount, 0), ROUND(a.current_price * 0.05, 2)))::numeric AS total_commission,
         SUM(a.current_price)::numeric     AS total_volume,
         MIN(COALESCE(a.settled_at, a.updated_at, a.created_at)) AS first_settlement,
         MAX(COALESCE(a.settled_at, a.updated_at, a.created_at)) AS last_settlement
       FROM auctions a
       JOIN users seller ON seller.id = a.seller_id
       JOIN users winner ON winner.id = a.winner_id
       ${where}
       GROUP BY seller.id, seller.name, seller.email
       ORDER BY total_commission DESC`,
      params
    );

    const rows = groupRes.rows.map((r) => ({
      sellerId: r.seller_id,
      sellerName: r.seller_name,
      sellerEmail: r.seller_email,
      auctionsCount: r.auctions_count,
      totalCommission: parseFloat(r.total_commission || 0),
      totalVolume: parseFloat(r.total_volume || 0),
      firstSettlement: r.first_settlement,
      lastSettlement: r.last_settlement,
    }));
    return { grouped: true, rows };
  }

  // Per-auction mode (default)
  const [dataRes, countRes, summaryRes] = await Promise.all([
    pool.query(
      `SELECT
         a.id                  AS auction_id,
         a.title               AS auction_title,
         a.current_price       AS hammer_price,
         COALESCE(NULLIF(a.commission_amount, 0), ROUND(a.current_price * 0.05, 2)) AS commission,
         COALESCE(a.settled_at, a.updated_at, a.created_at) AS settled_at,
         COALESCE(seller.name, seller.email) AS seller_name,
         seller.email          AS seller_email,
         COALESCE(winner.name, winner.email) AS winner_name,
         winner.email          AS winner_email
       FROM auctions a
       JOIN users seller ON seller.id = a.seller_id
       JOIN users winner ON winner.id = a.winner_id
       ${where}
       ORDER BY COALESCE(a.settled_at, a.updated_at, a.created_at) DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM auctions a
       JOIN users seller ON seller.id = a.seller_id
       JOIN users winner ON winner.id = a.winner_id
       ${where}`,
      params
    ),
    // Global summary (ignoring pagination/search filters)
    pool.query(`
      SELECT
        COALESCE(SUM(COALESCE(NULLIF(commission_amount, 0), ROUND(current_price * 0.05, 2))), 0)::numeric AS total_commission,
        COALESCE(SUM(CASE WHEN COALESCE(settled_at, updated_at, created_at) >= date_trunc('month', NOW()) THEN COALESCE(NULLIF(commission_amount, 0), ROUND(current_price * 0.05, 2)) ELSE 0 END), 0)::numeric AS month_commission,
        COUNT(*)::int AS total_auctions,
        COALESCE(AVG(COALESCE(NULLIF(commission_amount, 0), ROUND(current_price * 0.05, 2))), 0)::numeric AS avg_commission
      FROM auctions
      WHERE is_settled = TRUE AND winner_id IS NOT NULL
    `),
  ]);

  const summary = summaryRes.rows[0];
  return {
    grouped: false,
    rows: dataRes.rows.map((r) => ({
      auctionId: r.auction_id,
      auctionTitle: r.auction_title,
      hammerPrice: parseFloat(r.hammer_price || 0),
      commission: parseFloat(r.commission || 0),
      settledAt: r.settled_at,
      sellerName: r.seller_name,
      sellerEmail: r.seller_email,
      winnerName: r.winner_name,
      winnerEmail: r.winner_email,
    })),
    total: countRes.rows[0].total,
    summary: {
      totalCommission: parseFloat(summary.total_commission),
      monthCommission: parseFloat(summary.month_commission),
      totalAuctions: summary.total_auctions,
      avgCommission: parseFloat(summary.avg_commission),
    },
  };
}

// Every commission payment, from three sources, as one list:
//  1. COMMISSION entries in wallets (the auction escrow fee, or a seller paying from their wallet)
//  2. settled auctions from before the wallet ledger existed (no ledger row for them)
//  3. approved bank-transfer receipts
// The treasury's own wallet is left out, so a fee is not counted twice.
const UNIFIED_COMMISSIONS_FULL = `
  WITH unified_commissions AS (
    SELECT
      wt.id::text AS id,
      wt.created_at AS date,
      CASE
        WHEN wt.reference_type = 'AUCTION' THEN 'AUCTION_ESCROW'
        ELSE 'WALLET_DIRECT'
      END AS type,
      wt.amount::numeric AS commission,
      COALESCE((wt.metadata->>'hammerPrice')::numeric, a.current_price, (wt.amount * 20))::numeric AS gross_amount,
      COALESCE(wt.metadata->>'auctionTitle', a.title, 'Direct Wallet Commission Payment') AS auction_title,
      a.id::text AS auction_id,
      COALESCE(seller.name, split_part(seller.email, '@', 1), payer.name, split_part(payer.email, '@', 1), 'Seller') AS seller_name,
      COALESCE(seller.email, payer.email) AS seller_email,
      COALESCE(winner.name, split_part(winner.email, '@', 1), 'Buyer') AS winner_name,
      winner.email AS winner_email,
      'WALLET' AS method,
      wt.status AS status
    FROM wallet_transactions wt
    LEFT JOIN wallets w ON w.id = wt.wallet_id
    LEFT JOIN users payer ON payer.id = w.user_id
    LEFT JOIN auctions a ON a.id = wt.reference_id
    LEFT JOIN users seller ON seller.id = a.seller_id
    LEFT JOIN users winner ON winner.id = a.winner_id
    WHERE wt.type = 'COMMISSION' AND w.user_id != '00000000-0000-0000-0000-000000000000'

    UNION ALL

    SELECT
      a.id::text AS id,
      COALESCE(a.settled_at, a.updated_at, a.created_at) AS date,
      'AUCTION_ESCROW' AS type,
      COALESCE(NULLIF(a.commission_amount, 0), ROUND(a.current_price * 0.05, 2))::numeric AS commission,
      a.current_price::numeric AS gross_amount,
      a.title AS auction_title,
      a.id::text AS auction_id,
      COALESCE(seller.name, split_part(seller.email, '@', 1), 'Seller') AS seller_name,
      seller.email AS seller_email,
      COALESCE(winner.name, split_part(winner.email, '@', 1), 'Buyer') AS winner_name,
      winner.email AS winner_email,
      'PLATFORM_ESCROW' AS method,
      'COMPLETED' AS status
    FROM auctions a
    JOIN users seller ON seller.id = a.seller_id
    JOIN users winner ON winner.id = a.winner_id
    WHERE a.is_settled = TRUE
      AND a.id NOT IN (SELECT reference_id FROM wallet_transactions WHERE reference_type = 'AUCTION' AND reference_id IS NOT NULL)

    UNION ALL

    SELECT
      p.id::text AS id,
      p.created_at AS date,
      'MANUAL_WIRE' AS type,
      p.amount::numeric AS commission,
      (p.amount * 20)::numeric AS gross_amount,
      COALESCE(p.comment, 'Bank Wire Commission Receipt') AS auction_title,
      NULL AS auction_id,
      COALESCE(u.name, split_part(u.email, '@', 1), 'Seller') AS seller_name,
      u.email AS seller_email,
      '—' AS winner_name,
      NULL AS winner_email,
      'MANUAL_WIRE' AS method,
      p.status AS status
    FROM commission_proofs p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'APPROVED' AND (p.payment_method IS NULL OR p.payment_method = 'MANUAL_WIRE')
  )
  SELECT * FROM unified_commissions
`;

/**
 * One page of the unified commission list, newest first, with totals.
 * Filters: type (AUCTION_ESCROW, WALLET_DIRECT or MANUAL_WIRE; anything else means all),
 * search (title, seller or winner name/email), from / to (dates).
 * Returns { summary, transactions, total } (the summary ignores the filters).
 */
async function getCommissionTransactions({ type, search, from, to, limit, offset }) {
  const conditions = [];
  const params = [];

  if (type !== 'ALL' && ['AUCTION_ESCROW', 'WALLET_DIRECT', 'MANUAL_WIRE'].includes(type)) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(`(auction_title ILIKE $${idx} OR seller_name ILIKE $${idx} OR seller_email ILIKE $${idx} OR winner_name ILIKE $${idx} OR winner_email ILIKE $${idx})`);
  }

  if (from) {
    params.push(from);
    conditions.push(`date >= $${params.length}::date`);
  }

  if (to) {
    params.push(to);
    conditions.push(`date <= ($${params.length}::date + INTERVAL '1 day')`);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  // Summary query
  const summaryRes = await pool.query(`
    WITH unified_commissions AS (
      SELECT
        wt.id::text AS id,
        wt.created_at AS date,
        wt.amount::numeric AS commission
      FROM wallet_transactions wt
      JOIN wallets w ON w.id = wt.wallet_id
      WHERE wt.type = 'COMMISSION' AND w.user_id != '00000000-0000-0000-0000-000000000000'

      UNION ALL

      SELECT
        a.id::text AS id,
        COALESCE(a.settled_at, a.updated_at, a.created_at) AS date,
        COALESCE(NULLIF(a.commission_amount, 0), ROUND(a.current_price * 0.05, 2))::numeric AS commission
      FROM auctions a
      WHERE a.is_settled = TRUE
        AND a.id NOT IN (SELECT reference_id FROM wallet_transactions WHERE reference_type = 'AUCTION' AND reference_id IS NOT NULL)

      UNION ALL

      SELECT
        p.id::text AS id,
        p.created_at AS date,
        p.amount::numeric AS commission
      FROM commission_proofs p
      WHERE p.status = 'APPROVED' AND (p.payment_method IS NULL OR p.payment_method = 'MANUAL_WIRE')
    )
    SELECT
      COALESCE(SUM(commission), 0)::numeric AS total_commission,
      COUNT(*)::int AS total_transactions,
      COALESCE((SELECT balance FROM wallets WHERE user_id = '00000000-0000-0000-0000-000000000000'), 0)::numeric AS treasury_balance
    FROM unified_commissions
  `);

  // Count query (the filters can use any column of the unified list)
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM (${UNIFIED_COMMISSIONS_FULL}) unified ${whereClause}`,
    params
  );

  // Data query
  const dataRes = await pool.query(
    `${UNIFIED_COMMISSIONS_FULL} ${whereClause} ORDER BY date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const summary = summaryRes.rows[0];
  return {
    summary: {
      totalCommission: parseFloat(summary.total_commission),
      totalTransactions: summary.total_transactions,
      treasuryBalance: parseFloat(summary.treasury_balance),
    },
    transactions: dataRes.rows.map((r) => ({
      id: r.id,
      date: r.date,
      type: r.type,
      commission: parseFloat(r.commission || 0),
      grossAmount: parseFloat(r.gross_amount || 0),
      auctionTitle: r.auction_title,
      auctionId: r.auction_id,
      sellerName: r.seller_name,
      sellerEmail: r.seller_email,
      winnerName: r.winner_name,
      winnerEmail: r.winner_email,
      method: r.method,
      status: r.status,
    })),
    total: countRes.rows[0].total,
  };
}

module.exports = {
  getPlatformMetrics,
  getRevenueChart,
  getCommissionLedger,
  getCommissionTransactions,
};
