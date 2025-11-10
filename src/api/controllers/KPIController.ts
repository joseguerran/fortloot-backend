import { Request, Response } from 'express';
import { KPIService } from '../../services/KPIService';
import { log } from '../../utils/logger';

export class KPIController {
  /**
   * Get revenue KPIs
   */
  static async getRevenueKPIs(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const kpis = await KPIService.getRevenueKPIs(filters);

      res.json({
        success: true,
        data: kpis,
      });
    } catch (error) {
      log.error('Error getting revenue KPIs:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al obtener KPIs de revenue',
      });
    }
  }

  /**
   * Get product KPIs
   */
  static async getProductKPIs(req: Request, res: Response) {
    try {
      const { startDate, endDate, productType } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (productType) filters.productType = productType as any;

      const kpis = await KPIService.getProductKPIs(filters);

      res.json({
        success: true,
        data: kpis,
      });
    } catch (error) {
      log.error('Error getting product KPIs:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al obtener KPIs de productos',
      });
    }
  }

  /**
   * Get customer KPIs
   */
  static async getCustomerKPIs(req: Request, res: Response) {
    try {
      const { startDate, endDate, customerTier, customerId } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (customerTier) filters.customerTier = customerTier as any;
      if (customerId) filters.customerId = customerId as string;

      const kpis = await KPIService.getCustomerKPIs(filters);

      res.json({
        success: true,
        data: kpis,
      });
    } catch (error) {
      log.error('Error getting customer KPIs:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al obtener KPIs de clientes',
      });
    }
  }

  /**
   * Get tier KPIs
   */
  static async getTierKPIs(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const kpis = await KPIService.getTierKPIs(filters);

      res.json({
        success: true,
        data: kpis,
      });
    } catch (error) {
      log.error('Error getting tier KPIs:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al obtener KPIs de tiers',
      });
    }
  }

  /**
   * Get top products
   */
  static async getTopProducts(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const { startDate, endDate } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const products = await KPIService.getTopProducts(limit, filters);

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      log.error('Error getting top products:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al obtener top productos',
      });
    }
  }

  /**
   * Get top customers
   */
  static async getTopCustomers(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const { startDate, endDate } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const customers = await KPIService.getTopCustomers(limit, filters);

      res.json({
        success: true,
        data: customers,
      });
    } catch (error) {
      log.error('Error getting top customers:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al obtener top clientes',
      });
    }
  }

  /**
   * Get daily revenue trend
   */
  static async getDailyRevenueTrend(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 30;

      const trend = await KPIService.getDailyRevenueTrend(days);

      res.json({
        success: true,
        data: trend,
      });
    } catch (error) {
      log.error('Error getting daily revenue trend:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al obtener tendencia de revenue',
      });
    }
  }
}
