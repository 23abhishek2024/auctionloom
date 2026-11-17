const auctionService = require('../services/auctionService');
const userService = require('../services/userService');
const commissionService = require('../services/commissionService');
const reportService = require('../services/reportService');
const systemService = require('../services/systemService');
const {
  isUUID,
  requireUuid,
  optionalString,
  optionalQueryString,
  optionalDateParam,
} = require('../utils/validators');
const { AppError } = require('../utils/AppError');

// Shared query checks for the commission reports: page, limit, search text, date range and format
const readReportQuery = (query, maxLimit) => {
  const page = Math.max(1, parseInt(optionalQueryString(query.page, 'page', 6) || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(optionalQueryString(query.limit, 'limit', 6) || '20', 10) || 20));
  const format = (optionalQueryString(query.format, 'format', 10) || 'json').toLowerCase();
  if (format !== 'json' && format !== 'csv') throw new AppError(400, 'format must be json or csv.');
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    search: (optionalQueryString(query.search, 'search', 100) || '').trim(),
    from: optionalDateParam(query.from, 'from'),
    to: optionalDateParam(query.to, 'to'),
    format,
  };
};

/**
 * Admin Controller
 * Every route here sits behind authMiddleware + roleMiddleware('admin') (see adminRoutes.js).
 * Handlers read and check the request, call a service, and shape the response (JSON or CSV).
 */

// ── CSV exports (presentation only: the rows come from reportService) ──

const sendCsv = (res, filename, lines) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(lines.join('\n'));
};

const sellerLedgerCsvLines = (rows) => [
  'Seller Name,Seller Email,Auctions,Total Volume ($),Total Commission ($),First Settlement,Last Settlement',
  ...rows.map((r) =>
    `"${r.sellerName}","${r.sellerEmail}",${r.auctionsCount},${r.totalVolume.toFixed(2)},${r.totalCommission.toFixed(2)},"${r.firstSettlement ? new Date(r.firstSettlement).toISOString() : ''}","${r.lastSettlement ? new Date(r.lastSettlement).toISOString() : ''}"`
  ),
];

const auctionLedgerCsvLines = (rows) => [
  'Auction Title,Seller,Seller Email,Winner,Winner Email,Hammer Price ($),Commission 5% ($),Settled At',
  ...rows.map((r) =>
    `"${r.auctionTitle}","${r.sellerName}","${r.sellerEmail}","${r.winnerName}","${r.winnerEmail}",${r.hammerPrice.toFixed(2)},${r.commission.toFixed(2)},"${r.settledAt ? new Date(r.settledAt).toISOString() : ''}"`
  ),
];

const commissionTransactionsCsvLines = (transactions) => [
  'Transaction ID,Date,Type,Auction Title,Seller Name,Seller Email,Winner Name,Winner Email,Gross Amount ($),Commission ($),Status',
  ...transactions.map((r) =>
    `"${r.id}","${new Date(r.date).toISOString()}","${r.type}","${r.auctionTitle.replace(/"/g, '""')}","${r.sellerName.replace(/"/g, '""')}","${r.sellerEmail || ''}","${r.winnerName || ''}","${r.winnerEmail || ''}",${r.grossAmount.toFixed(2)},${r.commission.toFixed(2)},"${r.status}"`
  ),
];

/**
 * GET /api/admin/metrics
 * Returns high-level platform health & financial metrics
 */
const getAdminMetrics = async (req, res, next) => {
  try {
    const metrics = await reportService.getPlatformMetrics();
    res.json({ metrics });
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
    const chartData = await reportService.getRevenueChart();
    res.json({ chartData });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/users?search=
 * Returns list of all registered users with their platform statistics
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.listUsers(optionalQueryString(req.query.search, 'search', 100));
    res.json({
      users,
      count: users.length,
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
    const id = requireUuid(req.params.id, 'user ID');
    const { role } = req.body;

    if (!['admin', 'auctioneer', 'bidder'].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be 'admin', 'auctioneer', or 'bidder'." });
    }

    const user = await userService.changeRole(id, role);
    res.json({
      message: `User role successfully updated to ${role}.`,
      user,
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

    const deleted = await auctionService.forceDeleteAuction(id);
    res.json({ message: 'Auction forcefully deleted by Super Admin.', deleted });
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

    if (typeof status !== 'string' || !['ACTIVE', 'CLOSED', 'RESTRICTED'].includes(status.toUpperCase())) {
      return res.status(400).json({
        error: "Status must be one of 'ACTIVE', 'CLOSED', or 'RESTRICTED'.",
      });
    }

    const normalizedStatus = status.toUpperCase();
    const auction = await auctionService.setAuctionStatus(id, normalizedStatus, optionalString(reason, 'Reason', 300));

    res.json({
      message: `Auction status successfully updated to ${normalizedStatus}.`,
      auction,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/commission-proofs?status=
 * Returns payment proofs filtered by status (PENDING, APPROVED, REJECTED); any other value means all
 */
const getAllPaymentProofs = async (req, res, next) => {
  try {
    const status = optionalQueryString(req.query.status, 'status', 20);
    const statusFilter = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())
      ? status.toUpperCase()
      : null;

    const proofs = await commissionService.listProofs(statusFilter);
    res.json({
      proofs,
      count: proofs.length,
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
  try {
    const id = requireUuid(req.params.id, 'proof ID');
    const { status } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'APPROVED' or 'REJECTED'." });
    }

    const proof = await commissionService.reviewProof(id, status, optionalString(req.body.admin_notes, 'Admin notes', 500));
    res.json({
      message: `Payment proof status successfully updated to ${status}.`,
      proof,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/commission-ledger
 * Returns per-auction commission breakdown of settled auctions.
 * Supports: ?page=1&limit=20&search=&from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv&groupBySeller=true
 */
const getCommissionLedger = async (req, res, next) => {
  try {
    const { page, limit, offset, search, from, to, format } = readReportQuery(req.query, 200);
    const groupBySeller = req.query.groupBySeller === 'true';

    const ledger = await reportService.getCommissionLedger({ search, from, to, groupBySeller, limit, offset });

    if (ledger.grouped) {
      if (format === 'csv') {
        return sendCsv(res, 'commission_by_seller.csv', sellerLedgerCsvLines(ledger.rows));
      }
      return res.json({ success: true, data: { rows: ledger.rows, grouped: true } });
    }

    if (format === 'csv') {
      return sendCsv(res, 'commission_ledger.csv', auctionLedgerCsvLines(ledger.rows));
    }

    return res.json({
      success: true,
      data: {
        summary: ledger.summary,
        rows: ledger.rows,
        pagination: {
          page,
          limit,
          total: ledger.total,
          totalPages: Math.ceil(ledger.total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/commission-transactions
 * Returns unified transaction-level platform commission entries from wallet and legacy proofs.
 * Supports: ?page=1&limit=20&search=&type=AUCTION_ESCROW|WALLET_DIRECT|MANUAL_WIRE&from=&to=&format=csv
 */
const getCommissionTransactions = async (req, res, next) => {
  try {
    const { page, limit, offset, search, from, to, format } = readReportQuery(req.query, 100);
    const type = (optionalQueryString(req.query.type, 'type', 20) || 'ALL').toUpperCase();

    const report = await reportService.getCommissionTransactions({ type, search, from, to, limit, offset });

    if (format === 'csv') {
      return sendCsv(res, 'commission_transactions.csv', commissionTransactionsCsvLines(report.transactions));
    }

    return res.json({
      success: true,
      data: {
        summary: report.summary,
        transactions: report.transactions,
        pagination: {
          page,
          limit,
          total: report.total,
          totalPages: Math.ceil(report.total / limit) || 1,
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/system/purge-and-reset
 * Wipes all tables, strictly sets up admin@gmail.com + test1..test5@gmail.com (password: test@123),
 * sets all wallets to $0.00, and optionally runs 3 test auctions with full double-entry flow.
 */
const purgeAndResetDatabase = async (req, res, next) => {
  try {
    const { users, balances } = await systemService.purgeAndReset({
      runTestAuctions: req.body.runTestAuctions !== false,
    });

    return res.json({
      success: true,
      message: 'Purge, clean 5 test logins + admin setup, and full transaction verification completed.',
      users,
      balances,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/system/run-benchmark
 * Executes a high-concurrency bid stress test (default 100 requests) directly against PostgreSQL
 * using SELECT FOR UPDATE pessimistic locking. Returns detailed latency percentiles,
 * throughput, and database state validation.
 */
const runConcurrencyBenchmark = async (req, res, next) => {
  try {
    const count = parseInt(req.body.requests, 10) || 100;
    const data = await systemService.runBidBenchmark(count);
    return res.status(200).json({ success: true, data });
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
  getCommissionTransactions,
  purgeAndResetDatabase,
  runConcurrencyBenchmark,
};
