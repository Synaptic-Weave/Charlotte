import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';

import { WebSocketServer } from 'ws';
import { MikroORM } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';
import { createAuthRouter } from './routes/auth.js';
import { createNumbersRouter } from './routes/numbers.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import { createCallsRouter } from './routes/calls.js';
import { createIntegrationsRouter } from './routes/integrations.js';
import { AuthService } from './services/AuthService.js';
import { NumberService } from './services/NumberService.js';
import { IntegrationService } from './services/IntegrationService.js';
import { registerStreamHandler } from './routes/streams.js';
import { CallSessionService } from './services/CallSessionService.js';
import { VoiceToolService } from './services/VoiceToolService.js';
import { AppointmentService } from './services/AppointmentService.js';
import { CustomerService } from './services/CustomerService.js';

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
  const callSessionSvc = new CallSessionService(orm.em);
  const voiceToolSvc = new VoiceToolService(orm.em);
  const appointmentSvc = new AppointmentService(orm.em);
  const customerSvc = new CustomerService(orm.em);
  registerStreamHandler(wss, callSessionSvc, voiceToolSvc, appointmentSvc, customerSvc);

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
  const authSvc = new AuthService(orm.em);
  const numberSvc = new NumberService(orm.em);
  const integrationSvc = new IntegrationService(orm.em);

  app.use('/api/auth', createAuthRouter(authSvc));
  app.use('/api/tenants/numbers', createNumbersRouter(numberSvc));
  app.use('/api/webhook', createWebhooksRouter(callSessionSvc));
  app.use('/api/tenants/calls', createCallsRouter(callSessionSvc));
  app.use('/api/integrations', createIntegrationsRouter(integrationSvc));

  // Serve static files from the React frontend build folder if it exists
  const frontendDistPath = path.resolve(__dirname, '../frontend/dist');

  app.use(express.static(frontendDistPath));

  // Serve the React index.html for any other requests (client-side routing fallback)
  app.get('*', (req, res, next) => {
    // Let API or webhook requests fall through to 404/handlers
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
      if (err) {
        // Fallback friendly styled page if frontend is not built yet
        res.status(404).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Charlotte Receptionist — Backend Running</title>
            <style>
              body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
                color: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                padding: 20px;
                box-sizing: border-box;
              }
              .card {
                background: rgba(30, 41, 59, 0.7);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 24px;
                padding: 40px;
                max-width: 600px;
                width: 100%;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
                text-align: center;
              }
              h1 {
                background: linear-gradient(to right, #38bdf8, #818cf8);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-top: 0;
                font-size: 2.2rem;
                font-weight: 800;
              }
              p {
                color: #94a3b8;
                font-size: 1.1rem;
                line-height: 1.6;
              }
              .divider {
                height: 1px;
                background: rgba(255, 255, 255, 0.08);
                margin: 24px 0;
              }
              ul {
                text-align: left;
                padding-left: 20px;
                color: #cbd5e1;
                font-size: 1rem;
                line-height: 1.6;
              }
              li {
                margin-bottom: 12px;
              }
              a {
                color: #38bdf8;
                text-decoration: none;
                font-weight: 600;
                transition: color 0.2s ease;
              }
              a:hover {
                color: #818cf8;
                text-decoration: underline;
              }
              code {
                background: rgba(15, 23, 42, 0.6);
                padding: 3px 8px;
                border-radius: 6px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 0.9em;
                color: #f472b6;
                border: 1px solid rgba(255, 255, 255, 0.05);
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>🎙️ Charlotte Backend Active</h1>
              <p>The backend API server is running on port <code>8080</code>, but the production portal build could not be found at <code>frontend/dist</code>.</p>
              <div class="divider"></div>
              <p style="text-align: left; font-weight: 600; color: #f1f5f9; margin-bottom: 8px;">To launch or view the Portal, please choose one:</p>
              <ul>
                <li>⚡ <b>Open the Frontend Dev Server</b>: Start Vite development server by running <code>npm run dev</code> inside the <code>frontend</code> folder, and navigate to <b><a href="http://localhost:5173" target="_blank">http://localhost:5173</a></b> (recommended for active development).</li>
                <li>📦 <b>Compile Production Bundle</b>: Run <code>npm run build</code> in the <code>frontend</code> directory. Once built, the backend will serve the portal directly on this port at <b><a href="/">http://localhost:8080/</a></b>!</li>
              </ul>
            </div>
          </body>
          </html>
        `);
      }
    });
  });

  // Global Error Handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // _next is deliberately unused but required by Express to recognize this as an error handler
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

    // Terminate all active WebSocket connections so their close handlers
    // (which update CallSession state in DB) run before the HTTP server closes.
    wss.clients.forEach((client) => client.terminate());
    wss.close(() => {
      console.log('WebSocket server closed.');
    });

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
