import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { walletApi } from '../api/client';
import { TopupModal } from '../components/TopupModal';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Zap,
  Gavel,
  TrendingUp,
  Minus,
} from 'lucide-react';

// ─── Transaction type config ───────────────────────────────────────────────
const TX_CONFIG = {
  TOPUP: {
    label: 'Top Up',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    icon: ArrowDownLeft,
    sign: '+',
    amountColor: 'text-emerald-600',
  },
  SETTLEMENT_DEBIT: {
    label: 'Lot Paid',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    icon: Gavel,
    sign: '-',
    amountColor: 'text-rose-600',
  },
  SETTLEMENT_CREDIT: {
    label: 'Sale Proceeds',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
    icon: TrendingUp,
    sign: '+',
    amountColor: 'text-indigo-600',
  },
  PLATFORM_FEE: {
    label: '5% Platform Fee',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    icon: Minus,
    sign: '-',
    amountColor: 'text-amber-600',
  },
  WITHDRAWAL: {
    label: 'Withdrawal',
    color: 'bg-slate-50 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    icon: ArrowUpRight,
    sign: '-',
    amountColor: 'text-slate-700',
  },
  COMMISSION: {
    label: 'Commission',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
    icon: Minus,
    sign: '-',
    amountColor: 'text-orange-600',
  },
};

const getConfig = (type) =>
  TX_CONFIG[type] || {
    label: type,
    color: 'bg-slate-50 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    icon: Zap,
    sign: '',
    amountColor: 'text-slate-700',
  };

const formatDate = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' \u00b7 ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
};

const TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'TOPUP', label: 'Top Ups' },
  { value: 'SETTLEMENT_DEBIT', label: 'Lots Paid' },
  { value: 'SETTLEMENT_CREDIT', label: 'Sale Proceeds' },
  { value: 'PLATFORM_FEE', label: 'Platform Fees' },
  { value: 'WITHDRAWAL', label: 'Withdrawals' },
  { value: 'COMMISSION', label: 'Commission' },
];

export const WalletPage = () => {
  const { isAuthenticated } = useAuth();

  const [walletInfo, setWalletInfo] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isTopupOpen, setIsTopupOpen] = useState(false);

  const fetchData = useCallback(
    async (opts = {}) => {
      if (!isAuthenticated) return;
      const isRefresh = opts.refresh || false;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const currentPage = opts.page ?? page;
        const res = await walletApi.getTransactions({
          page: currentPage,
          limit: 20,
          type: typeFilter || undefined,
        });
        const { wallet, transactions: txs, pagination: pg } = res.data.data;
        setWalletInfo(wallet);
        setTransactions(txs);
        setPagination(pg);
      } catch (err) {
        console.error('[WalletPage] fetch error:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated, page, typeFilter]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchData({ page: newPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTypeChange = (val) => {
    setTypeFilter(val);
    setPage(1);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Please log in to view your wallet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">

        {/* Page Header */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
                <Wallet className="w-5 h-5 text-white" />
              </span>
              My Wallet
            </h1>
            <p className="text-slate-500 text-sm mt-1 ml-[52px]">
              Full ledger of every money movement in your AuctionLoom account.
            </p>
          </div>
          <button
            onClick={() => fetchData({ refresh: true })}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            id="wallet-refresh-btn"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Balance Hero Card */}
        <div className="relative mb-8 rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 shadow-2xl shadow-indigo-500/30 p-8 text-white">
          <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />
          <div className="relative">
            <p className="text-indigo-200 text-xs font-mono uppercase tracking-widest mb-2">Available Balance</p>
            {loading ? (
              <div className="h-12 w-48 bg-white/20 rounded-xl animate-pulse mb-4" />
            ) : (
              <p className="text-5xl font-extrabold tracking-tight mb-1">
                ${walletInfo ? walletInfo.balance.toFixed(2) : '0.00'}
                <span className="text-indigo-300 text-xl font-medium ml-3">
                  {walletInfo?.currency || 'USD'}
                </span>
              </p>
            )}
            <p className="text-indigo-300 text-sm">
              {pagination.total} transaction{pagination.total !== 1 ? 's' : ''} on record
            </p>
          </div>
          <div className="relative mt-6 flex items-center gap-3">
            <button
              onClick={() => setIsTopupOpen(true)}
              id="wallet-topup-btn"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-indigo-700 font-bold text-sm shadow-lg shadow-indigo-900/20 hover:bg-indigo-50 transition-all active:scale-95 cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4" />
              Top Up Wallet
            </button>
            <Link
              to="/my-hub"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-all border border-white/20"
            >
              My Hub
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filter by:</span>
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleTypeChange(opt.value)}
                id={`filter-${opt.value || 'all'}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  typeFilter === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Transaction Table */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                    <div className="h-2 bg-slate-100 rounded w-1/4" />
                  </div>
                  <div className="h-4 bg-slate-100 rounded w-20" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
              <Wallet className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium">No transactions found</p>
              <p className="text-xs">
                {typeFilter
                  ? 'Try clearing the filter to see all transactions.'
                  : 'Top up your wallet to get started.'}
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[1fr_130px_110px_160px] gap-4 px-6 py-3 bg-slate-50/80 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>Transaction</span>
                <span>Amount</span>
                <span className="hidden sm:block">Balance After</span>
                <span className="hidden md:block">Date &amp; Time</span>
              </div>

              <div className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const cfg = getConfig(tx.type);
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={tx.id}
                      className="grid grid-cols-[1fr_130px_110px_160px] gap-4 items-center px-6 py-4 hover:bg-slate-50/60 transition-colors"
                    >
                      {/* Left: icon + label + auction */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${cfg.color}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}
                          >
                            {cfg.label}
                          </span>
                          {tx.auctionTitle && (
                            <Link
                              to={`/auctions/${tx.auctionId}`}
                              className="block text-xs text-indigo-600 hover:text-indigo-800 font-medium truncate mt-0.5 transition-colors"
                              title={tx.auctionTitle}
                            >
                              {tx.auctionTitle}
                            </Link>
                          )}
                          {!tx.auctionTitle && tx.metadata?.note && (
                            <span className="block text-xs text-slate-400 truncate mt-0.5">
                              {tx.metadata.note}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className={`text-sm font-bold tabular-nums ${cfg.amountColor}`}>
                        {cfg.sign}${tx.amount.toFixed(2)}
                      </div>

                      {/* Balance after */}
                      <div className="hidden sm:block text-sm text-slate-500 tabular-nums font-mono">
                        ${tx.balanceAfter.toFixed(2)}
                      </div>

                      {/* Date */}
                      <div className="hidden md:block text-xs text-slate-400">
                        {formatDate(tx.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-mono">
              Page {pagination.page} of {pagination.totalPages} &nbsp;&middot;&nbsp; {pagination.total} total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                id="wallet-prev-page"
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    id={`wallet-page-${p}`}
                    className={`w-8 h-8 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      p === page
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                        : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= pagination.totalPages}
                id="wallet-next-page"
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 p-5 rounded-2xl bg-slate-50 border border-slate-200/80">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Transaction Types Explained
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(TX_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className="text-xs text-slate-600">{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Up Modal */}
      <TopupModal
        isOpen={isTopupOpen}
        onClose={() => setIsTopupOpen(false)}
        onSuccess={(w) => {
          if (w) setWalletInfo((prev) => ({ ...prev, balance: parseFloat(w.balance || 0) }));
          fetchData({ refresh: true });
          window.dispatchEvent(new Event('wallet_updated'));
        }}
        currentBalance={walletInfo?.balance || 0}
      />
    </div>
  );
};

export default WalletPage;
