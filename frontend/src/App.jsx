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
          <div className="min-h-screen flex flex-col justify-between bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
            
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
            <footer className="border-t border-slate-800/80 bg-slate-950/60 backdrop-blur-md py-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-slate-300 font-semibold">Prime Bid Architecture</span>
                  <span>— Node.js Cluster • PostgreSQL Pessimistic Locks • Socket.IO</span>
                </div>
                <div>
                  Built for high concurrency & zero double-wins.
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
