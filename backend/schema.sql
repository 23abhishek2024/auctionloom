-- ============================================================
--  Prime Bid - PostgreSQL Database Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'bidder' CHECK (role IN ('admin', 'auctioneer', 'bidder')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 2. AUCTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS auctions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    starting_price  DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    current_price   DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    end_time        TIMESTAMP WITH TIME ZONE NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
    winner_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for the scheduler to quickly find ended auctions
CREATE INDEX IF NOT EXISTS idx_auctions_status_end_time ON auctions(status, end_time);

-- ============================================================
-- 3. BIDS
-- ============================================================
CREATE TABLE IF NOT EXISTS bids (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_id      UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    bidder_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          DECIMAL(12, 2) NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast retrieval of bids per auction
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);

-- ============================================================
-- 4. JOBS (Distributed Job Queue - PostgreSQL-backed)
-- The scheduler inserts jobs here. Workers poll with SKIP LOCKED.
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            VARCHAR(100) NOT NULL,        -- e.g., 'CLOSE_AUCTION'
    payload         JSONB NOT NULL DEFAULT '{}',  -- e.g., { "auction_id": "..." }
    status          VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    locked_at       TIMESTAMP WITH TIME ZONE,
    locked_by       VARCHAR(100),                 -- worker PID
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Unique constraint: prevents scheduler from inserting duplicate jobs
    -- for the same auction. ON CONFLICT DO NOTHING relies on this.
    CONSTRAINT unique_pending_job UNIQUE (type, payload)
);

-- Index for workers to efficiently find PENDING jobs
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status) WHERE status = 'PENDING';
