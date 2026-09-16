import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { auctionApi, bidApi, userApi, adminApi, paymentApi, resolveImageUrl } from '../api/client';
import { loadRazorpayScript } from '../utils/razorpay';
import { RazorpayModal } from '../components/RazorpayModal';
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
  X,
  CreditCard,
  Copy,
  Check,
  Mail,
  ExternalLink,
  Trash2,
  ShieldAlert,
  Pause,
  Play,
  AlertTriangle,
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
  const [deleting, setDeleting] = useState(false);
  const [restricting, setRestricting] = useState(false);

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
  const [showReactions, setShowReactions] = useState(false);
  const [sellerPayout, setSellerPayout] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [lotPaid, setLotPaid] = useState(false);
  const [lotPaymentData, setLotPaymentData] = useState(null);
  const [payingLotRazorpay, setPayingLotRazorpay] = useState(false);
  const [lotPayError, setLotPayError] = useState(null);
  const [checkoutOrder, setCheckoutOrder] = useState(null);
  const [isRazorpayModalOpen, setIsRazorpayModalOpen] = useState(false);
  const chatBottomRef = useRef(null);

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Smooth scroll and focus jump to Live Room Chat
  const handleJumpToChat = () => {
    setActiveTab('chat');
    setTimeout(() => {
      const el = document.getElementById('auction-live-chat-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const input = document.getElementById('live-chat-input-box');
      if (input) {
        input.focus();
      }
    }, 150);
  };


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
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
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

    // Socket event handler for AUCTION_STATUS_CHANGED (Moderation Restriction / Hold)
    const handleStatusChanged = (data) => {
      console.log('[Socket] Live AUCTION_STATUS_CHANGED received:', data);
      if (data.auction_id === id) {
        setAuction((prev) => (prev ? { ...prev, status: data.status } : prev));
        if (data.status === 'RESTRICTED') {
          setError(`⚠️ Administrative Notice: ${data.reason || 'This auction is now restricted by platform moderation.'}`);
        } else if (data.status === 'ACTIVE') {
          setSuccessMsg('✅ Administrative hold lifted. Bidding is now active!');
          setError(null);
          setTimeout(() => setSuccessMsg(null), 4000);
        }
      }
    };

    if (socket) {
      socket.on('PRICE_UPDATE', handlePriceUpdate);
      socket.on('CHAT_MESSAGE', handleChatMessage);
      socket.on('REACTION', handleReaction);
      socket.on('AUCTION_STATUS_CHANGED', handleStatusChanged);
    }

    return () => {
      if (socket) {
        socket.off('PRICE_UPDATE', handlePriceUpdate);
        socket.off('CHAT_MESSAGE', handleChatMessage);
        socket.off('REACTION', handleReaction);
        socket.off('AUCTION_STATUS_CHANGED', handleStatusChanged);
      }
      leaveAuction(id);
    };
  }, [id, socket, isConnected]);

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

    if (user?.role === 'admin') {
      setError('Platform administrators are restricted from placing bids to preserve marketplace integrity.');
      return;
    }

    if (auction?.status === 'RESTRICTED') {
      setError('This auction has been placed under administrative restriction. Bidding is temporarily frozen.');
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

    if (user?.role === 'admin') {
      setError('Platform administrators are restricted from placing bids to preserve marketplace integrity.');
      return;
    }

    if (auction?.status === 'RESTRICTED') {
      setError('This auction has been placed under administrative restriction. Bidding is temporarily frozen.');
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

  // Super Admin Restrict / Resume Auction Toggle
  const handleAdminToggleRestrict = async () => {
    if (!auction) return;
    const isRestricted = auction.status === 'RESTRICTED';
    const targetStatus = isRestricted ? 'ACTIVE' : 'RESTRICTED';
    const actionLabel = isRestricted
      ? 'lift restriction and resume bidding'
      : 'place under administrative restriction (freeze bidding)';

    const confirmMsg = window.confirm(
      `🚨 SUPER ADMIN MODERATION ACTION:\n\nAre you sure you want to ${actionLabel} for "${auction.title}"?`
    );
    if (!confirmMsg) return;

    try {
      setRestricting(true);
      setError(null);
      const res = await adminApi.updateAuctionStatus(id, targetStatus);
      setAuction(res.data.auction);
      setSuccessMsg(
        targetStatus === 'RESTRICTED'
          ? '⚠️ Auction placed under administrative restriction. Bidding is frozen.'
          : '✅ Administrative restriction lifted. Bidding is now active!'
      );
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Failed to update auction status:', err);
      setError(err.response?.data?.error || 'Failed to update auction status.');
    } finally {
      setRestricting(false);
    }
  };

  // Super Admin Force Delete Auction from Detail Page
  const handleAdminDeleteAuction = async () => {
    const confirmed = window.confirm(
      `🚨 SUPER ADMIN MODERATION ACTION:\n\nAre you sure you want to permanently delete "${auction?.title}"?\n\nThis will remove the auction and all associated bids immediately from the marketplace.\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError(null);
      await adminApi.deleteAuction(id);
      alert(`Auction "${auction?.title}" was successfully deleted by Administrator.`);
      navigate('/auctions');
    } catch (err) {
      console.error('Failed to delete auction:', err);
      setError(err.response?.data?.error || 'Failed to delete auction.');
      setDeleting(false);
    }
  };

  // Seller Delete Auction (Allowed only if 0 bids)
  const handleSellerDeleteAuction = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete your auction "${auction?.title}"?`
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError(null);
      await auctionApi.delete(id);
      alert(`Your auction "${auction?.title}" was deleted.`);
      navigate('/auctions');
    } catch (err) {
      console.error('Failed to delete seller auction:', err);
      setError(err.response?.data?.error || 'Failed to delete auction.');
      setDeleting(false);
    }
  };

  // ── 5. Live Room Chat & Reactions Handlers (Video 33) ────────
  const handleSendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const text = chatInput.trim();
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const senderName = formatDisplayName(user);
    const messagePayload = {
      id: msgId,
      auctionId: id,
      text,
      senderName,
      senderEmail: user?.email || senderName,
      role: user?.role || 'bidder',
      timestamp: new Date().toISOString(),
    };

    // Optimistically show message immediately in chat box for instant feedback
    setChatMessages((prev) => [...prev, messagePayload]);

    sendMessage(messagePayload);
    setChatInput('');
  };

  const handleTriggerReaction = (emoji) => {
    sendReaction({
      auctionId: id,
      emoji,
      senderName: formatDisplayName(user),
      senderEmail: user?.email || 'Bidder',
    });
    setShowReactions(false);
  };

  // Derived state (calculated unconditionally before early returns)
  const isSeller = user?.id === auction?.seller_id;
  const isAdmin = user?.role === 'admin';
  const highestBid = bids && bids.length > 0 ? bids[0] : null;
  const winnerName = auction?.winner_name
    ? formatDisplayName(auction.winner_name, auction.winner_email)
    : (highestBid ? formatDisplayName(highestBid.bidder_name, highestBid.bidder_email) : null);
  const isWinnerMe = Boolean(
    user && (
      (auction?.winner_id && user.id === auction.winner_id) ||
      (highestBid && (user.id === highestBid.bidder_id || (user.email && highestBid.bidder_email === user.email)))
    )
  );

  // Hook 5: Winner settlement payout instructions & previous payment verification check
  useEffect(() => {
    if (user && id && isEnded && isWinnerMe && !sellerPayout) {
      userApi.getSellerPayoutForWinner(id)
        .then((res) => setSellerPayout(res.data.seller))
        .catch(() => {});
    }
  }, [user, id, isEnded, isWinnerMe, sellerPayout]);

  useEffect(() => {
    if (user && id && isWinnerMe) {
      paymentApi.getMyHistory()
        .then((res) => {
          const match = res.data?.payments?.find(
            (p) => p.auction_id === id && p.purpose === 'LOT_PAYMENT' && p.status === 'SUCCESS'
          );
          if (match) {
            setLotPaid(true);
            setLotPaymentData({
              payment_id: match.razorpay_payment_id || match.id,
              order_id: match.razorpay_order_id,
            });
          }
        })
        .catch(() => {});
    }
  }, [user, id, isWinnerMe]);

  // Execute cryptographic signature verification with backend
  const executeLotVerification = async (verifyPayload) => {
    try {
      setPayingLotRazorpay(true);
      const verifyRes = await paymentApi.verifyPayment(verifyPayload);
      setLotPaid(true);
      setLotPaymentData(verifyRes.data);
      setSuccessMsg('✅ Payment successfully settled and cryptographically verified via Razorpay!');
      setTimeout(() => setSuccessMsg(null), 5000);
      return verifyRes.data;
    } catch (verErr) {
      console.error('Lot payment verification failed:', verErr);
      const msg = verErr.response?.data?.error || 'Payment verification failed. Please contact platform support.';
      setLotPayError(msg);
      throw new Error(msg);
    } finally {
      setPayingLotRazorpay(false);
    }
  };

  // Razorpay Winner Lot Settlement Handler
  const handlePayLotRazorpay = async () => {
    if (!auction) return;
    setLotPayError(null);
    const hammerPrice = parseFloat(auction.current_price);

    try {
      setPayingLotRazorpay(true);
      const isLoaded = await loadRazorpayScript();

      const orderRes = await paymentApi.createOrder({
        amount: hammerPrice,
        purpose: 'LOT_PAYMENT',
        auction_id: id,
        notes: {
          auctionTitle: auction.title,
          winnerEmail: user?.email,
          sellerEmail: auction.seller_email,
        },
      });

      const orderData = orderRes.data;
      setCheckoutOrder(orderData);

      // If live keys exist on server, attempt standard Razorpay modal
      if (isLoaded && window.Razorpay && orderData.keyId && orderData.keyId !== 'rzp_test_placeholder') {
        try {
          const options = {
            key: orderData.keyId,
            amount: orderData.amount,
            currency: orderData.currency || 'INR',
            name: 'AuctionLoom Escrow',
            description: `Winning Lot Settlement: ${auction.title}`,
            image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=128&q=80',
            order_id: orderData.orderId,
            handler: async function (response) {
              await executeLotVerification({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
            },
            prefill: {
              name: user?.name || user?.email || 'Winner',
              email: user?.email || 'winner@auctionloom.com',
            },
            theme: {
              color: '#059669',
            },
          };

          const rzp = new window.Razorpay(options);
          rzp.on('payment.failed', function (response) {
            setLotPayError(`Payment failed: ${response.error.description}`);
            setPayingLotRazorpay(false);
          });
          rzp.open();
          setPayingLotRazorpay(false);
          return;
        } catch (popupErr) {
          console.warn('Official popup blocked, using interactive Razorpay modal:', popupErr);
        }
      }

      // Always open our interactive Razorpay Checkout Modal (supports live demo & sandbox)
      setIsRazorpayModalOpen(true);
      setPayingLotRazorpay(false);
    } catch (err) {
      console.error('Lot Razorpay error:', err);
      setLotPayError(err.response?.data?.error || 'Failed to initiate Razorpay checkout.');
      setPayingLotRazorpay(false);
    }
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

  if (error || !auction) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="glass-card border border-rose-200 p-8 rounded-3xl bg-white shadow-lg">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Auction Not Found</h2>
          <p className="text-xs text-slate-500 mb-6">{error || 'The requested auction could not be found or has been removed.'}</p>
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

        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAdminToggleRestrict}
                disabled={restricting}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50 border ${
                  auction?.status === 'RESTRICTED'
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                }`}
                title={auction?.status === 'RESTRICTED' ? 'Resume Bidding' : 'Freeze / Restrict Bidding'}
                id="btn-top-admin-restrict"
              >
                {auction?.status === 'RESTRICTED' ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{restricting ? 'Resuming...' : 'Resume Auction'}</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-600" />
                    <span>{restricting ? 'Restricting...' : 'Restrict Auction'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleAdminDeleteAuction}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-mono font-bold transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                title="Super Admin: Permanently Delete Auction"
                id="btn-top-admin-delete"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>{deleting ? 'Deleting...' : 'Delete (Admin)'}</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-mono shadow-sm">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]' : 'bg-rose-500'}`} />
            <span className="text-slate-500">
              Room: <span className="text-slate-800 font-semibold">{id.slice(0, 8)}...</span>
            </span>
          </div>
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
                    : auction.status === 'RESTRICTED'
                    ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
                }`}
              >
                {isEnded
                  ? 'AUCTION CLOSED'
                  : auction.status === 'RESTRICTED'
                  ? '⚠️ RESTRICTED / ON HOLD'
                  : 'ACTIVE BIDDING'}
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

              {/* Real-time Emoji Reaction Trigger (Collapsible) */}
              {!showReactions ? (
                <button
                  type="button"
                  onClick={() => setShowReactions(true)}
                  className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 hover:bg-white backdrop-blur-md border border-slate-200 shadow-md hover:shadow-lg transition-all text-xs font-semibold text-slate-700 hover:scale-105 active:scale-95 cursor-pointer"
                  title="React with emojis"
                >
                  <span className="text-sm">🔥</span>
                  <span className="text-[11px] font-medium">React</span>
                </button>
              ) : (
                <div className="absolute bottom-4 right-4 flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl animate-in fade-in zoom-in-95 duration-150">
                  <span className="text-[10px] font-mono text-slate-500 pl-2 pr-1 font-semibold flex items-center gap-1">
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
                  <button
                    type="button"
                    onClick={() => setShowReactions(false)}
                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center ml-1 text-xs cursor-pointer"
                    title="Close reaction tray"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

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
            <>
            <div className={`glass-card border rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
              isWinnerMe
                ? 'border-emerald-300 bg-emerald-50/90'
                : 'border-amber-300 bg-amber-50/80'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                  isWinnerMe
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-700'
                    : 'bg-amber-100 border border-amber-300 text-amber-700'
                }`}>
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`text-base font-bold ${isWinnerMe ? 'text-emerald-900' : 'text-amber-900'}`}>
                      Auction Concluded
                    </h3>
                    {isWinnerMe && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-600 text-white shadow-sm">
                        You Won!
                      </span>
                    )}
                  </div>

                  {winnerName ? (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-slate-600 font-medium">Declared Winner:</span>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-amber-200 shadow-sm">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 text-white text-[10px] font-bold flex items-center justify-center">
                          {getInitials(winnerName)}
                        </div>
                        <span className="text-xs font-bold text-slate-900">
                          {winnerName}
                        </span>
                      </div>
                      <span className="text-xs text-slate-600">
                        with winning bid of <strong className="text-slate-900 font-mono font-bold">${parseFloat(auction.current_price).toFixed(2)}</strong>
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">
                      No bids were placed on this item.
                    </p>
                  )}
                </div>
              </div>

              {winnerName && (
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <div className="px-3.5 py-2 rounded-xl bg-white/90 border border-amber-200 text-left sm:text-right shadow-sm">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">Winning Hammer Price</span>
                    <span className="text-base font-extrabold font-mono text-amber-700">
                      ${parseFloat(auction.current_price).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Seller Payout Coordinates for Winning Bidder */}
            {isWinnerMe && (
              <div className="rounded-3xl p-6 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-400 shadow-lg animate-fade-in space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                    <CreditCard className="w-5 h-5 text-emerald-600" />
                    <span>Seller Settlement & Payment Instructions</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                    Verified Winner
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Congratulations on winning this lot! Settle the hammer price of <strong className="text-slate-900">${parseFloat(auction.current_price).toFixed(2)}</strong> instantly via Razorpay Escrow, or wire directly to the seller:
                </p>

                {/* ── 1-Click Razorpay Escrow Settlement for Lot Winner ── */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                      <span>Instant Escrow Payment via Razorpay</span>
                    </div>
                    <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded text-emerald-100 font-semibold">
                      HMAC Verified
                    </span>
                  </div>

                  {lotPayError && (
                    <div className="p-2.5 rounded-xl bg-rose-600/90 text-white text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{lotPayError}</span>
                    </div>
                  )}

                  {lotPaid ? (
                    <div className="p-3 rounded-xl bg-white/20 border border-white/30 backdrop-blur-sm space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                        <span>Payment Settled & Cryptographically Verified ✓</span>
                      </div>
                      <div className="text-[11px] font-mono text-emerald-100">
                        Payment ID: <strong>{lotPaymentData?.payment_id}</strong>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                      <div className="text-xs text-emerald-100">
                        Supports UPI, Debit/Credit Cards, and NetBanking with instant cryptographic receipt.
                      </div>
                      <button
                        type="button"
                        onClick={handlePayLotRazorpay}
                        disabled={payingLotRazorpay}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {payingLotRazorpay ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Connecting Gateway...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 fill-slate-950" />
                            <span>Pay ${parseFloat(auction.current_price).toFixed(2)} via Razorpay</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {sellerPayout?.payoutMethods && (
                  sellerPayout.payoutMethods.bank_name ||
                  sellerPayout.payoutMethods.account_number ||
                  sellerPayout.payoutMethods.ifsc_swift ||
                  sellerPayout.payoutMethods.upi_id ||
                  sellerPayout.payoutMethods.paypal_email
                ) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono bg-white/95 p-4 rounded-2xl border border-emerald-200 shadow-inner">
                    {sellerPayout.payoutMethods.bank_name && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Bank Wire</span>
                          <strong className="text-slate-900 font-sans text-xs">{sellerPayout.payoutMethods.bank_name}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(sellerPayout.payoutMethods.bank_name, 'bank')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Copy Bank Name"
                        >
                          {copiedKey === 'bank' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {sellerPayout.payoutMethods.account_number && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Account Number</span>
                          <strong className="text-indigo-700 font-mono text-xs">{sellerPayout.payoutMethods.account_number}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(sellerPayout.payoutMethods.account_number, 'account')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Copy Account Number"
                        >
                          {copiedKey === 'account' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {sellerPayout.payoutMethods.ifsc_swift && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">IFSC / SWIFT</span>
                          <strong className="text-slate-900 text-xs">{sellerPayout.payoutMethods.ifsc_swift}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(sellerPayout.payoutMethods.ifsc_swift, 'ifsc')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Copy IFSC/SWIFT"
                        >
                          {copiedKey === 'ifsc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {sellerPayout.payoutMethods.upi_id && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">UPI ID</span>
                          <strong className="text-indigo-700 font-mono text-xs bg-indigo-50 px-1.5 py-0.5 rounded">{sellerPayout.payoutMethods.upi_id}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(sellerPayout.payoutMethods.upi_id, 'upi')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Copy UPI ID"
                        >
                          {copiedKey === 'upi' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {sellerPayout.payoutMethods.paypal_email && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2 sm:col-span-2">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">PayPal</span>
                          <strong className="text-slate-900 text-xs">{sellerPayout.payoutMethods.paypal_email}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(sellerPayout.payoutMethods.paypal_email, 'paypal')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Copy PayPal Address"
                        >
                          {copiedKey === 'paypal' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {sellerPayout.payoutMethods.notes && (
                      <div className="sm:col-span-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 italic">
                        <strong>Seller Notes:</strong> {sellerPayout.payoutMethods.notes}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Informative state when seller has not yet entered automated credentials */
                  <div className="rounded-2xl bg-amber-50/90 border border-amber-200 p-4 text-xs text-amber-900 space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-amber-950">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Direct Seller Settlement</span>
                    </div>
                    <p className="text-amber-800 leading-relaxed">
                      Seller <strong>{sellerPayout?.name || auction.seller_name}</strong> has not yet published automated digital payment coordinates (Bank wire, UPI, or PayPal). Please contact the seller directly below to arrange payment and delivery:
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {/* Option 1: Open in Web Gmail */}
                      <a
                        href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(sellerPayout?.email || auction.seller_email)}&su=${encodeURIComponent(`[AuctionLoom] Winning Bid Settlement - ${auction.title}`)}&body=${encodeURIComponent(`Hi ${sellerPayout?.name || auction.seller_name},\n\nI won your auction "${auction.title}" with a winning bid of $${parseFloat(auction.current_price).toFixed(2)}.\nPlease reply with your payment coordinates and shipping arrangements.\n\nThank you!`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition-all cursor-pointer"
                        title="Compose email directly in Web Gmail"
                      >
                        <Mail className="w-3.5 h-3.5 text-amber-300" />
                        <span>Email via Web Gmail ↗</span>
                      </a>

                      {/* Option 2: 1-Click Copy Email */}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(sellerPayout?.email || auction.seller_email, 'seller-email')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs shadow-sm hover:bg-slate-50 transition-all cursor-pointer"
                        title="Copy seller email address"
                      >
                        {copiedKey === 'seller-email' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">Copied! ✓</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Copy Email</span>
                          </>
                        )}
                      </button>

                      {/* Option 3: Smooth Scroll & Jump into Live Chat */}
                      <button
                        type="button"
                        onClick={handleJumpToChat}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-xs shadow-sm hover:bg-emerald-100 transition-all cursor-pointer"
                        title="Jump to live room chat below"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Message in Live Chat ↓</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-slate-500 pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/60 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span>Seller: <strong>{sellerPayout?.name || auction.seller_name}</strong> ({sellerPayout?.email || auction.seller_email})</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(sellerPayout?.email || auction.seller_email, 'seller-email-small')}
                      className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                      title="Copy seller email"
                    >
                      {copiedKey === 'seller-email-small' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 font-sans font-semibold">
                    <a
                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(sellerPayout?.email || auction.seller_email)}&su=${encodeURIComponent(`[AuctionLoom] Winning Bid Settlement - ${auction.title}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 font-semibold hover:text-indigo-700 underline"
                    >
                      Gmail Web ↗
                    </a>
                    <span className="text-slate-300">|</span>
                    <a
                      href={`mailto:${sellerPayout?.email || auction.seller_email}?subject=${encodeURIComponent(`[AuctionLoom] Winning Bid Settlement - ${auction.title}`)}`}
                      className="text-slate-500 font-semibold hover:text-slate-700 underline"
                    >
                      Desktop Mail App
                    </a>
                  </div>
                </div>

                {auction.winner_email_preview_url && (
                  <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between gap-3 flex-wrap bg-white/80 p-3 rounded-2xl border border-emerald-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-700 text-xs">
                      <Mail className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <span><strong>Transactional Notice:</strong> Automated winning invoice dispatched by worker</span>
                    </div>
                    <a
                      href={auction.winner_email_preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-xs shadow-sm hover:from-violet-700 hover:to-indigo-700 transition-all cursor-pointer"
                    >
                      <span>View Email Preview (Ethereal)</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* If seller is viewing their own concluded auction, provide reminder */}
            {isSeller && isEnded && (
              <div className="rounded-3xl p-5 bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-900 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-indigo-950">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    <span>Your Seller Payout Setup</span>
                  </div>
                  <Link
                    to="/my-hub"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 transition-colors"
                  >
                    Configure Coordinates in My Hub →
                  </Link>
                </div>
                <p className="text-slate-600">
                  This auction concluded with a winning bid of <strong>${parseFloat(auction.current_price).toFixed(2)}</strong> by <strong>{winnerName || 'Winner'}</strong>. Ensure your Bank, UPI, and PayPal details are configured in My Hub so your buyer can complete payment.
                </p>
              </div>
            )}
          </>
          )}


          {/* ── Dual Tabs: Live Bids History vs Live Room Chat (Video 33) ── */}
          <div id="auction-live-chat-section" className="glass-card border border-slate-200/90 rounded-3xl p-6 bg-white/95 backdrop-blur-xl shadow-sm scroll-mt-24">
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
                    id="live-chat-input-box"
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
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-center space-y-2 shadow-sm">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-800 font-mono">
                  <Trophy className="w-4 h-4 text-amber-600" />
                  <span>AUCTION CONCLUDED</span>
                </div>
                {winnerName ? (
                  <div className="text-xs text-slate-700">
                    <div className="flex items-center justify-center gap-1.5 my-1">
                      <span className="text-slate-500">Winner:</span>
                      <strong className="text-slate-900 font-bold">{winnerName}</strong>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Final Price: <span className="font-bold text-slate-900">${parseFloat(auction.current_price).toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-mono">
                    This auction concluded with no bids placed.
                  </p>
                )}

                {/* If Admin is viewing concluded auction, provide moderation delete */}
                {isAdmin && (
                  <div className="pt-3 border-t border-amber-200/80">
                    <button
                      type="button"
                      onClick={handleAdminDeleteAuction}
                      disabled={deleting}
                      className="w-full py-2 px-3 rounded-xl text-xs font-mono font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deleting ? 'Deleting...' : 'Delete Ended Auction (Admin)'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : isSeller ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
                <p className="text-xs text-amber-800 font-mono">
                  You are the seller of this auction. Self-bidding is blocked by backend concurrency rules.
                </p>
                {bids.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSellerDeleteAuction}
                    disabled={deleting}
                    className="w-full py-2 px-3 rounded-xl text-xs font-mono text-rose-600 bg-white hover:bg-rose-50 border border-rose-200 flex items-center justify-center gap-1.5 transition-all font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete My Listing (0 Bids)</span>
                  </button>
                )}
              </div>
            ) : auction?.status === 'RESTRICTED' && !isAdmin ? (
              <div className="p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-center space-y-2.5 shadow-sm">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-900 font-mono">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>AUCTION RESTRICTED UNDER REVIEW</span>
                </div>
                <p className="text-xs text-amber-800 font-mono leading-relaxed">
                  This auction lot has been placed on administrative hold by platform moderation. Bidding is temporarily frozen pending compliance review.
                </p>
                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-full border border-amber-200 text-[10px] font-mono text-amber-800 font-semibold shadow-xs">
                  Bidding Frozen
                </div>
              </div>
            ) : isAdmin ? (
              <div className="p-5 rounded-2xl bg-indigo-50/90 border border-indigo-200 text-center space-y-3.5 shadow-sm">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-900 font-mono">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>PLATFORM NEUTRALITY POLICY</span>
                </div>
                <p className="text-xs text-indigo-700 font-mono leading-relaxed">
                  Administrator accounts are restricted from placing bids to preserve marketplace integrity, prevent conflicts of interest, and protect buyer trust.
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-indigo-200 text-[10px] font-mono text-indigo-800 font-semibold shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Auditor Mode Active
                </div>

                {/* ── Super Admin Emergency Moderation ── */}
                <div className="pt-3.5 border-t border-indigo-200/80 space-y-2 text-left">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-800">
                    <span className="flex items-center gap-1.5 text-rose-700">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                      Moderation Controls
                    </span>
                    <span className="text-[10px] font-mono text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 font-semibold">
                      Super Admin
                    </span>
                  </div>

                  {/* Restrict / Resume Action */}
                  <button
                    type="button"
                    onClick={handleAdminToggleRestrict}
                    disabled={restricting}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 border ${
                      auction?.status === 'RESTRICTED'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                        : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500'
                    }`}
                    id="btn-sidebar-admin-restrict"
                  >
                    {auction?.status === 'RESTRICTED' ? (
                      <>
                        <Play className="w-4 h-4" />
                        <span>{restricting ? 'Resuming...' : 'Lift Restriction & Resume'}</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4" />
                        <span>{restricting ? 'Restricting...' : 'Restrict / Freeze Bidding'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleAdminDeleteAuction}
                    disabled={deleting}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-mono font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-600/20 active:scale-95 cursor-pointer disabled:opacity-50"
                    id="btn-sidebar-admin-delete"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{deleting ? 'Deleting Auction...' : 'Delete Auction (Admin)'}</span>
                  </button>
                  <p className="text-[10px] text-slate-500 font-mono text-center">
                    Permanently removes this lot and all bids from the platform.
                  </p>
                </div>
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

      {/* Interactive Razorpay Checkout Modal (UPI, Cards, NetBanking) */}
      <RazorpayModal
        isOpen={isRazorpayModalOpen}
        onClose={() => setIsRazorpayModalOpen(false)}
        orderData={checkoutOrder}
        onSuccess={executeLotVerification}
        onFailure={(err) => setLotPayError(err?.message || 'Payment simulation failed')}
      />

    </div>
  );
};

export default AuctionDetailPage;
