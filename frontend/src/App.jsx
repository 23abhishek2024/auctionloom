import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { AuctionDetailPage } from './pages/AuctionDetailPage';
import { CreateAuctionPage } from './pages/CreateAuctionPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <div className="min-h-screen flex flex-col justify-between bg-transparent text-slate-900 selection:bg-indigo-600 selection:text-white">
            
            {/* Top Navigation */}
            <div>
              <Navbar />

              {/* Main Content View */}
              <main className="pb-16">
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/auctions/:id" element={<AuctionDetailPage />} />
                  <Route
                    path="/create"
                    element={
                      <ProtectedRoute allowedRoles={['auctioneer', 'admin']}>
                        <CreateAuctionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>

            {/* Footer */}
            <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur-xl py-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  <span className="text-slate-800 font-semibold">AuctionLoom Enterprise Engine</span>
                  <span className="text-slate-400">— Node.js Multi-core • PostgreSQL Pessimistic Row-Locks (`FOR UPDATE`) • Socket.IO</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Real-Time Concurrency Guard • 0 Double-Wins</span>
                </div>
              </div>
            </footer>

          </div>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
