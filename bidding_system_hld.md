# Prime Bid: Detailed High-Level (HLD) & Low-Level Design (LLD)

## 1. Project Overview & Detailed Description
**Prime Bid** is a highly scalable, real-time auction platform designed to handle high concurrency, prevent race conditions (double-winning), and reliably process auction conclusions. 

The architecture is explicitly designed to demonstrate mastery over modern backend engineering, distributed systems, and generative AI. It strictly follows the **MVC (Model-View-Controller)** pattern, utilizes **Express Middlewares** for cross-cutting concerns (Logging, Auth, Rate Limiting), leverages the **Node.js Cluster module** for high availability, handles distributed background jobs safely using **PostgreSQL**, and optionally features an isolated **AI Assistant** (using basic LLM prompt engineering) to help users generate highly engaging auction descriptions.

---

## 2. High-Level Design (HLD) & Architecture

This architecture demonstrates robust system design principles, containerized via **Docker** for deployment on **AWS ECS**.

```mermaid
graph TD
    %% Clients
    Clients[React Web App] -->|HTTPS REST| LB(Node.js Cluster / Load Balancer)
    Clients <-->|WebSocket / Socket.IO| LB

    %% Node.js App Layer (Clusterized)
    subgraph Express Application (MVC Pattern)
        LB --> Worker1(Express Node 1)
        LB --> Worker2(Express Node 2)
        
        subgraph Middlewares
            Logger[Logging Middleware]
            RateLimiter[Rate Limiter]
            Auth[JWT Auth Middleware]
        end
        
        Worker1 --> Logger
        Logger --> RateLimiter
        RateLimiter --> Auth
        
        Auth --> Controllers(REST Controllers)
        Worker1 --> Socket(Socket.IO Hub)
        Worker1 -.-> AI(Isolated AI Service)
    end

    %% Background Workers
    subgraph Async Workers
        Scheduler(Auction Scheduler)
        JobWorkers(Job Worker Pool)
    end

    %% Data Layer
    subgraph Data Layer
        DB[(PostgreSQL)]
    end

    %% External
    LLM[OpenAI / LLM API]

    %% Connections
    Controllers -->|Read/Write/Lock| DB
    Socket -->|Broadcasts| Clients
    AI -.->|Basic Prompt Engineering| LLM
    Scheduler -->|Poll ended auctions & Insert Jobs| DB
    JobWorkers -->|Poll Jobs SKIP LOCKED| DB
    
    classDef primary fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef secondary fill:#f3e5f5,stroke:#4a148c,stroke-width:2px;
    classDef database fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef ai fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    
    class Worker1,Worker2,Controllers,Logger,RateLimiter,Auth primary;
    class DB database;
    class Clients secondary;
    class AI,LLM ai;
```

---

## 3. Low-Level Design (LLD)

### 3.1 Folder Structure (Strict MVC Pattern)
The application adheres to the Model-View-Controller architecture, cleanly separating business logic, routing, and data access.

```text
src/
├── index.js              # Entry point: Node.js Cluster module setup
├── app.js                # Express app initialization, Global Middlewares
├── routes/               # API Routes mapping
│   ├── authRoutes.js     # /api/auth
│   ├── auctionRoutes.js  # /api/auctions
│   └── bidRoutes.js      # /api/bids
├── controllers/          # Business logic handlers
│   ├── authController.js
│   ├── auctionController.js
│   └── bidController.js
├── models/               # Postgres DB queries and Data Models
│   ├── auctionModel.js   # Contains "SELECT ... FOR UPDATE" queries
│   ├── bidModel.js
│   └── userModel.js
├── middlewares/          # Express Middlewares
│   ├── logger.js         # Injects request_id and logs traffic
│   ├── auth.js           # Verifies JWT tokens and Roles (RBAC)
│   └── rateLimiter.js    # Prevents spam (System Design principle)
├── services/             # Third-party integrations
│   ├── socketService.js  # Socket.IO broadcasting logic
│   └── aiService.js      # [OPTIONAL] Basic LLM API integration for prompt engineering
└── workers/              # Background Job Processors
    ├── scheduler.js      # Finds ended auctions
    └── jobWorker.js      # Processes "CLOSE_AUCTION" jobs safely
```

### 3.2 Middleware Execution Flow
Every incoming REST API request passes through a rigorous middleware chain before reaching the controller.

```mermaid
flowchart LR
    Request[HTTP Request] --> Logger[Logger Middleware\nGenerates request_id]
    Logger --> RateLimit[Rate Limiter\nChecks IP/Token Bucket]
    RateLimit --> JWT[JWT Middleware\nValidates Token]
    JWT --> Role[Role Middleware\nChecks Authorization]
    Role --> Controller[Controller\nExecutes Business Logic]
    Controller --> Response[HTTP Response]
    
    style Logger fill:#fff3e0,stroke:#e65100
    style RateLimit fill:#fff3e0,stroke:#e65100
    style JWT fill:#fff3e0,stroke:#e65100
```

### 3.3 Core Database Schema (PostgreSQL)

```mermaid
erDiagram
    USERS ||--o{ AUCTIONS : creates
    USERS ||--o{ BIDS : places
    AUCTIONS ||--o{ BIDS : receives
    
    USERS {
        uuid id PK
        string email
        string password_hash
        string role "admin, auctioneer, bidder"
    }
    
    AUCTIONS {
        uuid id PK
        uuid seller_id FK
        string title
        text description
        decimal current_price
        timestamp end_time
        string status "ACTIVE, CLOSED"
    }
    
    BIDS {
        uuid id PK
        uuid auction_id FK
        uuid bidder_id FK
        decimal amount
        timestamp created_at
    }
    
    JOBS {
        uuid id PK
        string type "e.g., CLOSE_AUCTION"
        jsonb payload
        string status "PENDING, IN_PROGRESS, COMPLETED"
        timestamp locked_at
        string locked_by "worker_pid"
    }
```

---

## 4. Key System Workflows

### 4.1 Bid Placement (Concurrency, Middlewares, & Real-time)
This sequence highlights the interaction between Express middlewares, PostgreSQL pessimistic locking, and Socket.IO.

```mermaid
sequenceDiagram
    autonumber
    actor Bidder
    participant MW as Express Middlewares
    participant Ctrl as Bid Controller
    participant DB as PostgreSQL
    participant WS as Socket.IO Hub

    Bidder->>MW: POST /api/bids {auction_id, amount}
    
    %% Middleware execution
    Note over MW: 1. Logger injects Req ID<br/>2. Rate Limiter checks limits<br/>3. JWT Auth verifies user
    MW->>Ctrl: Passes Request (req.user populated)
    
    %% Transaction Start
    Ctrl->>DB: BEGIN TRANSACTION
    Ctrl->>DB: SELECT * FROM auctions WHERE id = X FOR UPDATE
    Note over DB: Row is exclusively locked.<br/>Concurrent bids wait here.
    DB-->>Ctrl: Auction Data
    
    %% Business Logic
    Ctrl->>Ctrl: Validate self-bid & min increment
    
    %% Save & Commit
    Ctrl->>DB: INSERT INTO bids (amount, bidder_id)
    Ctrl->>DB: UPDATE auctions SET current_price = amount
    Ctrl->>DB: COMMIT
    Note over DB: Row lock released.
    
    Ctrl-->>Bidder: 201 Created
    
    %% Real-time broadcast
    Ctrl->>WS: Emit 'PRICE_UPDATE' {auction_id, amount}
    WS-->>Bidder: UI updates instantly for everyone
```

### 4.2 Distributed Job Queue (System Design: Handling Queues)
Demonstrating how workers grab jobs safely without double-processing.

```mermaid
sequenceDiagram
    participant DB as DB (Jobs Table)
    participant W1 as Worker Process 1
    participant W2 as Worker Process 2

    par Worker 1 polling
        W1->>DB: SELECT id FROM jobs WHERE status='PENDING' FOR UPDATE SKIP LOCKED LIMIT 1
        DB-->>W1: Job A
        W1->>DB: UPDATE jobs SET status='IN_PROGRESS' WHERE id=Job A
    and Worker 2 polling
        W2->>DB: SELECT id FROM jobs WHERE status='PENDING' FOR UPDATE SKIP LOCKED LIMIT 1
        Note over DB: SKIP LOCKED skips Job A,<br/>instantly returns Job B.
        DB-->>W2: Job B
        W2->>DB: UPDATE jobs SET status='IN_PROGRESS' WHERE id=Job B
    end
```

### 4.3 AI Auction Assistant (Optional & Isolated)
An isolated module that can be built last and easily removed if not needed. It utilizes basic Prompt Engineering (direct API calls to an LLM provider) to help sellers generate optimized auction titles and descriptions, without complex RAG or orchestration frameworks.

```mermaid
sequenceDiagram
    actor Seller
    participant API as Express API
    participant AIS as Optional AI Service
    participant LLM as OpenAI / LLM API

    Seller->>API: POST /api/ai/generate-description {keywords: "vintage rolex"}
    API-.->AIS: format basic prompt(keywords)
    Note over AIS: "You are an expert auctioneer...<br/>keywords: {keywords}"
    AIS-.->LLM: HTTP POST /v1/chat/completions
    LLM-->>AIS: JSON Response
    AIS-.->API: Formatted {title, description}
    API-->>Seller: Returns optimized text
```

---

## 5. Technology Stack & Syllabus Alignment

This architecture rigorously implements the concepts mastered in your syllabus:

*   **Frontend**: **ReactJS** (Component architecture, `useState`/`useEffect` hooks, API calling via Axios). *(Note: Next.js is explicitly excluded as requested).*
*   **Backend Application**: **Node.js with Express.js**. Adheres strictly to the **MVC Pattern**. Utilizes the **Cluster module** to scale horizontally across CPU cores.
*   **Express Middlewares**: Deeply integrated custom middlewares for **JWT Authentication**, Authorization (Role checks), **Rate Limiting** (System Design), and Centralized **Logging**.
*   **Database**: **PostgreSQL** (Relational SQL). Implements advanced concurrency controls (`SELECT ... FOR UPDATE SKIP LOCKED`), joins, and aggregations.
*   **Generative AI**: **Isolated Basic Prompt Engineering** for an optional "AI Auction Assistant". Calls standard LLM APIs directly without complex framework overhead. Built as a decoupled final feature.
*   **Real-time Communication**: **Socket.IO** for instantaneous, bi-directional WebSocket broadcasting of price updates.
*   **Deployment & Infrastructure**: **Docker**. Application is containerized and ready for orchestration (e.g., AWS ECS).
*   **System Design Concepts**: Rate Limiting (Token Bucket), Message Queues (Postgres-backed Job Queue), and High Availability patterns.
