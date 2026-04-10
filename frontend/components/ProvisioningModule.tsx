import React, { useEffect, useMemo, useState } from 'react';
import { dbService } from '../apiClient';
import { Attachment, ProvisioningContext, ProvisioningRecord, ProvisioningStatus, User } from '../types';
import { AttachmentViewerModal } from './AttachmentViewerModal';
import { canPreviewAttachmentInline, resolveAttachmentForAccess, triggerAttachmentDownload } from '../utils/attachments';

interface ProvisioningModuleProps {
  user: User;
}

const formatMoney = (value?: number) => `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-';
const provisioningStatuses: ProvisioningStatus[] = ['PREVISTO', 'EM_ANALISE', 'APROVADO', 'CANCELADO', 'REALIZADO'];
const priorityOptions = ['', 'BAIXA', 'MEDIA', 'ALTA', 'CRITICA'];

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

const formatPriority = (priority?: string) => {
  const value = String(priority || '').trim().toUpperCase();
  return value || 'SEM PRIORIDADE';
};

export const ProvisioningModule: React.FC<ProvisioningModuleProps> = () => {
  const [context, setContext] = useState<ProvisioningContext | null>(null);
  const [items, setItems] = useState<ProvisioningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProvisioningRecord | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [filters, setFilters] = useState({ projectId: '', status: '', priority: '', search: '' });
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ProvisioningStatus>('EM_ANALISE');

  const load = async () => {
    try {
      setLoading(true);
      const [contextData, rows] = await Promise.all([
        dbService.getProvisioningContext(),
        dbService.getProvisioning(filters.projectId || undefined, filters.status || undefined, filters.search || undefined, filters.priority || undefined),
      ]);
      setContext(contextData);
      setItems(rows || []);
      if (selected) {
        const refreshed = (rows || []).find((item) => item.id === selected.id);
        setSelected(refreshed || null);
      }
    } catch (error) {
      console.error(error);
      alert('Nao foi possivel carregar o modulo de provisionamento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filters.projectId, filters.status, filters.priority, filters.search]);

  const sortedHistory = useMemo(
    () => [...(selected?.history || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [selected]
  );

  const summary = useMemo(() => {
    const now = new Date();
    const sevenDaysAhead = new Date();
    sevenDaysAhead.setDate(now.getDate() + 7);

    return {
      totalRecords: items.length,
      totalForecast: items.reduce((acc, item) => acc + Number(item.forecastValue || 0), 0),
      criticalCount: items.filter((item) => String(item.priority || '').toUpperCase() === 'CRITICA').length,
      upcomingCount: items.filter((item) => {
        if (!item.dueDate) return false;
        const date = new Date(`${item.dueDate}T12:00:00`);
        return date >= now && date <= sevenDaysAhead;
      }).length,
    };
  }, [items]);

  const toAttachmentPayloads = async (fileList: FileList | null) => {
    const pending = Array.from(fileList || []);
    const mapped = await Promise.all(pending.map((file) => new Promise<Attachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: crypto.randomUUID(),
        name: file.name,
        originalName: file.name,
        data: String(reader.result || ''),
        type: file.type || 'application/octet-stream',
        size: file.size,
        uploadDate: new Date().toISOString(),
      });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    return mapped;
  };

  const handleSendComment = async () => {
    if (!selected || !comment.trim()) return;
    try {
      await dbService.addProvisioningComment(selected.id, comment.trim());
      setComment('');
      alert('Comentario enviado com sucesso.');
      await load();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel enviar o comentario.');
    }
  };

  const handleSendAttachments = async () => {
    if (!selected || files.length === 0) return;
    try {
      await dbService.addProvisioningAttachments(selected.id, files);
      setFiles([]);
      alert('Arquivo enviado com sucesso.');
      await load();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel enviar os arquivos.');
    }
  };

  const handleChangeStatus = async () => {
    if (!selected) return;
    try {
      const updated = await dbService.updateProvisioningStatus(selected.id, selectedStatus);
      setSelected(updated);
      setStatusModalOpen(false);
      alert('Status atualizado com sucesso.');
      await load();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel atualizar o status.');
    }
  };

  const openAttachment = async (attachment: Attachment) => {
    try {
      const resolved = await resolveAttachmentForAccess(attachment);
      if (!resolved.data) {
        alert('Arquivo indisponivel para visualizacao.');
        return;
      }
      if (canPreviewAttachmentInline(resolved)) {
        setPreviewAttachment(resolved);
        return;
      }
      window.open(resolved.data, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      alert('Nao foi possivel abrir o arquivo.');
    }
  };

  if (loading) {
    return <div className="p-10 text-[10px] font-black uppercase tracking-widest text-slate-400">Carregando provisionamento...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      <div className="bg-white border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Provisionamento</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">Acompanhamento gerencial de provisoes financeiras por obra.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <select value={filters.projectId} onChange={(e) => setFilters((current) => ({ ...current, projectId: e.target.value }))} className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500">
            <option value="">Todas as obras</option>
            {(context?.projectOptions || []).map((project) => (
              <option key={project.id} value={project.id}>{project.code} - {project.name}</option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))} className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500">
            <option value="">Todos os status</option>
            {provisioningStatuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => setFilters((current) => ({ ...current, priority: e.target.value }))} className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500">
            {priorityOptions.map((priority) => <option key={priority || 'EMPTY'} value={priority}>{formatPriority(priority)}</option>)}
          </select>
          <input value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="Buscar codigo, item macro, descricao ou fornecedor" className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black outline-none focus:border-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="bg-white border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registros no filtro</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{summary.totalRecords}</p>
        </div>
        <div className="bg-white border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor previsto</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{formatMoney(summary.totalForecast)}</p>
        </div>
        <div className="bg-white border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Criticas</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{summary.criticalCount}</p>
        </div>
        <div className="bg-white border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Proximas 7 dias</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{summary.upcomingCount}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Codigo</th>
                <th className="px-6 py-4">Obra</th>
                <th className="px-6 py-4">Item Macro</th>
                <th className="px-6 py-4">Descricao</th>
                <th className="px-6 py-4">Data Prevista</th>
                <th className="px-6 py-4">Valor</th>
                <th className="px-6 py-4">Prioridade</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-xs font-black uppercase text-slate-800">{item.code}</td>
                  <td className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500">{item.projectName}</td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-black uppercase text-slate-800">{item.itemMacro}</div>
                    <div className="text-[10px] font-bold uppercase text-slate-400 mt-1">{item.createdByUserName}</div>
                  </td>
                  <td className="px-6 py-4 text-[11px] text-slate-600 max-w-[360px]">
                    <div className="line-clamp-2">{item.description}</div>
                  </td>
                  <td className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500">{formatDate(item.dueDate)}</td>
                  <td className="px-6 py-4 text-xs font-black uppercase text-slate-800">{formatMoney(item.forecastValue)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 border text-[9px] font-black uppercase ${priorityBadgeClass(item.priority)}`}>
                      {formatPriority(item.priority)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 border text-[9px] font-black uppercase ${statusBadgeClass(item.status)}`}>
                      {item.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Nenhum provisionamento encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[120] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-6xl border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-200 flex items-start justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex px-3 py-1 border text-[9px] font-black uppercase ${statusBadgeClass(selected.status)}`}>{selected.status.replaceAll('_', ' ')}</span>
                  <span className={`inline-flex px-3 py-1 border text-[9px] font-black uppercase ${priorityBadgeClass(selected.priority)}`}>{formatPriority(selected.priority)}</span>
                  {context?.permissions?.canApprove && (
                    <button type="button" onClick={() => { setSelectedStatus(selected.status); setStatusModalOpen(true); }} className="w-9 h-9 border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors">
                      <i className="fas fa-pen"></i>
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{selected.code}</p>
                <h3 className="text-3xl font-black uppercase tracking-tighter text-slate-900">{selected.itemMacro}</h3>
                <p className="text-xs font-bold uppercase text-slate-400">Por {selected.createdByUserName} em {new Date(selected.createdAt).toLocaleString('pt-BR')}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 transition-colors"><i className="fas fa-times text-2xl"></i></button>
            </div>

            <div className="p-8 grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-8">
              <div className="space-y-6">
                <div className="border border-slate-200 bg-slate-50 p-5 space-y-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descricao</p>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">{selected.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Obra</p>
                      <p className="text-xs font-black uppercase text-slate-800 mt-2">{selected.projectName}</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item Macro</p>
                      <p className="text-xs font-black uppercase text-slate-800 mt-2">{selected.itemMacro}</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fornecedor</p>
                      <p className="text-xs font-black uppercase text-slate-800 mt-2">{selected.supplier || 'Nao informado'}</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor</p>
                      <p className="text-xs font-black uppercase text-slate-800 mt-2">{formatMoney(selected.forecastValue)}</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Prevista</p>
                      <p className="text-xs font-black uppercase text-slate-800 mt-2">{formatDate(selected.dueDate)}</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                      <p className="text-xs font-black uppercase text-slate-800 mt-2">{selected.status.replaceAll('_', ' ')}</p>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">Historico</h4>
                  <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
                    {sortedHistory.map((history) => (
                      <div key={history.id} className="border-l-2 border-blue-500 pl-4 py-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-black uppercase text-slate-900">{history.action}</p>
                            <p className="text-sm font-medium text-slate-700 mt-1">{history.description}</p>
                            <p className="text-[10px] font-bold uppercase text-slate-400 mt-2">{history.userName || 'Sistema'} | {new Date(history.createdAt).toLocaleString('pt-BR')}</p>
                          </div>
                        </div>
                        {(history.attachments || []).length > 0 && (
                          <div className="mt-3 space-y-2">
                            {history.attachments.map((attachment) => (
                              <div key={attachment.id} className="flex items-center gap-4 text-[10px] font-black uppercase text-blue-600">
                                <span className="text-slate-600">{attachment.originalName || attachment.name}</span>
                                <button type="button" onClick={() => void openAttachment(attachment)}>Visualizar</button>
                                <button type="button" onClick={() => void triggerAttachmentDownload(attachment)}>Download</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">Enviar Comentarios</h4>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} placeholder="Registre uma observacao sobre a provisao..." className="w-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" />
                  <button type="button" onClick={() => void handleSendComment()} className="w-full bg-slate-900 text-white py-4 font-black uppercase text-[10px] tracking-widest">Enviar Comentario</button>
                </div>

                <div className="border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">Enviar Anexos</h4>
                  <div className="space-y-3">
                    <input type="file" multiple onChange={async (e) => setFiles(await toAttachmentPayloads(e.target.files))} className="block w-full text-xs font-bold" />
                    {files.length === 0 && <p className="text-[10px] font-bold uppercase text-slate-400">Nenhum arquivo selecionado.</p>}
                    {files.map((file) => (
                      <div key={file.id} className="text-[10px] font-black uppercase text-slate-600">{file.originalName || file.name}</div>
                    ))}
                  </div>
                  <button type="button" onClick={() => void handleSendAttachments()} className="w-full bg-slate-900 text-white py-4 font-black uppercase text-[10px] tracking-widest">Enviar Arquivos</button>
                </div>

                {(selected.attachments || []).length > 0 && (
                  <div className="border border-slate-200 bg-white p-5 space-y-4">
                    <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">Anexos da Provisao</h4>
                    <div className="space-y-3">
                      {selected.attachments.map((attachment) => (
                        <div key={attachment.id} className="flex items-center justify-between gap-3 border border-slate-100 bg-slate-50 px-4 py-3">
                          <span className="text-[10px] font-black uppercase text-slate-600">{attachment.originalName || attachment.name}</span>
                          <div className="flex items-center gap-3 text-[10px] font-black uppercase text-blue-600">
                            <button type="button" onClick={() => void openAttachment(attachment)}>Visualizar</button>
                            <button type="button" onClick={() => void triggerAttachmentDownload(attachment)}>Download</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {statusModalOpen && selected && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[130] flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 shadow-2xl w-full max-w-md p-8 space-y-6">
            <div>
              <h4 className="text-xl font-black uppercase tracking-tighter text-slate-900">Alterar Status</h4>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">Selecione o novo status do provisionamento.</p>
            </div>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as ProvisioningStatus)} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500">
              {provisioningStatuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </select>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStatusModalOpen(false)} className="flex-1 border border-slate-200 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Cancelar</button>
              <button type="button" onClick={() => void handleChangeStatus()} className="flex-1 bg-slate-900 text-white py-3 text-[10px] font-black uppercase tracking-widest">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {previewAttachment && (
        <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}
    </div>
  );
};
