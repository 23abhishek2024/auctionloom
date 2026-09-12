import React, { useState, useEffect } from 'react';
import { commissionApi, resolveImageUrl } from '../api/client';
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
  Eye,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const SubmitCommissionPage = () => {
  const { user } = useAuth();
  const [unpaidCommission, setUnpaidCommission] = useState(0);
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Form State
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      const res = await commissionApi.getMyProofs();
      setUnpaidCommission(res.data.unpaidCommission || 0);
      setProofs(res.data.proofs || []);
      if (res.data.unpaidCommission > 0 && !amount) {
        setAmount(res.data.unpaidCommission.toString());
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
      setSuccessMessage(res.data.message || 'Payment proof uploaded successfully!');
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
          <DollarSign className="w-3.5 h-3.5" /> Platform Governance
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Platform Commission & Settlement
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          AuctionLoom charges a nominal 5% commission on successfully concluded auctions. Clear your balance below to keep your listing privileges active.
        </p>
      </div>

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
              ? 'You have an outstanding commission balance. Please transfer the fee to our verified coordinates below and upload your transfer receipt.'
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

      {/* Payment Coordinates & Upload Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Platform Payment Coordinates */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" /> Platform Settlement Accounts
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Please transfer your platform fee to any of the official AuctionLoom corporate treasury accounts listed below:
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
            <Upload className="w-5 h-5 text-indigo-600" /> Upload Payment Proof
          </h2>
          <p className="text-xs text-slate-500 mb-6">
            Attach a clear screenshot or PDF receipt of your payment. Our administrators will verify and credit your balance within minutes.
          </p>

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

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
                placeholder="e.g. UPI Ref # 1234567890 / Rolex Auction Fee"
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
                      className="text-xs text-rose-600 hover:underline font-medium"
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
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Submitting Receipt...
                </>
              ) : (
                'Submit Proof for Approval'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Proof History Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" /> Your Submitted Payment Proofs
        </h2>

        {proofs.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No payment receipts submitted yet</p>
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
                      <a
                        href={resolveImageUrl(proof.proof_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                      >
                        <img
                          src={resolveImageUrl(proof.proof_url)}
                          alt="Proof"
                          className="w-full h-full object-cover"
                        />
                      </a>
                    </td>
                    <td className="py-3 px-4 font-bold font-mono text-emerald-600">
                      ${proof.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {proof.comment || '—'}
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
