import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Mail, Lock, AlertCircle, Gavel, UserCheck, Eye, EyeOff, Sparkles } from 'lucide-react';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { user, isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  // If already logged in, redirect to home marketplace
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  // Quick fill helper for local testing
  const handleQuickFill = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  };

  return (
    <div className="min-h-[calc(100vh-130px)] flex items-center justify-center px-4 py-6 sm:py-10">
      <div className="max-w-md w-full glass-panel border border-slate-200/90 rounded-3xl p-6 sm:p-9 shadow-xl shadow-slate-200/50 bg-white/95 backdrop-blur-xl">
        
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto mb-3 text-indigo-600 shadow-sm">
            <Gavel className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Welcome Back
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Sign in to access live bidding and real-time auctions.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-700 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors placeholder:text-slate-400 shadow-sm"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors placeholder:text-slate-400 shadow-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white btn-primary transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-500/25 active:scale-[0.99] mt-2"
          >
            <LogIn className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Signing In...' : 'Sign In'}</span>
          </button>

        </form>

        {/* Quick Demo Accounts Helpers */}
        <div className="mt-7 pt-5 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
              1-Click Demo Logins
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Pass: test@123
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickFill('test1@gmail.com', 'test@123')}
              className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 text-left transition-all cursor-pointer group"
            >
              <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">Test1</div>
              <div className="text-[10px] font-mono text-slate-500 truncate">test1@gmail.com</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('test2@gmail.com', 'test@123')}
              className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 text-left transition-all cursor-pointer group"
            >
              <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">Test2</div>
              <div className="text-[10px] font-mono text-slate-500 truncate">test2@gmail.com</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('test3@gmail.com', 'test@123')}
              className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 text-left transition-all cursor-pointer group"
            >
              <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">Test3</div>
              <div className="text-[10px] font-mono text-slate-500 truncate">test3@gmail.com</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('admin@gmail.com', 'test@123')}
              className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-rose-50/70 border border-slate-200 hover:border-rose-300 text-left transition-all cursor-pointer group"
            >
              <div className="text-xs font-bold text-slate-800 group-hover:text-rose-600">Admin</div>
              <div className="text-[10px] font-mono text-slate-500 truncate">admin@gmail.com</div>
            </button>
          </div>
        </div>

        {/* Footer link */}
        <div className="mt-6 text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-indigo-600 hover:text-indigo-700 font-semibold underline underline-offset-4">
            Register now
          </Link>
        </div>

      </div>
    </div>
  );
};

export default LoginPage;
