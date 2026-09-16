import React, { useState } from 'react';
import { walletApi } from '../api/client';
import {
  Wallet,
  X,
  Zap,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

export const TopupModal = ({ isOpen, onClose, onSuccess, initialAmount = '', currentBalance = 0 }) => {
  const [amount, setAmount] = useState(initialAmount ? initialAmount.toString() : '1000');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amount) || 0;
  const projectedBalance = currentBalance + numericAmount;

  const quickAmounts = [500, 1000, 5000, 10000, 25000];

  const handleTopup = async (e) => {
    e?.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (numericAmount <= 0) {
      setErrorMessage('Please specify an amount greater than $0.');
      return;
    }

    try {
      setLoading(true);
      const res = await walletApi.topup({
        amount: numericAmount,
        note: 'Instant platform simulated top-up',
      });

      const newWallet = res.data?.data?.wallet;
      setSuccessMessage(`Successfully added $${numericAmount.toLocaleString()} to your wallet!`);

      if (onSuccess) {
        onSuccess(newWallet);
      }

      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Top-up error:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to complete top-up. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-mono font-semibold mb-2">
            <Zap className="w-3.5 h-3.5 fill-emerald-300" /> Instant Platform Funding
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">Top Up Platform Wallet</h2>
          <p className="text-xs text-indigo-200/80 mt-1">
            Fund your internal bidding and settlement balance instantly.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 font-medium shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 font-medium shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Balance Preview Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Current Balance</span>
              <span className="text-sm font-extrabold text-slate-800">
                ${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <div className="text-right">
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Projected Balance</span>
              <span className="text-sm font-extrabold text-emerald-600">
                ${projectedBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 font-mono">
              Quick Select Amount
            </label>
            <div className="grid grid-cols-5 gap-2">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q.toString())}
                  className={`py-2 px-1 rounded-xl text-xs font-bold font-mono transition-all border ${
                    numericAmount === q
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  ${q >= 1000 ? `${q / 1000}k` : q}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount Input */}
          <form onSubmit={handleTopup} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 font-mono">
                Custom Deposit Amount ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-base">
                  $
                </span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-300 text-slate-900 font-mono font-extrabold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono bg-indigo-50/60 border border-indigo-100 p-2.5 rounded-xl">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Simulated Instant Clearing — zero waiting time for live auction bidding.</span>
            </div>

            <button
              type="submit"
              disabled={loading || numericAmount <= 0}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Funding Wallet...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-white" />
                  <span>Deposit ${numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} Now</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
