
import React from 'react';
import { Project } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

interface ConsolidationModuleProps {
  project: Project;
}

export const ConsolidationModule: React.FC<ConsolidationModuleProps> = ({ project }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const data = project.budget.map(item => {
    const executed = project.costs
      .filter(c => c.macroItemId === item.id)
      .reduce((sum, c) => sum + c.totalValue, 0);
    
    return {
      name: item.description,
      orçado: item.budgetedValue,
      executado: executed,
      diferenca: item.budgetedValue - executed
    };
  });

  const totalOrçado = project.budget.reduce((a, b) => a + b.budgetedValue, 0);
  const totalExecutado = project.costs.reduce((a, b) => a + b.totalValue, 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-none">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 rounded-none">
        <div className="bg-white p-6 rounded-none shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Investimento Total</p>
          <p className="text-2xl font-bold text-slate-800">R$ {formatCurrency(totalOrçado)}</p>
        </div>
        <div className="bg-white p-6 rounded-none shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Custo Executado</p>
          <p className="text-2xl font-bold text-blue-600">R$ {formatCurrency(totalExecutado)}</p>
        </div>
        <div className="bg-white p-6 rounded-none shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Diferença/Saldo</p>
          <p className={`text-2xl font-bold ${totalOrçado - totalExecutado >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            R$ {formatCurrency(totalOrçado - totalExecutado)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-none shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Eficiência</p>
          <div className="flex items-end gap-2 rounded-none">
            <p className="text-2xl font-bold text-slate-800">{(totalOrçado > 0 ? (totalExecutado/totalOrçado)*100 : 0).toFixed(1)}%</p>
            <span className="text-xs text-slate-400 mb-1">do orçamento</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 rounded-none">
        <div className="lg:col-span-2 bg-white p-6 rounded-none shadow-sm border border-slate-200 h-[400px] min-w-0">
          <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
            <i className="fas fa-chart-simple text-blue-500"></i>
            Comparativo Orçado vs Executado por Categoria
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} layout="vertical" margin={{ left: 40, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} style={{ fontSize: '11px', fontWeight: 'bold', fill: '#64748b' }} />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '0px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px' }}
                formatter={(value: number) => [`R$ ${formatCurrency(value)}`]}
              />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 'bold' }} />
              <Bar dataKey="orçado" name="Valor Orçado" fill="#e2e8f0" radius={0} barSize={12} />
              <Bar dataKey="executado" name="Valor Executado" fill="#2563eb" radius={0} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-none shadow-sm border border-slate-200 overflow-y-auto">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <i className="fas fa-list-ol text-blue-500"></i>
            Status dos Itens Macro
          </h3>
          <div className="space-y-4 rounded-none">
            {data.map((item, idx) => (
              <div key={idx} className="space-y-1.5 rounded-none">
                <div className="flex justify-between text-xs font-bold text-slate-600 rounded-none">
                  <span className="truncate max-w-[150px] uppercase">{item.name}</span>
                  <span className={item.executado > item.orçado ? 'text-rose-600' : 'text-blue-600'}>
                    {((item.executado / (item.orçado || 1)) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-none overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-700 rounded-none ${item.executado > item.orçado ? 'bg-rose-500' : 'bg-blue-600'}`}
                    style={{ width: `${Math.min(100, (item.executado / (item.orçado || 1)) * 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono rounded-none">
                  <span>ORÇ: R$ {formatCurrency(item.orçado)}</span>
                  <span>EXEC: R$ {formatCurrency(item.executado)}</span>
                </div>
              </div>
            ))}
            {data.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Defina o orçamento para ver a análise.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

