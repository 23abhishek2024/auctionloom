import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auctionApi, aiApi, uploadApi, resolveImageUrl } from '../api/client';
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
  UploadCloud,
  Image as ImageIcon,
  Check,
  X,
} from 'lucide-react';

const PRESET_GALLERY = [
  {
    name: 'Luxury Watch',
    url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
    category: 'Horology',
  },
  {
    name: 'Vintage Porsche',
    url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
    category: 'Automotive',
  },
  {
    name: 'Retro Sneaker',
    url: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800&q=80',
    category: 'Collectibles',
  },
  {
    name: 'Contemporary Art',
    url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&q=80',
    category: 'Fine Art',
  },
  {
    name: 'Vintage Camera',
    url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80',
    category: 'Antiques',
  },
  {
    name: 'Diamond Ring',
    url: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&q=80',
    category: 'Jewelry',
  },
];

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

  // Image Upload States (Node.js Video 28 - Multer)
  const [imageUrl, setImageUrl] = useState(PRESET_GALLERY[0].url);
  const [imagePreview, setImagePreview] = useState(PRESET_GALLERY[0].url);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  // AI Assistant States
  const [aiKeywords, setAiKeywords] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file (JPEG, PNG, WEBP, or GIF).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit.');
      return;
    }

    try {
      setUploadingImage(true);
      setError(null);
      setUploadSuccess(null);

      // Local preview immediately
      const objectUrl = URL.createObjectURL(file);
      setImagePreview(objectUrl);

      // Multer API Upload
      const res = await uploadApi.uploadImage(file);
      setImageUrl(res.data.url);
      setUploadSuccess(`Photo uploaded successfully via Multer (${(file.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error('Upload Error:', err);
      setError(err.response?.data?.error || 'Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSelectPreset = (presetUrl) => {
    setImageUrl(presetUrl);
    setImagePreview(presetUrl);
    setUploadSuccess('Selected curated showcase photo.');
    setError(null);
  };

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
        image_url: imageUrl || PRESET_GALLERY[0].url,
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
        className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Auctions
      </Link>

      {/* Main Form Card */}
      <div className="glass-panel border border-white/[0.08] rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-3 pb-6 border-b border-white/[0.08]">
          <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-inner">
            <PlusCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Create New Auction
            </h1>
            <p className="text-xs text-zinc-400">
              List an item for real-time competitive bidding with photo and live room chat.
            </p>
          </div>
        </div>

        {/* ── AI Assistant Feature Box (Phase 8) ──────────────────── */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-violet-950/40 via-[#121020] to-[#0A0C14] border border-violet-500/30 shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-violet-300 mb-2">
            <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
            <span>AI Auction Assistant</span>
            <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/30">
              Phase 8
            </span>
          </div>

          <p className="text-xs text-zinc-300 mb-4 leading-relaxed">
            Enter brief keywords about your item. Our prompt-engineered AI will automatically write an
            appraisal-grade title and compelling auction description.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={aiKeywords}
              onChange={(e) => setAiKeywords(e.target.value)}
              placeholder="e.g. 1968 Rolex Submariner Ref 5513 black dial excellent condition"
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#080910] border border-white/[0.08] text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-violet-400 transition-colors"
            />
            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={aiLoading}
              className="btn-primary px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-violet-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap active:scale-95"
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

          {/* ── 1. Multer Image Upload & Gallery Picker (Node.js Video 28) ── */}
          <div className="p-5 rounded-2xl bg-[#080911] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-zinc-200">
                  Item Photography *
                </label>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Upload high-res photo via Multer (JPEG, PNG, WEBP max 5MB) or select a showcase item.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                Multer Upload
              </span>
            </div>

            {/* Preview & Dropzone Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              {/* Image Preview Box */}
              <div className="relative h-44 rounded-xl overflow-hidden bg-black/80 border border-white/[0.08] flex items-center justify-center">
                {imagePreview ? (
                  <>
                    <img
                      src={imagePreview.startsWith('/uploads/') ? resolveImageUrl(imagePreview) : imagePreview}
                      alt="Item preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <span className="absolute bottom-2 left-2 text-[10px] font-mono text-white/90 bg-black/70 px-2 py-0.5 rounded backdrop-blur-sm">
                      Live Preview
                    </span>
                  </>
                ) : (
                  <div className="text-center p-4 text-zinc-500">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                    <span className="text-xs">No image selected</span>
                  </div>
                )}
              </div>

              {/* Upload Input & Dropzone */}
              <div className="md:col-span-2 space-y-3">
                <label className="border-2 border-dashed border-white/[0.12] hover:border-violet-500/60 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#0C0E18]/60 text-center group">
                  <UploadCloud className="w-7 h-7 text-violet-400 group-hover:scale-110 transition-transform mb-1" />
                  <span className="text-xs font-semibold text-zinc-200">
                    {uploadingImage ? 'Uploading via Multer...' : 'Click to upload custom photo'}
                  </span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">
                    Supports JPG, PNG, WEBP, GIF up to 5MB
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileChange}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                </label>

                {uploadSuccess && (
                  <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-mono">
                    <Check className="w-3.5 h-3.5" />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                {/* Preset Showcase Selector */}
                <div>
                  <span className="text-[11px] font-mono text-zinc-400 block mb-1.5">
                    Or select a curated showcase preset:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_GALLERY.map((preset) => (
                      <button
                        type="button"
                        key={preset.name}
                        onClick={() => handleSelectPreset(preset.url)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          imageUrl === preset.url
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/30 ring-1 ring-white/20 font-semibold'
                            : 'bg-[#131520] text-zinc-300 hover:bg-[#1C1F30] hover:text-white border border-white/[0.06]'
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-zinc-300 mb-2">
              Auction Title *
            </label>
            <div className="relative">
              <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. 1968 Vintage Rolex Submariner Ref. 5513"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#090A11] border border-white/[0.08] focus:border-violet-500 focus:outline-none text-white text-sm placeholder:text-zinc-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-zinc-300 mb-2">
              Description
            </label>
            <div className="relative">
              <textarea
                name="description"
                rows={5}
                value={formData.description}
                onChange={handleChange}
                placeholder="Provide details about condition, provenance, certificates, and shipping..."
                className="w-full p-4 rounded-xl bg-[#090A11] border border-white/[0.08] focus:border-violet-500 focus:outline-none text-white text-sm placeholder:text-zinc-500 transition-colors leading-relaxed"
              />
            </div>
          </div>

          {/* Row: Starting Price & End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Starting Price */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-zinc-300 mb-2">
                Starting Price ($) *
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 font-bold" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="starting_price"
                  value={formData.starting_price}
                  onChange={handleChange}
                  placeholder="500.00"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#090A11] border border-white/[0.08] focus:border-violet-500 focus:outline-none text-white font-mono text-sm placeholder:text-zinc-500 transition-colors"
                  required
                />
              </div>
            </div>

            {/* End Time */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-zinc-300 mb-2">
                End Date & Time *
              </label>
              <div className="relative">
                <input
                  type="datetime-local"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl bg-[#090A11] border border-white/[0.08] focus:border-violet-500 focus:outline-none text-white font-mono text-sm transition-colors"
                  required
                />
              </div>
            </div>

          </div>

          {/* Notice */}
          <div className="p-4 rounded-2xl bg-violet-950/20 border border-violet-500/20 text-xs text-zinc-400">
            Once launched, the auction will be active immediately. Bidders will receive live WebSocket
            updates whenever a new bid is placed.
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full py-3.5 px-6 rounded-xl font-bold text-sm shadow-xl shadow-violet-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
