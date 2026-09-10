require('dotenv').config();
const cluster = require('cluster');
const os = require('os');

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} is running`);
  console.log(`[Cluster] Forking ${numCPUs} workers...`);

  for (let i = 0; i < numCPUs; i++) {
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
