import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { walletApi } from '../api/client';
import { TopupModal } from './TopupModal';
import { Gavel, PlusCircle, LogIn, LogOut, UserPlus, Radio, Pencil, LayoutDashboard, Trophy, ShieldAlert, DollarSign, HelpCircle, Wallet, Zap } from 'lucide-react';
import { formatDisplayName, getInitials } from '../utils/formatters';

export const Navbar = () => {
  const { user, isAuthenticated, logout, updateName } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Wallet State
  const [walletBalance, setWalletBalance] = useState(0);
  const [isTopupOpen, setIsTopupOpen] = useState(false);

  const fetchWallet = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await walletApi.getWallet();
      if (res.data?.data?.wallet) {
        setWalletBalance(parseFloat(res.data.data.wallet.balance || 0));
      }
    } catch (err) {
      console.warn('Could not load wallet in navbar:', err.message);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchWallet();
    }
    const handleWalletUpdated = () => fetchWallet();
    window.addEventListener('wallet_updated', handleWalletUpdated);
    return () => window.removeEventListener('wallet_updated', handleWalletUpdated);
  }, [isAuthenticated]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'auctioneer':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-2xl shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/25 ring-1 ring-indigo-500/20 group-hover:scale-105 transition-transform duration-200">
                <Gavel className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-tight text-slate-900">
                  Auction<span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Loom</span>
                </span>
                <span className="hidden sm:block text-[9px] uppercase font-mono tracking-widest text-slate-400 -mt-0.5">
                  Real-Time Auction Engine
                </span>
              </div>
            </Link>

            {/* Socket Status indicator */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs shadow-inner">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-slate-600 font-mono text-[11px] font-medium">
                {isConnected ? 'LIVE SYNC' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-1 sm:gap-2">
            <Link
              to="/"
              className="px-3 py-1.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
            >
              Auctions
            </Link>

            <Link
              to="/leaderboard"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-600 hover:text-amber-600 hover:bg-amber-50/50 transition-all"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>Leaderboard</span>
            </Link>

            <Link
              to="/how-it-works"
              className="px-3 py-1.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
            >
              Guide
            </Link>

            {isAuthenticated && (
              <>
                <Link
                  to="/my-hub"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-100 transition-all"
                >
                  <LayoutDashboard className="w-4 h-4 text-indigo-500" />
                  <span>My Hub</span>
                </Link>

                <Link
                  to="/submit-commission"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-all"
                  title="Commission & Proofs"
                >
                  <DollarSign className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Commission</span>
                </Link>

                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-all shadow-sm"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    <span>Admin</span>
                  </Link>
                )}

                <Link
                  to="/create"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm"
                >
                  <PlusCircle className="w-4 h-4 text-indigo-600" />
                  <span>Create</span>
                </Link>
              </>
            )}
          </div>


          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {/* Wallet Balance Pill & Quick Top-Up */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 shadow-xs">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs font-mono font-extrabold tracking-tight">
                    ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsTopupOpen(true)}
                    className="ml-1 px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-xs"
                    title="Instant Wallet Top-Up"
                  >
                    + Top Up
                  </button>
                </div>

                {/* User info & role badge - Links to My Hub */}
                <Link
                  to="/my-hub"
                  className="flex items-center gap-2.5 p-1 rounded-2xl hover:bg-slate-100/80 transition-all group cursor-pointer"
                  title="View My Hub Dashboard"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-semibold text-xs flex items-center justify-center shadow-sm shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                    {getInitials(user?.name || user?.email)}
                  </div>
                  <div className="hidden sm:flex flex-col items-start text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-900 max-w-[130px] truncate group-hover:text-indigo-600 transition-colors" title={user?.email}>
                        {user?.name || formatDisplayName(user)}
                      </span>
                    </div>
                    <span className={`text-[10px] uppercase font-mono font-medium px-2 py-0.2 rounded-full border ${getRoleBadge(user?.role)}`}>
                      {user?.role}
                    </span>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setNameInput(user?.name || '');
                    setIsEditingName(true);
                  }}
                  className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
                  title="Quick change display name"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                  title="Logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
                >
                  <LogIn className="w-4 h-4 text-slate-500" />
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="btn-primary flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  Register
                </Link>
              </div>
            )}
          </div>

        </div>
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
      {/* Top Up Wallet Modal */}
      <TopupModal
        isOpen={isTopupOpen}
        onClose={() => setIsTopupOpen(false)}
        onSuccess={(w) => {
          if (w) setWalletBalance(parseFloat(w.balance || 0));
          window.dispatchEvent(new Event('wallet_updated'));
        }}
        currentBalance={walletBalance}
      />
    </nav>
  );
};

export default Navbar;
