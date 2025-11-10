import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { log } from '../../utils/logger';

/**
 * Controller for log management and retrieval
 */
export class LogController {
  /**
   * Get bot error logs
   * GET /api/logs/bot-errors?botId=xxx&limit=50
   */
  async getBotErrors(req: Request, res: Response): Promise<void> {
    try {
      const { botId, limit = '50' } = req.query;
      const maxLines = Math.min(parseInt(limit as string, 10) || 50, 500);

      // Get today's date for log file
      const today = new Date().toISOString().split('T')[0];
      const logDir = path.join(process.cwd(), 'logs');
      const botLogFile = path.join(logDir, `bot-${today}.log`);
      const errorLogFile = path.join(logDir, `error-${today}.log`);

      let errors: Array<{
        timestamp: string;
        level: string;
        botId?: string;
        message: string;
        orderId?: string;
        itemId?: string;
        itemName?: string;
        error?: string;
      }> = [];

      // Read bot log file
      try {
        const botLogContent = await fs.readFile(botLogFile, 'utf-8');
        const botLogLines = botLogContent.split('\n').filter(Boolean);

        // Parse log lines and extract errors
        for (const line of botLogLines) {
          try {
            // Winston JSON format: {"timestamp":"...","level":"error",...}
            const logEntry = JSON.parse(line);

            if (logEntry.level === 'error') {
              // Filter by botId if provided
              if (!botId || logEntry.botId === botId || logEntry.meta?.botId === botId) {
                errors.push({
                  timestamp: logEntry.timestamp,
                  level: logEntry.level,
                  botId: logEntry.botId || logEntry.meta?.botId,
                  message: logEntry.message,
                  orderId: logEntry.orderId || logEntry.meta?.orderId,
                  itemId: logEntry.itemId || logEntry.meta?.itemId,
                  itemName: logEntry.itemName || logEntry.meta?.itemName,
                  error: logEntry.error || logEntry.meta?.error,
                });
              }
            }
          } catch (parseError) {
            // Skip lines that aren't valid JSON
            continue;
          }
        }
      } catch (fileError) {
        // Bot log file might not exist yet
        log.debug('Bot log file not found', { botLogFile });
      }

      // Read error log file
      try {
        const errorLogContent = await fs.readFile(errorLogFile, 'utf-8');
        const errorLogLines = errorLogContent.split('\n').filter(Boolean);

        for (const line of errorLogLines) {
          try {
            const logEntry = JSON.parse(line);

            // Filter by botId if provided
            if (!botId || logEntry.botId === botId || logEntry.meta?.botId === botId) {
              errors.push({
                timestamp: logEntry.timestamp,
                level: logEntry.level,
                botId: logEntry.botId || logEntry.meta?.botId,
                message: logEntry.message,
                orderId: logEntry.orderId || logEntry.meta?.orderId,
                itemId: logEntry.itemId || logEntry.meta?.itemId,
                itemName: logEntry.itemName || logEntry.meta?.itemName,
                error: logEntry.error || logEntry.meta?.error,
              });
            }
          } catch (parseError) {
            continue;
          }
        }
      } catch (fileError) {
        log.debug('Error log file not found', { errorLogFile });
      }

      // Sort by timestamp descending (newest first)
      errors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Limit results
      errors = errors.slice(0, maxLines);

      res.json({
        success: true,
        data: {
          errors,
          total: errors.length,
          botId: botId || 'all',
          date: today,
        },
      });
    } catch (error) {
      log.error('Failed to retrieve bot error logs', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve error logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get bot activity logs
   * GET /api/logs/bot-activity?botId=xxx&limit=100
   */
  async getBotActivity(req: Request, res: Response): Promise<void> {
    try {
      const { botId, limit = '100' } = req.query;
      const maxLines = Math.min(parseInt(limit as string, 10) || 100, 1000);

      const today = new Date().toISOString().split('T')[0];
      const logDir = path.join(process.cwd(), 'logs');
      const botLogFile = path.join(logDir, `bot-${today}.log`);

      let activities: Array<{
        timestamp: string;
        level: string;
        botId?: string;
        message: string;
        meta?: any;
      }> = [];

      try {
        const logContent = await fs.readFile(botLogFile, 'utf-8');
        const logLines = logContent.split('\n').filter(Boolean);

        for (const line of logLines) {
          try {
            const logEntry = JSON.parse(line);

            // Filter by botId if provided
            if (!botId || logEntry.botId === botId || logEntry.meta?.botId === botId) {
              activities.push({
                timestamp: logEntry.timestamp,
                level: logEntry.level,
                botId: logEntry.botId || logEntry.meta?.botId,
                message: logEntry.message,
                meta: logEntry.meta || {},
              });
            }
          } catch (parseError) {
            continue;
          }
        }
      } catch (fileError) {
        log.debug('Bot log file not found', { botLogFile });
      }

      // Sort by timestamp descending
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Limit results
      activities = activities.slice(0, maxLines);

      res.json({
        success: true,
        data: {
          activities,
          total: activities.length,
          botId: botId || 'all',
          date: today,
        },
      });
    } catch (error) {
      log.error('Failed to retrieve bot activity logs', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve activity logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get application logs
   * GET /api/logs/application?level=error&limit=100
   */
  async getApplicationLogs(req: Request, res: Response): Promise<void> {
    try {
      const { level, limit = '100' } = req.query;
      const maxLines = Math.min(parseInt(limit as string, 10) || 100, 1000);

      const today = new Date().toISOString().split('T')[0];
      const logDir = path.join(process.cwd(), 'logs');
      const appLogFile = path.join(logDir, `application-${today}.log`);

      let logs: Array<{
        timestamp: string;
        level: string;
        message: string;
        meta?: any;
      }> = [];

      try {
        const logContent = await fs.readFile(appLogFile, 'utf-8');
        const logLines = logContent.split('\n').filter(Boolean);

        for (const line of logLines) {
          try {
            const logEntry = JSON.parse(line);

            // Filter by level if provided
            if (!level || logEntry.level === level) {
              logs.push({
                timestamp: logEntry.timestamp,
                level: logEntry.level,
                message: logEntry.message,
                meta: logEntry.meta || {},
              });
            }
          } catch (parseError) {
            continue;
          }
        }
      } catch (fileError) {
        log.debug('Application log file not found', { appLogFile });
      }

      // Sort by timestamp descending
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Limit results
      logs = logs.slice(0, maxLines);

      res.json({
        success: true,
        data: {
          logs,
          total: logs.length,
          level: level || 'all',
          date: today,
        },
      });
    } catch (error) {
      log.error('Failed to retrieve application logs', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve application logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const logController = new LogController();
