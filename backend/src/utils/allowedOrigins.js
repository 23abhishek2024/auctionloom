/**
 * Browser origins allowed to call the API and open a Socket.IO connection (CORS).
 * Add more with FRONTEND_URL, comma-separated (for example a custom domain). A "*" there is ignored:
 * allowing every origin would let any website call the API from a visitor's browser.
 */
const DEFAULT_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000', // docker-compose frontend (Nginx, also published on port 80)
  'http://localhost',
  'https://auctionloom.vercel.app',
  'https://biding-app-indol.vercel.app',
];

const getAllowedOrigins = () => {
  const fromEnv = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin && origin !== '*');
  return [...new Set([...fromEnv, ...DEFAULT_ORIGINS])];
};

module.exports = { getAllowedOrigins };
