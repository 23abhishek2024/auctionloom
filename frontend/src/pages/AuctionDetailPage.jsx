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
          bidder_email: data.bidder_email,
          created_at: new Date().toISOString(),
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
      senderEmail: user?.email || 'Anonymous Bidder',
      role: user?.role || 'bidder',
    });

    setChatInput('');
  };

  const handleTriggerReaction = (emoji) => {
    sendReaction({
      auctionId: id,
      emoji,
      senderEmail: user?.email || 'Bidder',
    });
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-mono text-slate-400">Connecting to live auction room...</p>
        </div>
      </div>
    );
  }

  if (error && !auction) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="glass-card border border-rose-500/30 p-8 rounded-3xl">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Auction Not Found</h2>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500"
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
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Live Auctions
        </Link>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-slate-400">
            Room: <span className="text-slate-200">{id.slice(0, 8)}...</span>
          </span>
        </div>
      </div>

      {/* Main Grid: Left Item Details + Right Live Bid Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Auction Details & Architecture Card */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Info Card */}
          <div className="glass-panel border border-slate-800/80 rounded-3xl p-6 sm:p-8">
            
            {/* Status & Category Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span
                className={`px-3 py-1 rounded-full text-xs font-mono font-medium border ${
                  isEnded
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {isEnded ? 'AUCTION CLOSED' : 'ACTIVE BIDDING'}
              </span>

              <div className="text-xs text-slate-400 font-mono">
                Seller: <span className="text-slate-300">{auction.seller_email}</span>
              </div>
            </div>

            {/* ── Hero Item Photography (Node.js Video 28 - Multer Asset) ── */}
            <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden mb-6 bg-slate-950 border border-slate-800 shadow-inner group">
              <img
                src={imgError ? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80' : resolveImageUrl(auction.image_url)}
                alt={auction.title}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />

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
              <div className="absolute bottom-4 right-4 flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-slate-700/80 shadow-2xl">
                <span className="text-[10px] font-mono text-slate-400 pl-1.5 pr-1 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-amber-400" /> React:
                </span>
                {['🔥', '🚀', '💎', '👏', '❤️', '⚡'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleTriggerReaction(emoji)}
                    className="w-8 h-8 rounded-xl bg-slate-900/90 hover:bg-indigo-600/40 hover:scale-125 transition-all text-base flex items-center justify-center cursor-pointer active:scale-95"
                    title={`Send ${emoji} reaction`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Status Chip overlay on image */}
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-800 text-xs font-mono text-slate-300">
                <span className={`w-2 h-2 rounded-full ${isEnded ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'}`} />
                <span>{isEnded ? 'CLOSED' : 'LIVE AUCTION'}</span>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
              {auction.title}
            </h1>

            {/* Description */}
            <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed mb-6 whitespace-pre-line bg-slate-900/40 p-4 rounded-2xl border border-slate-800/60">
              {auction.description || 'No detailed description provided by the seller.'}
            </div>

            {/* Auction Specs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 font-mono text-xs">
              <div>
                <span className="text-slate-400 block mb-1">Starting Price</span>
                <span className="text-slate-200 font-semibold text-sm">
                  ${parseFloat(auction.starting_price).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Total Bids</span>
                <span className="text-indigo-400 font-semibold text-sm">{bids.length}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Created At</span>
                <span className="text-slate-200">
                  {new Date(auction.created_at).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">End Time</span>
                <span className="text-slate-200">
                  {new Date(auction.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

          </div>

          {/* Winner Banner if Closed */}
          {isEnded && (
            <div className="glass-card border border-amber-500/30 bg-amber-950/20 rounded-3xl p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-amber-300 mb-0.5">Auction Concluded</h3>
                <p className="text-xs text-slate-300">
                  Winning bid:{' '}
                  <span className="font-mono font-bold text-white text-sm">
                    ${parseFloat(auction.current_price).toFixed(2)}
                  </span>
                  {auction.winner_id ? (
                    <span className="text-slate-400 ml-1">(Winner recorded in database)</span>
                  ) : (
                    <span className="text-slate-400 ml-1">(No winning bids placed)</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* System Architecture Explanation Card */}
          <div className="glass-card border border-slate-800/80 rounded-3xl p-6">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider font-mono mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Concurrency & Locking Architecture</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              When a bid is submitted, the Express API initiates a PostgreSQL transaction with{' '}
              <code className="text-indigo-300 bg-indigo-950/60 px-1 py-0.5 rounded font-mono">
                SELECT * FROM auctions WHERE id = X FOR UPDATE
              </code>
              . This exclusively locks the auction row, queuing any concurrent bids. Once committed,
              the row is unlocked and Socket.IO broadcasts the new price and chat messages instantly to all connected viewers.
            </p>
          </div>

          {/* ── Dual Tabs: Live Bids History vs Live Room Chat (Video 33) ── */}
          <div className="glass-card border border-slate-800/80 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('bids')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    activeTab === 'bids'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
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
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Live Room Chat ({Math.max(0, chatMessages.length - 1)})</span>
                </button>
              </div>

              <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
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
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2.5 font-normal">Bidder</th>
                        <th className="pb-2.5 font-normal">Amount</th>
                        <th className="pb-2.5 font-normal text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {bids.map((b, idx) => (
                        <tr key={b.id || idx} className={idx === 0 ? 'bg-indigo-500/5' : ''}>
                          <td className="py-3 text-slate-300 font-medium">
                            {b.bidder_email || 'Anonymous Bidder'}
                            {idx === 0 && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                                HIGHEST
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-slate-100 font-bold text-sm">
                            ${parseFloat(b.amount).toFixed(2)}
                          </td>
                          <td className="py-3 text-slate-400 text-right">
                            {new Date(b.created_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* Live Chat Stream (Video 33 - Socket.IO Chat) */
              <div className="space-y-4">
                <div className="h-64 overflow-y-auto space-y-2.5 pr-2">
                  {chatMessages.map((msg) => {
                    const isMe = user?.email && msg.senderEmail === user.email;
                    const isSys = msg.role === 'system';
                    return (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-xl text-xs ${
                          isSys
                            ? 'bg-indigo-950/30 border border-indigo-500/20 text-indigo-300'
                            : isMe
                            ? 'bg-indigo-600/20 border border-indigo-500/40 text-slate-100 ml-6'
                            : 'bg-slate-900/80 border border-slate-800 text-slate-200 mr-6'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono font-bold text-[11px] text-indigo-300 flex items-center gap-1.5">
                            {msg.senderEmail}
                            {msg.role === 'admin' && (
                              <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded font-sans">
                                Admin
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
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
                <form onSubmit={handleSendChatMessage} className="flex gap-2 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Chat with live bidders in room..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
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
          <div className="sticky top-24 glass-panel border border-slate-800/80 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6">
            
            {/* Live Ticking Countdown Header */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-center">
              <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 block mb-1">
                Time Remaining
              </span>
              <div
                className={`text-2xl font-extrabold font-mono tracking-tight ${
                  isEnded
                    ? 'text-slate-400'
                    : 'text-amber-400'
                }`}
              >
                {timeLeft}
              </div>
            </div>

            {/* Current Highest Bid Highlight */}
            <div
              className={`p-5 rounded-2xl border transition-all duration-300 text-center ${
                isPriceFlashing
                  ? 'bg-indigo-600/30 border-indigo-400 scale-[1.02]'
                  : 'bg-slate-900/50 border-slate-800/80'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 font-mono mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isEnded ? 'Winning Bid' : 'Current Highest Bid'}</span>
              </div>

              <div className="text-4xl font-extrabold text-white font-mono tracking-tight my-1">
                <span className="text-indigo-400 text-2xl">$</span>
                {parseFloat(auction.current_price).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>

              <span className="text-[11px] text-slate-400">
                Min next bid: ${(parseFloat(auction.current_price) + 1).toFixed(2)}
              </span>
            </div>

            {/* Bid Form or Restrictions */}
            {isEnded ? (
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
                <p className="text-xs text-slate-400 font-mono">
                  This auction has ended. No further bids can be accepted.
                </p>
              </div>
            ) : isSeller ? (
              <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-center">
                <p className="text-xs text-amber-300 font-mono">
                  You are the seller of this auction. Self-bidding is blocked by backend concurrency rules.
                </p>
              </div>
            ) : (
              <form onSubmit={handlePlaceBid} className="space-y-4">
                
                {/* ── 1-Click Instant Bidding (Bidzy Style) ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-300 font-semibold flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      1-Click Instant Bidding
                    </span>
                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/30">
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
                        className="py-2.5 px-1 rounded-xl text-xs font-mono font-bold bg-gradient-to-b from-slate-900 to-slate-950 hover:from-indigo-950 hover:to-indigo-900 border border-slate-700 hover:border-indigo-400 text-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer shadow-sm hover:shadow-indigo-500/20 disabled:opacity-50"
                        title={`Place 1-Click Bid for $${(parseFloat(auction.current_price) + inc).toFixed(2)}`}
                      >
                        <span className="text-amber-400 text-[9px] uppercase tracking-wider">1-Click</span>
                        <span>+${inc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Bid Increment Selector */}
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-mono text-slate-400 block mb-1.5">
                    Or select increment for custom bid:
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[10, 25, 50, 100].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() => handleQuickIncrement(inc)}
                        className="py-1.5 px-1 rounded-lg text-[11px] font-mono font-semibold bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                      >
                        +${inc}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Bid Input */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1.5">
                    Custom Bid Amount ($)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      step="0.01"
                      min={parseFloat(auction.current_price) + 0.01}
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono font-bold text-base focus:outline-none focus:border-indigo-500 transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Success Banner */}
                {successMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* Submit Bid Button */}
                <button
                  type="submit"
                  disabled={submitting || isEnded}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
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

                <p className="text-[10px] text-center text-slate-400">
                  Transactions protected by PostgreSQL pessimistic locks (`FOR UPDATE`).
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
