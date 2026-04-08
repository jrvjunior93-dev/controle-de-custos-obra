import React, { useEffect, useState } from 'react';
import { dbService } from '../apiClient';
import { ProvisioningDashboardData } from '../types';

const formatMoney = (value?: number) => `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ProvisioningDashboard: React.FC = () => {
  const [data, setData] = useState<ProvisioningDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const result = await dbService.getProvisioningDashboard();
        setData(result);
      } catch (error) {
        console.error(error);
        alert('Nao foi possivel carregar o dashboard de provisionamento.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return <div className="p-10 text-[10px] font-black uppercase tracking-widest text-slate-400">Carregando dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      <div className="bg-white border border-slate-200 shadow-sm p-8">
        <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Dashboard Provisionamento</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">Visão consolidada das provisoes financeiras.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="bg-white border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total de Registros</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{data?.totalRecords || 0}</p>
        </div>
        <div className="bg-white border border-slate-200 shadow-sm p-6 xl:col-span-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor Total Previsto</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{formatMoney(data?.totalForecastValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Por Status</h3>
          <div className="space-y-3">
            {(data?.byStatus || []).map((item) => (
              <div key={item.status} className="flex items-center justify-between border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-xs font-black uppercase text-slate-800">{item.status.replaceAll('_', ' ')}</p>
                  <p className="text-[10px] font-bold uppercase text-slate-400 mt-1">{item.count} registro(s)</p>
                </div>
                <p className="text-xs font-black uppercase text-slate-800">{formatMoney(item.totalValue)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Por Obra</h3>
          <div className="space-y-3 max-h-[26rem] overflow-y-auto">
            {(data?.byProject || []).map((item) => (
              <div key={item.projectId} className="flex items-center justify-between border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-xs font-black uppercase text-slate-800">{item.projectName}</p>
                  <p className="text-[10px] font-bold uppercase text-slate-400 mt-1">{item.count} registro(s)</p>
                </div>
                <p className="text-xs font-black uppercase text-slate-800">{formatMoney(item.totalValue)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Proximas Provisoes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.upcoming || []).map((item) => (
            <div key={item.id} className="border border-slate-100 bg-slate-50 p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.code}</p>
              <p className="text-sm font-black uppercase text-slate-900">{item.title}</p>
              <p className="text-[10px] font-bold uppercase text-slate-500">{item.projectName}</p>
              <div className="flex items-center justify-between gap-4 pt-2">
                <span className="text-[10px] font-black uppercase text-slate-500">{item.status.replaceAll('_', ' ')}</span>
                <span className="text-xs font-black uppercase text-slate-900">{formatMoney(item.forecastValue)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
