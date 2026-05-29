import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { MikroORM } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';
import { createAuthRouter } from './routes/auth.js';
import { createNumbersRouter } from './routes/numbers.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import { registerStreamHandler } from './routes/streams.js';

const PORT = Number(process.env.PORT || 8080);
const app = express();
const server = http.createServer(app);

// Initialize unified WebSocket server attached to the HTTP server
const wss = new WebSocketServer({ server });

async function bootstrap() {
  console.log('Initializing database connection...');
  const orm = await MikroORM.init(config);

  // Automatically apply any pending migrations on start
  console.log('Running pending database migrations...');
  await orm.getMigrator().up();

  // Register real-time voice streaming audio bridge
  registerStreamHandler(wss, orm.em);

  // Basic Middleware
  app.use(cors({
    origin: '*', // Allow all origins for the MVP/development API
    credentials: true,
  }));
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', async (req, res) => {
    const isDbConnected = await orm.isConnected();
    res.status(200).json({
      status: 'OK',
      timestamp: new Date(),
      database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
    });
  });

  // Register routes
  app.use('/api/auth', createAuthRouter(orm.em));
  app.use('/api/tenants/numbers', createNumbersRouter(orm.em));
  app.use('/api/webhook', createWebhooksRouter(orm.em));

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API Error:', err);
    const status = typeof err.status === 'number' ? err.status : 500;
    const message = status < 500 ? err.message : 'Internal server error occurred.';
    res.status(status).json({ error: message });
  });

  // Start Server
  server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Charlotte Server running on http://localhost:${PORT}`);
    console.log(`🎙️ WebSocket listener active on ws://localhost:${PORT}`);
    console.log(`==================================================`);
  });

  // Graceful Shutdown
  const gracefulShutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async () => {
      console.log('HTTP server stopped.');
      
      // Close database connection
      if (orm) {
        await orm.close(true);
        console.log('Database connection closed.');
      }
      
      console.log('Shutdown complete. Exiting.');
      process.exit(0);
    });

    // Enforce shutdown after timeout
    setTimeout(() => {
      console.error('Graceful shutdown timed out. Force exiting.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('Fatal bootstrapping error:', error);
  process.exit(1);
});
