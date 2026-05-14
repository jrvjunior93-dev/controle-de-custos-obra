import { ExecutedCost, Order, Project } from '../types';

const normalizeStatus = (value?: string) => String(value || '').trim().toUpperCase();

export const isPaidOrder = (order: Order) => normalizeStatus(order.sectorStatus) === 'PAGO';

export const buildPaidOrderCosts = (project: Project): ExecutedCost[] => (
  (project.orders || [])
    .filter(isPaidOrder)
    .map((order) => ({
      id: `order-cost-${order.id}`,
      macroItemId: order.macroItemId || '',
      description: order.title,
      itemDetail: order.description,
      manualOrderCode: order.orderCode,
      unit: 'un',
      quantity: 1,
      unitValue: Number(order.value || 0),
      totalValue: Number(order.value || 0),
      date: order.expectedDate || order.createdAt?.slice(0, 10) || '',
      entryDate: order.createdAt?.slice(0, 10) || order.expectedDate || '',
      attachments: order.attachments || [],
      originOrderId: order.id,
    }))
);

export const getPaidOrderExecutedTotal = (project: Project) => (
  buildPaidOrderCosts(project).reduce((total, cost) => total + Number(cost.totalValue || 0), 0)
);
