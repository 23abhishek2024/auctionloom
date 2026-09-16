import React, { useState, useEffect } from 'react';
import { commissionApi, paymentApi, resolveImageUrl } from '../api/client';
import { loadRazorpayScript } from '../utils/razorpay';
import { useAuth } from '../context/AuthContext';
import {
  DollarSign,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  Building2,
  QrCode,
  FileText,
  CreditCard,
  RefreshCw,
  Zap,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const SubmitCommissionPage = () => {
  const { user } = useAuth();
  const [unpaidCommission, setUnpaidCommission] = useState(0);
  const [proofs, setProofs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payingRazorpay, setPayingRazorpay] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Manual Upload Form State
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Razorpay instant settlement amount state
  const [razorpayAmount, setRazorpayAmount] = useState('');

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      const [proofsRes, paymentsRes] = await Promise.all([
        commissionApi.getMyProofs(),
        paymentApi.getMyHistory().catch(() => ({ data: { payments: [] } })),
      ]);

      const unpaid = proofsRes.data.unpaidCommission || 0;
      setUnpaidCommission(unpaid);
      setProofs(proofsRes.data.proofs || []);
      setPayments(paymentsRes.data?.payments || []);

      if (unpaid > 0) {
        setAmount(unpaid.toString());
        setRazorpayAmount(unpaid.toString());
      } else {
        setRazorpayAmount('10.00');
      }
    } catch (err) {
      console.error('Failed to load commission data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommissionData();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // ── 1. Razorpay 1-Click Instant Settlement (Zero Admin Wait) ──
  const handleRazorpaySettlement = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const payVal = parseFloat(razorpayAmount);
    if (isNaN(payVal) || payVal <= 0) {
      setErrorMessage('Please enter a valid amount to settle via Razorpay.');
      return;
    }

    try {
      setPayingRazorpay(true);

      // Step A: Load dynamic checkout script from Razorpay CDN
      const isLoaded = await loadRazorpayScript();

      // Step B: Create order on AuctionLoom Backend
      const orderRes = await paymentApi.createOrder({
        amount: payVal,
        purpose: 'COMMISSION',
        notes: {
          userEmail: user?.email,
          reason: 'Commission settlement',
        },
      });

      const orderData = orderRes.data;

      // Verification executor
      const executeVerification = async (verifyPayload) => {
        try {
          const verifyRes = await paymentApi.verifyPayment(verifyPayload);
          setSuccessMessage(
            `⚡ Instant Settlement Success! Payment ID: ${verifyRes.data.payment_id}. Your unpaid balance was cleared automatically.`
          );
          setUnpaidCommission(verifyRes.data.unpaid_commission || 0);
          await fetchCommissionData();
        } catch (verErr) {
          console.error('Verification failed:', verErr);
          setErrorMessage(
            verErr.response?.data?.error ||
              'Payment signature verification failed. Please contact platform support.'
          );
        } finally {
          setPayingRazorpay(false);
        }
      };

      // Step C: Open Razorpay Checkout Modal (or Sandbox Auto-Simulation)
      if (isLoaded && window.Razorpay && !orderData.is_sandbox_simulation && orderData.keyId !== 'rzp_test_placeholder') {
        const options = {
          key: orderData.keyId,
          amount: orderData.amount, // in paise
          currency: orderData.currency || 'INR',
          name: 'AuctionLoom Escrow',
          description: `Instant Platform Commission Clearance ($${payVal.toFixed(2)})`,
          image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=128&q=80',
          order_id: orderData.orderId,
          handler: async function (response) {
            await executeVerification({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
          },
          prefill: {
            name: user?.name || user?.email || 'Valued User',
            email: user?.email || 'bidder@auctionloom.com',
          },
          theme: {
            color: '#4f46e5',
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response) {
          setErrorMessage(`Payment failed: ${response.error.description}`);
          setPayingRazorpay(false);
        });
        rzp.open();
      } else {
        // High-fidelity sandbox / test simulation mode
        // Generates valid simulation token accepted by backend razorpayService
        const mockPaymentId = `pay_sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const mockSignature = `sim_sig_${orderData.orderId}_${mockPaymentId}`;

        await executeVerification({
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: mockPaymentId,
          razorpay_signature: mockSignature,
        });
      }
    } catch (err) {
      console.error('Razorpay initiation error:', err);
      setErrorMessage(
        err.response?.data?.error ||
          'Failed to initiate Razorpay checkout order. Please check server connection.'
      );
      setPayingRazorpay(false);
    }
  };

  // ── 2. Manual Upload Receipt Proof ──────────────────────────
  const handleSubmitProof = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedFile) {
      setErrorMessage('Please attach a screenshot of your payment transfer receipt.');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setErrorMessage('Please provide a valid transfer amount.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('proof', selectedFile);
      formData.append('amount', amount);
      formData.append('comment', comment);

      const res = await commissionApi.submitProof(formData);
      setSuccessMessage(res.data.message || 'Payment proof uploaded successfully! Admin will verify.');
      setSelectedFile(null);
      setPreviewUrl(null);
      setComment('');
      await fetchCommissionData();
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to submit payment proof.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold uppercase tracking-wider mb-2">
          <DollarSign className="w-3.5 h-3.5" /> Platform Governance & Settlement
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Platform Commission & Settlement
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          AuctionLoom charges a nominal 5% commission on successfully concluded auctions. Clear your balance below to keep your listing privileges active.
        </p>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="font-medium">{successMessage}</div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3 shadow-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div className="font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Balance Status Banner */}
      <div
        className={`rounded-3xl p-6 sm:p-8 mb-10 border shadow-lg relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 ${
          unpaidCommission > 0
            ? 'bg-gradient-to-r from-rose-50 to-orange-50 border-rose-200'
            : 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'
        }`}
      >
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-500">
            Current Outstanding Balance
          </span>
          <div
            className={`text-4xl sm:text-5xl font-extrabold font-mono tracking-tight ${
              unpaidCommission > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            ${unpaidCommission.toFixed(2)}
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-xl">
            {unpaidCommission > 0
              ? 'You have an outstanding commission balance. Use the instant 1-Click Razorpay gateway below for instant automatic clearance, or upload a manual wire receipt.'
              : 'Your account is in excellent standing. You have zero pending platform fees and are free to list unlimited auctions!'}
          </p>
        </div>

        {unpaidCommission > 0 ? (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold font-mono shadow-md">
            <AlertCircle className="w-4 h-4" /> Settlement Required
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold font-mono shadow-md">
            <CheckCircle2 className="w-4 h-4" /> Account Verified Active
          </div>
        )}
      </div>

      {/* ── RECOMMENDED: Instant 1-Click Razorpay Settlement Gateway ── */}
      <div className="mb-12 rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 sm:p-8 shadow-2xl relative overflow-hidden border border-indigo-700/50">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs font-mono font-semibold">
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" /> Instant 1-Click Clearance (Zero Waiting Time)
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-indigo-200 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Cryptographic HMAC-SHA256 Verified</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Pay via Razorpay Payment Gateway
              </h2>
              <p className="text-xs sm:text-sm text-indigo-100/80 leading-relaxed max-w-xl">
                Settle your platform fees instantly using <strong>UPI (Google Pay, PhonePe, Paytm), Debit/Credit Cards, or NetBanking</strong>. 
                Our backend automatically verifies Razorpay's cryptographic signature and clears your account balance immediately without waiting for manual administrator review.
              </p>

              {/* Supported payment badges */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px] font-mono font-medium text-indigo-200">
                  ⚡ Instant UPI
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px] font-mono font-medium text-indigo-200">
                  💳 Visa / Mastercard / RuPay
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px] font-mono font-medium text-indigo-200">
                  🏛️ 50+ NetBanking Banks
                </span>
              </div>
            </div>

            {/* Pay Action Card */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 space-y-4 shadow-xl">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-indigo-200 mb-1 font-semibold">
                  Amount to Settle (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-indigo-300">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={razorpayAmount}
                    onChange={(e) => setRazorpayAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/20 border border-white/30 text-white font-mono font-bold text-base placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleRazorpaySettlement}
                disabled={payingRazorpay}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-500/30 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {payingRazorpay ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Processing Secure Gateway...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>Pay ${parseFloat(razorpayAmount || 0).toFixed(2)} via Razorpay</span>
                  </>
                )}
              </button>

              <div className="text-[10px] text-center text-indigo-200/70 font-mono">
                Supports live Razorpay checkout + simulated sandbox for offline testing
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Coordinates & Upload Form Grid (Legacy Manual Option) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Platform Payment Coordinates */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" /> Platform Settlement Accounts
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Alternatively, transfer your platform fee to any of our verified corporate treasury accounts below and upload the receipt:
          </p>

          <div className="space-y-4 text-xs font-mono">
            {/* Bank Transfer */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <CreditCard className="w-4 h-4 text-indigo-600" /> Direct Bank Wire / IMPS
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Bank Name:</span>
                <span className="font-bold text-slate-900 font-sans">AuctionLoom Escrow Bank</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Account Number:</span>
                <span className="font-bold text-indigo-600 font-mono">9876 5432 1098 7654</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>IFSC / Routing Code:</span>
                <span className="font-bold text-slate-900">AUCT0009876</span>
              </div>
            </div>

            {/* UPI & Instant Transfer */}
            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2">
              <div className="font-bold text-indigo-900 flex items-center gap-2 text-sm">
                <QrCode className="w-4 h-4 text-indigo-600" /> Instant UPI Transfer (India)
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Virtual Payment ID:</span>
                <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200 font-mono">
                  auctionloom@upi
                </span>
              </div>
            </div>

            {/* PayPal / Global */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-indigo-600" /> Global PayPal Transfer
              </div>
              <div className="flex justify-between text-slate-600">
                <span>PayPal Account:</span>
                <span className="font-bold text-slate-900">settlement@auctionloom.com</span>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Proof Form */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-2">
            <Upload className="w-5 h-5 text-indigo-600" /> Manual Bank Wire / Screenshot Upload
          </h2>
          <p className="text-xs text-slate-500 mb-6">
            Attach a screenshot or PDF receipt of your manual wire. Administrators will inspect and approve your receipt.
          </p>

          <form onSubmit={handleSubmitProof} className="space-y-4">
            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Amount Paid (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                />
              </div>
            </div>

            {/* Note / Transaction Ref */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Transaction Reference / Comment
              </label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. Wire Ref # 1234567890 / Auction Commission"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
              />
            </div>

            {/* Receipt Screenshot Upload */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Transfer Receipt Screenshot
              </label>
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center hover:border-indigo-400 transition-colors bg-slate-50/50">
                {previewUrl ? (
                  <div className="space-y-2">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-36 mx-auto rounded-lg border border-slate-200 object-contain shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="text-xs text-rose-600 hover:underline font-medium cursor-pointer"
                    >
                      Change File
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer block py-4">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <span className="text-xs font-bold text-indigo-600 hover:underline block">
                      Click to upload receipt image
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono block mt-1">
                      PNG, JPG, WEBP up to 5MB
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      required
                    />
                  </label>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Submitting Receipt...
                </>
              ) : (
                'Submit Proof for Admin Approval'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ── Razorpay Gateway Transaction Receipts Audit Table ── */}
      {payments.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8 mb-10">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-600" /> Verified Razorpay Gateway Transactions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Payment ID</th>
                  <th className="py-3 px-4">Purpose</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs text-slate-700">
                      {p.razorpay_order_id}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-indigo-600 font-semibold">
                      {p.razorpay_payment_id || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-600">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {p.purpose}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold font-mono text-emerald-600">
                      ${parseFloat(p.amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                          p.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {p.status === 'SUCCESS' ? 'VERIFIED ✓' : p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Proof History Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" /> Manual Payment Proofs History
        </h2>

        {proofs.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No manual payment receipts submitted yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Your submitted proofs will appear here with live verification status.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                  <th className="py-3 px-4">Receipt</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Comment</th>
                  <th className="py-3 px-4">Submitted At</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proofs.map((proof) => (
                  <tr key={proof.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      {proof.screenshot_url ? (
                        <a
                          href={resolveImageUrl(proof.screenshot_url || proof.proof_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                        >
                          <img
                            src={resolveImageUrl(proof.screenshot_url || proof.proof_url)}
                            alt="Proof"
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                          RZP
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold font-mono text-emerald-600">
                      ${parseFloat(proof.amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {proof.notes || proof.comment || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">
                      {new Date(proof.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                          proof.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : proof.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800 animate-pulse'
                        }`}
                      >
                        {proof.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
