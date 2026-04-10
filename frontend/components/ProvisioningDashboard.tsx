import React, { useEffect, useMemo, useState } from 'react';
import { dbService } from '../apiClient';
import { ProvisioningContext, ProvisioningDashboardData, ProvisioningRecord, ProvisioningStatus } from '../types';

const formatMoney = (value?: number) => `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'PREVISTO', label: 'Previsto' },
  { value: 'EM_ANALISE', label: 'Em analise' },
  { value: 'APROVADO', label: 'Aprovado' },
  { value: 'CANCELADO', label: 'Cancelado' },
  { value: 'REALIZADO', label: 'Realizado' },
];

const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas as prioridades' },
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'CRITICA', label: 'Critica' },
];

const statusBadgeClass = (status: ProvisioningStatus) => {
  switch (status) {
    case 'PREVISTO':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'EM_ANALISE':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'APROVADO':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'CANCELADO':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'REALIZADO':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

const priorityBadgeClass = (priority?: string) => {
  switch (String(priority || '').toUpperCase()) {
    case 'CRITICA':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'ALTA':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'MEDIA':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'BAIXA':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-slate-50 text-slate-500 border-slate-200';
  }
};

const formatPriority = (priority?: string) => String(priority || '').trim().toUpperCase() || 'SEM PRIORIDADE';

export const ProvisioningDashboard: React.FC = () => {
  const [context, setContext] = useState<ProvisioningContext | null>(null);
  const [data, setData] = useState<ProvisioningDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ projectId: '', status: '', priority: '' });

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [contextData, result] = await Promise.all([
          dbService.getProvisioningContext(),
          dbService.getProvisioningDashboard(filters),
        ]);
        setContext(contextData);
        setData(result);
      } catch (error) {
        console.error(error);
        alert('Nao foi possivel carregar o dashboard de provisionamento.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [filters.projectId, filters.priority, filters.status]);

  const leaderProject = useMemo(
    () => [...(data?.byProject || [])].sort((a, b) => b.totalValue - a.totalValue)[0],
    [data]
  );

  const leaderStatus = useMemo(
    () => [...(data?.byStatus || [])].sort((a, b) => b.totalValue - a.totalValue)[0],
    [data]
  );

  const criticalUpcomingCount = useMemo(
    () => (data?.upcoming || []).filter((item) => String(item.priority || '').toUpperCase() === 'CRITICA').length,
    [data]
  );

  if (loading) {
    return <div className="p-10 text-[10px] font-black uppercase tracking-widest text-slate-400">Carregando dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      <section className="bg-white border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600">Provisionamento Financeiro</p>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Dashboard Provisionamento</h2>
            <p className="max-w-3xl text-sm text-slate-500">
              Leitura gerencial do provisionamento para apoiar priorizacao, distribuicao de caixa e concentracao por obra.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 xl:min-w-[42rem]">
            <select
              value={filters.projectId}
              onChange={(e) => setFilters((current) => ({ ...current, projectId: e.target.value }))}
              className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500"
            >
              <option value="">Todas as obras</option>
              {(context?.projectOptions || []).map((project) => (
                <option key={project.id} value={project.id}>{project.code} - {project.name}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
              className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'EMPTY'} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={filters.priority}
              onChange={(e) => setFilters((current) => ({ ...current, priority: e.target.value }))}
              className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value || 'EMPTY'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="border border-blue-100 bg-blue-50 p-6 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Exposicao do recorte</p>
            <p className="text-4xl font-black text-slate-900">{formatMoney(data?.totalForecastValue)}</p>
            <p className="text-sm text-slate-600">
              {leaderProject
                ? `${leaderProject.projectName} lidera o recorte com ${formatMoney(leaderProject.totalValue)}.`
                : 'Sem concentracao relevante no recorte atual.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registros</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{data?.totalRecords || 0}</p>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status Lider</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{leaderStatus?.status?.replaceAll('_', ' ') || '-'}</p>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Criticas proximas</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{criticalUpcomingCount}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className="bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Pipeline por Status</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Leitura de volume e valor por etapa.</p>
            </div>
          </div>

          {(data?.byStatus || []).length === 0 ? (
            <div className="border border-slate-200 bg-slate-50 px-4 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Sem dados para o recorte atual.
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.byStatus || []).map((item) => (
                <div key={item.status} className="border border-slate-100 bg-slate-50 px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className={`inline-flex px-3 py-1 border text-[9px] font-black uppercase ${statusBadgeClass(item.status)}`}>
                      {item.status.replaceAll('_', ' ')}
                    </span>
                    <span className="text-xs font-black uppercase text-slate-900">{formatMoney(item.totalValue)}</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.count} registro(s)</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Concentracao por Obra</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Obras com maior carga financeira no recorte.</p>
          </div>

          {(data?.byProject || []).length === 0 ? (
            <div className="border border-slate-200 bg-slate-50 px-4 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Nenhuma obra encontrada.
            </div>
          ) : (
            <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
              {(data?.byProject || []).map((item) => (
                <div key={item.projectId} className="border border-slate-100 bg-slate-50 px-4 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">{item.projectName}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{item.count} registro(s)</p>
                  </div>
                  <p className="text-xs font-black uppercase text-slate-900">{formatMoney(item.totalValue)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Proximas Provisoes</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Registros mais proximos da data prevista de desembolso.</p>
        </div>

        {(data?.upcoming || []).length === 0 ? (
          <div className="border border-slate-200 bg-slate-50 px-4 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Nenhuma provisao encontrada.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(data?.upcoming || []).map((item: ProvisioningRecord) => (
              <article key={item.id} className="border border-slate-100 bg-slate-50 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.code}</p>
                    <h4 className="text-lg font-black uppercase tracking-tight text-slate-900">{item.itemMacro}</h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.projectName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`inline-flex px-3 py-1 border text-[9px] font-black uppercase ${statusBadgeClass(item.status)}`}>
                      {item.status.replaceAll('_', ' ')}
                    </span>
                    <span className={`inline-flex px-3 py-1 border text-[9px] font-black uppercase ${priorityBadgeClass(item.priority)}`}>
                      {formatPriority(item.priority)}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-white bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Prevista</p>
                    <p className="mt-2 text-xs font-black uppercase text-slate-900">{formatDate(item.dueDate)}</p>
                  </div>
                  <div className="border border-white bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor</p>
                    <p className="mt-2 text-xs font-black uppercase text-slate-900">{formatMoney(item.forecastValue)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
