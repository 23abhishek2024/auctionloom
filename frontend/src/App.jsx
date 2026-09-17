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
import { UserHubPage } from './pages/UserHubPage';
import { WalletPage } from './pages/WalletPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { SubmitCommissionPage } from './pages/SubmitCommissionPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { AboutPage } from './pages/AboutPage';

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
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                  <Route path="/how-it-works" element={<HowItWorksPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route
                    path="/my-hub"
                    element={
                      <ProtectedRoute>
                        <UserHubPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/wallet"
                    element={
                      <ProtectedRoute>
                        <WalletPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/create"
                    element={
                      <ProtectedRoute>
                        <CreateAuctionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/submit-commission"
                    element={
                      <ProtectedRoute>
                        <SubmitCommissionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <AdminDashboardPage />
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
                  <span className="text-slate-800 font-semibold font-sans">AuctionLoom</span>
                  <span className="text-slate-400">— Real-Time Luxury & Collector Marketplace</span>
                </div>

                <div className="flex items-center gap-4 text-slate-600 font-sans text-xs">
                  <a href="/how-it-works" className="hover:text-indigo-600 transition-colors">How It Works</a>
                  <span>•</span>
                  <a href="/about" className="hover:text-indigo-600 transition-colors">Platform Architecture</a>
                  <span>•</span>
                  <a href="/leaderboard" className="hover:text-indigo-600 transition-colors">Hall of Fame</a>
                </div>

                <div className="flex items-center gap-2 text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Verified Bidding • Fair Auction Engine</span>
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
