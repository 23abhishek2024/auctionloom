require('dotenv').config();
const cluster = require('cluster');
const os = require('os');

// In cloud containers (Render, Heroku, Railway), respect WEB_CONCURRENCY or default to 1 to avoid OOM
const maxCPUs = parseInt(process.env.WEB_CONCURRENCY, 10) || (process.env.NODE_ENV === 'production' ? 1 : Math.min(2, os.cpus().length));

if (maxCPUs <= 1) {
  // Single-process mode for memory-constrained cloud environments (e.g. Render Free 512MB)
  require('./app');
} else if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} is running`);
  console.log(`[Cluster] Forking ${maxCPUs} workers...`);

  for (let i = 0; i < maxCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork(); // Auto-restart crashed workers
  });
} else {
  // Each worker runs the Express app
  require('./app');
  console.log(`[Cluster] Worker ${process.pid} started`);
}
