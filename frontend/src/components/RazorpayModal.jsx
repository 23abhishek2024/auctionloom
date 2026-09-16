import React, { useState } from 'react';
import {
  ShieldCheck,
  CreditCard,
  QrCode,
  Building2,
  Lock,
  CheckCircle2,
  X,
  Zap,
  Smartphone,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export const RazorpayModal = ({
  isOpen,
  onClose,
  orderData,
  onSuccess,
  onFailure,
}) => {
  const [activeTab, setActiveTab] = useState('upi'); // 'upi' | 'card' | 'netbanking'
  const [processing, setProcessing] = useState(false);
  const [simulatedFailure, setSimulatedFailure] = useState(false);

  // Form State for Demo
  const [upiId, setUpiId] = useState('bidder@oksbi');
  const [cardNumber, setCardNumber] = useState('4532 8712 9012 3456');
  const [expiry, setExpiry] = useState('08/29');
  const [cvv, setCvv] = useState('789');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');

  if (!isOpen || !orderData) return null;

  const amountInRupees = orderData.amountInRupees || (orderData.amount ? orderData.amount / 100 : 0);
  const formattedInr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountInRupees * 83.5); // approximate USD to INR conversion for authentic display

  const handlePaySuccess = async () => {
    setProcessing(true);
    setSimulatedFailure(false);

    // Simulate realistic 800ms gateway authorization latency
    setTimeout(async () => {
      const mockPaymentId = `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const mockSignature = `sim_sig_${orderData.orderId}_${mockPaymentId}`;

      try {
        await onSuccess({
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: mockPaymentId,
          razorpay_signature: mockSignature,
        });
        setProcessing(false);
        onClose();
      } catch (err) {
        setProcessing(false);
        if (onFailure) onFailure(err);
      }
    }, 900);
  };

  const handleSimulateFailure = () => {
    setProcessing(true);
    setSimulatedFailure(true);
    setTimeout(() => {
      setProcessing(false);
      if (onFailure) {
        onFailure(new Error('Payment was declined by customer issuing bank (Simulated Error)'));
      }
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200/80 transform transition-all animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Razorpay Authentic Header */}
        <div className="bg-gradient-to-r from-[#0c2340] via-[#0b284e] to-[#0d3466] text-white p-6 relative">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center font-bold text-lg text-indigo-300 shadow-inner">
                ₹
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-widest font-mono font-bold text-indigo-300">
                    Razorpay Trusted Business
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-semibold border border-emerald-500/30">
                    Sandbox Active
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  AuctionLoom Escrow Treasury
                </h2>
                <div className="text-[11px] font-mono text-slate-300">
                  Order: <span className="text-indigo-200">{orderData.orderId}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close payment dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Amount Display */}
          <div className="mt-5 pt-4 border-t border-white/10 flex items-baseline justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-300">
              Amount Payable:
            </span>
            <div className="text-right">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
                {formattedInr}
              </span>
              <span className="text-xs font-mono text-slate-300 ml-2">
                (${amountInRupees.toFixed(2)} USD)
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation: UPI, Card, NetBanking */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('upi')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'upi'
                ? 'border-indigo-600 text-indigo-700 bg-white font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4 text-indigo-600" />
            <span>Instant UPI / QR</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('card')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'card'
                ? 'border-indigo-600 text-indigo-700 bg-white font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-indigo-600" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('netbanking')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'netbanking'
                ? 'border-indigo-600 text-indigo-700 bg-white font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>NetBanking</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {simulatedFailure && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>Simulated Payment Failure: Bank server declined transaction.</span>
            </div>
          )}

          {/* TAB 1: UPI */}
          {activeTab === 'upi' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-indigo-600" /> Scan with Any UPI App
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Google Pay, PhonePe, Paytm, CRED, or BHIM.
                  </p>
                </div>
                {/* Mock dynamic QR Code */}
                <div className="w-16 h-16 rounded-xl bg-white p-1 border border-indigo-200 shadow-sm flex items-center justify-center relative overflow-hidden">
                  <div className="grid grid-cols-4 gap-0.5 w-full h-full p-1 opacity-80">
                    <div className="bg-slate-900 rounded-xs" />
                    <div className="bg-indigo-600 rounded-xs" />
                    <div className="bg-slate-900 rounded-xs" />
                    <div className="bg-slate-400 rounded-xs" />
                    <div className="bg-indigo-600 rounded-xs" />
                    <div className="bg-slate-900 rounded-xs" />
                    <div className="bg-indigo-400 rounded-xs" />
                    <div className="bg-slate-900 rounded-xs" />
                    <div className="bg-slate-900 rounded-xs" />
                    <div className="bg-indigo-500 rounded-xs" />
                    <div className="bg-slate-900 rounded-xs" />
                    <div className="bg-slate-700 rounded-xs" />
                    <div className="bg-indigo-700 rounded-xs" />
                    <div className="bg-slate-900 rounded-xs" />
                    <div className="bg-slate-800 rounded-xs" />
                    <div className="bg-indigo-600 rounded-xs" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Or Enter Virtual Payment ID (VPA)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="yourname@okhdfcbank"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Verified ✓
                  </span>
                </div>
              </div>

              {/* Supported apps */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                <span>Google Pay</span>
                <span>•</span>
                <span>PhonePe</span>
                <span>•</span>
                <span>Paytm</span>
                <span>•</span>
                <span>BHIM UPI</span>
              </div>
            </div>
          )}

          {/* TAB 2: CARDS */}
          {activeTab === 'card' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Card Number
                </label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4532 0000 0000 0000"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Expiry (MM/YY)
                  </label>
                  <input
                    type="text"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    placeholder="12/28"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1">
                    CVV
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    placeholder="•••"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono pt-1">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>256-Bit SSL Encrypted • PCI-DSS Level 1 Certified</span>
              </div>
            </div>
          )}

          {/* TAB 3: NETBANKING */}
          {activeTab === 'netbanking' && (
            <div className="space-y-3">
              <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider">
                Select Your Bank
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra', 'Punjab National Bank'].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setSelectedBank(b)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                      selectedBank === b
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 font-bold shadow-xs'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-2.5">
          <button
            type="button"
            onClick={handlePaySuccess}
            disabled={processing}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {processing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Authorizing with Gateway...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-emerald-200" />
                <span>Pay {formattedInr} (${amountInRupees.toFixed(2)})</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Cryptographic HMAC Verification</span>
            </span>
            <button
              type="button"
              onClick={handleSimulateFailure}
              disabled={processing}
              className="text-slate-400 hover:text-rose-600 transition-colors underline cursor-pointer"
            >
              Test Failure Response
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
