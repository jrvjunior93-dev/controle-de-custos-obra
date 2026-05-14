import React, { useEffect, useMemo, useState } from 'react';
import { Project } from '../types';
import { buildPaidOrderCosts } from '../utils/orderCosts';

interface CostModuleProps {
  project: Project;
}

const COSTS_COLUMN_WIDTHS_KEY = 'csc_brape_paid_order_costs_column_widths';

export const CostModule: React.FC<CostModuleProps> = ({ project }) => {
  const costs = useMemo(() => buildPaidOrderCosts(project), [project]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const defaults = {
      date: 150,
      orderCode: 150,
      description: 260,
      macro: 240,
      status: 140,
      total: 140,
    };
    if (typeof window === 'undefined') return defaults;
    try {
      const saved = window.localStorage.getItem(COSTS_COLUMN_WIDTHS_KEY);
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  });
  const [resizingColumn, setResizingColumn] = useState<{ key: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.max(90, resizingColumn.startWidth + (event.clientX - resizingColumn.startX));
      setColumnWidths((current) => ({ ...current, [resizingColumn.key]: nextWidth }));
    };

    const handleMouseUp = () => setResizingColumn(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COSTS_COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  const formatDate = (value?: string) => (
    value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '--/--/----'
  );

  const getMacroName = (macroItemId?: string) => (
    project.budget.find((macro) => macro.id === macroItemId)?.description || 'Item macro nao vinculado'
  );

  const getOrder = (orderId?: string) => (project.orders || []).find((order) => order.id === orderId);

  const totalExecuted = costs.reduce((total, cost) => total + Number(cost.totalValue || 0), 0);

  const getColumnStyle = (key: string) => ({
    width: `${columnWidths[key] || 140}px`,
    minWidth: `${columnWidths[key] || 140}px`,
  });

  const startColumnResize = (key: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingColumn({
      key,
      startX: event.clientX,
      startWidth: columnWidths[key] || 140,
    });
  };

  const renderColumnHeader = (key: string, label: string, className = '') => (
    <th className={`px-6 py-4 relative ${className}`} style={getColumnStyle(key)}>
      <div className="pr-3">{label}</div>
      <button
        type="button"
        onMouseDown={(event) => startColumnResize(key, event)}
        className="absolute top-0 right-0 h-full w-3 cursor-col-resize group"
        aria-label={`Redimensionar coluna ${label}`}
      >
        <span className="absolute right-1 top-1/2 h-6 w-px -translate-y-1/2 bg-slate-200 group-hover:bg-blue-400" />
      </button>
    </th>
  );

  return (
    <div className="w-full max-w-none mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Custos Executados</h3>
          <p className="text-sm text-slate-500 font-medium">Fonte: pedidos com status setorial PAGO.</p>
        </div>
        <div className="bg-white border border-slate-200 px-5 py-3 text-right">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Executado</p>
          <p className="text-lg font-black text-emerald-700">R$ {formatCurrency(totalExecuted)}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left table-fixed">
            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
              <tr>
                {renderColumnHeader('date', 'Data')}
                {renderColumnHeader('orderCode', 'Pedido')}
                {renderColumnHeader('description', 'Descricao')}
                {renderColumnHeader('macro', 'Item Macro')}
                {renderColumnHeader('status', 'Status')}
                {renderColumnHeader('total', 'Total', 'text-right')}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...costs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((cost) => {
                const order = getOrder(cost.originOrderId);
                return (
                  <tr key={cost.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-black text-slate-500 font-mono" style={getColumnStyle('date')}>
                      {formatDate(cost.date)}
                    </td>
                    <td className="px-6 py-4 text-xs font-black text-slate-800 uppercase whitespace-nowrap" style={getColumnStyle('orderCode')}>
                      {cost.manualOrderCode || '-'}
                    </td>
                    <td className="px-6 py-4" style={getColumnStyle('description')}>
                      <div className="font-black text-slate-800 uppercase text-xs truncate">{cost.description}</div>
                      <div className="text-[10px] font-bold text-slate-400 truncate mt-1">{cost.itemDetail || 'Sem descricao complementar'}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-black text-blue-700 uppercase truncate" style={getColumnStyle('macro')}>
                      {getMacroName(cost.macroItemId)}
                    </td>
                    <td className="px-6 py-4" style={getColumnStyle('status')}>
                      <span className="inline-flex bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-[10px] font-black uppercase tracking-wide">
                        {order?.sectorStatus || 'PAGO'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-900 font-mono text-sm" style={getColumnStyle('total')}>
                      R$ {formatCurrency(cost.totalValue)}
                    </td>
                  </tr>
                );
              })}
              {costs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400 font-bold">
                    Nenhum pedido com status setorial PAGO.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
