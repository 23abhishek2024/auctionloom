import React, { useState, useEffect } from 'react';
import { auctionApi } from '../api/client';
import { AuctionCard } from '../components/AuctionCard';
import { Search, SlidersHorizontal, RefreshCw, Zap, ShieldCheck, Flame, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const DashboardPage = () => {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, ACTIVE, ENDING_SOON, CLOSED
  const { user, isAuthenticated } = useAuth();

  const fetchAuctions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await auctionApi.getAll();
      setAuctions(res.data.auctions || []);
    } catch (err) {
      console.error('Failed to fetch auctions:', err);
      setError(err.response?.data?.error || 'Failed to connect to the backend auction service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuctions();
  }, []);

  // Filtering logic
  const filteredAuctions = auctions.filter((auc) => {
    const matchesSearch =
      auc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (auc.description && auc.description.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    const isExpired = new Date(auc.end_time) <= new Date();
    const isClosed = auc.status === 'CLOSED' || isExpired;

    if (filterStatus === 'ACTIVE') return !isClosed;
    if (filterStatus === 'CLOSED') return isClosed;
    if (filterStatus === 'ENDING_SOON') {
      const diff = new Date(auc.end_time) - new Date();
      return !isClosed && diff > 0 && diff <= 30 * 60 * 1000; // ending in 30 mins
    }
    return true;
  });

  const activeCount = auctions.filter(
    (a) => a.status === 'ACTIVE' && new Date(a.end_time) > new Date()
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden glass-panel border border-slate-200/90 p-8 sm:p-12 mb-10 shadow-lg shadow-slate-200/40 bg-white/90">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-mono mb-4 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span>Live Luxury Auctions & Real-Time Bidding</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 mb-4 leading-tight">
            High-Speed Live Bidding.{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              Zero Delays.
            </span>
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6">
            Experience real-time interactive auctions with instantaneous live price broadcasts and verified authentic listings.
            Discover luxury timepieces, collector vehicles, and rare fine art.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {isAuthenticated ? (
              <Link
                to="/create"
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-indigo-500/25 transition-all"
              >
                <Plus className="w-4 h-4" />
                Launch New Auction
              </Link>
            ) : (
              <Link
                to="/register"
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-indigo-500/25 transition-all"
              >
                <Plus className="w-4 h-4" />
                Start Selling
              </Link>
            )}

            <button
              onClick={fetchAuctions}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="mt-8 pt-6 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg">
          <div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">{auctions.length}</div>
            <div className="text-xs text-slate-500">Total Auctions</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-600 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
              {activeCount}
            </div>
            <div className="text-xs text-slate-500">Active Now</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-2xl font-extrabold text-indigo-600 font-mono">100%</div>
            <div className="text-xs text-slate-500">ACID Guaranteed</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search auctions by title or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none text-slate-900 placeholder:text-slate-400 transition-colors shadow-sm"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-slate-200 shadow-sm w-full md:w-auto overflow-x-auto">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'ACTIVE', label: 'Active' },
            { id: 'ENDING_SOON', label: 'Ending Soon' },
            { id: 'CLOSED', label: 'Closed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>

      {/* Content Area */}
      {error ? (
        <div className="glass-card border border-rose-200 bg-rose-50/50 p-6 rounded-2xl text-center">
          <p className="text-rose-600 font-semibold mb-2">Error loading auctions</p>
          <p className="text-sm text-slate-600 mb-4">{error}</p>
          <button
            onClick={fetchAuctions}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-64 rounded-2xl bg-white border border-slate-200/80 shadow-sm animate-pulse p-5 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-4 bg-slate-100 rounded w-1/3" />
                <div className="h-6 bg-slate-100 rounded w-3/4" />
                <div className="h-4 bg-slate-100 rounded w-full" />
              </div>
              <div className="h-10 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredAuctions.length === 0 ? (
        <div className="glass-card border border-slate-200 p-12 rounded-3xl text-center bg-white shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto mb-4 text-indigo-600 shadow-sm">
            <Flame className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">No Auctions Found</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            {searchQuery
              ? `No results matching "${searchQuery}". Try adjusting your filters.`
              : 'There are no active auctions right now. Be the first to create one!'}
          </p>
          {isAuthenticated ? (
            <Link
              to="/create"
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md shadow-indigo-500/25"
            >
              <Plus className="w-4 h-4" />
              Create the First Auction
            </Link>
          ) : (
            <Link
              to="/register"
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md shadow-indigo-500/25"
            >
              <Plus className="w-4 h-4" />
              Register to Sell
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAuctions.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}

    </div>
  );
};

export default DashboardPage;
