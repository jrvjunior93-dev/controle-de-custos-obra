import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Project, User, isGlobalAdmin, isProjectAdmin } from '../types';

interface ProjectDetailProps {
  project: Project;
  user: User;
  onUpdate: (p: Project) => void;
  onBack: () => void;
}

type Tab = 'RESUMO' | 'ORCAMENTO' | 'CUSTOS' | 'PARCELAMENTOS' | 'PEDIDOS' | 'ARQUIVOS' | 'RELATORIOS';
type ReportMode = 'PAGO' | 'A_PAGAR' | 'PEDIDOS' | 'CUSTO';
type ExportStatus = 'IDLE' | 'GENERATING' | 'SUCCESS' | 'ERROR';

const BudgetModule = lazy(() => import('./BudgetModule').then((module) => ({ default: module.BudgetModule })));
const CostModule = lazy(() => import('./CostModule').then((module) => ({ default: module.CostModule })));
const ConsolidationModule = lazy(() => import('./ConsolidationModule').then((module) => ({ default: module.ConsolidationModule })));
const InstallmentsModule = lazy(() => import('./InstallmentsModule').then((module) => ({ default: module.InstallmentsModule })));
const AttachmentsModule = lazy(() => import('./AttachmentsModule').then((module) => ({ default: module.AttachmentsModule })));
const OrdersModule = lazy(() => import('./OrdersModule').then((module) => ({ default: module.OrdersModule })));

const TabFallback: React.FC = () => (
  <div className="bg-white border border-slate-200 shadow-sm p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
    Carregando aba...
  </div>
);

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, user, onUpdate, onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('RESUMO');
  const [reportMode, setReportMode] = useState<ReportMode>('CUSTO');
  const [exportStatus, setExportStatus] = useState<ExportStatus>('IDLE');
  const budgetDraftStorageKey = useMemo(() => `csc_brape_budget_draft_${project.id}`, [project.id]);
  const [budgetDraft, setBudgetDraft] = useState(project.budget || []);
  const canManageProject = isGlobalAdmin(user.role) || (isProjectAdmin(user.role) && user.assignedProjectIds?.includes(project.id));
  const canAccessFullProjectTabs = user.role !== 'ADMIN_OBRA';

  useEffect(() => {
    const savedDraft = sessionStorage.getItem(budgetDraftStorageKey);
    if (!savedDraft) {
      setBudgetDraft(project.budget || []);
      return;
    }

    try {
      setBudgetDraft(JSON.parse(savedDraft));
    } catch {
      sessionStorage.removeItem(budgetDraftStorageKey);
      setBudgetDraft(project.budget || []);
    }
  }, [budgetDraftStorageKey, project.id]);

  useEffect(() => {
    sessionStorage.setItem(budgetDraftStorageKey, JSON.stringify(budgetDraft));
  }, [budgetDraft, budgetDraftStorageKey]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

  const currentBudget = budgetDraft;
  const totalBudgeted = currentBudget.reduce((sum, item) => sum + item.budgetedValue, 0);
  const paidCosts = project.costs || [];
  const pendingInstallments = (project.installments || []).filter((installment) => installment.status === 'PENDING');
  const activeOrdersWithValue = (project.orders || []).filter((order) => (order.value || 0) > 0 && order.status !== 'CONCLUIDO' && order.status !== 'CANCELADO');
  const totalExecuted = paidCosts.reduce((sum, item) => sum + item.totalValue, 0);
  const totalToPay = pendingInstallments.reduce((sum, installment) => sum + installment.value, 0);
  const totalRequested = activeOrdersWithValue.reduce((sum, order) => sum + Number(order.value || 0), 0);
  const totalProjected = totalExecuted + totalToPay + totalRequested;
  const projectedBalance = totalBudgeted - totalProjected;

  const macroCostSummary = currentBudget.map((item) => {
    const pedidos = activeOrdersWithValue.filter((order) => order.macroItemId === item.id).reduce((sum, order) => sum + Number(order.value || 0), 0);
    const aPagar = pendingInstallments.filter((installment) => installment.macroItemId === item.id).reduce((sum, installment) => sum + installment.value, 0);
    const pago = paidCosts.filter((cost) => cost.macroItemId === item.id).reduce((sum, cost) => sum + cost.totalValue, 0);

    return {
      id: item.id,
      description: item.description,
      pedidos,
      aPagar,
      pago,
      custo: pedidos + aPagar + pago
    };
  });

  const handleExportPDF = async () => {
    const element = document.getElementById('technical-dossier-pdf');
    const { default: html2pdf } = await import('html2pdf.js');
    const h2p = html2pdf as any;
    if (!element || !h2p) return alert('Erro no motor de PDF.');

    setExportStatus('GENERATING');
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `RELATORIO_${project.name.toUpperCase().replace(/\s+/g, '_')}_${reportMode}.pdf`,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 2, useCORS: true, windowWidth: 1000 },
      jsPDF: { unit: 'mm', format: 'a3', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await h2p().set(opt).from(element).save();
      setExportStatus('SUCCESS');
      setTimeout(() => setExportStatus('IDLE'), 3000);
    } catch {
      setExportStatus('ERROR');
      alert('Erro na exportação.');
    }
  };

  const availableTabs: { id: Tab; label: string; icon: string }[] = canAccessFullProjectTabs
    ? [
        { id: 'RESUMO', label: 'Dashboard', icon: 'chart-pie' },
        { id: 'ORCAMENTO', label: 'Orçamento', icon: 'clipboard-list' },
        { id: 'CUSTOS', label: 'Custos', icon: 'receipt' },
        { id: 'PARCELAMENTOS', label: 'Parcelas', icon: 'file-invoice-dollar' },
        { id: 'PEDIDOS', label: 'Pedidos', icon: 'shopping-cart' },
        { id: 'ARQUIVOS', label: 'Arquivos', icon: 'folder-open' },
        { id: 'RELATORIOS', label: 'Relatório Final', icon: 'file-pdf' }
      ]
    : [
        { id: 'RESUMO', label: 'Dashboard', icon: 'chart-pie' },
        { id: 'ARQUIVOS', label: 'Arquivos', icon: 'folder-open' },
        { id: 'RELATORIOS', label: 'Relatório Final', icon: 'file-pdf' }
      ];

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('RESUMO');
    }
  }, [activeTab, availableTabs]);

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-none">
      <div className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm no-print rounded-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-700 transition-colors"><i className="fas fa-arrow-left text-lg"></i></button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{project.name}</h2>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                <span><i className="fas fa-map-marker-alt mr-1"></i> {project.location}</span>
              </div>
            </div>
          </div>

          {canManageProject && (
            <div className="flex items-center gap-6 bg-slate-50 p-3 rounded-none border border-slate-200">
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Custo Pago</p>
                <p className="text-lg font-black text-slate-800">R$ {formatCurrency(totalExecuted)}</p>
              </div>
              <div className="h-10 w-px bg-slate-200"></div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Saldo Projetado</p>
                <p className={projectedBalance >= 0 ? 'text-lg font-black text-emerald-600' : 'text-lg font-black text-rose-600'}>R$ {formatCurrency(projectedBalance)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-8 mt-6 -mb-4 overflow-x-auto">
          {availableTabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 pb-4 px-1 text-[11px] uppercase font-black relative ${activeTab === tab.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <i className={`fas fa-${tab.icon}`}></i> {tab.label}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-none"></div>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto rounded-none">
        <div className="no-print">
          {activeTab === 'RESUMO' && <ConsolidationModule project={project} />}
          {canAccessFullProjectTabs && activeTab === 'ORCAMENTO' && <BudgetModule budget={currentBudget} onDraftChange={setBudgetDraft} draftKey={budgetDraftStorageKey} onSave={(budget) => { setBudgetDraft(budget); onUpdate({ ...project, budget }); }} />}
          {canAccessFullProjectTabs && activeTab === 'CUSTOS' && <CostModule project={project} onSave={(costs) => onUpdate({ ...project, costs })} />}
          {canAccessFullProjectTabs && activeTab === 'PARCELAMENTOS' && <InstallmentsModule project={project} onUpdate={onUpdate} />}
          {canAccessFullProjectTabs && activeTab === 'PEDIDOS' && <OrdersModule project={project} user={user} onUpdate={onUpdate} />}
          {activeTab === 'ARQUIVOS' && <AttachmentsModule project={project} onUpdate={onUpdate} isAdmin={canManageProject} />}
        </div>

        {activeTab === 'RELATORIOS' && (
          <div className="max-w-[1000px] mx-auto space-y-8 no-print rounded-none">
            <div className="bg-white p-6 rounded-none border border-slate-200 shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h3 className="text-2xl font-black uppercase">Relatório Final</h3>
                <button onClick={handleExportPDF} className="bg-slate-900 text-white px-8 py-3 font-black uppercase text-xs">
                  {exportStatus === 'GENERATING' ? 'Gerando PDF...' : 'Exportar PDF'}
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto">
                <button onClick={() => setReportMode('A_PAGAR')} className={`px-4 py-2 text-[11px] font-black uppercase border ${reportMode === 'A_PAGAR' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-500 border-slate-200'}`}>A pagar</button>
                <button onClick={() => setReportMode('PAGO')} className={`px-4 py-2 text-[11px] font-black uppercase border ${reportMode === 'PAGO' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200'}`}>Pago</button>
                <button onClick={() => setReportMode('PEDIDOS')} className={`px-4 py-2 text-[11px] font-black uppercase border ${reportMode === 'PEDIDOS' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}>Pedidos</button>
                <button onClick={() => setReportMode('CUSTO')} className={`px-4 py-2 text-[11px] font-black uppercase border ${reportMode === 'CUSTO' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}>Custo</button>
              </div>
            </div>

            <div id="technical-dossier-pdf" className="bg-white p-6 rounded-none border border-slate-200 shadow-sm space-y-6">
              {reportMode === 'A_PAGAR' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-lg font-black uppercase text-amber-600">A pagar</h4>
                    <p className="text-sm font-black text-slate-700">Total: R$ {formatCurrency(totalToPay)}</p>
                  </div>
                  <div className="overflow-x-auto border border-slate-100">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr className="text-[10px] uppercase font-black text-slate-500">
                          <th className="px-4 py-3">Fornecedor</th>
                          <th className="px-4 py-3">Descrição</th>
                          <th className="px-4 py-3">Vencimento</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingInstallments.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400 font-bold">Nenhum custo pendente de pagamento.</td></tr>}
                        {pendingInstallments.map((installment) => (
                          <tr key={installment.id} className="border-t border-slate-100 text-sm">
                            <td className="px-4 py-3 font-bold text-slate-700">{installment.provider}</td>
                            <td className="px-4 py-3 text-slate-600">{installment.description}</td>
                            <td className="px-4 py-3 text-slate-600">{installment.dueDate}</td>
                            <td className="px-4 py-3 text-right font-black text-slate-800">R$ {formatCurrency(installment.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportMode === 'PAGO' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-lg font-black uppercase text-emerald-700">Pago</h4>
                    <p className="text-sm font-black text-slate-700">Total: R$ {formatCurrency(totalExecuted)}</p>
                  </div>
                  <div className="overflow-x-auto border border-slate-100">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr className="text-[10px] uppercase font-black text-slate-500">
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Descrição</th>
                          <th className="px-4 py-3">Item Macro</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paidCosts.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400 font-bold">Nenhum custo finalizado.</td></tr>}
                        {paidCosts.map((cost) => (
                          <tr key={cost.id} className="border-t border-slate-100 text-sm">
                            <td className="px-4 py-3 text-slate-600">{cost.date}</td>
                            <td className="px-4 py-3 font-bold text-slate-700">{cost.description}</td>
                            <td className="px-4 py-3 text-slate-600">{currentBudget.find((item) => item.id === cost.macroItemId)?.description || 'Sem categoria'}</td>
                            <td className="px-4 py-3 text-right font-black text-slate-800">R$ {formatCurrency(cost.totalValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportMode === 'PEDIDOS' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-lg font-black uppercase text-blue-700">Pedidos em aberto</h4>
                    <p className="text-sm font-black text-slate-700">Total: R$ {formatCurrency(totalRequested)}</p>
                  </div>
                  <div className="overflow-x-auto border border-slate-100">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr className="text-[10px] uppercase font-black text-slate-500">
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Pedido</th>
                          <th className="px-4 py-3">Item Macro</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeOrdersWithValue.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400 font-bold">Nenhum pedido ativo com valor informado.</td></tr>}
                        {activeOrdersWithValue.map((order) => (
                          <tr key={order.id} className="border-t border-slate-100 text-sm">
                            <td className="px-4 py-3 text-slate-600">{new Date(order.createdAt).toLocaleDateString('pt-BR')}</td>
                            <td className="px-4 py-3 font-bold text-slate-700">{order.title}</td>
                            <td className="px-4 py-3 text-slate-600">{currentBudget.find((item) => item.id === order.macroItemId)?.description || 'Sem categoria'}</td>
                            <td className="px-4 py-3 text-slate-600">{order.status.replace('_', ' ')}</td>
                            <td className="px-4 py-3 text-right font-black text-slate-800">R$ {formatCurrency(Number(order.value || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportMode === 'CUSTO' && (
                <div className="space-y-6">
                  <h4 className="text-lg font-black uppercase text-slate-800">Custo (Pedidos + A pagar + Pago)</h4>
                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="border border-blue-200 bg-blue-50 p-4">
                      <p className="text-[10px] uppercase font-black text-blue-700">Pedidos</p>
                      <p className="text-2xl font-black text-blue-800">R$ {formatCurrency(totalRequested)}</p>
                    </div>
                    <div className="border border-amber-200 bg-amber-50 p-4">
                      <p className="text-[10px] uppercase font-black text-amber-700">A pagar</p>
                      <p className="text-2xl font-black text-amber-800">R$ {formatCurrency(totalToPay)}</p>
                    </div>
                    <div className="border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-[10px] uppercase font-black text-emerald-700">Pago</p>
                      <p className="text-2xl font-black text-emerald-800">R$ {formatCurrency(totalExecuted)}</p>
                    </div>
                    <div className="border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] uppercase font-black text-slate-600">Custo total</p>
                      <p className="text-2xl font-black text-slate-900">R$ {formatCurrency(totalProjected)}</p>
                    </div>
                  </div>

                  <div className="border border-slate-100 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr className="text-[10px] uppercase font-black text-slate-500">
                          <th className="px-4 py-3">Item Macro</th>
                          <th className="px-4 py-3 text-right">Pedidos</th>
                          <th className="px-4 py-3 text-right">A pagar</th>
                          <th className="px-4 py-3 text-right">Pago</th>
                          <th className="px-4 py-3 text-right">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {macroCostSummary.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400 font-bold">Nenhum item macro cadastrado.</td></tr>}
                        {macroCostSummary.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100 text-sm">
                            <td className="px-4 py-3 font-bold text-slate-700 uppercase">{row.description}</td>
                            <td className="px-4 py-3 text-right font-black text-blue-700">R$ {formatCurrency(row.pedidos)}</td>
                            <td className="px-4 py-3 text-right font-black text-amber-700">R$ {formatCurrency(row.aPagar)}</td>
                            <td className="px-4 py-3 text-right font-black text-emerald-700">R$ {formatCurrency(row.pago)}</td>
                            <td className="px-4 py-3 text-right font-black text-slate-900">R$ {formatCurrency(row.custo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


