# Prime Bid ⚡ Real-Time Auction & Distributed Bidding Engine

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Google Gemini](https://img.shields.io/badge/Gemini_AI-3.6_Flash-8E75B2?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)

**Prime Bid** is a production-grade, distributed real-time auction platform engineered to handle high concurrency, eliminate race conditions (preventing double-bids), and process auction conclusions asynchronously. 

Built strictly following the **MVC (Model-View-Controller)** pattern, **PostgreSQL Pessimistic Row Locking (`SELECT FOR UPDATE`)**, **Distributed Job Queues (`FOR UPDATE SKIP LOCKED`)**, **Bi-directional WebSockets (Socket.IO)**, and an **Isolated AI Appraisal Assistant (Google Gemini 3.6 Flash)**.

---

## 🏛️ System Architecture

```mermaid
graph TD
    %% Client Layer
    Clients[React 19 SPA<br/>Vite + Tailwind CSS] -->|HTTPS REST| API[Express API Gateway]
    Clients <-->|WebSocket / Socket.IO| Sockets[Socket.IO Real-Time Hub]

    %% Middleware Layer
    subgraph Express MVC Application
        API --> Logger[Logging Middleware<br/>Unique Request ID]
        Logger --> RateLimiter[Rate Limiter<br/>DDoS Prevention]
        RateLimiter --> Auth[JWT & RBAC Middleware<br/>Admin / Auctioneer / Bidder]
        Auth --> Controllers[REST Controllers]
        
        Controllers --> Models[Data Access Models]
        Controllers -.-> AIService[Gemini AI Assistant<br/>Structured JSON Output]
        Controllers --> Sockets
    end

    %% Background Workers
    subgraph Distributed Worker Pool
        Scheduler[Auction Scheduler<br/>Polls Ended Auctions]
        JobWorker[Job Worker Pool<br/>SELECT FOR UPDATE SKIP LOCKED]
    end

    %% Database Layer
    subgraph PostgreSQL 15 Storage
        DB[(PostgreSQL Cluster<br/>Users, Auctions, Bids, Jobs)]
    end

    %% Data Connections
    Models -->|Pessimistic Row Lock<br/>SELECT FOR UPDATE| DB
    Scheduler -->|Inserts CLOSE_AUCTION Jobs| DB
    JobWorker -->|Pulls Jobs Safely| DB
    Sockets -->|Broadcasts PRICE_UPDATE| Clients
```

---

## 🚀 Core Engineering Highlights

### 1. Zero Race Conditions with Pessimistic Row Locking
In high-frequency auctions, two bidders often submit identical or split-second competing bids. Traditional applications suffer from dirty writes and double-winners. 
- Prime Bid initiates an atomic **ACID Transaction** (`BEGIN`) and locks the target auction row exclusively using **`SELECT * FROM auctions WHERE id = $1 FOR UPDATE`**.
- Concurrent transactions are queued at the database engine level until the current transaction commits (`COMMIT`) or rolls back (`ROLLBACK`), guaranteeing absolute price consistency.

### 2. Instant WebSockets (Socket.IO)
- When a bid passes validation and commits to the database, a **`PRICE_UPDATE`** event is emitted to that auction's isolated room (`JOIN_AUCTION`).
- All active connected browsers receive the new price, bidder identity, and bid history feed instantly with **0 page refreshes**.

### 3. Distributed Background Workers (`FOR UPDATE SKIP LOCKED`)
- **The Scheduler**: Scans for active auctions where `end_time <= NOW()` and queues `CLOSE_AUCTION` jobs into the `jobs` table.
- **The Worker**: Polls using **`SELECT * FROM jobs WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED LIMIT 1`**. Multiple worker processes can run in parallel without ever duplicating or double-processing jobs.

### 4. AI Auction Assistant (Google Gemini)
- Integrated Google Gemini (`gemini-3.6-flash`) with structured JSON schema prompt engineering.
- Generates optimized auction titles, marketing descriptions, and suggested starting appraisal prices from basic seller keywords.

### 5. Docker Containerization & Multi-Stage Builds
- **Backend**: Alpine Linux container (`node:20-alpine`) with native C++ compilation tools for `bcrypt`.
- **Frontend**: Multi-stage build (`node:20-alpine` builder + `nginx:alpine` runtime), shrinking production image size to **25MB**.
- **Docker Compose**: 1-command startup of 5 microservices (`db`, `backend`, `frontend`, `worker`, `scheduler`).

---

## 📂 Project Structure (Strict MVC)

```text
aution-bid/
├── backend/
│   ├── src/
│   │   ├── controllers/      # authController, auctionController, bidController, aiController
│   │   ├── models/           # userModel, auctionModel, bidModel
│   │   ├── routes/           # authRoutes, auctionRoutes, bidRoutes, aiRoutes
│   │   ├── middlewares/      # logger.js, auth.js (RBAC), rateLimiter.js
│   │   ├── services/         # socketService.js, aiService.js
│   │   ├── workers/          # jobWorker.js, scheduler.js
│   │   ├── db.js             # PostgreSQL connection pool with cloud SSL support
│   │   ├── app.js            # Express application initialization & middleware chain
│   │   └── index.js          # Node.js Cluster module entry point
│   ├── scripts/
│   │   └── migrate.js        # Automated schema bootstrap script (npm run migrate)
│   ├── schema.sql            # Core PostgreSQL schema DDL
│   ├── Dockerfile            # Production Node.js Alpine container
│   └── verify_phases.mjs     # 61-assertion automated end-to-end test suite (npm test)
│
├── frontend/
│   ├── src/
│   │   ├── api/client.js     # Axios client with JWT interceptors
│   │   ├── context/          # AuthContext.jsx, SocketContext.jsx
│   │   ├── components/       # Navbar, AuctionCard, ProtectedRoute
│   │   ├── pages/            # Dashboard, AuctionDetail (Live Room), CreateAuction, Login, Register
│   │   └── App.jsx           # React Router client-side routing
│   ├── Dockerfile            # Multi-stage production build (Node -> Nginx)
│   ├── nginx.conf            # SPA routing fallback (try_files) & gzip compression
│   └── vercel.json           # Vercel SPA routing rewrite configuration
│
├── workflows/
│   └── ci-cd.yml             # GitHub Actions automated test & build pipeline
├── docker-compose.yml        # Orchestrates db, backend, frontend, worker, scheduler
└── render.yaml               # Infrastructure-as-Code blueprint for cloud deployment
```

---

## 🛠️ Quickstart Guide

### Option A: Run with Docker Compose (Fastest & Recommended)

Make sure [Docker Desktop](https://www.docker.com/) is running, then run:

```bash
# Clone the repository
git clone https://github.com/23abhishek2024/biding-app.git
cd biding-app

# Copy environment variables
cp .env.example .env

# Spin up all 5 microservices in 1 command
docker compose up --build
```

- **Frontend**: [http://localhost:3000](http://localhost:3000) or [http://localhost:80](http://localhost:80)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Database**: PostgreSQL on port 5432

---

### Option B: Run Locally (Without Docker)

#### 1. Start PostgreSQL
Ensure PostgreSQL is running locally on port 5432 with database `primebid`.

#### 2. Setup Backend
```bash
cd backend
npm install
npm run migrate    # Automatically creates all tables, indexes, and constraints
npm test           # Runs all 61 automated assertions
npm start          # Starts API server on http://localhost:5000
```

#### 3. Setup Frontend
```bash
cd ../frontend
npm install
npm run dev        # Starts Vite dev server on http://localhost:5173
```

---

## 🧪 Automated Testing Suite

Prime Bid includes a comprehensive 61-assertion integration and concurrency verification suite:

```bash
cd backend
npm test
```

```text
===========================================================
   PRIME BID: DETAILED 1 TO 7 PHASE VERIFICATION SUITE    
===========================================================
[Phase 1] ✅ PASS - MVC structure & folders verified
[Phase 2] ✅ PASS - PostgreSQL schema & constraints verified
[Phase 3] ✅ PASS - Auth, JWT issuance, rate limiting & RBAC verified
[Phase 4] ✅ PASS - Concurrency locking (Pessimistic SELECT FOR UPDATE verified)
[Phase 5] ✅ PASS - Real-time Socket.IO price broadcast verified
[Phase 6] ✅ PASS - Distributed worker (FOR UPDATE SKIP LOCKED verified)
[Phase 7] ✅ PASS - React frontend contexts & build bundle verified
[Phase 8] ✅ PASS - Google Gemini AI appraisal generation verified

===========================================================
   🎉 ALL PHASES (1 TO 8) ARE 100% VERIFIED AND PASSING!   
===========================================================
Total assertions passed: 61/61
```

---

## 🌐 Production Cloud Architecture

Prime Bid is engineered for decoupled cloud deployment:

| Layer | Provider | Configuration |
|---|---|---|
| **Frontend** | **Vercel** | React Vite SPA on Global Edge CDN. Uses `vercel.json` for client-side routing. |
| **Backend** | **Render** | Dockerized Node.js + Socket.IO server with health check at `/health`. |
| **Database** | **Supabase** | Managed PostgreSQL cluster with connection pooling over SSL (`DATABASE_URL`). |

---

## 📄 License
ISC License. Developed by **Abhishek** ([@23abhishek2024](https://github.com/23abhishek2024)).
