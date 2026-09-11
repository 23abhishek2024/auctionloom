import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, DollarSign, ArrowUpRight, User, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { resolveImageUrl } from '../api/client';

export const AuctionCard = ({ auction }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnded, setIsEnded] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [imgError, setImgError] = useState(false);

  const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80';
  const displayImage = imgError ? fallbackImage : resolveImageUrl(auction.image_url);

  useEffect(() => {
    const calculateTime = () => {
      const difference = new Date(auction.end_time) - new Date();
      if (difference <= 0 || auction.status === 'CLOSED') {
        setTimeLeft('Auction Ended');
        setIsEnded(true);
        setIsUrgent(false);
        return;
      }

      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      if (hours === 0 && minutes < 10) {
        setIsUrgent(true);
      }

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days}d ${hours % 24}h remaining`);
      } else {
        setTimeLeft(
          `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        );
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [auction.end_time, auction.status]);

  return (
    <div className="group relative rounded-2xl glass-card border border-white/[0.08] hover:border-violet-500/50 p-4 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-violet-950/50">
      
      {/* Item Image with status chips */}
      <div className="relative w-full h-44 rounded-xl overflow-hidden mb-3.5 bg-[#090A11] border border-white/[0.06]">
        <img
          src={displayImage}
          alt={auction.title}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07080E]/90 via-transparent to-black/40" />

        {/* Status Badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium backdrop-blur-md border border-white/10 shadow-lg bg-black/70">
          <span
            className={`w-2 h-2 rounded-full ${
              isEnded
                ? 'bg-zinc-500'
                : isUrgent
                ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-ping'
                : 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
            }`}
          />
          <span
            className={
              isEnded
                ? 'text-zinc-400'
                : isUrgent
                ? 'text-amber-300'
                : 'text-emerald-300 font-semibold'
            }
          >
            {isEnded ? 'CLOSED' : isUrgent ? 'ENDING SOON' : 'LIVE'}
          </span>
        </div>

        {/* Timer Chip */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono backdrop-blur-md bg-black/80 border border-white/10 text-zinc-300">
          <Clock className="w-3 h-3 text-violet-400" />
          <span className={isUrgent && !isEnded ? 'text-amber-400 font-semibold' : ''}>
            {timeLeft}
          </span>
        </div>
      </div>

      {/* Card Info */}
      <div>
        {/* Title */}
        <h3 className="text-base font-bold text-zinc-100 group-hover:text-violet-300 transition-colors line-clamp-1 mb-1">
          {auction.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
          {auction.description || 'No description provided.'}
        </p>
      </div>

      {/* Card Footer: Price & Action */}
      <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block">
            {isEnded ? 'Final Price' : 'Current Bid'}
          </span>
          <div className="flex items-baseline gap-0.5 text-xl font-extrabold text-white font-mono">
            <span className="text-amber-400 text-base font-bold">$</span>
            {parseFloat(auction.current_price).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        <Link
          to={`/auctions/${auction.id}`}
          className="btn-primary flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold group-hover:shadow-lg group-hover:shadow-violet-600/30 transition-all"
        >
          <span>{isEnded ? 'View Result' : 'Place Bid'}</span>
          <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>

    </div>
  );
};

export default AuctionCard;
