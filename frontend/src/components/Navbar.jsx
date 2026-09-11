import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Gavel, PlusCircle, LogIn, LogOut, UserPlus, Radio } from 'lucide-react';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      case 'auctioneer':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      default:
        return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#07080C]/85 backdrop-blur-2xl shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-600/30 ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-200">
                <Gavel className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
                  Auction<span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">Loom</span>
                </span>
                <span className="hidden sm:block text-[9px] uppercase font-mono tracking-widest text-zinc-400 -mt-0.5">
                  Real-Time Auction Engine
                </span>
              </div>
            </Link>

            {/* Socket Status indicator */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10121B] border border-white/[0.08] text-xs shadow-inner">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-zinc-400 font-mono text-[11px]">
                {isConnected ? 'LIVE SYNC' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              to="/"
              className="px-3.5 py-1.5 rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              Auctions
            </Link>

            {isAuthenticated && (user?.role === 'auctioneer' || user?.role === 'admin') && (
              <Link
                to="/create"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium text-violet-300 hover:text-white bg-violet-600/15 hover:bg-violet-600/30 border border-violet-500/30 transition-all shadow-sm"
              >
                <PlusCircle className="w-4 h-4 text-violet-400" />
                Create Auction
              </Link>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {/* User info & role badge */}
                <div className="hidden sm:flex flex-col items-end text-right">
                  <span className="text-xs font-semibold text-zinc-200 max-w-[140px] truncate">
                    {user?.email}
                  </span>
                  <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border ${getRoleBadge(user?.role)}`}>
                    {user?.role}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-[#12141D] hover:bg-[#1A1D2A] border border-white/[0.08] transition-all cursor-pointer"
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
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  <LogIn className="w-4 h-4 text-zinc-400" />
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="btn-primary flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-violet-600/25 transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  Register
                </Link>
              </div>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
};

export default Navbar;
