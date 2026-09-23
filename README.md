# AuctionLoom ⚡ High-Concurrency Real-Time Auction & Distributed Settlement Engine

[![Node.js](https://img.shields.io/badge/Node.js-20.x%20|%2022.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Multi--Container-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Google Gemini](https://img.shields.io/badge/Gemini_AI-3.6_Flash-8E75B2?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Financial Ledger](https://img.shields.io/badge/Ledger-Double--Entry%20ACID-10B981)](https://github.com/23abhishek2024/auctionloom)
[![Automated Tests](https://img.shields.io/badge/Tests-103%2F103_Passing-brightgreen)](https://github.com/23abhishek2024/auctionloom)
[![Live Demo](https://img.shields.io/badge/Live_Demo-auctionloom.vercel.app-00C7B7?logo=vercel&logoColor=white)](https://auctionloom.vercel.app/)

> 🌐 **Production Web Application**: [https://auctionloom.vercel.app/](https://auctionloom.vercel.app/)  
> ⚡ **Live Production API Gateway**: [https://primebid-backend-e971.onrender.com/api](https://primebid-backend-e971.onrender.com/api) *(Render Cloud Host)*  
> 🩺 **Service Health Endpoint**: [https://primebid-backend-e971.onrender.com/health](https://primebid-backend-e971.onrender.com/health)  
> 🗄️ **Primary Relational Store**: Managed PostgreSQL 15 on Supabase (Mumbai Cluster)  
> 📐 **Systems Architecture & HLD/LLD Specification**: [bidding_system_hld.md](bidding_system_hld.md)  

---

## 1. Executive Overview

**AuctionLoom** is an enterprise-grade, distributed real-time auction engine architected to handle high-frequency concurrent bidding, prevent race conditions, and guarantee transactional consistency across digital assets and physical lots.

### The Problem It Solves
In traditional auction applications, rapid-fire bids submitted in the same millisecond frequently result in:
1. **Race Conditions & Dirty Writes**: Concurrent database writes overwrite higher bids or allow multiple users to believe they placed the highest bid at the same price.
2. **Negative Balance & Double Spending**: Buyers can participate in multiple concurrent auctions with money they do not have, resulting in ledger anomalies upon final settlement.
3. **Ghost Settlements**: Lots closing at scheduled deadlines without synchronized background workers result in orphaned records, delayed payments, and uncollected platform fees.

### The Solution Architecture
AuctionLoom resolves these challenges through a strict, zero-trust engineering approach:
* **Pessimistic Row-Level Locking (`SELECT FOR UPDATE`)**: Synchronizes concurrent bid submissions directly inside atomic PostgreSQL transactions, serializing simultaneous bids on the same auction row.
* **Double-Entry Financial Ledger**: Built directly into the database schema with an unbreakable zero-overdraft invariant (`CHECK balance >= 0`) and strict idempotency key deduplication.
* **Distributed Outbox Job Queue (`FOR UPDATE SKIP LOCKED`)**: Decoupled asynchronous workers process lot conclusions, calculate 5% platform fees, and trigger automated escrow settlements without blocking the primary HTTP event loop.
* **Sub-Millisecond Bi-Directional WebSockets**: Broadcasts instant price updates, live auction room chat, and interactive audience reactions to connected clients via isolated Socket.IO rooms.
* **AI-Powered Appraisal Engine**: Integrates Google Gemini 3.6 Flash to appraise items, construct provenance narratives, and recommend starting reserve prices based on seller keywords.

---

## 2. Core Implemented Features

### ⚡ Real-Time High-Concurrency Bidding Engine
* **Atomic Bid Transactions**: Every bid runs inside an ACID database transaction acquiring a row lock via `SELECT * FROM auctions WHERE id = $1 FOR UPDATE`.
* **Sub-Millisecond Price Broadcasts**: Committed bids emit a `PRICE_UPDATE` payload directly to the auction's isolated WebSocket room, synchronizing all active bidders instantly.
* **Anti-Snipe & Integrity Validations**: Prevents sellers from bidding on their own lots, blocks bids below current highest offers, and rejects submissions on expired or administratively frozen listings.

### 💰 Double-Entry Financial Wallet & Escrow Ledger
* **Double-Entry Invariants**: All balance modifications strictly originate from `walletService.js` and record immutable transaction entries (`TOPUP`, `SETTLEMENT_DEBIT`, `SETTLEMENT_CREDIT`, `COMMISSION`, `WITHDRAWAL`).
* **Zero Overdraft Protection**: Database-level constraint `CHECK (balance >= 0)` guarantees negative balances are structurally impossible at the engine layer.
* **Idempotency Deduplication**: Unique constraint `idempotency_key UNIQUE` ensures retried network requests or client double-clicks cannot duplicate wallet deductions or top-ups.
* **1-Click Atomic Escrow Settlement**: When an auction concludes, the winning bidder can execute an atomic settlement. The winner's wallet is debited, the seller's wallet is credited (95% net payout), and the platform treasury/admin is credited (5% commission) in a single database transaction.

### 🔄 Distributed Background Workers & Outbox Queue
* **PostgreSQL-Backed Job Queue**: Independent background processes poll the `jobs` table using `SELECT * FROM jobs WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED LIMIT 1`.
* **Zero Worker Collisions**: Multiple worker instances can run across containers without ever acquiring or executing the same job twice.
* **Scheduled Expiration Sweep**: An autonomous scheduler scans for expired active auctions every 30 seconds and queues idempotent `CLOSE_AUCTION` jobs.
* **In-Process Fallback Sweep**: Built-in 15-second interval sweep in the API process ensures single-instance local setups close auctions seamlessly without dedicated worker containers.

### 💬 Multi-Channel Real-Time Communications
* **Live Room Chat**: Active auction rooms feature real-time participant chat (`SEND_MESSAGE` → `CHAT_MESSAGE`) with auto-joined room mechanics and sender identity tagging.
* **Floating Reactions**: Audience members can emit animated floating emoji reactions (`🔥`, `🚀`, `💎`, `👏`, `❤️`, `⚡`, `🎉`) broadcast live to all observers.
* **Administrative Broadcast Alerts**: Real-time administrative actions immediately broadcast status changes (`AUCTION_STATUS_CHANGED`), freezing the bidding UI on active clients.

### ✉️ Dual-Strategy Transactional Email Delivery
* **Smart Routing Engine**: Automatically routes test and demo accounts (`@gmail.com`, `@test.com`, `@example.com`) to disposable Ethereal accounts with instant web preview URLs, while routing production emails to real SMTP servers.
* **Settlement Notifications**: Winning bidders and sellers receive automated email dispatches containing lot details, hammer price, and seller payout coordinates.

### 🤖 Google Gemini AI Appraisal Assistant
* **Luxury Copywriting Pipeline**: Uses Google Gemini (`gemini-3.6-flash`) with structured JSON schema prompt engineering to generate appraisal-grade titles, descriptions, and suggested starting bids.
* **Deterministic Fallback Engine**: If no API key is provided or the upstream provider fails, an intelligent heuristic copywriter guarantees continuous functionality without breaking the listing workflow.

### 🛡️ Platform Moderation & Role-Based Access Control (RBAC)
* **Granular RBAC**: Strict middleware enforcement across `bidder`, `auctioneer`, and `admin` roles.
* **Administrative Auction Freeze**: Super Administrators can instantly freeze suspicious listings by switching them to `RESTRICTED`, locking bid submission across the cluster.
* **Cascading Lot Deletion**: Safe administrative deletion purges corresponding bids, queued jobs, and audit proofs without leaving orphaned database rows.
* **Payment Proof Verification**: Sellers submitting manual commission proofs have their uploads verified and approved or rejected via the Admin Dashboard.

### 🖼️ Multer Multipart Media Processing
* **Local Asset Pipeline**: High-performance image ingestion engine utilizing `multer.diskStorage`.
* **Security & Size Guards**: Enforces strict MIME-type allowlists (JPEG, PNG, WebP) and a 5MB maximum file size limit with sanitized, collision-resistant timestamped filenames.

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose in AuctionLoom |
|---|---|---|---|
| **Frontend SPA** | React | `19.2.8` | Component-driven user interface with concurrent rendering and declarative UI state. |
| **Build Tooling** | Vite | `8.3.0` | Ultra-fast client build pipeline and HMR development server. |
| **Client Routing** | React Router | `7.18.3` | Declarative client-side routing with protected route authorization guards. |
| **Styling & Icons** | Tailwind CSS / Lucide | `3.4.19` / `1.44.0` | Utility-first responsive design system and modern iconography. |
| **API Gateway** | Express.js | `5.2.1` | RESTful API server with route modularization and centralized error handling. |
| **Process Clustering** | Node.js Cluster | `v20+` / `v22+` | Multi-core CPU worker distribution for horizontal process scaling. |
| **Relational Database**| PostgreSQL | `15-alpine` | Primary ACID relational database with row-level pessimistic locking. |
| **Database Driver** | `pg` (node-postgres) | `8.23.0` | High-performance client pool with cloud SSL connection support. |
| **Real-Time Layer** | Socket.IO | `4.8.3` | Low-latency bi-directional event distribution across auction rooms. |
| **Authentication** | JSON Web Tokens (JWT) | `9.0.3` | Stateless Bearer token authentication and authorization claims. |
| **Password Hashing** | bcrypt | `6.0.0` | Salted cryptographic password hashing (10 rounds). |
| **Rate Limiting** | express-rate-limit | `8.7.0` | IP-based request throttling protecting API endpoints against DDoS. |
| **Multipart Ingestion**| Multer | `2.3.0` | Streaming multipart/form-data image upload processing and disk storage. |
| **AI Appraisal** | Google Gemini API | `3.6-flash` | Automated appraisal valuations, titles, and copywriting generation. |
| **Email Transporter** | Nodemailer | `10.0.10` | Transactional email delivery with Ethereal web previews and SMTP support. |
| **Containerization** | Docker & Compose | `3.8` | Multi-container orchestration (`db`, `backend`, `frontend`, `worker`, `scheduler`). |

---

## 4. System Architecture

### High-Level Distributed Architecture

```mermaid
flowchart TB
    subgraph Clients["Client Layer (Browsers / Devices)"]
        Browser["React 19 SPA (Vite + Tailwind)<br/>Edge CDN Hosted"]
    end

    subgraph Ingress["Ingress & Real-Time Gateway"]
        API["Express 5 REST API Gateway<br/>Cluster Master + Workers"]
        WS["Socket.IO Real-Time Gateway<br/>Isolated Auction Rooms"]
    end

    subgraph Middleware["Middleware Pipeline"]
        Logger["Structured Request Logger<br/>Correlation ID Tracking"]
        Limiter["Rate Limiter Middleware<br/>IP Throttling"]
        Auth["JWT & RBAC Middleware<br/>Claims Verification"]
    end

    subgraph CoreServices["Backend Application Core"]
        AuctionService["Auction & Bid Controller<br/>Pessimistic Locking"]
        WalletService["Double-Entry Wallet Service<br/>Zero-Overdraft Invariant"]
        AIService["Gemini 3.6 Flash Engine<br/>Structured JSON Appraisals"]
        UploadService["Multer Storage Pipeline<br/>MIME & Size Enforcement"]
    end

    subgraph StorageLayer["PostgreSQL 15 Cluster"]
        DB[(PostgreSQL Primary Store<br/>Users, Auctions, Bids, Wallets,<br/>Transactions, Jobs, Proofs)]
    end

    subgraph AsyncWorkers["Background Worker Pool"]
        Scheduler["Auction Scheduler<br/>Polls Expired Lots (30s)"]
        JobWorker["Distributed Job Worker<br/>SELECT FOR UPDATE SKIP LOCKED (10s)"]
    end

    subgraph External["External Integrations"]
        GeminiAPI["Google Gemini AI API"]
        EmailGateway["Nodemailer (Ethereal / SMTP)"]
    end

    Browser -->|HTTPS REST| API
    Browser <-->|WSS WebSockets| WS

    API --> Logger --> Limiter --> Auth
    Auth --> AuctionService
    Auth --> WalletService
    Auth --> UploadService
    Auth --> AIService

    AIService -.->|HTTPS| GeminiAPI
    AuctionService -->|SELECT FOR UPDATE| DB
    WalletService -->|SELECT FOR UPDATE| DB

    Scheduler -->|INSERT INTO jobs| DB
    JobWorker -->|FOR UPDATE SKIP LOCKED| DB
    JobWorker -.->|Dispatch Mail| EmailGateway

    AuctionService -->|Emit PRICE_UPDATE| WS
    WS -->|Live Broadcast| Browser
```

### Atomic Bidding & Concurrency Sequence (`SELECT FOR UPDATE`)

```mermaid
sequenceDiagram
    autonumber
    actor BidderA as Bidder A (Alice)
    actor BidderB as Bidder B (Bob)
    participant API as Express API Server
    participant DB as PostgreSQL 15 Engine
    participant WS as Socket.IO Hub

    Note over BidderA,BidderB: Alice and Bob submit bids for the same auction simultaneously
    BidderA->>API: POST /api/auctions/{id}/bids ($1,200)
    BidderB->>API: POST /api/auctions/{id}/bids ($1,200)

    API->>DB: Client 1: BEGIN Transaction
    API->>DB: Client 2: BEGIN Transaction

    API->>DB: Client 1: SELECT * FROM auctions WHERE id = :id FOR UPDATE
    Note over DB: Database grants Exclusive Row Lock to Client 1

    API->>DB: Client 2: SELECT * FROM auctions WHERE id = :id FOR UPDATE
    Note over DB: Client 2 is BLOCKED at engine level waiting for lock release

    API->>DB: Client 1: Validate (Active? End time? Amount > current_price?) -> PASSED
    API->>DB: Client 1: INSERT INTO bids (amount: $1,200)
    API->>DB: Client 1: UPDATE auctions SET current_price = $1,200
    API->>DB: Client 1: COMMIT Transaction
    Note over DB: Exclusive Row Lock RELEASED

    API->>WS: Broadcast PRICE_UPDATE ($1,200, Alice)
    WS-->>BidderA: 201 Created (Bid Accepted)
    WS-->>BidderB: Live WebSocket Price Updates to $1,200

    Note over DB: Client 2 wakes up, acquires lock, reads current_price = $1,200
    API->>DB: Client 2: Validate ($1,200 > $1,200?) -> FAILED
    API->>DB: Client 2: ROLLBACK Transaction
    API-->>BidderB: 400 Bad Request ("Bid must be higher than current price of $1,200")
```

---

## 5. Repository Structure

```text
auctionloom/
├── .env.example                     # Environment template with validated placeholders
├── .gitignore                       # Ignored node_modules, build bundles, and local secrets
├── README.md                        # Production system documentation
├── docker-compose.yml               # Multi-container orchestration (5 microservices)
├── render.yaml                      # Infrastructure-as-Code blueprint for cloud deployment
├── vercel.json                      # Vercel SPA routing rewrite rules and cache headers
├── aws-ecs-task-definition.json     # AWS ECS container task definition template
│
├── backend/                         # Express 5 REST API & WebSocket Server
│   ├── src/
│   │   ├── controllers/             # HTTP Route Handlers
│   │   │   ├── adminController.js   # Platform metrics, user roles, moderation, purge/reset
│   │   │   ├── aiController.js      # Google Gemini copy & appraisal handler
│   │   │   ├── auctionController.js # Auction CRUD, filtering, sorting, and republishing
│   │   │   ├── authController.js    # Registration, login, JWT issuance, profile updates
│   │   │   ├── bidController.js     # Concurrency-safe bidding & price updates
│   │   │   ├── commissionController.js # Proof submission & seller debt tracking
│   │   │   ├── userController.js    # User stats, listings, bids, payout profiles
│   │   │   └── walletController.js  # Top-ups, lot settlements, withdrawals, balance feeds
│   │   ├── middlewares/             # Security & Request Processing Pipeline
│   │   │   ├── auth.js              # JWT Bearer verification & Role-Based Access Control
│   │   │   ├── logger.js            # Structured console logging with unique request IDs
│   │   │   ├── rateLimiter.js       # IP rate limiting via express-rate-limit (5,000 req/15m)
│   │   │   └── upload.js            # Multer disk storage, MIME filter, and 5MB size limit
│   │   ├── models/                  # Data Access & SQL Query Layer
│   │   │   ├── auctionModel.js      # Auction queries and row locking helpers
│   │   │   ├── bidModel.js          # Bid creation and highest-bid retrieval
│   │   │   └── userModel.js         # User lookups and credential validation
│   │   ├── routes/                  # Express RESTful Route Definitions
│   │   │   ├── adminRoutes.js       # /api/admin endpoints (Super Admin RBAC)
│   │   │   ├── aiRoutes.js          # /api/ai endpoints (Seller / Admin RBAC)
│   │   │   ├── auctionRoutes.js     # /api/auctions CRUD & nested bids
│   │   │   ├── authRoutes.js        # /api/auth authentication endpoints
│   │   │   ├── bidRoutes.js         # /api/bids legacy & direct bid endpoints
│   │   │   ├── commissionRoutes.js  # /api/commissions proof submission endpoints
│   │   │   ├── uploadRoutes.js      # /api/upload multipart image endpoint
│   │   │   ├── userRoutes.js        # /api/users profile, stats & payout methods
│   │   │   └── walletRoutes.js      # /api/wallet double-entry ledger endpoints
│   │   ├── services/                # Encapsulated Business & External Services
│   │   │   ├── aiService.js         # Gemini 3.6 Flash & fallback heuristic copywriter
│   │   │   ├── auctionClosureService.js # Atomic lot closure & escrow settlement
│   │   │   ├── emailService.js      # Nodemailer dual-delivery engine (Ethereal + SMTP)
│   │   │   ├── socketService.js     # Socket.IO room manager & event broadcaster
│   │   │   ├── topupService.js      # Wallet funding & payment request abstraction
│   │   │   └── walletService.js     # ACID double-entry ledger & zero-overdraft engine
│   │   ├── utils/                   # Shared Helper Utilities
│   │   │   └── validators.js        # UUID, email, and numeric format validators
│   │   ├── workers/                 # Asynchronous Distributed Processors
│   │   │   ├── jobWorker.js         # SELECT FOR UPDATE SKIP LOCKED job executor
│   │   │   └── scheduler.js         # Periodic lot expiration poller (every 30s)
│   │   ├── app.js                   # Express application initialization & middleware chain
│   │   ├── db.js                    # PostgreSQL connection pool with auto-migration
│   │   └── index.js                 # Node.js Cluster module process manager
│   ├── scripts/
│   │   ├── migrate.js               # Database schema initialization script
│   │   └── reset_and_seed.js        # Database reset and test user seed script
│   ├── clean_reset_and_verify.js    # Automated end-to-end database wipe & ledger test
│   ├── verify_phases.mjs            # 103-assertion comprehensive verification test suite
│   ├── schema.sql                   # Authoritative PostgreSQL DDL schema definition
│   ├── Dockerfile                   # Production Node.js Alpine container
│   └── package.json                 # Backend scripts and dependencies
│
└── frontend/                        # React 19 Client SPA
    ├── src/
    │   ├── api/
    │   │   └── client.js            # Axios client with JWT interceptors & API methods
    │   ├── components/              # Reusable UI Components
    │   │   ├── AuctionCard.jsx      # Auction lot card with live countdown & bid badges
    │   │   ├── Navbar.jsx           # Responsive header with profile dropdown & wallet pill
    │   │   ├── ProtectedRoute.jsx   # Route guard enforcing authentication
    │   │   ├── TopupModal.jsx       # Interactive wallet top-up modal
    │   │   └── WithdrawModal.jsx    # Escrow earnings payout modal
    │   ├── context/                 # Global Client State Providers
    │   │   ├── AuthContext.jsx      # Authentication session, tokens, and active user
    │   │   └── SocketContext.jsx    # Socket.IO client connection & event subscriptions
    │   ├── pages/                   # Application Views
    │   │   ├── AboutPage.jsx        # Architectural walkthrough & technical documentation
    │   │   ├── AdminDashboardPage.jsx # Platform metrics, user moderation & system reset
    │   │   ├── AuctionDetailPage.jsx # Live auction room, real-time chat & reactions
    │   │   ├── CreateAuctionPage.jsx # Listing creation with Gemini AI assistant & upload
    │   │   ├── DashboardPage.jsx    # Auction catalog with filtering, search & sorting
    │   │   ├── HowItWorksPage.jsx   # User guide for bidding, selling, and settlement
    │   │   ├── LeaderboardPage.jsx  # Platform hall of fame & top bidders
    │   │   ├── LoginPage.jsx        # User login form
    │   │   ├── RegisterPage.jsx     # User registration form
    │   │   ├── SubmitCommissionPage.jsx # Manual payment receipt submission
    │   │   ├── UserHubPage.jsx      # Personal stats, active bids, won lots & payouts
    │   │   └── WalletPage.jsx       # Real-time ledger, top-up modal & transaction logs
    │   ├── utils/                   # Frontend Formatters & Helpers
    │   │   └── formatters.js        # Currency, date, and countdown formatting utilities
    │   ├── App.jsx                  # React Router configuration & layout scaffold
    │   ├── index.css                # Tailwind CSS directives & custom design tokens
    │   └── main.jsx                 # React DOM mount point
    ├── public/                      # Static client assets
    ├── Dockerfile                   # Multi-stage production build (Node build -> Nginx)
    ├── nginx.conf                   # Nginx reverse proxy & SPA HTML5 routing fallback
    ├── package.json                 # Frontend dependencies and scripts
    └── vite.config.js               # Vite build and proxy configuration
```

---

## 6. Prerequisites

To build and run AuctionLoom, ensure your development environment satisfies the following minimum requirements:

* **Node.js**: `v20.x` or `v22.x` (LTS recommended)
* **Package Manager**: `npm` (`v9+` or `v10+`)
* **Database**: PostgreSQL `14.x` or `15.x` (Local, Docker container, or managed cloud instance such as Supabase, Neon, or AWS RDS)
* **Container Engine** (Optional): Docker Engine `24+` with Docker Compose `v2.20+`

---

## 7. Environment Configuration

Copy `.env.example` in the root directory to `.env`:

```bash
cp .env.example .env
```

### Complete Environment Variable Reference

| Variable Name | Required | Default / Example | Purpose & Notes |
|---|---|---|---|
| `PORT` | No | `5000` | Port on which the Express API server listens. |
| `NODE_ENV` | No | `production` | Environment mode (`development` or `production`). Enables SSL and optimizations. |
| `DATABASE_URL` | **Yes** (Cloud) | `postgresql://user:pass@host:5432/db?sslmode=require` | Connection URI for cloud databases (Supabase, Neon, Render). Overrides discrete `DB_*` flags. |
| `DB_HOST` | No | `localhost` | PostgreSQL host when `DATABASE_URL` is omitted. |
| `DB_PORT` | No | `5432` | PostgreSQL port when `DATABASE_URL` is omitted. |
| `DB_NAME` | No | `auctionloom` | PostgreSQL database name. |
| `DB_USER` | No | `postgres` | PostgreSQL database user. |
| `DB_PASSWORD` | No | `<your-db-password>` | PostgreSQL database password. |
| `DB_POOL_MAX` | No | `10` | Maximum concurrent connections permitted in the `pg.Pool`. |
| `DISABLE_DB_SSL`| No | `false` | Set to `true` to disable SSL when connecting to local PostgreSQL instances in production mode. |
| `JWT_SECRET` | **Yes** | `<generate-strong-secret>` | Secret key used to sign and verify HMAC-SHA256 JWT tokens. |
| `FRONTEND_URL` | No | `http://localhost:3000` | Comma-separated list of permitted CORS origins and Socket.IO allowed clients. |
| `GEMINI_API_KEY`| No | `<your-gemini-key>` | Google Gemini API key for AI appraisals. If omitted, the deterministic fallback engine activates. |
| `EMAIL_DELIVERY_MODE` | No | `smart` | Modes: `smart` (auto-routes test accounts to Ethereal), `ethereal` (all preview), or `smtp` (physical delivery). |
| `EMAIL_FROM` | No | `"AuctionLoom" <settlements@auctionloom.com>` | Sender header attached to outbound transactional emails. |
| `SMTP_HOST` | No | `smtp.gmail.com` | Hostname for real outbound SMTP delivery. |
| `SMTP_PORT` | No | `587` | Port for outbound SMTP (typically 587 for TLS or 465 for SSL). |
| `SMTP_USER` | No | `<smtp-username>` | Username / email address for authenticated SMTP delivery. |
| `SMTP_PASS` | No | `<smtp-password>` | Application password or token for SMTP delivery. |
| `VITE_API_URL` | No | `http://localhost:5000/api` | Base REST API endpoint injected during the frontend Vite build. |
| `VITE_SOCKET_URL` | No | `http://localhost:5000` | WebSocket endpoint injected during the frontend Vite build. |

---

## 8. Installation & Local Setup

### Option A: 1-Command Docker Compose (Recommended)

Spins up the entire distributed topology in isolated containers:

```bash
# 1. Clone the repository
git clone https://github.com/23abhishek2024/auctionloom.git
cd auctionloom

# 2. Configure environment
cp .env.example .env

# 3. Launch all 5 services (db, backend, frontend, worker, scheduler)
docker compose up --build
```

Access services locally:
* **Frontend Web Application**: [http://localhost:3000](http://localhost:3000) (or [http://localhost:80](http://localhost:80))
* **Backend API Gateway**: [http://localhost:5000](http://localhost:5000)
* **PostgreSQL Database**: Port `5432`

---

### Option B: Native Host Setup (Without Docker)

#### 1. Database Provisioning
Ensure PostgreSQL is running locally and initialize the database:

```sql
CREATE DATABASE auctionloom;
```

#### 2. Backend Setup
```bash
cd backend
npm install

# Run automated schema migrations
npm run migrate

# (Optional) Seed clean test accounts and luxury auctions
npm run seed

# Start the API and WebSocket server in development mode (with hot reload)
npm run dev
```

The backend starts on [http://localhost:5000](http://localhost:5000).

#### 3. Frontend Setup
In a separate terminal:

```bash
cd frontend
npm install

# Start the Vite development server
npm run dev
```

The frontend will be available at [http://localhost:5173](http://localhost:5173).

---

## 9. Verified CLI Scripts & Commands

### Backend (`backend/package.json`)

| Command | Script Invocation | Purpose |
|---|---|---|
| `npm start` | `node src/index.js` | Launches backend in production cluster mode. |
| `npm run dev` | `nodemon src/app.js` | Launches development server with hot-reload via nodemon. |
| `npm run cluster` | `node src/index.js` | Forks one worker per CPU core using Node.js Cluster module. |
| `npm run worker` | `node src/workers/jobWorker.js` | Starts standalone distributed job worker (`SKIP LOCKED`). |
| `npm run scheduler` | `node src/workers/scheduler.js` | Starts background poller queuing expired lots every 30s. |
| `npm run migrate` | `node scripts/migrate.js` | Executes DDL schema migrations against configured database. |
| `npm run clean-verify` | `node clean_reset_and_verify.js` | Full DB purge, 6-user reseed, live bid race, and ledger audit. |
| `npm run benchmark` | `node benchmark_concurrency.js` | Stress tests SELECT FOR UPDATE with 100 concurrent bids & latency percentiles (also available via 1-click in the Admin Dashboard UI). |
| `npm test` | `node verify_phases.mjs` | Executes the 10-phase, 103-assertion verification test suite. |

### Frontend (`frontend/package.json`)

| Command | Script Invocation | Purpose |
|---|---|---|
| `npm run dev` | `vite` | Starts local development server on port 5173. |
| `npm run build` | `vite build` | Compiles optimized production bundle into `dist/`. |
| `npm run preview` | `vite preview` | Locally serves the compiled production distribution. |
| `npm run lint` | `oxlint` | Runs high-speed Rust-based linter across source files. |

---

## 10. Database Schema & Data Models

The database schema is defined in [backend/schema.sql](backend/schema.sql) and automatically verified on startup in [backend/src/db.js](backend/src/db.js).

```
                      +-------------------+
                      |       USERS       |
                      +-------------------+
                      | id (UUID, PK)     |
                      | email (UNIQUE)    |
                      | role (admin/...)  |
                      | unpaid_commission |
                      | payout_methods    |
                      +---------+---------+
                                |
        +-----------------------+-----------------------+
        | 1:N                   | 1:N                   | 1:1
+-------v-------+       +-------v-------+       +-------v-------+
|   AUCTIONS    |       |     BIDS      |       |    WALLETS    |
+---------------+       +---------------+       +---------------+
| id (UUID, PK) |       | id (UUID, PK) |       | id (UUID, PK) |
| seller_id(FK) |<---+  | auction_id(FK)|       | user_id (FK)  |
| current_price |    |  | bidder_id(FK) |       | balance >= 0  |
| status        |    |  | amount        |       | version       |
| winner_id(FK) |    |  +---------------+       +---+-------+---+
| is_settled    |    |                              |       |
+-------+-------+    |                          1:N |       | 1:N
        |            |                  +-----------+       +-----------+
        | 1:N        +---------------+  |                               |
+-------v-------+                    |  |                               |
|     JOBS      |                    |  v                               v
+---------------+                    | +---------------+ +-------------------+
| id (UUID, PK) |                    | |  WALLET_TXS   | | PAYMENT_REQUESTS  |
| type          |                    | +---------------+ +-------------------+
| payload(JSONB)|                    | | id (UUID, PK) | | id (UUID, PK)     |
| status        |                    | | wallet_id(FK) | | wallet_id (FK)    |
| (type,payload)|(UNIQUE)            | | amount        | | amount, type      |
+---------------+                    | | balance_after | | provider, status  |
                                     | | idempotency_uk| | idempotency_key_uk|
                             +-------v-------+ +---------------+ +-------------------+
                             |COMMISSION_PRFS|
                             +---------------+
                             | id (UUID, PK) |
                             | user_id (FK)  |
                             | status, amount|
                             | proof_url     |
                             +---------------+
```

### Key Database Entities

1. **`users`**: Manages credentials, display identities, account roles (`admin`, `auctioneer`, `bidder`), accumulated unpaid commissions, and JSONB payout configurations.
2. **`auctions`**: Stores lot metadata, starting/current prices, timestamps, statuses (`ACTIVE`, `CLOSED`, `RESTRICTED`), foreign-key winner associations, escrow settlement state (`is_settled`, `settled_at`), and calculated commission records.
3. **`bids`**: Immutable record of all accepted bids placed per auction, indexed by `auction_id` for instantaneous price-ladder reconstruction.
4. **`wallets`**: Secure balance store with row versioning, constrained by `CHECK (balance >= 0)` to guarantee zero overdraft.
5. **`wallet_transactions`**: Immutable double-entry transaction ledger tracking all balance adjustments with unique `idempotency_key` guarantees.
6. **`jobs`**: Distributed outbox table for asynchronous tasks with unique constraints preventing duplicate pending executions: `CONSTRAINT unique_pending_job UNIQUE (type, payload)`.
7. **`payment_requests`**: Gateway-ready abstraction layer for financial top-up and withdrawal requests.
8. **`commission_proofs`**: Audit log of seller payment receipts submitted for manual commission reconciliation.

---

## 11. Pre-Configured Test Accounts

Executing `npm run seed` or `npm run clean-verify` populates the database with 5 standardized user accounts and 1 platform administrator.

* **Universal Seed Password**: `test@123`

| Name | Email Address | Role | Initial Permissions & Testing Scope |
|---|---|---|---|
| **Administrator** | `admin@gmail.com` | `admin` | Full moderation, freeze auctions (`RESTRICTED`), force delete, audit commissions, system purge. |
| **Test User 1** | `test1@gmail.com` | `auctioneer` | Create auctions, upload images, use AI appraisal generator, receive lot settlements. |
| **Test User 2** | `test2@gmail.com` | `auctioneer` | Create auctions, upload images, manage seller payout methods. |
| **Test User 3** | `test3@gmail.com` | `bidder` | Wallet top-up, high-concurrency bidding, 1-click escrow lot settlement. |
| **Test User 4** | `test4@gmail.com` | `bidder` | Wallet top-up, live bidding, real-time room chat participation. |
| **Test User 5** | `test5@gmail.com` | `bidder` | Wallet top-up, live bidding, real-time animated floating reactions. |

---

## 12. REST API Reference

All protected endpoints require an `Authorization: Bearer <jwt_token>` header.

### 🔐 Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new user account | `{ email, password, name, role? }` |
| `POST` | `/api/auth/login` | Public | Authenticate user & receive JWT token | `{ email, password }` |
| `GET` | `/api/auth/me` | Bearer | Retrieve authenticated profile | _None_ |
| `PUT` | `/api/auth/profile` | Bearer | Update profile name | `{ name }` |

### 🏷️ Auctions (`/api/auctions`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `GET` | `/api/auctions` | Public | List auctions with filtering & search | Query: `status`, `search`, `category`, `sort`, `limit`, `offset` |
| `GET` | `/api/auctions/:id` | Public | Retrieve single auction details | Path: `id` (UUID) |
| `POST` | `/api/auctions` | Auctioneer / Admin | Create a new auction listing | `{ title, description, starting_price, end_time, category, image_url }` |
| `DELETE` | `/api/auctions/:id` | Owner / Admin | Delete auction listing (pre-bidding) | Path: `id` (UUID) |
| `POST` | `/api/auctions/:id/republish` | Owner / Admin | 1-Click republish closed auction lot | Path: `id` (UUID), Body: `{ end_time?, starting_price? }` |
| `GET` | `/api/auctions/:id/bids` | Public | Get all bids placed on an auction | Path: `id` (UUID) |
| `POST` | `/api/auctions/:id/bids` | Bearer | Submit a concurrency-safe bid | Path: `id` (UUID), Body: `{ amount }` |

### 💼 Wallet & Double-Entry Ledger (`/api/wallet`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `GET` | `/api/wallet` | Bearer | Retrieve balance, stats & ledger summary | _None_ |
| `GET` | `/api/wallet/transactions` | Bearer | Paginated immutable ledger transactions | Query: `limit`, `offset`, `type` |
| `POST` | `/api/wallet/topup` | Bearer | Simulated self-service balance credit | `{ amount }` |
| `POST` | `/api/wallet/settle-lot` | Bearer | Winning bidder lot escrow settlement | `{ auctionId }` |
| `POST` | `/api/wallet/settle-commission` | Bearer | Seller commission direct settlement | `{ amount }` |
| `POST` | `/api/wallet/withdraw` | Bearer | Withdraw funds from available balance | `{ amount, payoutMethod? }` |

### 🛡️ Administration (`/api/admin`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `GET` | `/api/admin/metrics` | Admin | Aggregate platform metrics (GMV, volume) | _None_ |
| `GET` | `/api/admin/revenue-chart` | Admin | Daily platform revenue & commission history | _None_ |
| `GET` | `/api/admin/commission-ledger` | Admin | Platform commission ledger & summary | _None_ |
| `GET` | `/api/admin/commission-transactions`| Admin | Complete feed of platform fee credits | _None_ |
| `GET` | `/api/admin/users` | Admin | Retrieve all platform users | _None_ |
| `PUT` | `/api/admin/users/:id/role` | Admin | Update a user's role | Path: `id` (UUID), Body: `{ role: 'admin' \| 'auctioneer' \| 'bidder' }` |
| `PUT` | `/api/admin/auctions/:id/status`| Admin | Freeze or unfreeze auction status | Path: `id` (UUID), Body: `{ status: 'ACTIVE' \| 'RESTRICTED' }` |
| `DELETE`| `/api/admin/auctions/:id` | Admin | Force delete lot with cascading purge | Path: `id` (UUID) |
| `GET` | `/api/admin/commission-proofs`| Admin | List submitted offline payment proofs | _None_ |
| `PUT` | `/api/admin/commission-proofs/:id/status` | Admin | Approve or reject payment proof | Path: `id` (UUID), Body: `{ status: 'APPROVED' \| 'REJECTED', admin_notes? }` |
| `POST` | `/api/admin/system/purge-and-reset` | Admin | 1-Click clean DB reset & test suite run | _None_ |

### 🧾 Commissions & Offline Wire Proofs (`/api/commissions`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `POST` | `/api/commissions/proof` | Bearer | Submit offline wire payment receipt image | Form field: `proof` (image ≤ 5MB), Body: `{ amount, paymentMethod?, notes? }` |
| `GET` | `/api/commissions/my-proofs` | Bearer | Retrieve user's submitted commission receipts & debt | _None_ |

### 🤖 AI Valuations & Media (`/api/ai` & `/api/upload`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `POST` | `/api/ai/generate` | Auctioneer / Admin | Generate luxury copy & starting price | `{ keywords, category }` |
| `POST` | `/api/upload` | Bearer | Upload image via Multer (`multipart/form-data`) | Form field: `image` (JPEG, PNG, WebP ≤ 5MB) |

### 📊 Users & Analytics (`/api/users` & `/api/leaderboard`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `GET` | `/api/leaderboard` | Public | Global bidder & winner leaderboard | _None_ |
| `GET` | `/api/users/me/stats` | Bearer | Aggregated personal bidding statistics | _None_ |
| `GET` | `/api/users/me/auctions` | Bearer | Retrieve auctions created by user | _None_ |
| `GET` | `/api/users/me/bids` | Bearer | Retrieve auctions user has bid on | _None_ |
| `GET` | `/api/users/me/won` | Bearer | Retrieve won lots with settlement status | _None_ |
| `POST` | `/api/users/me/upgrade-seller`| Bearer | Upgrade account privileges to seller | _None_ |
| `GET` | `/api/users/me/payout-methods`| Bearer | Retrieve saved payout accounts | _None_ |
| `PUT` | `/api/users/me/payout-methods`| Bearer | Update seller payout configuration | `{ bank, upi, paypal, crypto }` |

---

## 13. Real-Time WebSocket Event Matrix

WebSocket connections are managed by Socket.IO attached to the main HTTP server. Clients connect and join specific auction rooms to scope real-time traffic.

### Client-to-Server Inbound Events

| Event Name | Expected Payload | Handling & Action |
|---|---|---|
| `JOIN_AUCTION` | `auctionId` (UUID string) | Joins the socket to the isolated channel `auctionId`. |
| `LEAVE_AUCTION` | `auctionId` (UUID string) | Removes the socket from channel `auctionId`. |
| `SEND_MESSAGE` | `{ auctionId, text, senderName?, senderEmail?, role? }` | Auto-joins sender to room, sanitizes message text (max 500 chars), constructs payload, and emits `CHAT_MESSAGE`. |
| `SEND_REACTION` | `{ auctionId, emoji, senderName? }` | Validates emoji against allowlist (`🔥`, `🚀`, `💎`, `👏`, `❤️`, `⚡`, `🎉`) and emits `REACTION` to room. |

### Server-to-Client Outbound Broadcasts

| Event Name | Broadcast Scope | Payload Structure | Triggering Action |
|---|---|---|---|
| `PRICE_UPDATE` | Room (`auctionId`) | `{ auction_id, new_price, bidder_name, bidder_email, bid_id }` | Dispatched immediately after a valid bid commits to PostgreSQL. |
| `CHAT_MESSAGE` | Room (`auctionId`) | `{ id, auctionId, text, senderName, senderEmail, role, timestamp }` | Broadcasts new room chat messages to all connected participants. |
| `REACTION` | Room (`auctionId`) | `{ id, auctionId, emoji, senderName, timestamp }` | Broadcasts interactive floating emoji reaction to room observers. |
| `AUCTION_STATUS_CHANGED` | Room (`auctionId`) | `{ auction_id, status: 'ACTIVE' \| 'RESTRICTED' }` | Broadcast when an administrator freezes or unfreezes a listing. |

---

## 14. Financial & Concurrency Invariants

AuctionLoom guarantees four fundamental system invariants:

### 1. Serialized Bidding Invariant
```sql
SELECT * FROM auctions WHERE id = $1 FOR UPDATE;
```
* Bids for the same lot are serialized at the database engine level.
* No phantom reads or lost updates occur regardless of client submission concurrency.

### 2. Zero-Overdraft Invariant
```sql
CONSTRAINT wallets_balance_check CHECK (balance >= 0)
```
* The wallet engine enforces that debits exceeding the available balance throw an explicit `InsufficientFundsError`.
* Database constraints prevent negative balances even under direct SQL operations.

### 3. Idempotency Invariant
```sql
CONSTRAINT wallet_transactions_idempotency_key_key UNIQUE (idempotency_key)
```
* Network retries transmitting the same `idempotency_key` return the original transaction record without altering balances.

### 4. Distributed Worker Job Deduplication
```sql
SELECT * FROM jobs WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED LIMIT 1;
```
* Workers acquire and lock pending jobs without blocking other workers.
* The unique constraint `CONSTRAINT unique_pending_job UNIQUE (type, payload)` prevents duplicate job insertions.

---

## 15. Automated Verification & Testing Suite

AuctionLoom includes an exhaustive 10-phase verification test suite that executes 103 automated assertions across every architectural layer.

### Running the Test Suite
Ensure the backend server is running on port 5000, then execute:

```bash
cd backend
npm test
```

### Verification Output

```text
===========================================================
   AUCTIONLOOM: DETAILED 1 TO 10 PHASE VERIFICATION SUITE   
===========================================================
[Phase 1]  ✅ PASS - Environment & MVC Structure verified
[Phase 2]  ✅ PASS - PostgreSQL Schema & Concurrency Constraints verified
[Phase 3]  ✅ PASS - Core API, JWT Authentication, Rate Limiting & RBAC verified
[Phase 4]  ✅ PASS - Auction CRUD & Pessimistic Row Locking (SELECT FOR UPDATE) verified
[Phase 5]  ✅ PASS - Socket.IO Real-Time Synchronization & Events verified
[Phase 6]  ✅ PASS - Scheduler & Distributed Job Worker (FOR UPDATE SKIP LOCKED) verified
[Phase 7]  ✅ PASS - React 19 Frontend & Real-Time Contexts verified
[Phase 8]  ✅ PASS - Google Gemini AI Auction Assistant verified
[Phase 9]  ✅ PASS - Multer Image Upload & Socket.IO Live Room Chat verified
[Phase 10] ✅ PASS - Production-Grade Wallet & Double-Entry Ledger System verified

===========================================================
   🎉 ALL PHASES (1 TO 10) ARE 100% VERIFIED AND PASSING!  
===========================================================
Total assertions passed: 103/103
```

### Complete End-to-End Ledger Verification
To purge the database, seed standardized accounts, simulate a multi-bid concurrency race, close the auction, execute wallet escrow settlement, and audit ledger balances in one automated pass:

```bash
cd backend
npm run clean-verify
```

---

## 16. Deployment Guide

### Cloud Deployment Topology

```
┌────────────────────────────────────────────────────────┐
│                   Vercel Edge Network                  │
│  React 19 SPA (Vite) • https://auctionloom.vercel.app  │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────▼─────────────────────────────┐
│                 Render Cloud Infrastructure             │
│  auctionloom-backend Web Service (Express + Socket.IO) │
│  auctionloom-worker Background Service (SKIP LOCKED)   │
│  auctionloom-scheduler Cron Service (Poll 30s)         │
└──────────────────────────┬─────────────────────────────┘
                           │ SSL Connection Pool
┌──────────────────────────▼─────────────────────────────┐
│                 Supabase PostgreSQL 15                 │
│  ACID Relational Storage • Row Locking • JSONB Indexes │
└────────────────────────────────────────────────────────┘
```

### 1. Frontend on Vercel
* Deploy the `frontend/` directory to Vercel.
* **Build Command**: `npm run build`
* **Output Directory**: `dist`
* **Configuration**: `vercel.json` provides client-side SPA routing rewrites:
  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```
* **Environment Variables**: Set `VITE_API_URL` and `VITE_SOCKET_URL`.

### 2. Backend & Workers on Render
Deploy using the Blueprint specification in [render.yaml](render.yaml):
* Spawns the web API service with health checks at `/health`.
* Deploys standalone `auctionloom-worker` (`npm run worker`) and `auctionloom-scheduler` (`npm run scheduler`).
* Connects securely over SSL using `DATABASE_URL`.

---

## 17. Security Architecture

* **Rate Limiting**: `express-rate-limit` enforces a threshold of 5,000 requests per 15-minute window per IP (configured in `rateLimiter.js` to support high-frequency real-time bidding without dropping telemetry), mitigating brute-force and DDoS attempts.
* **Password Hashing**: Passwords are salted and hashed using `bcrypt` (10 rounds). Plaintext passwords are never logged or stored.
* **JWT Authentication**: Stateless Bearer tokens signed with HMAC-SHA256 carry user claims (`id`, `email`, `role`) with verified expiration periods.
* **Role-Based Access Control**: Route-level middleware ensures only users with `admin` or `auctioneer` privileges can create listings, appraise items, or execute moderation commands.
* **File Upload Protections**: Multer middleware inspects MIME types, restricts file sizes to ≤ 5MB, and assigns randomized timestamped file names to prevent directory traversal.
* **CORS Origin Filtering**: Dynamic origin parsing restricts incoming HTTP requests and WebSocket handshakes to verified frontend domains.

---

## 18. Known Operational Characteristics

* **Single-Instance Fallback Mode**: When deployed without independent background worker containers (e.g., in development or minimal cloud tiers), an in-process fallback sweep running every 15 seconds in `app.js` automatically closes expired lots.
* **Database Connection Limits**: Cloud databases (such as Supabase free tier or Neon) impose concurrent connection caps. Configure `DB_POOL_MAX=10` or use an external connection pooler (e.g., PgBouncer / Supabase Supavisor) when scaling API instances.
* **Stateless Socket Clustering**: To scale the WebSocket gateway across multiple Node.js cluster processes or multiple server instances, configure the official `@socket.io/redis-adapter` backed by a Redis instance.

---

## 19. Contributing

Contributions to AuctionLoom are welcome. Please follow these conventions:

1. **Fork the Repository**: Create your feature branch (`git checkout -b feature/concurrency-enhancement`).
2. **Adhere to Code Style**: Maintain the strict MVC pattern, keep SQL queries parameterized, and ensure all wallet balance mutations pass through `walletService.js`.
3. **Execute Verification**: Run the verification suite before opening a PR:
   ```bash
   cd backend && npm test
   ```
4. **Submit a Pull Request**: Provide a detailed description of your changes and reference any related issues.

---

## 20. License & Maintainers

* **License**: Open-source under the [ISC License](LICENSE)
* **Author & Lead Architect**: **Abhishek** ([@23abhishek2024](https://github.com/23abhishek2024))
* **Repository**: [https://github.com/23abhishek2024/auctionloom](https://github.com/23abhishek2024/auctionloom)
