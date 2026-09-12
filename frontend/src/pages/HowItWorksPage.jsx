import React from 'react';
import { UserCheck, Gavel, Timer, CreditCard, ShieldCheck, ArrowRight, Sparkles, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';

export const HowItWorksPage = () => {
  const steps = [
    {
      number: '01',
      icon: <UserCheck className="w-6 h-6 text-indigo-600" />,
      title: 'Registration & Identity Verification',
      description:
        'Create your secure account in seconds. Seamlessly participate as an active bidder, or activate full auctioneer seller privileges to list authenticated luxury and collector items.',
      badge: 'Step 1',
    },
    {
      number: '02',
      icon: <Gavel className="w-6 h-6 text-indigo-600" />,
      title: 'Real-Time Competitive Bidding',
      description:
        'Place live bids powered by persistent WebSockets and PostgreSQL row-level pessimistic locking. Race conditions are mathematically eliminated so you never lose a legitimate bid to latency.',
      badge: 'Step 2',
    },
    {
      number: '03',
      icon: <Timer className="w-6 h-6 text-indigo-600" />,
      title: 'Anti-Snipe Fair Clock Extension',
      description:
        'If a bid is placed in the final moments, our distributed scheduler automatically grants overtime. This guarantees fair opportunity for all collectors without unfair bot sniping.',
      badge: 'Step 3',
    },
    {
      number: '04',
      icon: <Trophy className="w-6 h-6 text-indigo-600" />,
      title: 'Winning Settlement & Direct Payouts',
      description:
        'Upon auction close, the highest bidder is awarded the lot. The winner is instantly provided the seller’s verified payout credentials (Bank Wire, UPI, or PayPal) to complete checkout.',
      badge: 'Step 4',
    },
    {
      number: '05',
      icon: <ShieldCheck className="w-6 h-6 text-indigo-600" />,
      title: '5% Platform Fee & Transparent Verification',
      description:
        'The platform charges a nominal 5% fee on closed auctions. Sellers upload transfer receipts via the Commission portal, which are reviewed and settled by administrators in real-time.',
      badge: 'Step 5',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" /> Transparency & Integrity
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
          How AuctionLoom Works
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          From verified listing curation to millisecond-accurate bidding and direct escrow settlements, discover how our platform ensures fair, transparent, and secure auctions.
        </p>
      </div>

      {/* 5-Step Process Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
        {steps.map((step, idx) => (
          <div
            key={idx}
            className="rounded-3xl bg-white border border-slate-200/80 shadow-lg p-8 relative overflow-hidden hover:shadow-xl transition-all group"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                {step.icon}
              </div>
              <span className="font-mono font-extrabold text-3xl text-slate-200 group-hover:text-indigo-200 transition-colors">
                {step.number}
              </span>
            </div>

            <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold font-mono uppercase tracking-wider mb-2">
              {step.badge}
            </span>

            <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">
              {step.title}
            </h3>

            <p className="text-sm text-slate-600 leading-relaxed">
              {step.description}
            </p>
          </div>
        ))}
      </div>

      {/* CTA Box */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 sm:p-12 text-center text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-2xl mx-auto space-y-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold">
            Ready to Experience Real-Time Auctions?
          </h2>
          <p className="text-sm text-slate-300">
            Join thousands of premier collectors. Bid on authentic luxury timepieces, art, and rarities with zero latency.
          </p>
          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/"
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg transition-all active:scale-95 inline-flex items-center gap-2"
            >
              Explore Live Marketplace <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/leaderboard"
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm transition-all active:scale-95"
            >
              View Leaderboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
