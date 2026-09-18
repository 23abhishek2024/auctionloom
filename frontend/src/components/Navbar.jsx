import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { walletApi } from '../api/client';
import { TopupModal } from './TopupModal';
import { 
  Gavel, 
  PlusCircle, 
  LogIn, 
  LogOut, 
  UserPlus, 
  Radio, 
  Pencil, 
  LayoutDashboard, 
  Trophy, 
  ShieldAlert, 
  HelpCircle, 
  Wallet, 
  Zap,
  ChevronDown
} from 'lucide-react';
import { formatDisplayName, getInitials } from '../utils/formatters';

export const Navbar = () => {
  const { user, isAuthenticated, logout, updateName } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Profile Dropdown Menu State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsDropdownOpen(false);
    }, 250);
  };

  // Wallet State
  const [walletBalance, setWalletBalance] = useState(0);
  const [isTopupOpen, setIsTopupOpen] = useState(false);

  // Click-outside listener for profile dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Escape key listener to close dropdown
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsDropdownOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchWallet = async () => {
    if (!isAuthenticated) {
      setWalletBalance(0);
      return;
    }
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
    } else {
      setWalletBalance(0);
    }
    const handleWalletUpdated = () => fetchWallet();
    window.addEventListener('wallet_updated', handleWalletUpdated);
    return () => window.removeEventListener('wallet_updated', handleWalletUpdated);
  }, [isAuthenticated, user?.id]);

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

            {isAuthenticated && (user?.role === 'auctioneer' || user?.role === 'admin') && (
              <Link
                to="/create"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm ml-1"
              >
                <PlusCircle className="w-4 h-4 text-indigo-600" />
                <span>Create</span>
              </Link>
            )}
          </div>


          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">

                {/* Modern User Profile Dropdown Pill */}
                <div 
                  className="relative" 
                  ref={dropdownRef}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(prev => !prev)}
                    className={`flex items-center gap-2 sm:gap-2.5 p-1 sm:p-1.5 sm:pr-3 rounded-2xl border transition-all cursor-pointer select-none ${
                      isDropdownOpen 
                        ? 'bg-slate-100 border-indigo-300 ring-2 ring-indigo-500/20 shadow-sm' 
                        : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-xs'
                    }`}
                    aria-expanded={isDropdownOpen}
                    aria-label="User profile menu"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 text-white font-semibold text-xs flex items-center justify-center shadow-sm shadow-indigo-500/20 shrink-0">
                      {getInitials(user?.name || user?.email)}
                    </div>
                    <div className="hidden sm:flex flex-col items-start text-left leading-tight">
                      <span className="text-xs font-semibold text-slate-900 max-w-[120px] truncate" title={user?.email}>
                        {user?.name || formatDisplayName(user)}
                      </span>
                      <span className={`text-[9px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-md border mt-0.5 ${getRoleBadge(user?.role)}`}>
                        {user?.role}
                      </span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`} />
                  </button>

                  {/* Dropdown Menu Panel */}
                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-3xl bg-white/95 backdrop-blur-2xl border border-slate-200/90 shadow-2xl shadow-slate-900/15 py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                      {/* User Account Info Header */}
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 text-white font-bold text-sm flex items-center justify-center shadow-md shadow-indigo-500/25 shrink-0">
                          {getInitials(user?.name || user?.email)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {user?.name || formatDisplayName(user)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsDropdownOpen(false);
                                setNameInput(user?.name || '');
                                setIsEditingName(true);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
                              title="Edit Display Name"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-xs text-slate-500 truncate font-mono">
                            {user?.email}
                          </p>
                          <div className="mt-1">
                            <span className={`inline-block text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full border ${getRoleBadge(user?.role)}`}>
                              {user?.role}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Balance Preview Card */}
                      <div className="mx-3 my-2.5 p-3 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-50 to-teal-50/40 border border-emerald-200/70 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] uppercase font-mono font-bold tracking-wider text-emerald-700">
                            Available Balance
                          </div>
                          <div className="text-base font-extrabold font-mono text-emerald-950">
                            ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-emerald-700">USD</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            setIsTopupOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Top Up</span>
                        </button>
                      </div>

                      {/* Navigation Links */}
                      <div className="px-2 py-1 space-y-0.5">
                        <Link
                          to="/my-hub"
                          onClick={() => setIsDropdownOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition-colors group"
                        >
                          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <LayoutDashboard className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-slate-800 group-hover:text-indigo-600">My Hub / Dashboard</div>
                            <div className="text-[10px] text-slate-400 font-normal">Active bids, won lots & listings</div>
                          </div>
                        </Link>

                        <Link
                          to="/wallet"
                          onClick={() => setIsDropdownOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-emerald-600 hover:bg-slate-50 transition-colors group"
                        >
                          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                            <Wallet className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-slate-800 group-hover:text-emerald-600">Wallet & Ledger</div>
                            <div className="text-[10px] text-slate-400 font-normal">Transaction history & balance</div>
                          </div>
                        </Link>

                        {(user?.role === 'auctioneer' || user?.role === 'admin') && (
                          <Link
                            to="/create"
                            onClick={() => setIsDropdownOpen(false)}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-violet-600 hover:bg-slate-50 transition-colors group"
                          >
                            <div className="p-1.5 rounded-lg bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                              <PlusCircle className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-slate-800 group-hover:text-violet-600">Create New Auction</div>
                              <div className="text-[10px] text-slate-400 font-normal">List item for live bidding</div>
                            </div>
                          </Link>
                        )}

                        {user?.role === 'admin' && (
                          <Link
                            to="/admin"
                            onClick={() => setIsDropdownOpen(false)}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-rose-600 hover:bg-rose-50/60 transition-colors group"
                          >
                            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                              <ShieldAlert className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-slate-800 group-hover:text-rose-600">Super Admin Panel</div>
                              <div className="text-[10px] text-slate-400 font-normal">Commission ledger & moderation</div>
                            </div>
                          </Link>
                        )}

                        <Link
                          to="/how-it-works"
                          onClick={() => setIsDropdownOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors group"
                        >
                          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-slate-800 group-hover:text-white transition-colors">
                            <HelpCircle className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-slate-800">How It Works</div>
                            <div className="text-[10px] text-slate-400 font-normal">Auction rules & platform guide</div>
                          </div>
                        </Link>
                      </div>

                      {/* Divider */}
                      <div className="my-1.5 border-t border-slate-100" />

                      {/* Logout Action */}
                      <div className="px-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            handleLogout();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer group"
                        >
                          <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                            <LogOut className="w-4 h-4" />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-bold">Sign Out</div>
                            <div className="text-[10px] text-rose-400 font-normal">Log out of this account</div>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
