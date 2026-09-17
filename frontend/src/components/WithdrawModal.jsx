import React, { useState } from 'react';
import { walletApi } from '../api/client';
import {
  Wallet,
  X,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  RefreshCw,
  ShieldCheck,
  Building2,
} from 'lucide-react';

export const WithdrawModal = ({ isOpen, onClose, onSuccess, currentBalance = 0 }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amount) || 0;
  const isOverdraft = numericAmount > currentBalance;
  const projectedBalance = Math.max(0, currentBalance - numericAmount);

  const quickAmounts = [50, 100, 250, 500];

  const handleWithdraw = async (e) => {
    e?.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (numericAmount <= 0) {
      setErrorMessage('Please specify an amount greater than $0.');
      return;
    }

    if (isOverdraft) {
      setErrorMessage(`Insufficient funds. Your available balance is $${currentBalance.toFixed(2)}.`);
      return;
    }

    try {
      setLoading(true);
      const res = await walletApi.withdraw({
        amount: numericAmount,
        note: 'Instant simulated cash out',
      });

      const updatedWallet = res.data?.data?.wallet;
      setSuccessMessage(`Successfully cashed out $${numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}!`);

      if (onSuccess) {
        onSuccess(updatedWallet);
      }

      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Withdrawal error:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to complete withdrawal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-mono font-semibold mb-2">
            <ArrowUpRight className="w-3.5 h-3.5" /> Instant Direct Cash Out
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">Withdraw Platform Funds</h2>
          <p className="text-xs text-indigo-200/80 mt-1">
            Cash out proceeds earned from selling items or withdraw excess funds.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 font-medium shadow-sm animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 font-medium shadow-sm animate-fade-in">
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
            <TrendingDown className={`w-4 h-4 ${isOverdraft ? 'text-rose-500' : 'text-slate-400'}`} />
            <div className="text-right">
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Projected Balance</span>
              <span className={`text-sm font-extrabold ${isOverdraft ? 'text-rose-600' : 'text-indigo-600'}`}>
                ${projectedBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Quick Select
              </label>
              <button
                type="button"
                onClick={() => setAmount(currentBalance > 0 ? currentBalance.toString() : '0')}
                disabled={currentBalance <= 0}
                className="text-[11px] font-mono font-bold text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                Max (${currentBalance.toFixed(2)})
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q.toString())}
                  disabled={q > currentBalance}
                  className={`py-2 px-1 rounded-xl text-xs font-bold font-mono transition-all border ${
                    numericAmount === q
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                      : q > currentBalance
                      ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  ${q}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount Input */}
          <form onSubmit={handleWithdraw} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 font-mono">
                Withdrawal Amount ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-base">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={currentBalance}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="0.00"
                  className={`w-full pl-8 pr-4 py-3 rounded-2xl bg-white border font-mono text-base font-bold text-slate-900 focus:outline-none focus:ring-2 transition-all shadow-sm ${
                    isOverdraft
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
                      : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-100'
                  }`}
                />
              </div>
              {isOverdraft && (
                <p className="text-[11px] text-rose-600 mt-1 font-mono font-medium">
                  Cannot withdraw more than available balance (${currentBalance.toFixed(2)}).
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-indigo-900 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-800">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Simulated Direct Payout</span>
              </div>
              <p className="text-[11px] text-indigo-700/80 leading-relaxed">
                Funds are immediately debited from your platform wallet. No banking fees apply.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || numericAmount <= 0 || isOverdraft}
                className="flex-1 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-lg shadow-slate-900/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Confirm Cash Out</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Security Footer */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Double-Entry Row Locked
          </span>
          <span>Zero-Overdraft Invariant</span>
        </div>
      </div>
    </div>
  );
};
