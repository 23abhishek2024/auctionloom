import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, DollarSign, ArrowUpRight, User, CheckCircle2 } from 'lucide-react';

export const AuctionCard = ({ auction }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnded, setIsEnded] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);

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
    <div className="group relative rounded-2xl glass-card border border-slate-800/80 hover:border-indigo-500/40 p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
      
      {/* Card Header & Status */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isEnded
                  ? 'bg-slate-600'
                  : isUrgent
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-emerald-400 animate-pulse'
              }`}
            />
            <span
              className={`text-xs font-mono font-medium px-2 py-0.5 rounded-full border ${
                isEnded
                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                  : isUrgent
                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {isEnded ? 'CLOSED' : isUrgent ? 'ENDING SOON' : 'ACTIVE'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className={isUrgent && !isEnded ? 'text-amber-400 font-semibold' : ''}>
              {timeLeft}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1 mb-1.5">
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
