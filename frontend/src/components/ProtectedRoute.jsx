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
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shadow-md shadow-indigo-500/20" />
          <span className="text-xs text-slate-500 font-mono">Authenticating...</span>
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
        <div className="max-w-md w-full glass-card p-8 rounded-3xl border border-rose-200 text-center bg-white shadow-xl">
          <h2 className="text-xl font-bold text-rose-600 mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-600 mb-6">
            Your role (<span className="font-mono text-slate-900 font-semibold">{user?.role}</span>) does not have permission to access this page.
          </p>
          <a
            href="/"
            className="inline-flex items-center px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-sm"
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
