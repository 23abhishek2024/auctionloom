import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userApi, auctionApi, resolveImageUrl } from '../api/client';
import { formatDisplayName, getInitials } from '../utils/formatters';
import {
  Gavel,
  Trophy,
  TrendingUp,
  Tag,
  Clock,
  ArrowUpRight,
  PlusCircle,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Layers,
  Sparkles,
  Zap,
  Flame,
  Radio,
  RefreshCw,
} from 'lucide-react';

export const UserHubPage = () => {
  const { user, updateName, upgradeToSeller } = useAuth();
  const tabsSectionRef = useRef(null);

  const [stats, setStats] = useState({
    listedCount: 0,
    activeBidsCount: 0,
    wonCount: 0,
    totalBidsCount: 0,
    totalVolume: 0,
  });
  const [participations, setParticipations] = useState([]);
  const [myAuctions, setMyAuctions] = useState([]);
  const [wonAuctions, setWonAuctions] = useState([]);
  const [liveAuctions, setLiveAuctions] = useState([]);

  const [activeTab, setActiveTab] = useState('bids'); // 'bids', 'seller', 'won'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleCardClick = (tabKey) => {
    setActiveTab(tabKey);
    if (tabsSectionRef.current) {
      tabsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Edit Name Modal State
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const fetchHubData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsRes, bidsRes, auctionsRes, wonRes, exploreRes] = await Promise.all([
        userApi.getStats(),
        userApi.getMyBids(),
        userApi.getMyAuctions(),
        userApi.getMyWon(),
        auctionApi.getAll().catch(() => ({ data: { auctions: [] } })),
      ]);

      setStats(statsRes.data.stats || {});
      setParticipations(bidsRes.data.participations || []);
      setMyAuctions(auctionsRes.data.auctions || []);
      setWonAuctions(wonRes.data.wonAuctions || []);
      const activeList = (exploreRes.data?.auctions || []).filter(
        (a) => a.status === 'ACTIVE' && new Date(a.end_time) > new Date()
      );
      setLiveAuctions(activeList.slice(0, 3));
    } catch (err) {
      console.error('Failed to load user hub data:', err);
      setError(err.response?.data?.error || 'Failed to load your personal dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHubData();
  }, []);

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    try {
      setSavingName(true);
      await updateName(nameInput.trim());
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to update name:', err);
      alert(err.response?.data?.error || 'Failed to update name.');
    } finally {
      setSavingName(false);
    }
  };

  const displayName = user?.name || formatDisplayName(user);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* ── 1. Profile Banner & Header ───────────────────────── */}
      <div className="relative rounded-3xl glass-panel border border-slate-200/90 p-6 sm:p-8 mb-8 shadow-sm bg-white/95">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 text-white font-extrabold text-xl sm:text-2xl flex items-center justify-center shadow-lg shadow-indigo-500/25 border-2 border-white shrink-0">
              {getInitials(displayName)}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {displayName}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(user?.name || '');
                    setIsEditingName(true);
                  }}
                  className="text-slate-400 hover:text-indigo-600 p-1 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
                  title="Edit your display name"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                <span>{user?.email}</span>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                  Full Access Member
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline">Buyer & Seller Privileges</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/create"
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Launch Auction</span>
            </Link>
            <button
              onClick={fetchHubData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
              title="Refresh Dashboard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

        </div>

        {user?.role === 'bidder' && (
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 text-xs">
            <div className="flex items-center gap-2.5 text-indigo-900">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Your account is in <strong>Bidder Mode</strong>. Activate selling privileges to list items for auction!</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await upgradeToSeller();
                  fetchHubData();
                } catch (e) {
                  alert('Upgrade failed: ' + (e.response?.data?.error || e.message));
                }
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm shrink-0 cursor-pointer transition-colors"
            >
              Activate Seller Privileges
            </button>
          </div>
        )}

      </div>

      {/* ── 2. Metric KPI Cards Matrix ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        {/* Active Bids */}
        <button
          type="button"
          onClick={() => handleCardClick('bids')}
          className={`group relative text-left rounded-2xl p-5 bg-white shadow-sm transition-all duration-200 cursor-pointer border hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
            activeTab === 'bids'
              ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20'
              : 'border-slate-200/90 hover:border-indigo-300'
          }`}
          title="Click to view your active bids"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] uppercase font-mono tracking-wider font-semibold group-hover:text-indigo-600 transition-colors">
              Active Bids
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              activeTab === 'bids'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100'
            }`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
            {stats.activeBidsCount}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-400 font-mono">Live auctions participating</span>
            <span className="text-[10px] font-mono text-indigo-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
              View →
            </span>
          </div>
        </button>

        {/* Won Auctions */}
        <button
          type="button"
          onClick={() => handleCardClick('won')}
          className={`group relative text-left rounded-2xl p-5 bg-white shadow-sm transition-all duration-200 cursor-pointer border hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
            activeTab === 'won'
              ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20'
              : 'border-slate-200/90 hover:border-amber-300'
          }`}
          title="Click to view won items"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] uppercase font-mono tracking-wider font-semibold group-hover:text-amber-600 transition-colors">
              Trophies Won
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              activeTab === 'won'
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                : 'bg-amber-50 text-amber-600 group-hover:bg-amber-100'
            }`}>
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-600">
            {stats.wonCount}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-400 font-mono">Successfully claimed items</span>
            <span className="text-[10px] font-mono text-amber-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
              View →
            </span>
          </div>
        </button>

        {/* Listed by Me */}
        <button
          type="button"
          onClick={() => handleCardClick('seller')}
          className={`group relative text-left rounded-2xl p-5 bg-white shadow-sm transition-all duration-200 cursor-pointer border hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
            activeTab === 'seller'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20'
              : 'border-slate-200/90 hover:border-emerald-300'
          }`}
          title="Click to view created listings"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] uppercase font-mono tracking-wider font-semibold group-hover:text-emerald-600 transition-colors">
              My Listings
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              activeTab === 'seller'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100'
            }`}>
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
            {stats.listedCount}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-400 font-mono">Items published as seller</span>
            <span className="text-[10px] font-mono text-emerald-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
              View →
            </span>
          </div>
        </button>

        {/* Total Bids Placed */}
        <button
          type="button"
          onClick={() => handleCardClick('bids')}
          className={`group relative text-left rounded-2xl p-5 bg-white shadow-sm transition-all duration-200 cursor-pointer border hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
            activeTab === 'bids'
              ? 'border-violet-400 ring-2 ring-violet-500/20 bg-violet-50/10'
              : 'border-slate-200/90 hover:border-violet-300'
          }`}
          title="Click to view all bid activity"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] uppercase font-mono tracking-wider font-semibold group-hover:text-violet-600 transition-colors">
              Total Bids
            </span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
              <Gavel className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
            {stats.totalBidsCount}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-400 font-mono">Total bids submitted</span>
            <span className="text-[10px] font-mono text-violet-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
              View →
            </span>
          </div>
        </button>

      </div>

      {/* ── 3. Tabs Navigation ──────────────────────────────── */}
      <div ref={tabsSectionRef} className="glass-card border border-slate-200/90 rounded-3xl p-6 bg-white shadow-sm mb-8 scroll-mt-24">
        
        <div className="flex items-center gap-2 border-b border-slate-200 pb-4 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('bids')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'bids'
                ? 'btn-primary text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>My Bids & Participations ({participations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('seller')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'seller'
                ? 'btn-primary text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>My Created Auctions ({myAuctions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('won')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'won'
                ? 'btn-primary text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Won Items ({wonAuctions.length})</span>
          </button>
        </div>

        {/* ── TAB 1: BIDS & PARTICIPATIONS ───────────────────── */}
        {activeTab === 'bids' && (
          <div>
            {participations.length === 0 ? (
              <div className="py-6">
                <div className="text-center max-w-lg mx-auto mb-8">
                  <div className="w-14 h-14 rounded-3xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <TrendingUp className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 mb-1">
                    No Active Bids Yet
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    <strong>My Hub</strong> is your private bidding ledger. Since your account is newly registered, you haven't placed any bids yet. Explore the live marketplace below and place your first bid!
                  </p>
                  <Link
                    to="/"
                    className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md shadow-indigo-500/20"
                  >
                    <span>Browse All Live Auctions</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Jumpstart Row: Featured Live Auctions */}
                {liveAuctions.length > 0 && (
                  <div className="border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-700">
                          Recommended Auctions To Bid On
                        </h4>
                      </div>
                      <Link to="/" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                        View All Auctions →
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {liveAuctions.map((item) => (
                        <div
                          key={item.id}
                          className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 hover:bg-white hover:border-indigo-300 transition-all flex flex-col justify-between shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <img
                              src={resolveImageUrl(item.image_url)}
                              alt={item.title}
                              className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <h5 className="text-xs font-bold text-slate-900 truncate mb-1">
                                {item.title}
                              </h5>
                              <span className="text-[11px] font-mono text-indigo-600 font-bold block">
                                Current: ${parseFloat(item.current_price).toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Seller: {item.seller_name || 'Verified Seller'}
                              </span>
                            </div>
                          </div>

                          <Link
                            to={`/auctions/${item.id}`}
                            className="btn-primary text-center py-2 rounded-xl text-xs font-semibold shadow-sm block"
                          >
                            Enter Live Room & Bid
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {participations.map((item) => {
                  const isClosed = item.status === 'CLOSED' || new Date(item.end_time) <= new Date();
                  const isWinning = !isClosed && item.is_highest_bidder;
                  const isOutbid = !isClosed && !item.is_highest_bidder;
                  const isWon = isClosed && item.is_winner;

                  return (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 hover:bg-white hover:border-indigo-300 transition-all flex flex-col justify-between shadow-sm hover:shadow-md"
                    >
                      <div className="flex gap-4 mb-3">
                        <img
                          src={resolveImageUrl(item.image_url)}
                          alt={item.title}
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isWinning && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                WINNING (Highest Bidder)
                              </span>
                            )}
                            {isOutbid && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                OUTBID
                              </span>
                            )}
                            {isWon && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                <Trophy className="w-3 h-3 text-amber-600" />
                                YOU WON
                              </span>
                            )}
                            {isClosed && !isWon && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                CONCLUDED
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 truncate mb-1">
                            {item.title}
                          </h4>
                          <span className="text-[11px] text-slate-500 font-mono block">
                            Seller: {item.seller_name || 'Verified Seller'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs font-mono">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">My Bid / Current</span>
                          <span className="font-bold text-slate-900">
                            ${parseFloat(item.my_highest_bid).toFixed(2)}
                          </span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="font-bold text-indigo-600">
                            ${parseFloat(item.current_price).toFixed(2)}
                          </span>
                        </div>

                        <Link
                          to={`/auctions/${item.id}`}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-sans font-semibold text-xs transition-all ${
                            isOutbid
                              ? 'btn-primary shadow-sm'
                              : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700'
                          }`}
                        >
                          <span>{isOutbid ? 'Place Higher Bid' : 'View Auction'}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: MY CREATED AUCTIONS (SELLER) ───────────── */}
        {activeTab === 'seller' && (
          <div>
            {myAuctions.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                  <Tag className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">No Auctions Listed Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                  You have full selling privileges! Publish a luxury watch, collector vehicle, or fine art piece to start accepting live bids.
                </p>
                <Link
                  to="/create"
                  className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>List Your First Auction</span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myAuctions.map((item) => {
                  const isClosed = item.status === 'CLOSED' || new Date(item.end_time) <= new Date();

                  return (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 hover:bg-white hover:border-indigo-300 transition-all flex flex-col justify-between shadow-sm hover:shadow-md"
                    >
                      <div className="flex gap-4 mb-3">
                        <img
                          src={resolveImageUrl(item.image_url)}
                          alt={item.title}
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              isClosed
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {isClosed ? 'CONCLUDED' : 'LIVE'}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {item.total_bids} bids received
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 truncate mb-1">
                            {item.title}
                          </h4>
                          {isClosed && item.winner_name ? (
                            <span className="text-[11px] text-amber-700 font-mono block">
                              Winner: <strong>{item.winner_name}</strong>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono block">
                              Starts at: ${parseFloat(item.starting_price).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs font-mono">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">
                            {isClosed ? 'Sold For' : 'Current Price'}
                          </span>
                          <span className="font-extrabold text-slate-900 text-sm">
                            ${parseFloat(item.current_price).toFixed(2)}
                          </span>
                        </div>

                        <Link
                          to={`/auctions/${item.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-sans font-semibold text-xs bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors"
                        >
                          <span>View Live Room</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: WON ITEMS (TROPHIES) ────────────────────── */}
        {activeTab === 'won' && (
          <div>
            {wonAuctions.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">No Trophies Claimed Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                  Place competitive bids on live auctions to claim your first luxury win!
                </p>
                <Link
                  to="/"
                  className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm"
                >
                  Explore Active Auctions
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {wonAuctions.map((item) => (
                  <div
                    key={item.id}
                    className="border border-amber-200 bg-amber-50/50 rounded-2xl p-4 flex flex-col justify-between shadow-sm"
                  >
                    <div className="flex gap-4 mb-3">
                      <img
                        src={resolveImageUrl(item.image_url)}
                        alt={item.title}
                        className="w-20 h-20 rounded-xl object-cover border border-amber-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 mb-1.5">
                          <Trophy className="w-3 h-3 text-amber-600" />
                          <span>OFFICIALLY WON</span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 truncate mb-1">
                          {item.title}
                        </h4>
                        <span className="text-[11px] text-slate-500 font-mono block">
                          Seller: {item.seller_name || 'Verified Seller'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-amber-200/80 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Winning Hammer Price</span>
                        <span className="font-extrabold text-amber-700 text-base">
                          ${parseFloat(item.current_price).toFixed(2)}
                        </span>
                      </div>

                      <Link
                        to={`/auctions/${item.id}`}
                        className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-sans font-semibold text-xs shadow-sm"
                      >
                        <span>View Certificate</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Quick Edit Name Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-extrabold tracking-tight text-slate-900 mb-1">
              Set Your Display Name
            </h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              This name will be shown publicly to other users on live bids, auction rooms, and chat.
            </p>
            <form onSubmit={handleSaveName}>
              <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-700 mb-1.5">
                Your Full Name
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Abhishek Kumar"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 mb-5 text-slate-900 shadow-sm"
                autoFocus
                required
              />
              <div className="flex justify-end items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingName || !nameInput.trim()}
                  className="btn-primary px-5 py-2 rounded-xl text-xs font-semibold shadow-md shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {savingName ? 'Saving...' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default UserHubPage;
