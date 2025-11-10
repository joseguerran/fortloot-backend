import { Router } from 'express';
import { logController } from '../controllers/LogController';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * Log routes
 * All routes require authentication
 */

// Get bot error logs
router.get('/bot-errors', authenticate, (req, res) =>
  logController.getBotErrors(req, res)
);

// Get bot activity logs
router.get('/bot-activity', authenticate, (req, res) =>
  logController.getBotActivity(req, res)
);

// Get application logs
router.get('/application', authenticate, (req, res) =>
  logController.getApplicationLogs(req, res)
);

export default router;
