import { prisma } from '../database/client';
import { CustomerTier, ProductType } from '@prisma/client';
import { log } from '../utils/logger';

export interface KPIFilters {
  startDate?: Date;
  endDate?: Date;
  productType?: ProductType;
  customerTier?: CustomerTier;
  customerId?: string;
}

export interface RevenueKPI {
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  averageOrderValue: number;
  profitMargin: number;
}

export interface ProductKPI {
  productType: ProductType;
  totalSales: number;
  revenue: number;
  profit: number;
  orderCount: number;
  averagePrice: number;
}

export interface CustomerKPI {
  customerId: string;
  epicAccountId: string;
  email: string;
  tier: CustomerTier;
  totalOrders: number;
  totalRevenue: number;
  totalProfit: number;
  lifetimeValue: number;
  averageOrderValue: number;
  lastOrderDate?: Date;
}

export interface TierKPI {
  tier: CustomerTier;
  customerCount: number;
  totalOrders: number;
  totalRevenue: number;
  totalProfit: number;
  averageOrderValue: number;
  averageLifetimeValue: number;
}

export class KPIService {
  /**
   * Calculate overall revenue KPIs
   */
  static async getRevenueKPIs(filters: KPIFilters = {}): Promise<RevenueKPI> {
    const where: any = {
      status: { in: ['COMPLETED', 'PAYMENT_VERIFIED'] },
    };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const orders = await prisma.order.findMany({
      where,
      select: {
        finalPrice: true,
        profitAmount: true,
      },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + (o.finalPrice || 0), 0);
    const totalProfit = orders.reduce((sum, o) => sum + (o.profitAmount || 0), 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalOrders,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
    };
  }

  /**
   * Get KPIs by product type
   */
  static async getProductKPIs(filters: KPIFilters = {}): Promise<ProductKPI[]> {
    const where: any = {
      status: { in: ['COMPLETED', 'PAYMENT_VERIFIED'] },
    };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    if (filters.productType) {
      where.productType = filters.productType;
    }

    const orders = await prisma.order.findMany({
      where,
      select: {
        productType: true,
        finalPrice: true,
        profitAmount: true,
      },
    });

    // Group by product type
    const productMap = new Map<ProductType, { revenue: number; profit: number; count: number }>();

    for (const order of orders) {
      const type = order.productType;
      const current = productMap.get(type) || { revenue: 0, profit: 0, count: 0 };

      productMap.set(type, {
        revenue: current.revenue + (order.finalPrice || 0),
        profit: current.profit + (order.profitAmount || 0),
        count: current.count + 1,
      });
    }

    // Convert to array
    const result: ProductKPI[] = [];
    for (const [productType, data] of productMap.entries()) {
      result.push({
        productType,
        totalSales: data.count,
        revenue: Math.round(data.revenue * 100) / 100,
        profit: Math.round(data.profit * 100) / 100,
        orderCount: data.count,
        averagePrice: Math.round((data.revenue / data.count) * 100) / 100,
      });
    }

    return result.sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Get KPIs by customer
   */
  static async getCustomerKPIs(filters: KPIFilters = {}): Promise<CustomerKPI[]> {
    const where: any = {};

    if (filters.customerTier) {
      where.tier = filters.customerTier;
    }

    if (filters.customerId) {
      where.id = filters.customerId;
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        orders: {
          where: {
            status: { in: ['COMPLETED', 'PAYMENT_VERIFIED'] },
            ...(filters.startDate || filters.endDate
              ? {
                  createdAt: {
                    ...(filters.startDate && { gte: filters.startDate }),
                    ...(filters.endDate && { lte: filters.endDate }),
                  },
                }
              : {}),
          },
          select: {
            finalPrice: true,
            profitAmount: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    return customers.map((customer) => {
      const orders = customer.orders;
      const totalRevenue = orders.reduce((sum, o) => sum + (o.finalPrice || 0), 0);
      const totalProfit = orders.reduce((sum, o) => sum + (o.profitAmount || 0), 0);
      const totalOrders = orders.length;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const lastOrderDate = orders.length > 0 ? orders[0].createdAt : undefined;

      return {
        customerId: customer.id,
        epicAccountId: customer.epicAccountId,
        email: customer.email,
        tier: customer.tier,
        totalOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        lifetimeValue: Math.round(customer.lifetimeValue * 100) / 100,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        lastOrderDate,
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  /**
   * Get KPIs by customer tier
   */
  static async getTierKPIs(filters: KPIFilters = {}): Promise<TierKPI[]> {
    const tiers: CustomerTier[] = ['REGULAR', 'VIP', 'PREMIUM'];
    const result: TierKPI[] = [];

    for (const tier of tiers) {
      const customers = await prisma.customer.findMany({
        where: { tier },
        include: {
          orders: {
            where: {
              status: { in: ['COMPLETED', 'PAYMENT_VERIFIED'] },
              ...(filters.startDate || filters.endDate
                ? {
                    createdAt: {
                      ...(filters.startDate && { gte: filters.startDate }),
                      ...(filters.endDate && { lte: filters.endDate }),
                    },
                  }
                : {}),
            },
            select: {
              finalPrice: true,
              profitAmount: true,
            },
          },
        },
      });

      const customerCount = customers.length;
      let totalOrders = 0;
      let totalRevenue = 0;
      let totalProfit = 0;
      let totalLifetimeValue = 0;

      for (const customer of customers) {
        totalOrders += customer.orders.length;
        totalRevenue += customer.orders.reduce((sum, o) => sum + (o.finalPrice || 0), 0);
        totalProfit += customer.orders.reduce((sum, o) => sum + (o.profitAmount || 0), 0);
        totalLifetimeValue += customer.lifetimeValue;
      }

      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const averageLifetimeValue = customerCount > 0 ? totalLifetimeValue / customerCount : 0;

      result.push({
        tier,
        customerCount,
        totalOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        averageLifetimeValue: Math.round(averageLifetimeValue * 100) / 100,
      });
    }

    return result;
  }

  /**
   * Get top selling products
   */
  static async getTopProducts(limit: number = 10, filters: KPIFilters = {}): Promise<any[]> {
    const where: any = {
      status: { in: ['COMPLETED', 'PAYMENT_VERIFIED'] },
    };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const orders = await prisma.order.findMany({
      where,
      select: {
        productId: true,
        productName: true,
        productType: true,
        finalPrice: true,
        profitAmount: true,
      },
    });

    // Group by product
    const productMap = new Map<string, any>();

    for (const order of orders) {
      const key = order.productId || order.productName;
      if (!key) continue;

      const current = productMap.get(key) || {
        productId: order.productId,
        productName: order.productName,
        productType: order.productType,
        salesCount: 0,
        revenue: 0,
        profit: 0,
      };

      productMap.set(key, {
        ...current,
        salesCount: current.salesCount + 1,
        revenue: current.revenue + (order.finalPrice || 0),
        profit: current.profit + (order.profitAmount || 0),
      });
    }

    // Convert to array and sort
    const products = Array.from(productMap.values())
      .map((p) => ({
        ...p,
        revenue: Math.round(p.revenue * 100) / 100,
        profit: Math.round(p.profit * 100) / 100,
        averagePrice: Math.round((p.revenue / p.salesCount) * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return products.slice(0, limit);
  }

  /**
   * Get top customers
   */
  static async getTopCustomers(limit: number = 10, filters: KPIFilters = {}): Promise<any[]> {
    const customers = await this.getCustomerKPIs(filters);
    return customers.slice(0, limit);
  }

  /**
   * Get daily revenue trend
   */
  static async getDailyRevenueTrend(days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['COMPLETED', 'PAYMENT_VERIFIED'] },
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        finalPrice: true,
        profitAmount: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by day
    const dailyMap = new Map<string, { revenue: number; profit: number; orders: number }>();

    for (const order of orders) {
      const date = order.createdAt.toISOString().split('T')[0];
      const current = dailyMap.get(date) || { revenue: 0, profit: 0, orders: 0 };

      dailyMap.set(date, {
        revenue: current.revenue + (order.finalPrice || 0),
        profit: current.profit + (order.profitAmount || 0),
        orders: current.orders + 1,
      });
    }

    // Convert to array
    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        revenue: Math.round(data.revenue * 100) / 100,
        profit: Math.round(data.profit * 100) / 100,
        orders: data.orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Store business metrics snapshot
   */
  static async storeMetricsSnapshot(): Promise<void> {
    try {
      const revenueKPIs = await this.getRevenueKPIs();
      const productKPIs = await this.getProductKPIs();
      const tierKPIs = await this.getTierKPIs();

      // Store overall metrics
      await prisma.businessMetric.create({
        data: {
          date: new Date(),
          revenue: revenueKPIs.totalRevenue,
          profit: revenueKPIs.totalProfit,
          orderCount: revenueKPIs.totalOrders,
          avgOrderValue: revenueKPIs.averageOrderValue,
        },
      });

      // Store product metrics
      for (const product of productKPIs) {
        await prisma.businessMetric.create({
          data: {
            date: new Date(),
            productType: product.productType,
            revenue: product.revenue,
            profit: product.profit,
            orderCount: product.orderCount,
            avgOrderValue: product.averagePrice,
          },
        });
      }

      // Store tier metrics
      for (const tier of tierKPIs) {
        await prisma.businessMetric.create({
          data: {
            date: new Date(),
            customerTier: tier.tier,
            revenue: tier.totalRevenue,
            profit: tier.totalProfit,
            orderCount: tier.totalOrders,
            avgOrderValue: tier.averageOrderValue,
          },
        });
      }

      log.info('Business metrics snapshot stored successfully');
    } catch (error) {
      log.error('Error storing metrics snapshot:', error);
      throw error;
    }
  }
}
