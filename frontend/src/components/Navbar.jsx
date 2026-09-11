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
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs shadow-inner">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-slate-600 font-mono text-[11px] font-medium">
                {isConnected ? 'LIVE SYNC' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              to="/"
              className="px-3.5 py-1.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
            >
              Auctions
            </Link>

            {isAuthenticated && (user?.role === 'auctioneer' || user?.role === 'admin') && (
              <Link
                to="/create"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm"
              >
                <PlusCircle className="w-4 h-4 text-indigo-600" />
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
                  <span className="text-xs font-semibold text-slate-800 max-w-[140px] truncate">
                    {user?.email}
                  </span>
                  <span className={`text-[10px] uppercase font-mono font-medium px-2 py-0.5 rounded-full border ${getRoleBadge(user?.role)}`}>
                    {user?.role}
                  </span>
                </div>

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
    </nav>
  );
};

export default Navbar;
