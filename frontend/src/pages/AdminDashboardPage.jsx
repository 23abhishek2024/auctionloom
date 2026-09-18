import React, { useState, useEffect, useCallback } from 'react';
import { adminApi, auctionApi, resolveImageUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  ShieldAlert,
  Users,
  DollarSign,
  Gavel,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  Search,
  Trash2,
  Eye,
  Check,
  X,
  ExternalLink,
  Lock,
  Pause,
  Play,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const AdminDashboardPage = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [metrics, setMetrics] = useState(null);
  const [revenueChart, setRevenueChart] = useState([]);
  const [users, setUsers] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [auctions, setAuctions] = useState([]);

  const [activeTab, setActiveTab] = useState('commission'); // 'commission', 'proofs', 'users', 'auctions'
  const [proofStatusFilter, setProofStatusFilter] = useState('PENDING'); // 'PENDING', 'APPROVED', 'REJECTED', 'ALL'
  const [userSearch, setUserSearch] = useState('');
  const [auctionSearch, setAuctionSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedProofModal, setSelectedProofModal] = useState(null);

  // Commission Sub-Tab & State
  const [commTab, setCommTab] = useState('transactions'); // 'transactions' | 'ledger'
  const [commTransactions, setCommTransactions] = useState([]);
  const [commTxSummary, setCommTxSummary] = useState(null);
  const [commTxPag, setCommTxPag] = useState({ page: 1, totalPages: 1, total: 0 });
  const [commTxType, setCommTxType] = useState('ALL');

  // Commission Ledger State
  const [commRows, setCommRows] = useState([]);
  const [commSummary, setCommSummary] = useState(null);
  const [commPag, setCommPag] = useState({ page: 1, totalPages: 1, total: 0 });
  const [commPage, setCommPage] = useState(1);
  const [commSearch, setCommSearch] = useState('');
  const [commFrom, setCommFrom] = useState('');
  const [commTo, setCommTo] = useState('');
  const [commLoading, setCommLoading] = useState(false);
  const [commGrouped, setCommGrouped] = useState(false);

  // Authorization gate: Only role === 'admin'
  useEffect(() => {
    if (!isAuthenticated || (user && user.role !== 'admin')) {
      navigate('/');
    }
  }, [isAuthenticated, user, navigate]);

  const fetchAllAdminData = async () => {
    try {
      setLoading(true);
      const [mRes, rRes, uRes, pRes, aRes] = await Promise.all([
        adminApi.getMetrics(),
        adminApi.getRevenueChart(),
        adminApi.getUsers(userSearch),
        adminApi.getProofs(proofStatusFilter === 'ALL' ? undefined : proofStatusFilter),
        auctionApi.getAll(),
      ]);

      setMetrics(mRes.data.metrics);
      setRevenueChart(rRes.data.chartData || []);
      setUsers(uRes.data.users || []);
      setProofs(pRes.data.proofs || []);
      setAuctions(aRes.data.auctions || []);
    } catch (err) {
      console.error('Failed to load admin telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAllAdminData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofStatusFilter, user]);

  // Commission Transactions Fetch
  const fetchCommissionTransactions = useCallback(async (opts = {}) => {
    setCommLoading(true);
    try {
      const res = await adminApi.getCommissionTransactions({
        page: opts.page ?? commPage,
        limit: 20,
        search: commSearch || undefined,
        type: commTxType !== 'ALL' ? commTxType : undefined,
        from: commFrom || undefined,
        to: commTo || undefined,
      });
      const d = res.data.data;
      setCommTransactions(d.transactions || []);
      setCommTxSummary(d.summary || null);
      setCommTxPag(d.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      console.error('[AdminDashboard] Commission transactions fetch error:', err);
    } finally {
      setCommLoading(false);
    }
  }, [commPage, commSearch, commTxType, commFrom, commTo]);

  // Commission Ledger Fetch
  const fetchCommissionLedger = useCallback(async (opts = {}) => {
    setCommLoading(true);
    try {
      const res = await adminApi.getCommissionLedger({
        page: opts.page ?? commPage,
        limit: 20,
        search: commSearch || undefined,
        from: commFrom || undefined,
        to: commTo || undefined,
        groupBySeller: commGrouped,
      });
      const d = res.data.data;
      if (commGrouped) {
        setCommRows(d.rows || []);
        setCommSummary(null);
        setCommPag({ page: 1, totalPages: 1, total: (d.rows || []).length });
      } else {
        setCommRows(d.rows || []);
        setCommSummary(d.summary || null);
        setCommPag(d.pagination || { page: 1, totalPages: 1, total: 0 });
      }
    } catch (err) {
      console.error('[AdminDashboard] Commission ledger fetch error:', err);
    } finally {
      setCommLoading(false);
    }
  }, [commPage, commSearch, commFrom, commTo, commGrouped]);

  useEffect(() => {
    if (activeTab === 'commission' && user?.role === 'admin') {
      if (commTab === 'transactions') {
        fetchCommissionTransactions();
      } else {
        fetchCommissionLedger();
      }
    }
  }, [activeTab, commTab, fetchCommissionTransactions, fetchCommissionLedger, user]);

  const handleCommPageChange = (p) => {
    setCommPage(p);
    if (commTab === 'transactions') {
      fetchCommissionTransactions({ page: p });
    } else {
      fetchCommissionLedger({ page: p });
    }
  };

  const handleCommExportCsv = () => {
    const params = new URLSearchParams({
      format: 'csv',
      ...(commSearch ? { search: commSearch } : {}),
      ...(commFrom ? { from: commFrom } : {}),
      ...(commTo ? { to: commTo } : {}),
    });
    const token = localStorage.getItem('token');
    const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const base = rawBase.match(/https?:\/\/[^\s\r\n]+/)?.[0]?.replace(/\/+$/, '') || 'http://localhost:5000/api';
    const endpoint = commTab === 'transactions' ? 'commission-transactions' : 'commission-ledger';
    if (commTab === 'ledger') {
      params.append('groupBySeller', commGrouped);
    } else if (commTxType !== 'ALL') {
      params.append('type', commTxType);
    }
    const url = `${base}/admin/${endpoint}?${params.toString()}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = commTab === 'transactions' ? 'commission_transactions.csv' : (commGrouped ? 'commission_by_seller.csv' : 'commission_ledger.csv');
        a.click();
      })
      .catch(() => alert('CSV export failed. Please try again.'));
  };

  // Handle Proof Approval / Rejection
  const handleProofDecision = async (proofId, status) => {
    if (!window.confirm(`Are you sure you want to mark this receipt as ${status}?`)) return;
    try {
      setActionLoading(true);
      await adminApi.updateProofStatus(proofId, status);
      await fetchAllAdminData();
      if (selectedProofModal?.id === proofId) setSelectedProofModal(null);
    } catch (err) {
      alert(err.response?.data?.error || `Failed to update status to ${status}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle User Role Change
  const handleRoleChange = async (userId, newRole) => {
    try {
      setActionLoading(true);
      await adminApi.updateRole(userId, newRole);
      await fetchAllAdminData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update user role');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Emergency Auction Deletion
  const handleForceDeleteAuction = async (auctionId, title) => {
    if (!window.confirm(`EMERGENCY MODERATION: Are you sure you want to permanently delete "${title}"? This cannot be undone.`)) {
      return;
    }
    try {
      setActionLoading(true);
      await adminApi.deleteAuction(auctionId);
      await fetchAllAdminData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete auction');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Restrict / Resume Auction Toggle
  const handleToggleAuctionStatus = async (auctionId, currentStatus, title) => {
    const isRestricted = currentStatus === 'RESTRICTED';
    const targetStatus = isRestricted ? 'ACTIVE' : 'RESTRICTED';
    const actionLabel = isRestricted ? 'lift restriction & resume bidding' : 'place under administrative restriction (freeze bidding)';

    if (!window.confirm(`Are you sure you want to ${actionLabel} for "${title}"?`)) {
      return;
    }

    try {
      setActionLoading(true);
      await adminApi.updateAuctionStatus(auctionId, targetStatus);
      await fetchAllAdminData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update auction status');
    } finally {
      setActionLoading(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 text-xs font-semibold uppercase tracking-wider mb-2">
            <ShieldAlert className="w-3.5 h-3.5" /> Super Admin Control Center
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Platform Operations & Financial Governance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time telemetry, platform commission approvals, user moderation, and inventory control.
          </p>
        </div>

        <button
          onClick={fetchAllAdminData}
          disabled={loading || actionLoading}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Metrics
        </button>
      </div>

      {/* KPI Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {/* Total Settled Volume */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider">Gross Auction Volume</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            ${metrics?.totalVolume?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Across {metrics?.settledAuctions || 0} successfully concluded auctions
          </p>
        </div>

        {/* Platform 5% Commission & Admin Wallet */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider">Admin Commission Received</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">
            ${metrics?.collectedCommission?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span>Admin Live Wallet:</span>
              <span className="text-emerald-700 font-bold font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ${(metrics?.adminWalletBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Platform Treasury:</span>
              <span className="font-mono text-slate-600 font-semibold">${(metrics?.treasuryBalance ?? 0).toFixed(2)} liquid</span>
            </div>
          </div>
        </div>

        {/* Registered Users */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider">Registered Accounts</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {metrics?.totalUsers || 0}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {metrics?.userBreakdown?.auctioneer_count || 0} Auctioneers • {metrics?.userBreakdown?.bidder_count || 0} Bidders
          </p>
        </div>

        {/* Pending Proofs & Auctions */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider">Pending Receipts</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-600 font-mono">
            {metrics?.pendingProofsCount || 0}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {metrics?.activeAuctions || 0} live auctions actively receiving bids
          </p>
        </div>
      </div>

      {/* Operations Tab Bar */}
      <div className="flex border-b border-slate-200 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('commission')}
          className={`pb-3 px-4 font-bold text-sm transition-all flex items-center gap-2 border-b-2 ${
            activeTab === 'commission'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Admin Commission &amp; Money Transitions
        </button>

        <button
          onClick={() => setActiveTab('proofs')}
          className={`pb-3 px-4 font-bold text-sm transition-all flex items-center gap-2 border-b-2 ${
            activeTab === 'proofs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Legacy Wire Receipts
          {metrics?.pendingProofsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500 text-white font-mono">
              {metrics.pendingProofsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-4 font-bold text-sm transition-all flex items-center gap-2 border-b-2 ${
            activeTab === 'users'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          User Management ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('auctions')}
          className={`pb-3 px-4 font-bold text-sm transition-all flex items-center gap-2 border-b-2 ${
            activeTab === 'auctions'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Gavel className="w-4 h-4" />
          Auction Inventory ({auctions.length})
        </button>
      </div>

      {/* TAB 1: COMMISSION PROOF RECEIPTS */}
      {activeTab === 'proofs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
          {/* Status Filter Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((status) => (
                <button
                  key={status}
                  onClick={() => setProofStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all ${
                    proofStatusFilter === status
                      ? 'bg-slate-900 text-white shadow'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Total {proofs.length} receipts in current view
            </div>
          </div>

          {proofs.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-50" />
              <p className="font-semibold text-slate-700">No {proofStatusFilter.toLowerCase()} payment receipts</p>
              <p className="text-xs text-slate-400 mt-1">Auctioneers submit proofs after paying the 5% platform fee.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    <th className="py-3 px-4">Receipt</th>
                    <th className="py-3 px-4">Auctioneer</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Current Debt</th>
                    <th className="py-3 px-4">Note / Comment</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {proofs.map((proof) => (
                    <tr key={proof.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Image Thumbnail */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => setSelectedProofModal(proof)}
                          className="relative group block w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shadow-sm"
                        >
                          <img
                            src={resolveImageUrl(proof.proof_url)}
                            alt="Receipt"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <Eye className="w-4 h-4" />
                          </div>
                        </button>
                      </td>

                      {/* User Info */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{proof.user_name}</div>
                        <div className="text-xs text-slate-400 font-mono">{proof.user_email}</div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600 text-base">
                        ${proof.amount.toFixed(2)}
                      </td>

                      {/* Current Debt */}
                      <td className="py-3 px-4 font-mono text-xs">
                        <span className={proof.user_unpaid_commission > 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                          ${proof.user_unpaid_commission.toFixed(2)}
                        </span>
                      </td>

                      {/* Comment */}
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {proof.comment || '—'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                            proof.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : proof.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800 animate-pulse'
                          }`}
                        >
                          {proof.status}
                        </span>
                      </td>

                      {/* Decision Buttons */}
                      <td className="py-3 px-4 text-right space-x-2">
                        {proof.status === 'PENDING' ? (
                          <>
                            <button
                              onClick={() => handleProofDecision(proof.id, 'APPROVED')}
                              disabled={actionLoading}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-all active:scale-95 inline-flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => handleProofDecision(proof.id, 'REJECTED')}
                              disabled={actionLoading}
                              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-medium text-xs transition-all active:scale-95 inline-flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
              />
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Total {users.length} members registered
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-center">Listings</th>
                  <th className="py-3 px-4 text-center">Total Bids</th>
                  <th className="py-3 px-4 text-center">Wins</th>
                  <th className="py-3 px-4 text-right">Spent Volume</th>
                  <th className="py-3 px-4 text-right">Unpaid Commission</th>
                  <th className="py-3 px-4 text-center">Modify Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{u.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase font-mono ${
                          u.role === 'admin'
                            ? 'bg-rose-100 text-rose-800'
                            : u.role === 'auctioneer'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">{u.listings_count}</td>
                    <td className="py-3 px-4 text-center font-mono">{u.total_bids}</td>
                    <td className="py-3 px-4 text-center font-bold text-emerald-600 font-mono">{u.auctions_won}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">${u.total_spent.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      <span className={u.unpaid_commission > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                        ${u.unpaid_commission.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        disabled={actionLoading || u.id === user.id}
                        className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 focus:ring-1 focus:ring-indigo-500 font-mono cursor-pointer"
                      >
                        <option value="bidder">bidder</option>
                        <option value="auctioneer">auctioneer</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AUCTION INVENTORY & MODERATION */}
      {activeTab === 'auctions' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4">Seller</th>
                  <th className="py-3 px-4">Current Price</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">End Time</th>
                  <th className="py-3 px-4 text-right">Moderation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {auctions.map((auc) => (
                  <tr key={auc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={resolveImageUrl(auc.image_url)}
                          alt={auc.title}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                        />
                        <div>
                          <div className="font-bold text-slate-900 line-clamp-1">{auc.title}</div>
                          <div className="text-xs text-slate-400 font-mono truncate max-w-xs">{auc.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{auc.seller_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{auc.seller_email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      ${parseFloat(auc.current_price).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                          auc.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : auc.status === 'RESTRICTED'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {auc.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">
                      {new Date(auc.end_time).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleToggleAuctionStatus(auc.id, auc.status, auc.title)}
                          disabled={actionLoading}
                          className={`p-1.5 rounded-lg border transition-colors active:scale-95 cursor-pointer ${
                            auc.status === 'RESTRICTED'
                              ? 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                              : 'text-amber-600 hover:bg-amber-50 border-amber-200'
                          }`}
                          title={auc.status === 'RESTRICTED' ? 'Lift Restriction & Resume' : 'Restrict Auction (Freeze Bids)'}
                        >
                          {auc.status === 'RESTRICTED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleForceDeleteAuction(auc.id, auc.title)}
                          disabled={actionLoading}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors active:scale-95 cursor-pointer"
                          title="Force Delete Auction"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECEIPT INSPECTION MODAL */}
      {selectedProofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-slate-900">Proof of Payment Receipt</h3>
              <button
                onClick={() => setSelectedProofModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-h-80 flex items-center justify-center mb-4">
              <img
                src={resolveImageUrl(selectedProofModal.proof_url)}
                alt="Receipt screenshot"
                className="max-h-80 w-auto object-contain"
              />
            </div>

            <div className="space-y-2 text-xs font-mono mb-6 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Auctioneer:</span>
                <span className="font-bold text-slate-800">{selectedProofModal.user_name} ({selectedProofModal.user_email})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-bold text-emerald-600 text-sm">${selectedProofModal.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Unpaid Balance:</span>
                <span className="font-bold text-rose-600">${selectedProofModal.user_unpaid_commission.toFixed(2)}</span>
              </div>
              {selectedProofModal.comment && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-500 block mb-0.5">Note from seller:</span>
                  <p className="text-slate-700 italic font-sans">{selectedProofModal.comment}</p>
                </div>
              )}
            </div>

            {selectedProofModal.status === 'PENDING' && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleProofDecision(selectedProofModal.id, 'APPROVED')}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" /> Approve & Settle Debt
                </button>
                <button
                  onClick={() => handleProofDecision(selectedProofModal.id, 'REJECTED')}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" /> Reject Receipt
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: COMMISSION & TRANSACTIONS */}
      {activeTab === 'commission' && (
        <div className="space-y-6">
          {/* Sub-Tab Switcher: Live Transactions Feed vs. Ledger */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setCommTab('transactions'); setCommPage(1); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  commTab === 'transactions'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Live Commission Transactions Feed
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${commTab === 'transactions' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {commTxSummary?.totalTransactions || commTransactions.length}
                </span>
              </button>

              <button
                onClick={() => { setCommTab('ledger'); setCommPage(1); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  commTab === 'ledger'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                Auction & Seller Ledger
              </button>
            </div>

            <div className="text-xs text-slate-500 font-mono flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-xl font-bold">
                Admin Wallet: ${(metrics?.adminWalletBalance ?? 0).toFixed(2)} USD
              </span>
              <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 px-3 py-1 rounded-xl font-bold">
                Treasury: ${(metrics?.treasuryBalance ?? commTxSummary?.treasuryBalance ?? 0).toFixed(2)} USD Liquid
              </span>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400 mb-1">Total Platform Commission</p>
              <p className="text-2xl font-extrabold text-emerald-600 font-mono">
                ${(commTxSummary?.totalCommission ?? metrics?.collectedCommission ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400 mb-1">Admin Wallet Balance</p>
              <p className="text-2xl font-extrabold text-indigo-600 font-mono">
                ${(metrics?.adminWalletBalance ?? 0).toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{metrics?.adminEmail || 'admin@gmail.com'}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400 mb-1">Gross Settled Volume</p>
              <p className="text-2xl font-extrabold text-slate-800 font-mono">
                ${(metrics?.totalVolume || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400 mb-1">Commission Transitions</p>
              <p className="text-2xl font-extrabold text-amber-600 font-mono">
                {commTab === 'transactions' 
                  ? (commTxSummary?.totalTransactions || commTransactions.length) 
                  : (commSummary?.totalAuctions || 0)}
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Search</label>
                <input
                  type="text"
                  value={commSearch}
                  onChange={(e) => setCommSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (commTab === 'transactions' ? fetchCommissionTransactions({ page: 1 }) : fetchCommissionLedger({ page: 1 }))}
                  placeholder="Search by auction title, seller, buyer, or ID..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  id="comm-search-input"
                />
              </div>

              {commTab === 'transactions' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Channel / Type</label>
                  <select
                    value={commTxType}
                    onChange={(e) => { setCommTxType(e.target.value); setCommPage(1); }}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-indigo-400 font-mono"
                    id="comm-type-filter"
                  >
                    <option value="ALL">All Sources</option>
                    <option value="AUCTION_ESCROW">Auction Escrow (5%)</option>
                    <option value="WALLET_DIRECT">Direct Wallet Payment</option>
                    <option value="MANUAL_WIRE">Manual Bank Wire</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">From</label>
                <input type="date" value={commFrom} onChange={(e) => setCommFrom(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400" id="comm-from-date" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">To</label>
                <input type="date" value={commTo} onChange={(e) => setCommTo(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400" id="comm-to-date" />
              </div>
              <button 
                onClick={() => { setCommPage(1); commTab === 'transactions' ? fetchCommissionTransactions({ page: 1 }) : fetchCommissionLedger({ page: 1 }); }}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow hover:bg-indigo-700 transition-all cursor-pointer" id="comm-apply-filter"
              >
                Apply
              </button>
              <button 
                onClick={() => { setCommSearch(''); setCommFrom(''); setCommTo(''); setCommTxType('ALL'); setCommPage(1); }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-all cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              {commTab === 'ledger' ? (
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={commGrouped} onChange={(e) => { setCommGrouped(e.target.checked); setCommPage(1); }}
                    className="w-4 h-4 rounded accent-indigo-600" id="comm-group-by-seller" />
                  Group by Seller
                </label>
              ) : (
                <span className="text-xs text-slate-400 font-mono">Real-time immutable double-entry platform commission transitions</span>
              )}
              <button onClick={handleCommExportCsv}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-all cursor-pointer" id="comm-export-csv">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
          </div>

          {/* Table: LIVE TRANSACTIONS FEED vs. LEDGER */}
          {commTab === 'transactions' ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {commLoading ? (
                <div className="p-8 space-y-3">
                  {[...Array(4)].map((_, i) => (<div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />))}
                </div>
              ) : commTransactions.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-slate-600">No commission transactions found</p>
                  <p className="text-xs mt-1">When an auction settles or a commission is paid, money movements appear here immediately.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                        <th className="py-3 px-4">Date &amp; Time</th>
                        <th className="py-3 px-4">Money Transition</th>
                        <th className="py-3 px-4">Auction / Reference</th>
                        <th className="py-3 px-4">From Whom (Seller)</th>
                        <th className="py-3 px-4">Winning Buyer</th>
                        <th className="py-3 px-4 text-right">Hammer Price</th>
                        <th className="py-3 px-4 text-right text-emerald-700">Admin Received (+5%)</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                            {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                            <span className="text-slate-400">{new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase ${
                              tx.type === 'AUCTION_ESCROW'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : tx.type === 'WALLET_DIRECT'
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : 'bg-purple-100 text-purple-800 border border-purple-200'
                            }`}>
                              {tx.type === 'AUCTION_ESCROW' ? 'Auction Escrow 5%' : tx.type === 'WALLET_DIRECT' ? 'Wallet Payment' : 'Bank Wire'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm font-semibold text-slate-800 max-w-[200px] truncate" title={tx.auctionTitle}>
                              {tx.auctionTitle}
                            </p>
                            <p className="text-[10px] font-mono text-slate-400">
                              TX: {tx.id?.slice(0, 8)}…
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm text-slate-700 font-medium">{tx.sellerName}</p>
                            <p className="text-xs text-slate-400 font-mono">{tx.sellerEmail}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm text-slate-700">{tx.winnerName || '—'}</p>
                            <p className="text-xs text-slate-400 font-mono">{tx.winnerEmail || '—'}</p>
                          </td>
                          <td className="py-3 px-4 text-right text-sm font-mono font-semibold text-slate-700">
                            ${tx.grossAmount.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-extrabold font-mono shadow-sm">
                              +${tx.commission.toFixed(2)} USD
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold font-mono">
                              <Check className="w-3 h-3" /> {tx.status || 'COMPLETED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* LEDGER TABLE */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {commLoading ? (
                <div className="p-8 space-y-3">
                  {[...Array(4)].map((_, i) => (<div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />))}
                </div>
              ) : commRows.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-slate-600">No commission records found</p>
                  <p className="text-xs mt-1">Settle a lot to see data here.</p>
                </div>
              ) : commGrouped ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                        <th className="py-3 px-4">Seller</th>
                        <th className="py-3 px-4">Auctions</th>
                        <th className="py-3 px-4">Total Volume</th>
                        <th className="py-3 px-4 text-emerald-700">Total Commission</th>
                        <th className="py-3 px-4">Last Settlement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commRows.map((r) => (
                        <tr key={r.sellerId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4"><p className="text-sm font-semibold text-slate-800">{r.sellerName}</p><p className="text-xs text-slate-400 font-mono">{r.sellerEmail}</p></td>
                          <td className="py-3 px-4 text-sm font-mono text-slate-700">{r.auctionsCount}</td>
                          <td className="py-3 px-4 text-sm font-mono text-slate-700">${r.totalVolume.toFixed(2)}</td>
                          <td className="py-3 px-4 text-sm font-bold font-mono text-emerald-700">${r.totalCommission.toFixed(2)}</td>
                          <td className="py-3 px-4 text-xs text-slate-400">{r.lastSettlement ? new Date(r.lastSettlement).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                        <th className="py-3 px-4">Auction</th>
                        <th className="py-3 px-4">Seller</th>
                        <th className="py-3 px-4">Winner</th>
                        <th className="py-3 px-4 text-right">Hammer Price</th>
                        <th className="py-3 px-4 text-right text-emerald-700">Commission 5%</th>
                        <th className="py-3 px-4">Settled At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commRows.map((r) => (
                        <tr key={r.auctionId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4"><p className="text-sm font-semibold text-slate-800 max-w-[200px] truncate" title={r.auctionTitle}>{r.auctionTitle}</p><p className="text-xs font-mono text-slate-400">{r.auctionId?.slice(0, 8)}…</p></td>
                          <td className="py-3 px-4"><p className="text-sm text-slate-700">{r.sellerName}</p><p className="text-xs text-slate-400 font-mono">{r.sellerEmail}</p></td>
                          <td className="py-3 px-4"><p className="text-sm text-slate-700">{r.winnerName}</p><p className="text-xs text-slate-400 font-mono">{r.winnerEmail}</p></td>
                          <td className="py-3 px-4 text-right text-sm font-mono font-semibold text-slate-800">${r.hammerPrice.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right"><span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold font-mono">+${r.commission.toFixed(2)}</span></td>
                          <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">{r.settledAt ? new Date(r.settledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Pagination */}
          {!commLoading && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-mono">
                Page {commTab === 'transactions' ? commTxPag.page : commPag.page} of {commTab === 'transactions' ? commTxPag.totalPages : commPag.totalPages} &middot;{' '}
                {commTab === 'transactions' ? commTxPag.total : commPag.total} records
              </p>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleCommPageChange(commPage - 1)} 
                  disabled={commPage <= 1} 
                  id="comm-prev-page"
                  className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, commTab === 'transactions' ? commTxPag.totalPages : commPag.totalPages) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button key={p} onClick={() => handleCommPageChange(p)} id={`comm-page-${p}`}
                      className={`w-8 h-8 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        p === commPage ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
                      }`}>{p}</button>
                  );
                })}
                <button 
                  onClick={() => handleCommPageChange(commPage + 1)} 
                  disabled={commPage >= (commTab === 'transactions' ? commTxPag.totalPages : commPag.totalPages)} 
                  id="comm-next-page"
                  className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Monthly Financial Chart (Visual SVG Bar Graph) */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8 mt-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Monthly Revenue &amp; Commission Ledger</h2>
                <p className="text-xs text-slate-500">Gross settled marketplace volume vs. platform 5% fee collection</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-indigo-600" /> Gross Volume
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500" /> Platform Fee (5%)
                </span>
              </div>
            </div>

            {/* Responsive Bar Chart Rendering */}
            <div className="h-64 flex items-end gap-3 sm:gap-6 pt-6 border-b border-slate-200 pb-2">
              {revenueChart.map((m, idx) => {
                const maxVal = Math.max(...revenueChart.map((d) => d.grossVolume), 10000);
                const volumeHeight = Math.max(12, Math.round((m.grossVolume / maxVal) * 190));
                const commHeight = Math.max(8, Math.round((m.commission / (maxVal * 0.1)) * 90));

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-16 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-slate-900 text-white text-[11px] p-2 rounded-lg shadow-xl whitespace-nowrap z-20 font-mono">
                      <div>Volume: ${m.grossVolume.toLocaleString()}</div>
                      <div className="text-emerald-400">Commission: ${m.commission.toLocaleString()}</div>
                      <div className="text-slate-400">{m.auctionsCount} items closed</div>
                    </div>

                    {/* Bars */}
                    <div className="w-full flex items-end justify-center gap-1">
                      <div
                        style={{ height: `${volumeHeight}px` }}
                        className="w-1/2 max-w-[28px] bg-gradient-to-t from-indigo-700 to-indigo-500 rounded-t-md transition-all group-hover:brightness-110"
                      />
                      <div
                        style={{ height: `${commHeight}px` }}
                        className="w-1/2 max-w-[18px] bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md transition-all group-hover:brightness-110"
                      />
                    </div>

                    {/* Month Label */}
                    <span className="text-[11px] text-slate-500 font-mono font-medium truncate w-full text-center">
                      {m.month.split(' ')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
