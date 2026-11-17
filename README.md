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
[![Wallet Ledger](https://img.shields.io/badge/Ledger-Append--only%20ACID-10B981)](https://github.com/23abhishek2024/auctionloom)
[![Automated Tests](https://img.shields.io/badge/Tests-104_checks_%2B_6_stress_scenarios-brightgreen)](https://github.com/23abhishek2024/auctionloom/actions)
[![Live Demo](https://img.shields.io/badge/Live_Demo-auctionloom.vercel.app-00C7B7?logo=vercel&logoColor=white)](https://auctionloom.vercel.app/)

> 🌐 **Production Web Application**: [https://auctionloom.vercel.app/](https://auctionloom.vercel.app/)  
> ⚡ **Live Production API Gateway**: [https://primebid-backend-e971.onrender.com/api](https://primebid-backend-e971.onrender.com/api) *(Render Cloud Host)*  
> 🩺 **Service Health Endpoint**: [https://primebid-backend-e971.onrender.com/health](https://primebid-backend-e971.onrender.com/health)  
> 🗄️ **Primary Relational Store**: Managed PostgreSQL on Supabase (Mumbai region)  
> 📐 **Systems Architecture & HLD/LLD Specification**: [bidding_system_hld.md](bidding_system_hld.md)  

---

## 1. Executive Overview

**AuctionLoom** is a real-time auction platform built to stay correct when many people bid, pay and withdraw at the same moment: bids on one lot are serialized with row locks, money moves in locked transactions with an append-only ledger, and ended auctions are closed by a PostgreSQL job queue.

### The Problem It Solves
In traditional auction applications, rapid-fire bids submitted in the same millisecond frequently result in:
1. **Race Conditions & Dirty Writes**: Concurrent database writes overwrite higher bids or allow multiple users to believe they placed the highest bid at the same price.
2. **Negative Balance & Double Spending**: Concurrent payments or withdrawals from one wallet can overdraw it or charge a buyer twice for the same lot.
3. **Ghost Settlements**: Lots closing at scheduled deadlines without synchronized background workers result in orphaned records, delayed payments, and uncollected platform fees.

### The Solution Architecture
AuctionLoom resolves these challenges through a strict, zero-trust engineering approach:
* **Pessimistic Row-Level Locking (`SELECT FOR UPDATE`)**: Synchronizes concurrent bid submissions directly inside atomic PostgreSQL transactions, serializing simultaneous bids on the same auction row.
* **Append-Only Wallet Ledger**: Every balance change writes a ledger row with `balance_after`; a settlement writes the buyer's debit, the seller's 95% credit and the platform's 5% fee in one transaction. `CHECK (balance >= 0)`, row locks and idempotency keys stop overdrafts and double charges. (Top-ups are simulated, so there is no external "bank" account on the other side; settlements balance exactly.)
* **PostgreSQL Job Queue (`FOR UPDATE SKIP LOCKED`)**: A scheduler queues a close job for every ended auction and workers close them (winner, 5% fee, auto-settlement, emails) without ever taking the same job twice.
* **Real-Time WebSockets**: Price updates, live auction room chat (logged-in users, identity set by the server) and audience reactions, scoped to Socket.IO rooms per auction.
* **AI-Powered Appraisal Engine**: Integrates Google Gemini 3.6 Flash to appraise items, construct provenance narratives, and recommend starting reserve prices based on seller keywords.

---

## 2. Core Implemented Features

### ⚡ Real-Time High-Concurrency Bidding Engine
* **Atomic Bid Transactions**: Every bid runs inside an ACID database transaction acquiring a row lock via `SELECT * FROM auctions WHERE id = $1 FOR UPDATE`.
* **Instant Price Broadcasts**: Committed bids emit a `PRICE_UPDATE` payload to the auction's WebSocket room (only after COMMIT, so nobody sees a bid that was rolled back).
* **Integrity Validations**: Sellers can't bid on their own lots, admins can't bid, amounts must be whole cents and strictly higher than the current price, and expired or frozen lots refuse bids. (There is no anti-sniping time extension.)

### 💰 Wallet & Escrow Ledger
* **Ledger Entries**: All balance changes go through `walletService.js` (or the services that call it) and append a ledger entry (`TOPUP`, `SETTLEMENT_DEBIT`, `SETTLEMENT_CREDIT`, `COMMISSION`, `WITHDRAWAL`) with the balance after it.
* **Zero Overdraft Protection**: Database-level constraint `CHECK (balance >= 0)` guarantees negative balances are structurally impossible at the engine layer.
* **Idempotency Deduplication**: Unique constraint `idempotency_key UNIQUE` ensures retried network requests or client double-clicks cannot duplicate wallet deductions or top-ups.
* **1-Click Atomic Escrow Settlement**: When an auction concludes, the winning bidder can execute an atomic settlement. The winner's wallet is debited, the seller's wallet is credited (95% net payout), and the platform treasury/admin is credited (5% commission) in a single database transaction.

### 🔄 Background Workers & Job Queue
* **PostgreSQL-Backed Job Queue**: Worker processes drain the `jobs` table oldest-first with `SELECT ... WHERE status = 'PENDING' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`.
* **No Worker Collisions**: Several workers can run at once without ever taking the same job.
* **Scheduler**: Every 30 seconds it queues one `CLOSE_AUCTION` job per ended auction; a partial unique index allows only one *open* job per auction, so finished jobs don't block a republished auction, and a stuck job is handed back (or failed after 3 claims).
* **In-Process Sweep**: The API process also closes ended auctions every 15 seconds (and an auction opened after its end time is closed on the spot). This is what closes auctions on the live demo: Render's free plan can't run separate worker processes. All paths call the same `closeAuction`, which locks the row and re-checks, so an auction is never closed twice.

### 💬 Multi-Channel Real-Time Communications
* **Live Room Chat**: Logged-in users chat in each auction room (`SEND_MESSAGE` → `CHAT_MESSAGE`). The server reads the sender's name and role from the login token sent in the socket handshake, so nobody can post as someone else; 5 messages per 10 seconds per connection.
* **Floating Reactions**: Audience members can emit animated floating emoji reactions (`🔥`, `🚀`, `💎`, `👏`, `❤️`, `⚡`, `🎉`) broadcast live to all observers.
* **Administrative Broadcast Alerts**: Real-time administrative actions immediately broadcast status changes (`AUCTION_STATUS_CHANGED`), freezing the bidding UI on active clients.

### ✉️ Dual-Strategy Transactional Email Delivery
* **Smart Routing Engine**: Sends demo addresses (`@test.com`, `@example.com`, the `test1`-`test5@gmail.com` seed accounts, anything starting with `test`) to disposable Ethereal inboxes with web preview links, and real addresses through SMTP when it is configured.
* **Settlement Notifications**: Winners and sellers get an email with the lot, hammer price and the seller's payout details (all user-typed text is HTML-escaped).

### 🤖 Google Gemini AI Appraisal Assistant
* **Luxury Copywriting Pipeline**: Uses Google Gemini (`gemini-3.6-flash`) in JSON mode (the prompt names the three fields; the server checks them) to generate appraisal-grade titles, descriptions, and suggested starting bids.
* **Deterministic Fallback Engine**: If no API key is provided or the upstream provider fails, an intelligent heuristic copywriter guarantees continuous functionality without breaking the listing workflow.

### 🛡️ Platform Moderation & Role-Based Access Control (RBAC)
* **Granular RBAC**: Strict middleware enforcement across `bidder`, `auctioneer`, and `admin` roles.
* **Administrative Auction Freeze**: Admins can freeze a running auction (`ACTIVE` → `RESTRICTED`) and resume it; closed auctions can't change status.
* **Lot Deletion**: Deleting a lot removes its bids and queued jobs in one locked transaction; a lot that has been paid for can't be deleted (it is part of the money records).
* **Payment Proof Verification**: Sellers submitting manual commission proofs have their uploads verified and approved or rejected via the Admin Dashboard.

### 🖼️ Image Uploads (Multer)
* **Stored in PostgreSQL**: Images (auction photos, commission receipts) are read into memory and saved in an `uploads` table, served from `/uploads/<id>.<ext>`. The free Render disk is wiped on every restart, so files on disk disappeared; a production setup would use object storage (S3, Supabase Storage).
* **Security & Size Guards**: JPEG, PNG, WebP or GIF only, at most 5 MB; the file's first bytes must match the declared type, the extension comes from that type (never from the file name), and images are served with `X-Content-Type-Options: nosniff`.

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose in AuctionLoom |
|---|---|---|---|
| **Frontend SPA** | React | `19.2.8` | Component-driven user interface with concurrent rendering and declarative UI state. |
| **Build Tooling** | Vite | `8.3.0` | Ultra-fast client build pipeline and HMR development server. |
| **Client Routing** | React Router | `7.18.3` | Declarative client-side routing with protected route authorization guards. |
| **Styling & Icons** | Tailwind CSS / Lucide | `3.4.19` / `1.44.0` | Utility-first responsive design system and modern iconography. |
| **API Gateway** | Express.js | `5.2.1` | RESTful API server with route modularization and centralized error handling. |
| **Process Clustering** | Node.js Cluster | `v20+` / `v22+` | Optional multi-process mode (`WEB_CONCURRENCY`, default 1 process). More than one process needs a shared Socket.IO adapter (not included), otherwise live updates reach only the browsers on the same process. |
| **Relational Database**| PostgreSQL | `15-alpine` | Primary ACID relational database with row-level pessimistic locking. |
| **Database Driver** | `pg` (node-postgres) | `8.23.0` | High-performance client pool with cloud SSL connection support. |
| **Real-Time Layer** | Socket.IO | `4.8.3` | Low-latency bi-directional event distribution across auction rooms. |
| **Authentication** | JSON Web Tokens (JWT) | `9.0.3` | Stateless Bearer token authentication and authorization claims. |
| **Password Hashing** | bcrypt | `6.0.0` | Salted cryptographic password hashing (10 rounds). |
| **Rate Limiting** | express-rate-limit | `8.x` | Per-IP throttling, plus limits on failed logins and sign-ups. |
| **Multipart Ingestion**| Multer | `2.x` | multipart/form-data image uploads (memory storage, saved to PostgreSQL). |
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
        API["Express 5 REST API<br/>+ 15s closing sweep"]
        WS["Socket.IO Real-Time Gateway<br/>Isolated Auction Rooms"]
    end

    subgraph Middleware["Middleware Pipeline"]
        Logger["Structured Request Logger<br/>Correlation ID Tracking"]
        Limiter["Rate Limiter Middleware<br/>IP Throttling"]
        Auth["JWT & RBAC Middleware<br/>Claims Verification"]
    end

    subgraph CoreServices["Backend Application Core"]
        AuctionService["Auction & Bid Controller<br/>Pessimistic Locking"]
        WalletService["Wallet Service<br/>Append-only ledger, no overdraft"]
        AIService["Gemini 3.6 Flash Engine<br/>Structured JSON Appraisals"]
        UploadService["Upload Service<br/>Byte check, stored in PostgreSQL"]
    end

    subgraph StorageLayer["PostgreSQL"]
        DB[(PostgreSQL Primary Store<br/>Users, Auctions, Bids, Wallets,<br/>Transactions, Jobs, Proofs, Uploads)]
    end

    subgraph AsyncWorkers["Background Worker Pool"]
        Scheduler["Auction Scheduler<br/>Polls Expired Lots (30s)"]
        JobWorker["Job Worker<br/>SELECT FOR UPDATE SKIP LOCKED (drains every 10s)"]
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
├── render.yaml                      # Render blueprint: free web service (workers need a paid plan)
├── vercel.json                      # Vercel SPA routing rewrite rules and cache headers
├── aws-ecs-task-definition.json     # AWS ECS container task definition template
│
├── backend/                         # Express 5 REST API & WebSocket Server
│   ├── src/
│   │   ├── controllers/             # HTTP layer only: check the request, call a service, send the response (no SQL)
│   │   │   ├── adminController.js   # Admin routes: metrics, ledgers (JSON/CSV), users, moderation, purge, benchmark
│   │   │   ├── aiController.js      # Google Gemini copy & appraisal handler
│   │   │   ├── auctionController.js # Auction CRUD, filtering, sorting, and republishing
│   │   │   ├── authController.js    # Registration, login, profile and password changes
│   │   │   ├── bidController.js     # Bid input checks (the locked transaction is in bidService)
│   │   │   ├── commissionController.js # Proof submission & seller debt tracking
│   │   │   ├── userController.js    # User stats, listings, bids, payout profiles
│   │   │   └── walletController.js  # Top-ups, lot settlements, withdrawals, balance feeds
│   │   ├── middlewares/             # Security & Request Processing Pipeline
│   │   │   ├── auth.js              # JWT verification (role + password-change check from the DB) & RBAC
│   │   │   ├── logger.js            # Request id (X-Request-Id) and access log
│   │   │   ├── rateLimiter.js       # Per-IP limits: API 5,000/15m, failed logins 10/15m, sign-ups 50/h
│   │   │   └── upload.js            # Multer memory storage, image type filter, 5MB limit
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
│   │   │   └── walletRoutes.js      # /api/wallet balance, ledger and payments
│   │   ├── services/                # Business rules, transactions & SQL (never touch req/res)
│   │   │   ├── aiService.js         # Gemini 3.6 Flash & fallback heuristic copywriter
│   │   │   ├── auctionClosureService.js # Atomic lot closure, auto-settlement & the winner's settle-lot
│   │   │   ├── auctionService.js    # List/read/create/delete/republish auctions, admin moderation
│   │   │   ├── authService.js       # Password hashing, login checks, JWT issuance
│   │   │   ├── bidService.js        # Bid transaction with SELECT FOR UPDATE + PRICE_UPDATE event
│   │   │   ├── commissionService.js # Seller commission debt: pay from wallet, receipts, admin review
│   │   │   ├── emailService.js      # Nodemailer dual-delivery engine (Ethereal + SMTP)
│   │   │   ├── reportService.js     # Admin metrics, revenue chart, commission ledger & report
│   │   │   ├── socketService.js     # Socket.IO room manager & event broadcaster
│   │   │   ├── systemService.js     # Purge-and-reseed (off in production) and the bid benchmark
│   │   │   ├── uploadService.js     # Image byte check, storage in PostgreSQL, serving
│   │   │   ├── topupService.js      # Wallet funding & payment request abstraction
│   │   │   ├── userService.js       # Dashboards, leaderboard, payout details, admin user management
│   │   │   └── walletService.js     # Locked credits/debits, ledger, settlement, wallet history
│   │   ├── utils/                   # Shared Helper Utilities
│   │   │   ├── AppError.js          # Expected failures (404, 403, ...) a service reports to the HTTP layer
│   │   │   └── validators.js        # Input checks: UUIDs, money (whole cents), text, dates, email, password
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
│   ├── verify_phases.mjs            # End-to-end test suite (11 phases, 111 checks), run in CI
│   ├── stress_test.js               # Concurrency stress tests (6 scenarios), run in CI
│   ├── benchmark_concurrency.js     # 100 simultaneous bids: latency + database checks
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
| `DB_POOL_MAX` | No | `20` | Maximum concurrent connections permitted in the `pg.Pool`. |
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
| `TRUST_PROXY` | No | `1` in production, `0` otherwise | Proxy hops to trust for the client IP (rate limits). `/health` shows the `clientIp` the server sees. |
| `ALLOW_DEMO_RESET` | No | `false` | Set to `true` to allow the admin "Purge & Reset" when `NODE_ENV=production`. |
| `SWEEP_INTERVAL_MS` | No | `15000` | How often the API process closes ended auctions; `0` turns it off (CI does this to test the worker). |
| `WEB_CONCURRENCY` | No | `1` | Number of cluster processes started by `npm start`. Keep `1` unless you add a shared Socket.IO adapter (see §18). |

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
| `npm start` | `node src/index.js` | Starts the backend: one process, or `WEB_CONCURRENCY` cluster workers. |
| `npm run dev` | `nodemon src/app.js` | Launches development server with hot-reload via nodemon. |
| `npm run cluster` | `node src/index.js` | Same as `npm start`; set `WEB_CONCURRENCY=4` to fork 4 workers (needs a shared Socket.IO adapter for live updates). |
| `npm run worker` | `node src/workers/jobWorker.js` | Starts standalone distributed job worker (`SKIP LOCKED`). |
| `npm run scheduler` | `node src/workers/scheduler.js` | Starts background poller queuing expired lots every 30s. |
| `npm run migrate` | `node scripts/migrate.js` | Executes DDL schema migrations against configured database. |
| `npm run clean-verify` | `node clean_reset_and_verify.js` | Full DB purge, 6-user reseed, live bid race, and ledger audit. |
| `npm run benchmark` | `node benchmark_concurrency.js` | 100 simultaneous bids over HTTP: latency percentiles plus database checks (exit code 1 if a check fails). The Admin Dashboard has a similar 1-click benchmark. |
| `npm test` | `node verify_phases.mjs` | End-to-end suite: 11 phases, 111 checks (server must be running). |
| `npm run stress` | `node stress_test.js` | 6 concurrency scenarios: bid race, double spend, double settlement, republish of a paid lot, cross settlement, bid vs delete. |

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

1. **`users`**: Credentials, display names, roles (`admin`, `auctioneer`, `bidder`), unpaid commission (legacy, see below), JSONB payout details and `password_changed_at` (tokens issued before it are refused).
2. **`auctions`**: Stores lot metadata, starting/current prices, timestamps, statuses (`ACTIVE`, `CLOSED`, `RESTRICTED`), foreign-key winner associations, escrow settlement state (`is_settled`, `settled_at`), and calculated commission records.
3. **`bids`**: Immutable record of all accepted bids placed per auction, indexed by `auction_id` for instantaneous price-ladder reconstruction.
4. **`wallets`**: Secure balance store with row versioning, constrained by `CHECK (balance >= 0)` to guarantee zero overdraft.
5. **`wallet_transactions`**: Append-only ledger of every balance change, with `balance_after` and a unique `idempotency_key`.
6. **`jobs`**: Job queue for background work. A partial unique index allows one open job per auction: `CREATE UNIQUE INDEX unique_open_job ON jobs (type, payload) WHERE status IN ('PENDING', 'IN_PROGRESS')`.
7. **`payment_requests`**: Gateway-ready record of top-up and withdrawal requests (top-ups are simulated today).
8. **`commission_proofs`**: Seller receipts for commission paid outside the platform. The 5% fee is now taken automatically at settlement, so nothing creates new commission debt; this path is kept for manual reconciliation.
9. **`uploads`**: Uploaded images (bytes, type, size), served from `/uploads/<id>.<ext>`.

---

## 11. Local Test Accounts

Running `npm run seed` or `npm run clean-verify` against **your local database** creates 5 user accounts and 1 administrator for development. Their password is set in `backend/scripts/reset_and_seed.js`.

> **These are local development accounts only.** On any deployed copy, log in as the admin once and change the password under *My Hub → Payout & Password* (this also logs out every other session). The admin "Purge & Reset" button, which recreates these accounts, is switched off when `NODE_ENV=production` unless `ALLOW_DEMO_RESET=true` is set on the server.

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
| `PUT` | `/api/auth/password` | Bearer | Change password (logs out other sessions, returns a new token) | `{ currentPassword, newPassword }` |

### 🏷️ Auctions (`/api/auctions`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `GET` | `/api/auctions` | Public | List auctions with filtering & search (max 100 per page; response includes `total`) | Query: `status`, `search`, `seller_id`, `sort`, `limit`, `offset` |
| `GET` | `/api/auctions/:id` | Public | Retrieve single auction details | Path: `id` (UUID) |
| `POST` | `/api/auctions` | Auctioneer / Admin | Create a new auction listing | `{ title, description, starting_price, end_time or duration_minutes, image_url }` |
| `DELETE` | `/api/auctions/:id` | Owner (before bids) / Admin | Delete auction listing (never a paid lot) | Path: `id` (UUID) |
| `POST` | `/api/auctions/:id/republish` | Owner / Admin | 1-Click republish closed auction lot | Path: `id` (UUID), Body: `{ end_time?, starting_price? }` |
| `GET` | `/api/auctions/:id/bids` | Public | Get all bids placed on an auction | Path: `id` (UUID) |
| `POST` | `/api/auctions/:id/bids` | Bearer | Submit a concurrency-safe bid | Path: `id` (UUID), Body: `{ amount }` |

### 💼 Wallet & Ledger (`/api/wallet`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `GET` | `/api/wallet` | Bearer | Retrieve balance, stats & ledger summary | _None_ |
| `GET` | `/api/wallet/transactions` | Bearer | Paginated ledger entries | Query: `page`, `limit`, `type` |
| `POST` | `/api/wallet/topup` | Bearer | Simulated self-service balance credit (optional `Idempotency-Key` header) | `{ amount, note? }` |
| `POST` | `/api/wallet/settle-lot` | Bearer | Winning bidder lot escrow settlement | `{ auctionId }` |
| `POST` | `/api/wallet/settle-commission` | Bearer | Seller commission direct settlement | `{ amount }` |
| `POST` | `/api/wallet/withdraw` | Bearer | Withdraw funds from available balance (optional `Idempotency-Key` header) | `{ amount, note? }` |

### 🛡️ Administration (`/api/admin`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `GET` | `/api/admin/metrics` | Admin | Aggregate platform metrics (GMV, volume) | _None_ |
| `GET` | `/api/admin/revenue-chart` | Admin | Monthly sales & commission, latest 12 months (`isSample: true` when there are no sales yet) | _None_ |
| `GET` | `/api/admin/commission-ledger` | Admin | Platform commission ledger & summary | _None_ |
| `GET` | `/api/admin/commission-transactions`| Admin | Complete feed of platform fee credits | _None_ |
| `GET` | `/api/admin/users` | Admin | Retrieve all platform users | _None_ |
| `PUT` | `/api/admin/users/:id/role` | Admin | Update a user's role | Path: `id` (UUID), Body: `{ role: 'admin' \| 'auctioneer' \| 'bidder' }` |
| `PUT` | `/api/admin/auctions/:id/status`| Admin | Freeze a running auction or resume a frozen one | Path: `id` (UUID), Body: `{ status: 'ACTIVE' \| 'RESTRICTED', reason? }` |
| `DELETE`| `/api/admin/auctions/:id` | Admin | Delete a lot with its bids and jobs (not a paid lot) | Path: `id` (UUID) |
| `GET` | `/api/admin/commission-proofs`| Admin | List submitted offline payment proofs | _None_ |
| `PUT` | `/api/admin/commission-proofs/:id/status` | Admin | Approve or reject payment proof | Path: `id` (UUID), Body: `{ status: 'APPROVED' \| 'REJECTED', admin_notes? }` |
| `POST` | `/api/admin/system/purge-and-reset` | Admin | Wipe and re-seed the database (403 in production unless `ALLOW_DEMO_RESET=true`) | `{ runTestAuctions? }` |
| `POST` | `/api/admin/system/run-benchmark` | Admin | Bid benchmark on a temporary lot, with database checks | `{ requests }` (2-500) |

### 🧾 Commissions & Offline Wire Proofs (`/api/commissions`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `POST` | `/api/commissions/proof` | Bearer | Submit offline wire payment receipt image | Form field: `proof` (image ≤ 5MB), fields: `amount`, `comment?` |
| `GET` | `/api/commissions/my-proofs` | Bearer | Retrieve user's submitted commission receipts & debt | _None_ |

### 🤖 AI Valuations & Media (`/api/ai` & `/api/upload`)

| Method | Endpoint | Auth | Description | Request Body / Parameters |
|---|---|---|---|---|
| `POST` | `/api/ai/generate` | Auctioneer / Admin | Generate luxury copy & starting price | `{ keywords, category }` |
| `POST` | `/api/upload` | Bearer | Upload image via Multer (`multipart/form-data`) | Form field: `image` (JPEG, PNG, WebP, GIF ≤ 5MB) |

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
| `PUT` | `/api/users/me/payout-methods`| Bearer | Update seller payout configuration | `{ bank_name, account_number, ifsc_swift, upi_id, paypal_email }` |
| `GET` | `/api/users/auction-payout/:auctionId`| Bearer (winner, seller, admin) | Seller's payout details for a won lot | Path: `auctionId` (UUID) |

---

## 13. Real-Time WebSocket Event Matrix

WebSocket connections are managed by Socket.IO attached to the main HTTP server. Clients connect and join specific auction rooms to scope real-time traffic. A logged-in client sends its JWT in the handshake (`auth: { token }`); the server loads the user's name and role from the database. Without a token the client is a guest (can watch and react, not chat).

### Client-to-Server Inbound Events

| Event Name | Expected Payload | Handling & Action |
|---|---|---|
| `JOIN_AUCTION` | `auctionId` (UUID string) | Joins the socket to the isolated channel `auctionId`. |
| `LEAVE_AUCTION` | `auctionId` (UUID string) | Removes the socket from channel `auctionId`. |
| `SEND_MESSAGE` | `{ auctionId, text, clientId? }` | Logged-in users only (guests get `CHAT_ERROR`). Text trimmed to 500 chars; sender name, id and role come from the server; 5 per 10 s. |
| `SEND_REACTION` | `{ auctionId, emoji }` | Emoji from the allowlist (`🔥`, `🚀`, `💎`, `👏`, `❤️`, `⚡`, `🎉`); sender set by the server ("Guest" if not logged in). |

### Server-to-Client Outbound Broadcasts

| Event Name | Broadcast Scope | Payload Structure | Triggering Action |
|---|---|---|---|
| `PRICE_UPDATE` | Room (`auctionId`) | `{ auction_id, new_price, bidder_name, bidder_id, bid_id }` | Dispatched immediately after a valid bid commits to PostgreSQL. |
| `CHAT_MESSAGE` | Room (`auctionId`) | `{ id, clientId, auctionId, text, senderName, senderId, role, timestamp }` | Broadcasts new room chat messages (never an email). |
| `CHAT_ERROR` | Sender only | `{ auctionId, error }` | Chat refused: not logged in, or sending too fast. |
| `REACTION` | Room (`auctionId`) | `{ id, auctionId, emoji, senderName, timestamp }` | Broadcasts interactive floating emoji reaction to room observers. |
| `AUCTION_STATUS_CHANGED` | Room (`auctionId`) | `{ auction_id, status: 'ACTIVE' \| 'RESTRICTED', reason, timestamp }` | Broadcast when an administrator freezes or unfreezes a listing. |

---

## 14. Financial & Concurrency Invariants

AuctionLoom relies on four system invariants (each one is exercised by `npm test` and `npm run stress`):

### 1. Serialized Bidding Invariant
```sql
SELECT * FROM auctions WHERE id = $1 FOR UPDATE;
```
* Bids for the same lot are serialized at the database engine level: each bid reads the current price under the lock, so no bid is lost.
* Amounts are whole cents, so an accepted bid is always strictly higher than the one before it.

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

### 4. Worker Job Deduplication
```sql
SELECT * FROM jobs WHERE status = 'PENDING' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
```
* Workers claim pending jobs without blocking or duplicating each other.
* The partial unique index `unique_open_job ON jobs (type, payload) WHERE status IN ('PENDING', 'IN_PROGRESS')` allows only one open job per auction, while finished jobs don't block a new one.

---

## 15. Automated Verification & Testing Suite

Two suites run in GitHub Actions on every push, against a real PostgreSQL service and a running server:

* `npm test` (`verify_phases.mjs`): 11 phases, 111 checks of real behaviour: auth and RBAC, bidding and locking, sockets and chat identity, the real scheduler and worker processes, uploads, wallet and settlement, CORS, input validation, rate limits and the audit regression checks (including the 5% fee in whole cents, reports that count each commission once, final commission-receipt decisions, role guards, and tokens from before a password change).
* `npm run stress` (`stress_test.js`): 6 concurrency scenarios fired at the same moment, each checked in the database afterwards.

### Running the Test Suite
Ensure the backend server is running on port 5000 (CI starts it with `SWEEP_INTERVAL_MS=0`), then execute:

```bash
cd backend
npm test
npm run stress
```

### Verification Output

```text
Phase 1   Server up, API catalogue, JSON 404
Phase 2   Database: all 9 tables, unique index on open jobs
Phase 3   Auth, JWT, RBAC, rate-limit headers
Phase 4   Auction CRUD, admin freeze, row locking (2 identical bids at once: 1 accepted)
Phase 5   Socket.IO PRICE_UPDATE after commit, no emails in payloads
Phase 6   Real scheduler + worker processes close an ended auction; re-queue after republish
Phase 7   CORS and Socket.IO origin allow-list
Phase 8   AI assistant (RBAC, validation, generation)
Phase 9   Uploads (stored in PostgreSQL, byte check, nosniff) and chat identity
Phase 10  Wallet: top-up, overdraft refusal, settlement 95/5, idempotent re-settlement
Phase 11  Regression checks from the pre-interview audit (precision, fee rounding, errors,
          validation, chat, benchmark, fan-out, report totals, CSV, rate limits, paid-lot
          delete, status changes, receipts, role guards, stale tokens, ...)

Total assertions passed: 111/111

Stress tests passed: 6/6
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
│          Render (free web service, one process)        │
│  Express + Socket.IO + 15s closing sweep               │
│  (sleeps after 15 min idle; first request ~1 min)      │
└──────────────────────────┬─────────────────────────────┘
                           │ SSL Connection Pool
┌──────────────────────────▼─────────────────────────────┐
│                  Supabase PostgreSQL                   │
│  ACID Relational Storage • Row Locking • JSONB         │
└────────────────────────────────────────────────────────┘

The separate worker and scheduler processes run in Docker Compose (and could run
on Render as background workers on a paid plan; the free plan has none).
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

### 2. Backend on Render
Deploy using the Blueprint in [render.yaml](render.yaml):
* One free web service (Docker) with health checks at `/health`; it closes auctions with its in-process sweep.
* Set `DATABASE_URL` (Supabase), `JWT_SECRET`, `FRONTEND_URL` and optionally `GEMINI_API_KEY` in the Render dashboard.
* After the first deploy, open `/health` and check that `clientIp` is your IP (otherwise adjust `TRUST_PROXY`).
* The blueprint shows, commented out, how to add the worker and scheduler as background workers on a paid plan.
* A GitHub Actions workflow (`keep-alive.yml`) pings the API twice a day so Supabase doesn't pause the database.

---

## 17. Security Architecture

* **Rate Limiting**: Per IP (behind Render's proxy via `trust proxy`): 5,000 API requests per 15 minutes, 10 failed logins per 15 minutes per account, 50 sign-ups per hour. The store is in memory, so each process counts separately.
* **Password Hashing**: bcrypt (10 rounds); passwords must be 8-72 characters. Plaintext passwords are never logged or stored.
* **JWT Authentication**: HS256 Bearer tokens valid 7 days. On every request the account and role are read from the database, and tokens issued before the last password change are refused (changing the password logs out other sessions).
* **Role-Based Access Control**: Route-level middleware ensures only `admin` or `auctioneer` users can create listings, use the AI assistant or moderate; admins can't bid.
* **Input Validation**: Every id, amount (whole cents, max $10M), text length, date and email is checked before it reaches PostgreSQL; bad input is a 400 with a plain message.
* **Error Handling**: Unexpected errors are logged with a request id; the client gets a generic message plus `requestId` (also in the `X-Request-Id` header), never database or code details.
* **Chat Identity**: Chat messages carry the name and role the server loaded for the socket's token; guests can't chat.
* **File Upload Protections**: Image types only, ≤ 5MB, file bytes must match the type, extension taken from the type, served with `nosniff`.
* **CORS Origin Filtering**: Only the configured frontend origins may call the API from a browser or open a WebSocket.
* **Known gaps**: the database connection skips certificate verification (`rejectUnauthorized: false`), the login token lives in `localStorage` (readable by any script injected into the page), top-ups are simulated, a bid doesn't check the bidder's wallet (an unpaid winner is handled by the 24-hour payment window), there is no anti-sniping extension, uploads have no per-user quota, the home page loads the newest 100 auctions and filters them in the browser, and sign-up reveals whether an email is already registered.

---

## 18. Known Operational Characteristics

* **Single-Instance Mode (the live demo)**: Without worker containers (development, Render's free plan), the 15-second sweep in `app.js` closes expired lots; opening an ended auction also closes it on the spot.
* **Database Connection Limits**: Cloud databases (such as Supabase free tier or Neon) impose concurrent connection caps. Configure `DB_POOL_MAX=10` or use an external connection pooler (e.g., PgBouncer / Supabase Supavisor) when scaling API instances.
* **Socket Clustering**: Socket.IO rooms live in one process's memory, so the server runs one process by default. To run several cluster processes or server instances, add the official `@socket.io/redis-adapter` (backed by Redis) and sticky sessions; without them a bid is broadcast only to the browsers connected to the process that handled it.

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
