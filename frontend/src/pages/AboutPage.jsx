import React from 'react';
import { ShieldCheck, Cpu, Database, Award, CheckCircle2, Lock, Zap, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AboutPage = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" /> About AuctionLoom
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
          The Premier Real-Time Luxury Auction Platform
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          Engineered for collectors, connoisseurs, and auctioneers who demand unwavering precision, cryptographic transparency, and absolute fairness in competitive bidding.
        </p>
      </div>

      {/* Core Mission Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        <div className="rounded-3xl bg-white border border-slate-200/80 shadow-lg p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">ACID Concurrency</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Unlike standard auction systems vulnerable to double-spend race conditions, our PostgreSQL row-level pessimistic locking (`SELECT ... FOR UPDATE`) guarantees single-winner determinism.
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200/80 shadow-lg p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-4">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Zero-Latency WebSockets</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Persistent Socket.IO bi-directional connections broadcast price updates and in-room auction chat instantaneously to all active participants across the globe.
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200/80 shadow-lg p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Transparent Settlements</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Verified payout credentials, automated 5% platform fee accounting, and administrative proof approvals ensure full financial accountability between buyers and sellers.
          </p>
        </div>
      </div>

      {/* Engineering Blueprint Banner */}
      <div className="rounded-3xl bg-slate-900 text-white p-8 sm:p-12 border border-slate-800 shadow-2xl mb-16 relative overflow-hidden">
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <span className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
              Engineering Architecture
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Built on Modern Distributed Systems
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              AuctionLoom combines React 19, Node.js 20, Express 5, PostgreSQL 15, Socket.IO, Docker multi-stage containerization, and AWS ECS orchestration into a production-grade live bidding system.
            </p>
            <div className="pt-2 flex flex-wrap gap-2 text-xs font-mono">
              <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/10">PostgreSQL SKIP LOCKED</span>
              <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/10">Token Bucket Rate Limiting</span>
              <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/10">JWT RBAC Security</span>
              <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/10">Gemini LLM Assistant</span>
            </div>
          </div>

          <div className="bg-slate-800/80 rounded-2xl border border-slate-700 p-6 space-y-3 text-xs font-mono text-slate-300 shadow-inner">
            <div className="text-indigo-400 font-bold">--- System Specifications ---</div>
            <div>• Database: PostgreSQL with Connection Pooling</div>
            <div>• Real-Time Engine: Bi-directional WebSocket Pub/Sub</div>
            <div>• Concurrency Model: Pessimistic Row Lock (FOR UPDATE)</div>
            <div>• Background Job Queue: Distributed Postgres Workers</div>
            <div>• Monorepo State: React SPA + Express REST API</div>
            <div>• Container Orchestration: Docker + AWS ECS Fargate</div>
          </div>
        </div>
      </div>
    </div>
  );
};
