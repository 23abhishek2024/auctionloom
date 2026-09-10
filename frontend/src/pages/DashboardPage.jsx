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
      <div className="relative rounded-3xl overflow-hidden glass-panel border border-slate-800/80 p-8 sm:p-12 mb-10 shadow-2xl">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono mb-4">
            <Zap className="w-3.5 h-3.5 animate-pulse" />
            <span>PostgreSQL Row Locking & WebSockets</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            High-Speed Live Bidding. Zero Double-Wins.
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-6">
            Engineered with strict pessimistic locking (`FOR UPDATE`) and distributed job queues.
            Place bids with instantaneous WebSocket price broadcasts and sub-millisecond consistency.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {isAuthenticated && (user?.role === 'auctioneer' || user?.role === 'admin') ? (
              <Link
                to="/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 transition-all"
              >
                <Plus className="w-4 h-4" />
                Launch New Auction
              </Link>
            ) : null}

            <button
              onClick={fetchAuctions}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg">
          <div>
            <div className="text-2xl font-bold text-white font-mono">{auctions.length}</div>
            <div className="text-xs text-slate-400">Total Auctions</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400 font-mono">{activeCount}</div>
            <div className="text-xs text-slate-400">Active Now</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-2xl font-bold text-indigo-400 font-mono">100%</div>
            <div className="text-xs text-slate-400">ACID Guaranteed</div>
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
            className="w-full pl-10 pr-4 py-2 rounded-xl text-sm bg-slate-900/80 border border-slate-800 focus:border-indigo-500 focus:outline-none text-slate-200 placeholder:text-slate-400 transition-colors"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800 w-full md:w-auto overflow-x-auto">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'ACTIVE', label: 'Active' },
            { id: 'ENDING_SOON', label: 'Ending Soon' },
            { id: 'CLOSED', label: 'Closed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                filterStatus === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>

      {/* Content Area */}
      {error ? (
        <div className="glass-card border border-rose-500/30 p-6 rounded-2xl text-center">
          <p className="text-rose-400 font-semibold mb-2">Error loading auctions</p>
          <p className="text-sm text-slate-400 mb-4">{error}</p>
          <button
            onClick={fetchAuctions}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700"
          >
            Try Again
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-64 rounded-2xl glass-card border border-slate-800 animate-pulse p-5 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-4 bg-slate-800 rounded w-1/3" />
                <div className="h-6 bg-slate-800 rounded w-3/4" />
                <div className="h-4 bg-slate-800 rounded w-full" />
              </div>
              <div className="h-10 bg-slate-800 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredAuctions.length === 0 ? (
        <div className="glass-card border border-slate-800 p-12 rounded-3xl text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 text-indigo-400">
            <Flame className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-200 mb-1">No Auctions Found</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto mb-6">
            {searchQuery
              ? `No results matching "${searchQuery}". Try adjusting your filters.`
              : 'There are no auctions available right now.'}
          </p>
          {isAuthenticated && (user?.role === 'auctioneer' || user?.role === 'admin') && (
            <Link
              to="/create"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500"
            >
              <Plus className="w-4 h-4" />
              Create the First Auction
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
