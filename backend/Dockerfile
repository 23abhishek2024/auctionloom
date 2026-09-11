# ==========================================
# AuctionLoom Backend - Production Dockerfile
# ==========================================
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (e.g. bcrypt)
RUN apk add --no-cache python3 make g++

# Install dependencies with npm ci for deterministic builds
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose backend API port
EXPOSE 5000

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Start server
CMD ["npm", "start"]
