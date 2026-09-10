import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auctionApi, aiApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  PlusCircle,
  ArrowLeft,
  Calendar,
  DollarSign,
  FileText,
  Tag,
  AlertCircle,
  Sparkles,
  Wand2,
  CheckCircle2,
} from 'lucide-react';

export const CreateAuctionPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Set default end_time to 24 hours from now
  const defaultEndTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  };

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    starting_price: '',
    end_time: defaultEndTime(),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // AI Assistant States
  const [aiKeywords, setAiKeywords] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  // ── AI Copywriting Handler ──────────────────────────────────
  const handleGenerateAI = async () => {
    if (!aiKeywords.trim()) {
      setError('Please enter a few keywords (e.g. "Rolex Submariner 1968 mint") to generate.');
      return;
    }

    try {
      setAiLoading(true);
      setError(null);
      setAiMessage(null);

      const res = await aiApi.generate({
        keywords: aiKeywords.trim(),
      });

      const { title, description, suggested_starting_price } = res.data;

      setFormData((prev) => ({
        ...prev,
        title: title || prev.title,
        description: description || prev.description,
        starting_price: prev.starting_price || (suggested_starting_price ? suggested_starting_price.toString() : ''),
      }));

      setAiMessage('✨ Listing copy generated successfully! You can review and edit below.');
      setTimeout(() => setAiMessage(null), 5000);
    } catch (err) {
      console.error('AI Generator Error:', err);
      setError(
        err.response?.data?.error ||
        (err.code === 'ECONNABORTED'
          ? 'AI generation request timed out. Please try again.'
          : err.message || 'Failed to generate copy. Try again.')
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    const price = parseFloat(formData.starting_price);
    if (isNaN(price) || price <= 0) {
      setError('Starting price must be greater than 0');
      return;
    }

    const endDate = new Date(formData.end_time);
    if (isNaN(endDate.getTime()) || endDate <= new Date()) {
      setError('Auction end time must be strictly in the future');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await auctionApi.create({
        title: formData.title.trim(),
        description: formData.description.trim(),
        starting_price: price,
        end_time: endDate.toISOString(),
      });

      const newAuction = res.data.auction;
      navigate(`/auctions/${newAuction.id}`);
    } catch (err) {
      console.error('Failed to create auction:', err);
      setError(err.response?.data?.error || 'Failed to create auction. Please check your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      
      {/* Back Link */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Auctions
      </Link>

      {/* Main Form Card */}
      <div className="glass-panel border border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-3 pb-6 border-b border-slate-800/80">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <PlusCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Create New Auction
            </h1>
            <p className="text-xs text-slate-400">
              List an item for real-time competitive bidding.
            </p>
          </div>
        </div>

        {/* ── AI Assistant Feature Box (Phase 8) ──────────────────── */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/50 border border-indigo-500/30 shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-indigo-300 mb-2">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>AI Auction Assistant</span>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
              Phase 8
            </span>
          </div>

          <p className="text-xs text-slate-300 mb-4 leading-relaxed">
            Enter brief keywords about your item. Our prompt-engineered AI will automatically write an
            appraisal-grade title and compelling auction description.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={aiKeywords}
              onChange={(e) => setAiKeywords(e.target.value)}
              placeholder="e.g. 1968 Rolex Submariner Ref 5513 black dial excellent condition"
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors"
            />
            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={aiLoading}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Wand2 className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
              <span>{aiLoading ? 'Generating...' : 'Generate with AI'}</span>
            </button>
          </div>

          {aiMessage && (
            <div className="mt-3 text-xs text-emerald-400 flex items-center gap-1.5 font-medium animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{aiMessage}</span>
            </div>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-300 mb-2">
              Auction Title *
            </label>
            <div className="relative">
              <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. 1968 Vintage Rolex Submariner Ref. 5513"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-indigo-500 focus:outline-none text-white text-sm placeholder:text-slate-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-300 mb-2">
              Description
            </label>
            <div className="relative">
              <textarea
                name="description"
                rows={5}
                value={formData.description}
                onChange={handleChange}
                placeholder="Provide details about condition, provenance, certificates, and shipping..."
                className="w-full p-4 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-indigo-500 focus:outline-none text-white text-sm placeholder:text-slate-500 transition-colors leading-relaxed"
              />
            </div>
          </div>

          {/* Row: Starting Price & End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Starting Price */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-300 mb-2">
                Starting Price ($) *
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="starting_price"
                  value={formData.starting_price}
                  onChange={handleChange}
                  placeholder="500.00"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-indigo-500 focus:outline-none text-white font-mono text-sm placeholder:text-slate-500 transition-colors"
                  required
                />
              </div>
            </div>

            {/* End Time */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-300 mb-2">
                End Date & Time *
              </label>
              <div className="relative">
                <input
                  type="datetime-local"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-indigo-500 focus:outline-none text-white font-mono text-sm transition-colors"
                  required
                />
              </div>
            </div>

          </div>

          {/* Notice */}
          <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-slate-400">
            Once launched, the auction will be active immediately. Bidders will receive live WebSocket
            updates whenever a new bid is placed.
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <PlusCircle className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
            <span>{submitting ? 'Launching Auction...' : 'Publish Auction'}</span>
          </button>

        </form>

      </div>

    </div>
  );
};

export default CreateAuctionPage;
