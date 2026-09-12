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
  const { user, upgradeToSeller } = useAuth();

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

      // Seamlessly upgrade legacy bidder if needed
      if (user?.role === 'bidder' && upgradeToSeller) {
        try {
          await upgradeToSeller();
        } catch (e) {
          console.warn('Auto upgrade failed:', e);
        }
      }

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

      // Seamlessly upgrade legacy bidder account to full seller privileges
      if (user?.role === 'bidder' && upgradeToSeller) {
        try {
          await upgradeToSeller();
        } catch (e) {
          console.warn('Auto upgrade to seller failed:', e);
        }
      }

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
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Auctions
      </Link>

      {/* Main Form Card */}
      <div className="glass-panel border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-xl shadow-slate-200/50 space-y-8 bg-white/95 backdrop-blur-xl">
        
        {/* Header */}
        <div className="flex items-center gap-3 pb-6 border-b border-slate-200">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-sm">
            <PlusCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Create New Auction
            </h1>
            <p className="text-xs text-slate-500">
              List an item for real-time competitive bidding with photo and live room chat.
            </p>
          </div>
        </div>

        {/* ── AI Assistant Feature Box (Phase 8) ──────────────────── */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-slate-50 border border-indigo-200/80 shadow-sm relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-400/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-indigo-700 mb-2">
            <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
            <span>AI Auction Assistant</span>
            <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
              Phase 8
            </span>
          </div>

          <p className="text-xs text-slate-600 mb-4 leading-relaxed">
            Enter brief keywords about your item. Our prompt-engineered AI will automatically write an
            appraisal-grade title and compelling auction description.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={aiKeywords}
              onChange={(e) => setAiKeywords(e.target.value)}
              placeholder="e.g. 1968 Rolex Submariner Ref 5513 black dial excellent condition"
              className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors shadow-sm"
            />
            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={aiLoading}
              className="btn-primary px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Wand2 className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
              <span>{aiLoading ? 'Generating...' : 'Generate with AI'}</span>
            </button>
          </div>

          {aiMessage && (
            <div className="mt-3 text-xs text-emerald-600 flex items-center gap-1.5 font-medium animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{aiMessage}</span>
            </div>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── 1. Multer Image Upload & Gallery Picker (Node.js Video 28) ── */}
          <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-800">
                  Item Photography *
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Upload high-res photo via Multer (JPEG, PNG, WEBP max 5MB) or select a showcase item.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Multer Upload
              </span>
            </div>

            {/* Preview & Dropzone Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              {/* Image Preview Box */}
              <div className="relative h-44 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                {imagePreview ? (
                  <>
                    <img
                      src={imagePreview.startsWith('/uploads/') ? resolveImageUrl(imagePreview) : imagePreview}
                      alt="Item preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <span className="absolute bottom-2 left-2 text-[10px] font-mono text-white bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
                      Live Preview
                    </span>
                  </>
                ) : (
                  <div className="text-center p-4 text-slate-400">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                    <span className="text-xs">No image selected</span>
                  </div>
                )}
              </div>

              {/* Upload Input & Dropzone */}
              <div className="md:col-span-2 space-y-3">
                <label className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white text-center group shadow-sm">
                  <UploadCloud className="w-7 h-7 text-indigo-600 group-hover:scale-110 transition-transform mb-1" />
                  <span className="text-xs font-semibold text-slate-800">
                    {uploadingImage ? 'Uploading via Multer...' : 'Click to upload custom photo'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
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
                  <div className="text-[11px] text-emerald-600 flex items-center gap-1.5 font-mono">
                    <Check className="w-3.5 h-3.5" />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                {/* Preset Showcase Selector */}
                <div>
                  <span className="text-[11px] font-mono text-slate-500 block mb-1.5">
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
                            ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
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
            <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-700 mb-2">
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
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none text-slate-900 text-sm placeholder:text-slate-400 transition-colors shadow-sm"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-700 mb-2">
              Description
            </label>
            <div className="relative">
              <textarea
                name="description"
                rows={5}
                value={formData.description}
                onChange={handleChange}
                placeholder="Provide details about condition, provenance, certificates, and shipping..."
                className="w-full p-4 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none text-slate-900 text-sm placeholder:text-slate-400 transition-colors leading-relaxed shadow-sm"
              />
            </div>
          </div>

          {/* Row: Starting Price & End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Starting Price */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-700 mb-2">
                Starting Price ($) *
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-600 font-bold" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="starting_price"
                  value={formData.starting_price}
                  onChange={handleChange}
                  placeholder="500.00"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none text-slate-900 font-mono text-sm placeholder:text-slate-400 transition-colors shadow-sm"
                  required
                />
              </div>
            </div>

            {/* End Time */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-700 mb-2">
                End Date & Time *
              </label>
              <div className="relative">
                <input
                  type="datetime-local"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none text-slate-900 font-mono text-sm transition-colors shadow-sm"
                  required
                />
              </div>
            </div>

          </div>

          {/* Notice */}
          <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-950">
            Once launched, the auction will be active immediately. Bidders will receive live WebSocket
            updates whenever a new bid is placed.
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full py-3.5 px-6 rounded-xl font-bold text-sm shadow-md shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
