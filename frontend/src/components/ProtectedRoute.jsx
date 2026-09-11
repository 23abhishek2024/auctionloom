import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
          <span className="text-xs text-zinc-400 font-mono">Authenticating...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-card p-8 rounded-3xl border border-rose-500/20 text-center bg-[#090A12]/90 backdrop-blur-xl shadow-2xl">
          <h2 className="text-xl font-bold text-rose-400 mb-2">Access Restricted</h2>
          <p className="text-sm text-zinc-400 mb-6">
            Your role (<span className="font-mono text-zinc-200">{user?.role}</span>) does not have permission to access this page.
          </p>
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#101322] hover:bg-[#161a2e] border border-white/[0.08] hover:border-violet-500/40 transition-colors"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
