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
    <div className="group relative rounded-2xl glass-card border border-slate-800/80 hover:border-indigo-500/40 p-4 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
      
      {/* Item Image with status chips */}
      <div className="relative w-full h-44 rounded-xl overflow-hidden mb-3.5 bg-slate-900 border border-slate-800/60">
        <img
          src={displayImage}
          alt={auction.title}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30" />

        {/* Status Badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium backdrop-blur-md border border-white/10 shadow-lg bg-slate-950/70">
          <span
            className={`w-2 h-2 rounded-full ${
              isEnded
                ? 'bg-slate-500'
                : isUrgent
                ? 'bg-amber-400 animate-ping'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span
            className={
              isEnded
                ? 'text-slate-400'
                : isUrgent
                ? 'text-amber-300'
                : 'text-emerald-300'
            }
          >
            {isEnded ? 'CLOSED' : isUrgent ? 'ENDING SOON' : 'LIVE'}
          </span>
        </div>

        {/* Timer Chip */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono backdrop-blur-md bg-slate-950/80 border border-slate-800 text-slate-300">
          <Clock className="w-3 h-3 text-indigo-400" />
          <span className={isUrgent && !isEnded ? 'text-amber-400 font-semibold' : ''}>
            {timeLeft}
          </span>
        </div>
      </div>

      {/* Card Info */}
      <div>
        {/* Title */}
        <h3 className="text-base font-bold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1 mb-1">
          {auction.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
          {auction.description || 'No description provided.'}
        </p>
      </div>

      {/* Card Footer: Price & Action */}
      <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
            {isEnded ? 'Final Price' : 'Current Bid'}
          </span>
          <div className="flex items-baseline gap-0.5 text-xl font-extrabold text-slate-100 font-mono">
            <span className="text-indigo-400 text-base">$</span>
            {parseFloat(auction.current_price).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        <Link
          to={`/auctions/${auction.id}`}
          className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 group-hover:shadow-lg group-hover:shadow-indigo-600/25 transition-all"
        >
          <span>{isEnded ? 'View Result' : 'Place Bid'}</span>
          <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>

    </div>
  );
};

export default AuctionCard;
