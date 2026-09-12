import React, { useState, useEffect } from 'react';
import { userApi } from '../api/client';
import { Trophy, Medal, Award, Crown, Search, RefreshCw, Flame, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LeaderboardPage = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await userApi.getLeaderboard();
      setLeaderboard(res.data.leaderboard || []);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      setError(err.response?.data?.error || 'Failed to load leaderboard rankings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const filtered = leaderboard.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.tier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const top1 = leaderboard[0];
  const top2 = leaderboard[1];
  const top3 = leaderboard[2];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 shadow-2xl p-8 sm:p-12 mb-10 text-white">
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-80 h-80 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-4">
              <Trophy className="w-3.5 h-3.5" /> High-Roller Hall of Fame
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-3">
              Bidders Leaderboard
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-2xl leading-relaxed">
              Celebrating our most distinguished collectors and active bidders. Ranked in real-time by total verified expenditure and auction victories.
            </p>
          </div>

          <button
            onClick={fetchLeaderboard}
            disabled={loading}
            className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-sm font-medium transition-all backdrop-blur-md text-white shadow-lg active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Ranks
          </button>
        </div>
      </div>

      {/* Podium Display (Top 3) */}
      {!loading && leaderboard.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 items-end">
          {/* Rank 2 - Silver */}
          {top2 && (
            <div className="order-2 md:order-1 rounded-2xl bg-white border border-slate-200/80 shadow-lg p-6 relative overflow-hidden text-center hover:shadow-xl transition-all">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />
              <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 border-2 border-slate-300 flex items-center justify-center text-slate-700 shadow-inner mb-3">
                <Medal className="w-8 h-8 text-slate-500" />
              </div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold mb-2">
                #2 Silver Collector
              </span>
              <h3 className="text-lg font-bold text-slate-900 truncate">{top2.username}</h3>
              <p className="text-xs text-slate-500 mb-4">{top2.email}</p>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-around text-xs">
                <div>
                  <span className="block text-slate-400 font-mono">Volume</span>
                  <span className="font-bold text-slate-800 text-sm font-mono">
                    ${top2.totalSpent.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-400 font-mono">Won</span>
                  <span className="font-bold text-emerald-600 text-sm">{top2.auctionsWon}</span>
                </div>
              </div>
            </div>
          )}

          {/* Rank 1 - Gold (Center, Elevated) */}
          {top1 && (
            <div className="order-1 md:order-2 rounded-2xl bg-gradient-to-b from-amber-50 to-white border-2 border-amber-400 shadow-2xl p-7 relative overflow-hidden text-center transform md:-translate-y-4 hover:shadow-amber-500/20 transition-all">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500" />
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 border-4 border-white flex items-center justify-center text-white shadow-xl mb-3">
                <Crown className="w-10 h-10 drop-shadow-md text-white" />
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500 text-slate-900 text-xs font-black uppercase tracking-wider mb-2 shadow-sm">
                <Sparkles className="w-3.5 h-3.5" /> #1 Grand Master
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 truncate">{top1.username}</h3>
              <p className="text-xs text-slate-500 mb-4">{top1.email}</p>
              <div className="pt-4 border-t border-amber-200/60 flex items-center justify-around text-xs">
                <div>
                  <span className="block text-amber-800/70 font-mono">Total Volume</span>
                  <span className="font-black text-amber-600 text-base font-mono">
                    ${top1.totalSpent.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="block text-amber-800/70 font-mono">Victories</span>
                  <span className="font-black text-emerald-600 text-base">{top1.auctionsWon} Won</span>
                </div>
                <div>
                  <span className="block text-amber-800/70 font-mono">Bids</span>
                  <span className="font-black text-indigo-600 text-base">{top1.totalBids}</span>
                </div>
              </div>
            </div>
          )}

          {/* Rank 3 - Bronze */}
          {top3 && (
            <div className="order-3 rounded-2xl bg-white border border-slate-200/80 shadow-lg p-6 relative overflow-hidden text-center hover:shadow-xl transition-all">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-600 via-orange-400 to-amber-600" />
              <div className="w-16 h-16 mx-auto rounded-full bg-orange-50 border-2 border-orange-300 flex items-center justify-center text-orange-700 shadow-inner mb-3">
                <Award className="w-8 h-8 text-amber-700" />
              </div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs font-bold mb-2">
                #3 Bronze Collector
              </span>
              <h3 className="text-lg font-bold text-slate-900 truncate">{top3.username}</h3>
              <p className="text-xs text-slate-500 mb-4">{top3.email}</p>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-around text-xs">
                <div>
                  <span className="block text-slate-400 font-mono">Volume</span>
                  <span className="font-bold text-slate-800 text-sm font-mono">
                    ${top3.totalSpent.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-400 font-mono">Won</span>
                  <span className="font-bold text-emerald-600 text-sm">{top3.auctionsWon}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm p-4 mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by username, email, or tier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <span>Showing {filtered.length} ranked collectors</span>
        </div>
      </div>

      {/* Rankings Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600" />
            <p className="text-sm font-medium">Computing platform rankings...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-red-500">
            <p className="text-sm">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-700">No matching bidders found</p>
            <p className="text-xs text-slate-400 mt-1">Start bidding on active auctions to claim your place on the leaderboard!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                  <th className="py-4 px-6 text-center w-20">Rank</th>
                  <th className="py-4 px-6">Collector</th>
                  <th className="py-4 px-6">Standing Tier</th>
                  <th className="py-4 px-6 text-center">Bids Placed</th>
                  <th className="py-4 px-6 text-center">Auctions Won</th>
                  <th className="py-4 px-6 text-right">Total Expenditure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((bidder) => {
                  const isTop1 = bidder.rank === 1;
                  const isTop2 = bidder.rank === 2;
                  const isTop3 = bidder.rank === 3;

                  return (
                    <tr
                      key={bidder.id}
                      className={`transition-colors hover:bg-indigo-50/30 ${
                        isTop1 ? 'bg-amber-50/40 font-semibold' : ''
                      }`}
                    >
                      {/* Rank Number */}
                      <td className="py-4 px-6 text-center">
                        {isTop1 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white font-bold text-xs shadow-md">
                            1
                          </span>
                        ) : isTop2 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-400 text-white font-bold text-xs shadow">
                            2
                          </span>
                        ) : isTop3 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700 text-white font-bold text-xs shadow">
                            3
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono font-bold text-sm">
                            #{bidder.rank}
                          </span>
                        )}
                      </td>

                      {/* User Info */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-sm ${
                              isTop1
                                ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 ring-2 ring-amber-300'
                                : isTop2
                                ? 'bg-gradient-to-tr from-slate-400 to-slate-500'
                                : isTop3
                                ? 'bg-gradient-to-tr from-amber-700 to-orange-500'
                                : 'bg-gradient-to-tr from-indigo-500 to-purple-600'
                            }`}
                          >
                            {bidder.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {bidder.username}
                              {isTop1 && <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">{bidder.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Tier Badge */}
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            bidder.tier === 'Grand Master'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : bidder.tier === 'High Roller'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : bidder.tier === 'VIP Collector'
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {bidder.tier === 'Grand Master' && <Flame className="w-3 h-3 text-amber-500" />}
                          {bidder.tier}
                        </span>
                      </td>

                      {/* Bids Placed */}
                      <td className="py-4 px-6 text-center font-mono text-slate-700">
                        {bidder.totalBids}
                      </td>

                      {/* Auctions Won */}
                      <td className="py-4 px-6 text-center font-semibold text-emerald-600">
                        {bidder.auctionsWon > 0 ? `${bidder.auctionsWon} Won` : '—'}
                      </td>

                      {/* Total Expenditure */}
                      <td className="py-4 px-6 text-right font-mono font-bold text-slate-900 text-base">
                        ${bidder.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
