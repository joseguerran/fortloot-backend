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
    : config.cors.allowedOrigins;

  // Create regex for allowed domain if configured
  const allowedDomainRegex = config.cors.allowedDomain
    ? new RegExp(`^https?:\\/\\/([a-z0-9-]+\\.)?${config.cors.allowedDomain.replace('.', '\\.')}$`, 'i')
    : null;

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // Development mode - allow all localhost origins
        if (config.server.isDevelopment) {
          return callback(null, true);
        }

        // Check explicit allowed origins list
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Check wildcard domain pattern
        if (allowedDomainRegex && allowedDomainRegex.test(origin)) {
          return callback(null, true);
        }

        // Reject
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use((req, _res, next) => {
    if (config.server.isDevelopment) {
      // Development: log completo con query y body
      log.debug(`${req.method} ${req.path}`, {
        query: req.query,
        body: req.body,
      });
    } else {
      // Production: solo método, path y origen
      log.info(`${req.method} ${req.path}`, {
        origin: req.get('origin') || req.get('referer'),
      });
    }
    next();
  });

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
