require('dotenv').config();
const cluster = require('cluster');

// One process unless WEB_CONCURRENCY asks for more. Socket.IO rooms live in each process's memory:
// with several cluster workers, a bid handled by worker A is broadcast only to the browsers connected
// to worker A, and the HTTP long-polling fallback needs sticky sessions. Running more than one process
// therefore needs a shared Socket.IO adapter (for example @socket.io/redis-adapter), which this project
// does not include. (It used to fork 2 workers outside production, which split live updates locally.)
const processCount = parseInt(process.env.WEB_CONCURRENCY, 10) || 1;

if (processCount <= 1) {
  // Single process: the default, and what the live demo runs (Render's free plan has 512 MB)
  require('./app');
} else if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} is running`);
  console.log(`[Cluster] Forking ${processCount} workers (live updates need a shared Socket.IO adapter for this)...`);

  for (let i = 0; i < processCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork(); // Auto-restart crashed workers
  });
} else {
  // Each worker runs the Express app
  require('./app');
  console.log(`[Cluster] Worker ${process.pid} started`);
}
