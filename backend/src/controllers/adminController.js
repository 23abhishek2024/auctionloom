const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const { isUUID } = require('../utils/validators');
const { getIO } = require('../services/socketService');

/**
 * GET /api/admin/metrics
 * Returns high-level platform health & financial metrics
 */
const getAdminMetrics = async (req, res, next) => {
  try {
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
        COALESCE(SUM(commission_amount), 0)::numeric AS accrued_commission
      FROM auctions
      WHERE commission_calculated = TRUE
    `);

    const collectedRes = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0)::numeric AS collected_commission
      FROM commission_proofs
      WHERE status = 'APPROVED'
    `);

    const pendingProofsRes = await pool.query(`
      SELECT COUNT(*)::int AS pending_proofs_count
      FROM commission_proofs
      WHERE status = 'PENDING'
    `);

    const totalBidsRes = await pool.query(`SELECT COUNT(*)::int AS total_bids FROM bids`);

    res.json({
      metrics: {
        totalVolume: parseFloat(volumeRes.rows[0].total_volume || 0),
        settledAuctions: volumeRes.rows[0].settled_auctions || 0,
        totalAuctions: auctionCountsRes.rows[0].total_auctions || 0,
        activeAuctions: auctionCountsRes.rows[0].active_auctions || 0,
        closedAuctions: auctionCountsRes.rows[0].closed_auctions || 0,
        totalUsers: userCountsRes.rows[0].total_users || 0,
        userBreakdown: userCountsRes.rows[0],
        accruedCommission: parseFloat(commissionRes.rows[0].accrued_commission || 0),
        collectedCommission: parseFloat(collectedRes.rows[0].collected_commission || 0),
        pendingProofsCount: pendingProofsRes.rows[0].pending_proofs_count || 0,
        totalBids: totalBidsRes.rows[0].total_bids || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/revenue-chart
 * Returns monthly gross volume and platform commission breakdown for charts
 */
const getRevenueChart = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(created_at, 'Mon YYYY') AS month_label,
        DATE_TRUNC('month', created_at) AS month_date,
        COUNT(id)::int AS auction_count,
        COALESCE(SUM(current_price), 0)::numeric AS gross_volume,
        COALESCE(SUM(commission_amount), 0)::numeric AS platform_commission
      FROM auctions
      WHERE status = 'CLOSED' AND winner_id IS NOT NULL
      GROUP BY DATE_TRUNC('month', created_at), TO_CHAR(created_at, 'Mon YYYY')
      ORDER BY month_date ASC
      LIMIT 12
    `);

    // If no closed auctions with winners exist yet, return sample months for chart visual preview
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

    res.json({
      chartData: chartData.map(d => ({
        month: d.month_label,
        grossVolume: parseFloat(d.gross_volume),
        commission: parseFloat(d.platform_commission),
        auctionsCount: d.auction_count,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/users
 * Returns list of all registered users with their platform statistics
 */
const getAllUsers = async (req, res, next) => {
  try {
    const search = req.query.search ? `%${req.query.search.trim()}%` : null;
    let query = `
      SELECT 
        u.id, 
        u.email, 
        COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS name,
        u.role, 
        u.unpaid_commission::numeric AS unpaid_commission, 
        u.created_at,
        COUNT(DISTINCT a.id)::int AS listings_count,
        COUNT(DISTINCT b.id)::int AS total_bids,
        COUNT(DISTINCT w.id)::int AS auctions_won,
        COALESCE(SUM(b.amount), 0)::numeric AS total_spent
      FROM users u
      LEFT JOIN auctions a ON a.seller_id = u.id
      LEFT JOIN bids b ON b.bidder_id = u.id
      LEFT JOIN auctions w ON w.winner_id = u.id AND w.status = 'CLOSED'
    `;
    const params = [];

    if (search) {
      params.push(search);
      query += ` WHERE u.email ILIKE $1 OR u.name ILIKE $1 `;
    }

    query += `
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query, params);
    res.json({
      users: result.rows.map(u => ({
        ...u,
        unpaid_commission: parseFloat(u.unpaid_commission || 0),
        total_spent: parseFloat(u.total_spent || 0),
      })),
      count: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/users/:id/role
 * Admin updates user role (admin, auctioneer, bidder)
 */
const updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'auctioneer', 'bidder'].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be 'admin', 'auctioneer', or 'bidder'." });
    }

    const result = await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role`,
      [role, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      message: `User role successfully updated to ${role}.`,
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/admin/auctions/:id
 * Force delete an auction by Super Admin (override capability)
 */
const forceDeleteAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) {
      return res.status(400).json({ error: 'Invalid auction ID format.' });
    }

    // Explicitly cleanup associated jobs and bids
    await pool.query(`DELETE FROM jobs WHERE payload->>'auction_id' = $1`, [id]);
    await pool.query(`DELETE FROM bids WHERE auction_id = $1`, [id]);

    const result = await pool.query(`DELETE FROM auctions WHERE id = $1 RETURNING *`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Auction not found.' });
    }

    res.json({ message: 'Auction forcefully deleted by Super Admin.', deleted: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/auctions/:id/status
 * Moderate auction status: RESTRICTED, ACTIVE, CLOSED
 */
const updateAuctionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!isUUID(id)) {
      return res.status(400).json({ error: 'Invalid auction ID format.' });
    }

    if (!status || !['ACTIVE', 'CLOSED', 'RESTRICTED'].includes(status.toUpperCase())) {
      return res.status(400).json({
        error: "Status must be one of 'ACTIVE', 'CLOSED', or 'RESTRICTED'.",
      });
    }

    const normalizedStatus = status.toUpperCase();
    const updated = await auctionModel.updateStatus(id, normalizedStatus);

    if (!updated) {
      return res.status(404).json({ error: 'Auction not found.' });
    }

    // Real-time broadcast to room so all clients update live
    try {
      const io = getIO();
      io.to(id).emit('AUCTION_STATUS_CHANGED', {
        auction_id: id,
        status: normalizedStatus,
        reason: reason || (normalizedStatus === 'RESTRICTED' ? 'Administrative hold applied.' : 'Restriction lifted.'),
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    res.json({
      message: `Auction status successfully updated to ${normalizedStatus}.`,
      auction: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/commission-proofs
 * Returns payment proofs filtered by status (PENDING, APPROVED, REJECTED)
 */
const getAllPaymentProofs = async (req, res, next) => {
  try {
    const status = req.query.status;
    let query = `
      SELECT p.*, 
             u.email AS user_email, 
             COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS user_name,
             u.unpaid_commission::numeric AS user_unpaid_commission
      FROM commission_proofs p
      JOIN users u ON p.user_id = u.id
    `;
    const params = [];

    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      params.push(status.toUpperCase());
      query += ` WHERE p.status = $1 `;
    }

    query += ` ORDER BY p.created_at DESC `;

    const result = await pool.query(query, params);
    res.json({
      proofs: result.rows.map(p => ({
        ...p,
        amount: parseFloat(p.amount),
        user_unpaid_commission: parseFloat(p.user_unpaid_commission || 0),
      })),
      count: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/commission-proofs/:id/status
 * Updates status of proof (APPROVED / REJECTED) and adjusts seller's unpaid_commission
 */
const updatePaymentProofStatus = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'APPROVED' or 'REJECTED'." });
    }

    await client.query('BEGIN');

    const proofRes = await client.query(`SELECT * FROM commission_proofs WHERE id = $1 FOR UPDATE`, [id]);
    if (proofRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Commission proof not found.' });
    }

    const proof = proofRes.rows[0];
    const previousStatus = proof.status;

    // Update proof status
    const updatedProofRes = await client.query(
      `UPDATE commission_proofs 
       SET status = $1, admin_notes = COALESCE($2, admin_notes), updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [status, admin_notes || null, id]
    );

    // If approving now (and was not previously approved), decrement seller's unpaid commission
    if (status === 'APPROVED' && previousStatus !== 'APPROVED') {
      await client.query(
        `UPDATE users 
         SET unpaid_commission = GREATEST(0.00, unpaid_commission - $1) 
         WHERE id = $2`,
        [proof.amount, proof.user_id]
      );
    } else if (status === 'REJECTED' && previousStatus === 'APPROVED') {
      // Revert if previously approved but now rejected
      await client.query(
        `UPDATE users 
         SET unpaid_commission = unpaid_commission + $1 
         WHERE id = $2`,
        [proof.amount, proof.user_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: `Payment proof status successfully updated to ${status}.`,
      proof: updatedProofRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/admin/commission-ledger
 * Returns per-auction commission breakdown (PLATFORM_FEE + SETTLEMENT_CREDIT rows).
 * Supports: ?page=1&limit=20&search=&from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv&groupBySeller=true
 */
const getCommissionLedger = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '20')));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const from = req.query.from || null;
    const to = req.query.to || null;
    const format = (req.query.format || 'json').toLowerCase();
    const groupBySeller = req.query.groupBySeller === 'true';

    // ----------------------------------------------------------------
    // Per-auction ledger: each SETTLEMENT_DEBIT (winner's payment) =>
    //   join auction => find seller credit + platform fee via idempotency key pattern
    // We query auctions where commission_calculated=true, join users.
    // ----------------------------------------------------------------
    const conditions = [`a.commission_calculated = TRUE`, `a.winner_id IS NOT NULL`];
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
      conditions.push(`a.updated_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`a.updated_at <= ($${params.length}::date + INTERVAL '1 day')`);
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
           SUM(a.commission_amount)::numeric AS total_commission,
           SUM(a.current_price)::numeric     AS total_volume,
           MIN(a.updated_at)    AS first_settlement,
           MAX(a.updated_at)    AS last_settlement
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

      if (format === 'csv') {
        const header = 'Seller Name,Seller Email,Auctions,Total Volume ($),Total Commission ($),First Settlement,Last Settlement';
        const csvRows = rows.map((r) =>
          `"${r.sellerName}","${r.sellerEmail}",${r.auctionsCount},${r.totalVolume.toFixed(2)},${r.totalCommission.toFixed(2)},"${r.firstSettlement ? new Date(r.firstSettlement).toISOString() : ''}","${r.lastSettlement ? new Date(r.lastSettlement).toISOString() : ''}"`
        );
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="commission_by_seller.csv"');
        return res.send([header, ...csvRows].join('\n'));
      }

      return res.json({ success: true, data: { rows, grouped: true } });
    }

    // Per-auction mode (default)
    const [dataRes, countRes, summaryRes] = await Promise.all([
      pool.query(
        `SELECT
           a.id                  AS auction_id,
           a.title               AS auction_title,
           a.current_price       AS hammer_price,
           a.commission_amount   AS commission,
           a.updated_at          AS settled_at,
           COALESCE(seller.name, seller.email) AS seller_name,
           seller.email          AS seller_email,
           COALESCE(winner.name, winner.email) AS winner_name,
           winner.email          AS winner_email
         FROM auctions a
         JOIN users seller ON seller.id = a.seller_id
         JOIN users winner ON winner.id = a.winner_id
         ${where}
         ORDER BY a.updated_at DESC
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
          COALESCE(SUM(commission_amount), 0)::numeric AS total_commission,
          COALESCE(SUM(CASE WHEN updated_at >= date_trunc('month', NOW()) THEN commission_amount ELSE 0 END), 0)::numeric AS month_commission,
          COUNT(*)::int AS total_auctions,
          COALESCE(AVG(commission_amount), 0)::numeric AS avg_commission
        FROM auctions
        WHERE commission_calculated = TRUE AND winner_id IS NOT NULL
      `),
    ]);

    const total = countRes.rows[0].total;
    const summary = summaryRes.rows[0];
    const rows = dataRes.rows.map((r) => ({
      auctionId: r.auction_id,
      auctionTitle: r.auction_title,
      hammerPrice: parseFloat(r.hammer_price || 0),
      commission: parseFloat(r.commission || 0),
      settledAt: r.settled_at,
      sellerName: r.seller_name,
      sellerEmail: r.seller_email,
      winnerName: r.winner_name,
      winnerEmail: r.winner_email,
    }));

    if (format === 'csv') {
      const header = 'Auction Title,Seller,Seller Email,Winner,Winner Email,Hammer Price ($),Commission 5% ($),Settled At';
      const csvRows = rows.map((r) =>
        `"${r.auctionTitle}","${r.sellerName}","${r.sellerEmail}","${r.winnerName}","${r.winnerEmail}",${r.hammerPrice.toFixed(2)},${r.commission.toFixed(2)},"${r.settledAt ? new Date(r.settledAt).toISOString() : ''}"`,
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="commission_ledger.csv"');
      return res.send([header, ...csvRows].join('\n'));
    }

    return res.json({
      success: true,
      data: {
        summary: {
          totalCommission: parseFloat(summary.total_commission),
          monthCommission: parseFloat(summary.month_commission),
          totalAuctions: summary.total_auctions,
          avgCommission: parseFloat(summary.avg_commission),
        },
        rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAdminMetrics,
  getRevenueChart,
  getAllUsers,
  updateUserRole,
  forceDeleteAuction,
  updateAuctionStatus,
  getAllPaymentProofs,
  updatePaymentProofStatus,
  getCommissionLedger,
};
