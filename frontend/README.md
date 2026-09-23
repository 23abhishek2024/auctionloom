# AuctionLoom — Frontend Client

The responsive, real-time Single Page Application (SPA) for the **AuctionLoom** auction and settlement platform.

## Tech Stack
* **Framework**: React 19 (`react`, `react-dom`)
* **Tooling & Bundler**: Vite 8 with Hot Module Replacement (HMR)
* **Routing**: React Router 7 (`react-router-dom`)
* **Styling**: Tailwind CSS 3.4 & Lucide React icons
* **Real-Time Client**: Socket.IO Client 4.8
* **HTTP Client**: Axios

## Key Features & Architecture
* **Real-Time Bidding Feeds**: Room-partitioned WebSockets subscribing to live bid events, auction timers, and instant price updates without page reloads.
* **Live Room Chat & Floating Reactions**: Bi-directional participant chat with synchronized floating emoji reactions.
* **Interactive Financial Wallet**: Wallet balance management, top-ups, withdrawals, and 1-click escrow settlement triggers.
* **Role-Based Authorization Guards**: Protected routes safeguarding administrative consoles and auctioneer workflows.
* **AI Luxury Appraisal Generator**: Interactive appraisal copywriting interface communicating with backend Gemini AI endpoints.

## Getting Started

```bash
# Install dependencies
npm install

# Start Vite development server (defaults to http://localhost:5173)
npm run dev

# Production build
npm run build
```
