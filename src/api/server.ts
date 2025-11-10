import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from '../config';
import { log } from '../utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';
import { FileManagementService } from '../services/FileManagementService';

/**
 * Create and configure Express server
 */
export const createServer = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS - Allow admin dashboard
  const allowedOrigins = config.server.isDevelopment
    ? ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001']
    : []; // Configure specific origins in production

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        if (config.server.isDevelopment || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging in development
  if (config.server.isDevelopment) {
    app.use((req, _res, next) => {
      log.debug(`${req.method} ${req.path}`, {
        query: req.query,
        body: req.body,
      });
      next();
    });
  }

  // Serve static files (payment proofs, etc.)
  const uploadsPath = path.join(process.cwd(), FileManagementService.getUploadDir());
  app.use('/uploads', express.static(uploadsPath));
  log.info(`Serving static files from: ${uploadsPath}`);

  // Mount API routes
  app.use('/api', routes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'Fortloot Bot API',
      version: '1.0.0',
      status: 'running',
      environment: config.server.env,
      endpoints: {
        health: '/api/health',
        orders: '/api/orders',
        bots: '/api/bots',
        analytics: '/api/analytics',
      },
    });
  });

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

/**
 * Start the server
 */
export const startServer = async (app: Application): Promise<void> => {
  return new Promise((resolve) => {
    app.listen(config.server.port, () => {
      log.system.startup({
        port: config.server.port,
        env: config.server.env,
      });
      resolve();
    });
  });
};
