import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { auctionApi, bidApi, resolveImageUrl } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import {
  Clock,
  DollarSign,
  TrendingUp,
  History,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Gavel,
  Trophy,
  Zap,
  MessageSquare,
  Send,
  Flame,
  Sparkles,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { formatDisplayName, getInitials } from '../utils/formatters';

export const AuctionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, isConnected, joinAuction, leaveAuction, sendMessage, sendReaction } = useSocket();
  const { user, isAuthenticated } = useAuth();

  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [isPriceFlashing, setIsPriceFlashing] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnded, setIsEnded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Tabs: 'bids' or 'chat' (Socket.IO Video 33)
  const [activeTab, setActiveTab] = useState('bids');
  const [chatMessages, setChatMessages] = useState([
    {
      id: 'welcome-1',
      text: '👋 Welcome to the live auction room! Ask questions or share thoughts here in real time.',
      senderName: 'System Bot',
      senderEmail: 'System Bot',
      role: 'system',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [activeReactions, setActiveReactions] = useState([]);
  const chatBottomRef = useRef(null);

  // ── 1. Fetch initial auction & bid history ───────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [auctionRes, bidsRes] = await Promise.all([
          auctionApi.getById(id),
          bidApi.getBidsForAuction(id),
        ]);
        setAuction(auctionRes.data.auction);
        setBids(bidsRes.data.bids || []);

        // Initial default bid proposal (current price + 10)
        const current = parseFloat(auctionRes.data.auction.current_price);
        setBidAmount((current + 10).toFixed(2));
      } catch (err) {
        console.error('Failed to load auction detail:', err);
        setError(err.response?.data?.error || 'Auction not found or failed to load.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // ── 2. Real-time WebSocket Room, Bids, Chat & Reactions (Node.js Video 33) ──
  useEffect(() => {
    if (!id) return;

    // Join the auction room
    joinAuction(id);

    // Socket event handler for PRICE_UPDATE
    const handlePriceUpdate = (data) => {
      console.log('[Socket] Live PRICE_UPDATE received:', data);
      if (data.auction_id === id) {
        setAuction((prev) => (prev ? { ...prev, current_price: data.new_price } : prev));

        const newBidEntry = {
          id: data.bid_id || Math.random().toString(),
          amount: data.new_price,
          bidder_name: data.bidder_name,
          bidder_email: data.bidder_email,
          created_at: data.timestamp || new Date().toISOString(),
        };

        setBids((prev) => [newBidEntry, ...prev.filter((b) => b.id !== newBidEntry.id)]);

        setIsPriceFlashing(true);
        setTimeout(() => setIsPriceFlashing(false), 1200);

        const nextMin = parseFloat(data.new_price) + 10;
        setBidAmount((prev) => {
          const prevNum = parseFloat(prev);
          return isNaN(prevNum) || prevNum <= parseFloat(data.new_price)
            ? nextMin.toFixed(2)
            : prev;
        });
      }
    };

    // Socket event handler for CHAT_MESSAGE
    const handleChatMessage = (msg) => {
      console.log('[Socket] Live CHAT_MESSAGE received:', msg);
      if (msg.auctionId === id) {
        setChatMessages((prev) => [...prev, msg]);
      }
    };

    // Socket event handler for REACTION (Floating emojis)
    const handleReaction = (reaction) => {
      console.log('[Socket] Live REACTION received:', reaction);
      if (reaction.auctionId === id) {
        const reactionObj = {
          ...reaction,
          left: Math.floor(Math.random() * 75) + 10,
        };
        setActiveReactions((prev) => [...prev, reactionObj]);
        setTimeout(() => {
          setActiveReactions((prev) => prev.filter((r) => r.id !== reaction.id));
        }, 2200);
      }
    };

    if (socket) {
      socket.on('PRICE_UPDATE', handlePriceUpdate);
      socket.on('CHAT_MESSAGE', handleChatMessage);
      socket.on('REACTION', handleReaction);
    }

    return () => {
      if (socket) {
        socket.off('PRICE_UPDATE', handlePriceUpdate);
        socket.off('CHAT_MESSAGE', handleChatMessage);
        socket.off('REACTION', handleReaction);
      }
      leaveAuction(id);
    };
  }, [id, socket]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // ── 3. Live Countdown Timer ──────────────────────────────────
  useEffect(() => {
    if (!auction?.end_time) return;

    const timer = () => {
      const diff = new Date(auction.end_time) - new Date();
      if (diff <= 0 || auction.status === 'CLOSED') {
        setTimeLeft('AUCTION CONCLUDED');
        setIsEnded(true);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);

      setTimeLeft(
        `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
      );
    };

    timer();
    const interval = setInterval(timer, 1000);
    return () => clearInterval(interval);
  }, [auction?.end_time, auction?.status]);

  // ── 4. Place Bid Handlers (Standard + 1-Click Quick Bids) ────
  const handlePlaceBid = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/auctions/${id}` } });
      return;
    }

    const numAmount = parseFloat(bidAmount);
    if (isNaN(numAmount) || numAmount <= parseFloat(auction.current_price)) {
      setError(`Bid must be strictly higher than $${auction.current_price}`);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMsg(null);

      await bidApi.placeBid({
        auction_id: id,
        amount: numAmount,
      });

      setSuccessMsg(`Bid of $${numAmount.toFixed(2)} placed successfully!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Bid error:', err);
      setError(err.response?.data?.error || 'Failed to place bid. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // 1-Click Instant Quick Bid (Bidzy-style)
  const handleInstantBid = async (inc) => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/auctions/${id}` } });
      return;
    }

    const current = parseFloat(auction?.current_price || 0);
    const targetAmount = parseFloat((current + inc).toFixed(2));

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMsg(null);

      await bidApi.placeBid({
        auction_id: id,
        amount: targetAmount,
      });

      setSuccessMsg(`⚡ 1-Click Bid of $${targetAmount.toFixed(2)} placed!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Instant bid error:', err);
      setError(err.response?.data?.error || 'Failed to place instant bid.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickIncrement = (inc) => {
    const current = parseFloat(auction?.current_price || 0);
    setBidAmount((current + inc).toFixed(2));
    setError(null);
  };

  // ── 5. Live Room Chat & Reactions Handlers (Video 33) ────────
  const handleSendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    sendMessage({
      auctionId: id,
      text: chatInput.trim(),
      senderName: formatDisplayName(user),
      senderEmail: user?.email || 'Anonymous Bidder',
      role: user?.role || 'bidder',
    });

    setChatInput('');
  };

  const handleTriggerReaction = (emoji) => {
    sendReaction({
      auctionId: id,
      emoji,
      senderName: formatDisplayName(user),
      senderEmail: user?.email || 'Bidder',
    });
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shadow-md shadow-indigo-500/20" />
          <p className="text-xs font-mono text-slate-500 tracking-wider">Connecting to live auction room...</p>
        </div>
      </div>
    );
  }

  if (error && !auction) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="glass-card border border-rose-200 p-8 rounded-3xl bg-white shadow-lg">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Auction Not Found</h2>
          <p className="text-xs text-slate-500 mb-6">{error}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white btn-primary"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Auctions
          </Link>
        </div>
      </div>
    );
  }

  const isSeller = user?.id === auction.seller_id;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Top Back Nav & Live Room Indicator */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Live Auctions
        </Link>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-mono shadow-sm">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]' : 'bg-rose-500'}`} />
          <span className="text-slate-500">
            Room: <span className="text-slate-800 font-semibold">{id.slice(0, 8)}...</span>
          </span>
        </div>
      </div>

      {/* Main Grid: Left Item Details + Right Live Bid Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Auction Details & Architecture Card */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Info Card */}
          <div className="glass-panel border border-slate-200/90 rounded-3xl p-6 sm:p-8 bg-white/95 backdrop-blur-xl shadow-xl shadow-slate-200/40">
            
            {/* Status & Category Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span
                className={`px-3 py-1 rounded-full text-xs font-mono font-medium border ${
                  isEnded
                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
                }`}
              >
                {isEnded ? 'AUCTION CLOSED' : 'ACTIVE BIDDING'}
              </span>

              <div className="text-xs text-slate-500 font-mono">
                Seller: <span className="text-slate-800 font-medium">{formatDisplayName(auction.seller_name, auction.seller_email)}</span>
              </div>
            </div>

            {/* ── Hero Item Photography (Node.js Video 28 - Multer Asset) ── */}
            <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden mb-6 bg-slate-100 border border-slate-200 shadow-inner group">
              <img
                src={imgError ? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80' : resolveImageUrl(auction.image_url)}
                alt={auction.title}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

              {/* Floating Real-Time Reaction Particles */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {activeReactions.map((r) => (
                  <div
                    key={r.id}
                    style={{ left: `${r.left}%` }}
                    className="absolute bottom-12 text-3xl animate-bounce filter drop-shadow-md select-none transition-all duration-1000"
                  >
                    {r.emoji}
                  </div>
                ))}
              </div>

              {/* Real-time Emoji Reaction Trigger Bar */}
              <div className="absolute bottom-4 right-4 flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl">
                <span className="text-[10px] font-mono text-slate-600 pl-1.5 pr-1 flex items-center gap-1 font-medium">
                  <Flame className="w-3 h-3 text-amber-500" /> React:
                </span>
                {['🔥', '🚀', '💎', '👏', '❤️', '⚡'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleTriggerReaction(emoji)}
                    className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:scale-125 border border-slate-200 hover:border-indigo-300 transition-all text-base flex items-center justify-center cursor-pointer active:scale-95"
                    title={`Send ${emoji} reaction`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Status Chip overlay on image */}
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-xs font-mono text-white shadow-lg">
                <span className={`w-2 h-2 rounded-full ${isEnded ? 'bg-slate-400' : 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]'}`} />
                <span>{isEnded ? 'CLOSED' : 'LIVE AUCTION'}</span>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-4 text-slate-900">
              {auction.title}
            </h1>

            {/* Description */}
            <div className="prose max-w-none text-slate-600 text-sm leading-relaxed mb-6 whitespace-pre-line bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
              {auction.description || 'No detailed description provided by the seller.'}
            </div>

            {/* Auction Specs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50/90 border border-slate-200 font-mono text-xs">
              <div>
                <span className="text-slate-400 block mb-1">Starting Price</span>
                <span className="text-slate-900 font-semibold text-sm">
                  ${parseFloat(auction.starting_price).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Total Bids</span>
                <span className="text-indigo-600 font-semibold text-sm">{bids.length}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Created At</span>
                <span className="text-slate-700">
                  {new Date(auction.created_at).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">End Time</span>
                <span className="text-slate-700">
                  {new Date(auction.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

          </div>

          {/* Winner Banner if Closed */}
          {isEnded && (
            <div className="glass-card border border-amber-300 bg-amber-50/80 rounded-3xl p-6 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-700 shadow-sm">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-amber-900 mb-0.5">Auction Concluded</h3>
                <p className="text-xs text-slate-700">
                  Winning bid:{' '}
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    ${parseFloat(auction.current_price).toFixed(2)}
                  </span>
                  {auction.winner_id ? (
                    <span className="text-slate-500 ml-1">(Winner recorded in database)</span>
                  ) : (
                    <span className="text-slate-500 ml-1">(No winning bids placed)</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ── Dual Tabs: Live Bids History vs Live Room Chat (Video 33) ── */}
          <div className="glass-card border border-slate-200/90 rounded-3xl p-6 bg-white/95 backdrop-blur-xl shadow-sm">
            <div className="flex items-center justify-between mb-5 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('bids')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    activeTab === 'bids'
                      ? 'btn-primary text-white shadow-md shadow-indigo-500/25'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Bids History ({bids.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    activeTab === 'chat'
                      ? 'btn-primary text-white shadow-md shadow-indigo-500/25'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Live Room Chat ({Math.max(0, chatMessages.length - 1)})</span>
                </button>
              </div>

              <span className="text-[11px] font-mono text-emerald-600 flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                WebSocket Active
              </span>
            </div>

            {activeTab === 'bids' ? (
              /* Bid History Table */
              bids.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-mono">
                  No bids placed yet. Be the first to place a bid!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="pb-2.5 font-normal">Bidder</th>
                        <th className="pb-2.5 font-normal">Amount</th>
                        <th className="pb-2.5 font-normal text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bids.map((b, idx) => {
                        const bidderDisplayName = formatDisplayName(b.bidder_name, b.bidder_email);
                        return (
                          <tr key={b.id || idx} className={idx === 0 ? 'bg-indigo-50/50' : ''}>
                            <td className="py-3 text-slate-800 font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {getInitials(bidderDisplayName)}
                                </div>
                                <span className="font-semibold text-slate-900">{bidderDisplayName}</span>
                                {idx === 0 && (
                                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                    HIGHEST
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 text-slate-900 font-bold text-sm">
                              <span className="text-indigo-600 font-bold">$</span>{parseFloat(b.amount).toFixed(2)}
                            </td>
                            <td className="py-3 text-slate-500 text-right">
                              {new Date(b.created_at).toLocaleTimeString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* Live Chat Stream (Video 33 - Socket.IO Chat) */
              <div className="space-y-4">
                <div className="h-64 overflow-y-auto space-y-2.5 pr-2">
                  {chatMessages.map((msg) => {
                    const isMe = user && ((user.email && msg.senderEmail === user.email) || (user.name && msg.senderName === user.name));
                    const isSys = msg.role === 'system';
                    const senderDisplayName = formatDisplayName(msg.senderName, msg.senderEmail);
                    return (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-xl text-xs ${
                          isSys
                            ? 'bg-indigo-50 border border-indigo-200 text-indigo-900'
                            : isMe
                            ? 'bg-indigo-600 text-white shadow-sm ml-6'
                            : 'bg-slate-50 border border-slate-200 text-slate-800 mr-6'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`font-mono font-bold text-[11px] flex items-center gap-1.5 ${isMe ? 'text-indigo-100' : 'text-indigo-600'}`}>
                            {senderDisplayName}
                            {msg.role === 'admin' && (
                              <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded font-sans">
                                Admin
                              </span>
                            )}
                          </span>
                          <span className={`text-[10px] font-mono ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="leading-relaxed break-words">{msg.text}</p>
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>

                {/* Chat input form */}
                <form onSubmit={handleSendChatMessage} className="flex gap-2 pt-2 border-t border-slate-200">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Chat with live bidders in room..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-sm"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-white btn-primary flex items-center gap-1.5 shadow-md shadow-indigo-500/20 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            )}
          </div>

        </div>

        {/* Right 1 Col: Sticky Live Bid & Action Box */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 glass-panel border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xl shadow-slate-200/50 space-y-6 bg-white/95 backdrop-blur-xl">
            
            {/* Live Ticking Countdown Header */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center shadow-inner">
              <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 block mb-1 font-medium">
                Time Remaining
              </span>
              <div
                className={`text-2xl font-extrabold font-mono tracking-tight ${
                  isEnded
                    ? 'text-slate-400'
                    : 'text-amber-600'
                }`}
              >
                {timeLeft}
              </div>
            </div>

            {/* Current Highest Bid Highlight */}
            <div
              className={`p-5 rounded-2xl border transition-all duration-300 text-center ${
                isPriceFlashing
                  ? 'bg-indigo-50 border-indigo-400 scale-[1.02] shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-50/80 border border-slate-200'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 font-mono mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                <span>{isEnded ? 'Winning Bid' : 'Current Highest Bid'}</span>
              </div>

              <div className="text-4xl font-extrabold font-mono tracking-tight my-1 text-slate-900">
                <span className="text-indigo-600 text-2xl font-bold mr-1">$</span>
                <span>
                  {parseFloat(auction.current_price).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <span className="text-[11px] text-slate-500 font-mono">
                Min next bid: <span className="text-slate-800 font-semibold">${(parseFloat(auction.current_price) + 1).toFixed(2)}</span>
              </span>
            </div>

            {/* Bid Form or Restrictions */}
            {isEnded ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <p className="text-xs text-slate-500 font-mono">
                  This auction has ended. No further bids can be accepted.
                </p>
              </div>
            ) : isSeller ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                <p className="text-xs text-amber-800 font-mono">
                  You are the seller of this auction. Self-bidding is blocked by backend concurrency rules.
                </p>
              </div>
            ) : (
              <form onSubmit={handlePlaceBid} className="space-y-4">
                
                {/* ── 1-Click Instant Bidding (Bidzy Style) ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-700 font-semibold flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      1-Click Instant Bidding
                    </span>
                    <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      Bidzy Style
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {[10, 25, 50, 100].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        disabled={submitting || isEnded}
                        onClick={() => handleInstantBid(inc)}
                        className="py-2.5 px-1 rounded-xl text-xs font-mono font-bold bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-400 text-slate-800 transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer shadow-sm hover:shadow-md hover:shadow-indigo-500/10 disabled:opacity-50"
                        title={`Place 1-Click Bid for $${(parseFloat(auction.current_price) + inc).toFixed(2)}`}
                      >
                        <span className="text-amber-600 text-[9px] uppercase tracking-wider font-semibold">1-Click</span>
                        <span>+${inc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Bid Increment Selector */}
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-mono text-slate-500 block mb-1.5">
                    Or select increment for custom bid:
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[10, 25, 50, 100].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() => handleQuickIncrement(inc)}
                        className="py-1.5 px-1 rounded-lg text-[11px] font-mono font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-indigo-300 text-slate-700 transition-colors cursor-pointer"
                      >
                        +${inc}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Bid Input */}
                <div>
                  <label className="text-[11px] font-mono text-slate-600 block mb-1.5">
                    Custom Bid Amount ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-600 font-bold font-mono text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min={parseFloat(auction.current_price) + 0.01}
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono font-bold text-base focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors shadow-sm"
                      required
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Success Banner */}
                {successMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* Submit Bid Button */}
                <button
                  type="submit"
                  disabled={submitting || isEnded}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white btn-primary transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-indigo-500/30 active:scale-[0.98]"
                >
                  <Gavel className={`w-4 h-4 ${submitting ? 'animate-bounce' : ''}`} />
                  <span>
                    {submitting
                      ? 'Acquiring Lock & Placing...'
                      : isAuthenticated
                      ? `Confirm Bid of $${parseFloat(bidAmount || 0).toFixed(2)}`
                      : 'Sign In to Bid'}
                  </span>
                </button>

                <p className="text-[10px] text-center text-slate-400 font-mono">
                  Verified Bidding & Buyer Protection • Secure Real-Time Checkout
                </p>
              </form>
            )}

          </div>
        </div>

      </div>

    </div>
  );
};

export default AuctionDetailPage;
