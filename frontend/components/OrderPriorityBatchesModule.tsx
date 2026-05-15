import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dbService } from '../apiClient';
import { Order, OrderPriorityBatch, OrderPriorityBatchContext, OrderPriorityBatchStatus, OrderPriorityBatchType } from '../types';

const formatMoney = (value?: number | null) => value == null
  ? 'Sem valor definido'
  : `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('pt-BR');
};

const normalizeText = (value?: string) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const statusClass = (status: OrderPriorityBatchStatus) => {
  if (status === 'APROVADO') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'RECUSADO' || status === 'CANCELADO') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (status === 'AGUARDANDO_APROVACAO') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

const batchTypeLabel = (type: OrderPriorityBatchType) => (
  type === 'DIRETORIA_ADMINISTRATIVA'
    ? 'Administrativa para Obras'
    : 'Obras para Administrativa'
);

const ordersFromBatch = (batch?: OrderPriorityBatch | null) => (
  (batch?.items || []).map((item) => item.order).filter(Boolean)
);

const mergeOrders = (base: Order[], selected: Order[]) => {
  const map = new Map<string, Order>();
  base.forEach((order) => map.set(order.id, order));
  selected.forEach((order) => {
    if (!map.has(order.id)) map.set(order.id, order);
  });
  return Array.from(map.values());
};

export const OrderPriorityBatchesModule: React.FC = () => {
  const [context, setContext] = useState<OrderPriorityBatchContext | null>(null);
  const [batches, setBatches] = useState<OrderPriorityBatch[]>([]);
  const [currentBatch, setCurrentBatch] = useState<OrderPriorityBatch | null>(null);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [selectedOnlyFilter, setSelectedOnlyFilter] = useState(false);
  const [localListFilter, setLocalListFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [autoSavingSelection, setAutoSavingSelection] = useState(false);
  const selectionSaveVersion = useRef(0);
  const [createForm, setCreateForm] = useState({
    type: 'DIRETORIA_ADMINISTRATIVA' as OrderPriorityBatchType,
    availableValue: '',
    note: '',
  });

  const canCreateAdministrative = Boolean(context?.permissions.canCreateAdministrativeBatch);
  const canCreateWorks = Boolean(context?.permissions.canCreateWorksBatch);

  const selectedOrdersInBatch = useMemo(() => ordersFromBatch(currentBatch), [currentBatch]);
  const displayOrders = useMemo(() => mergeOrders(availableOrders, selectedOrdersInBatch), [availableOrders, selectedOrdersInBatch]);
  const visibleOrders = useMemo(() => {
    const term = normalizeText(localListFilter);
    if (!term) return displayOrders;
    return displayOrders.filter((order) => {
      const haystack = [
        order.orderCode,
        order.externalCode,
        order.projectName,
        order.title,
        order.description,
        order.type,
        order.sectorStatus,
        order.currentSectorName,
      ].map(normalizeText).join(' ');
      return haystack.includes(term);
    });
  }, [displayOrders, localListFilter]);
  const selectedOrders = useMemo(() => displayOrders.filter((order) => selectedOrderIds.includes(order.id)), [displayOrders, selectedOrderIds]);
  const selectedValue = selectedOrders.reduce((total, order) => total + Number(order.value || 0), 0);

  async function loadBatches(nextStatus = statusFilter) {
    const data = await dbService.listOrderPriorityBatches(nextStatus || undefined);
    setBatches(Array.isArray(data?.items) ? data.items : []);
  }

  async function loadBase() {
    setLoading(true);
    try {
      const [contextData] = await Promise.all([
        dbService.getOrderPriorityBatchContext(),
        loadBatches(''),
      ]);
      setContext(contextData);
      const defaultType = contextData?.permissions?.canCreateAdministrativeBatch
        ? 'DIRETORIA_ADMINISTRATIVA'
        : 'DIRETORIA_OBRAS';
      setCreateForm((current) => ({ ...current, type: defaultType }));
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel carregar prioridades diretoria.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBase();
  }, []);

  async function createBatch() {
    const type = createForm.type;
    if (type === 'DIRETORIA_ADMINISTRATIVA') {
      const value = Number(createForm.availableValue);
      if (!Number.isFinite(value) || value <= 0) {
        alert('Informe o valor disponivel do lote.');
        return;
      }
    }

    setOperating(true);
    try {
      const payload = {
        type,
        availableValue: type === 'DIRETORIA_ADMINISTRATIVA' ? Number(createForm.availableValue) : undefined,
        note: createForm.note,
      };
      const data = await dbService.createOrderPriorityBatch(payload);
      setCreateForm((current) => ({ ...current, availableValue: '', note: '' }));
      await loadBatches();
      if (data?.item?.id) await openBatch(data.item.id);
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel criar o lote.');
    } finally {
      setOperating(false);
    }
  }

  async function openBatch(id: string) {
    selectionSaveVersion.current += 1;
    setAutoSavingSelection(false);
    setOperating(true);
    try {
      const data = await dbService.getOrderPriorityBatch(id);
      const batch = data?.item || null;
      setCurrentBatch(batch);
      const savedOrders = ordersFromBatch(batch);
      setSelectedOrderIds(savedOrders.map((order) => order.id));
      if (batch?.status === 'ABERTO') {
        const availableData = await dbService.getOrderPriorityBatchAvailableOrders(id, {
          search: searchFilter,
          projectId: projectFilter,
          selectedOnly: selectedOnlyFilter,
        });
        setAvailableOrders(mergeOrders(Array.isArray(availableData?.items) ? availableData.items : [], savedOrders));
      } else {
        setAvailableOrders(savedOrders);
      }
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel abrir o lote.');
    } finally {
      setOperating(false);
    }
  }

  async function searchAvailableOrders() {
    if (!currentBatch?.id) return;
    const data = await dbService.getOrderPriorityBatchAvailableOrders(currentBatch.id, {
      search: searchFilter,
      projectId: projectFilter,
      selectedOnly: selectedOnlyFilter,
    });
    setAvailableOrders(mergeOrders(Array.isArray(data?.items) ? data.items : [], selectedOrdersInBatch));
  }

  function clearSearchFilters() {
    setSearchFilter('');
    setProjectFilter('');
    setSelectedOnlyFilter(false);
  }

  async function persistSelection(orderIds: string[], showSuccess = false) {
    if (!currentBatch?.id) return;
    const version = ++selectionSaveVersion.current;
    setAutoSavingSelection(true);
    try {
      const data = await dbService.saveOrderPriorityBatchSelection(currentBatch.id, orderIds);
      if (version !== selectionSaveVersion.current) return;
      const batch = data?.item || null;
      setCurrentBatch(batch);
      const savedOrders = ordersFromBatch(batch);
      setSelectedOrderIds(savedOrders.map((order) => order.id));
      setAvailableOrders((current) => mergeOrders(current, savedOrders));
      await loadBatches();
      if (showSuccess) alert('Selecao salva. Voce pode navegar e voltar depois.');
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel salvar a selecao.');
      if (version === selectionSaveVersion.current) {
        const savedOrders = ordersFromBatch(currentBatch);
        setSelectedOrderIds(savedOrders.map((order) => order.id));
        setAvailableOrders((current) => mergeOrders(current, savedOrders));
      }
    } finally {
      if (version === selectionSaveVersion.current) setAutoSavingSelection(false);
    }
  }

  function toggleOrder(orderId: string) {
    if (!currentBatch?.canSave) return;
    const nextOrderIds = selectedOrderIds.includes(orderId)
      ? selectedOrderIds.filter((id) => id !== orderId)
      : [...selectedOrderIds, orderId];
    setSelectedOrderIds(nextOrderIds);
    void persistSelection(nextOrderIds);
  }

  async function saveSelection() {
    if (!currentBatch?.id) return;
    setOperating(true);
    try {
      await persistSelection(selectedOrderIds, true);
    } finally {
      setOperating(false);
    }
  }

  async function submitBatch() {
    if (!currentBatch?.id) return;
    if (selectedOrderIds.length === 0) {
      alert('Selecione ao menos um pedido.');
      return;
    }
    setOperating(true);
    try {
      await dbService.saveOrderPriorityBatchSelection(currentBatch.id, selectedOrderIds);
      const data = await dbService.submitOrderPriorityBatch(currentBatch.id);
      setCurrentBatch(data?.item || null);
      await loadBatches();
      alert('Lote enviado para aprovacao da Diretoria Administrativa.');
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel enviar o lote.');
    } finally {
      setOperating(false);
    }
  }

  async function approveBatch() {
    if (!currentBatch?.id || !confirm('Aprovar este lote e marcar os pedidos como prioridade aprovada?')) return;
    setOperating(true);
    try {
      const data = await dbService.approveOrderPriorityBatch(currentBatch.id);
      setCurrentBatch(data?.item || null);
      await loadBatches();
      alert('Lote aprovado.');
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel aprovar o lote.');
    } finally {
      setOperating(false);
    }
  }

  async function rejectBatch() {
    if (!currentBatch?.id) return;
    const reason = prompt('Informe o motivo da recusa:', currentBatch.rejectionReason || '');
    if (reason === null) return;
    setOperating(true);
    try {
      const data = await dbService.rejectOrderPriorityBatch(currentBatch.id, reason || undefined);
      setCurrentBatch(data?.item || null);
      await loadBatches();
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel recusar o lote.');
    } finally {
      setOperating(false);
    }
  }

  async function cancelBatch() {
    if (!currentBatch?.id || !confirm('Cancelar este lote de prioridade?')) return;
    setOperating(true);
    try {
      const data = await dbService.cancelOrderPriorityBatch(currentBatch.id);
      setCurrentBatch(data?.item || null);
      await loadBatches();
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel cancelar o lote.');
    } finally {
      setOperating(false);
    }
  }

  async function changeStatusFilter(value: string) {
    setStatusFilter(value);
    setOperating(true);
    try {
      await loadBatches(value);
    } finally {
      setOperating(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-[11px] font-black uppercase tracking-widest text-slate-400">Carregando prioridades...</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Prioridades Diretoria</h2>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
            Lotes de prioridade entre Diretoria Administrativa e Diretoria de Obras.
          </p>
        </div>
        <select value={statusFilter} onChange={(event) => void changeStatusFilter(event.target.value)} className="bg-white border border-slate-200 px-4 py-3 text-xs font-black uppercase">
          <option value="">Todos os status</option>
          <option value="ABERTO">Abertos</option>
          <option value="AGUARDANDO_APROVACAO">Aguardando aprovacao</option>
          <option value="APROVADO">Aprovados</option>
          <option value="RECUSADO">Recusados</option>
          <option value="CANCELADO">Cancelados</option>
        </select>
      </div>

      {(canCreateAdministrative || canCreateWorks) && (
        <div className="bg-white border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Abrir lote</h3>
          <div className="grid grid-cols-1 lg:grid-cols-[260px_180px_1fr_auto] gap-3 items-end">
            <label className="space-y-2">
              <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Tipo do lote</span>
              <select value={createForm.type} onChange={(event) => setCreateForm((current) => ({ ...current, type: event.target.value as OrderPriorityBatchType }))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase">
                {canCreateAdministrative && <option value="DIRETORIA_ADMINISTRATIVA">Administrativa para Obras</option>}
                {canCreateWorks && <option value="DIRETORIA_OBRAS">Obras para Administrativa</option>}
              </select>
            </label>
            <label className="space-y-2">
              <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Valor disponivel</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={createForm.type === 'DIRETORIA_OBRAS'}
                value={createForm.type === 'DIRETORIA_OBRAS' ? '' : createForm.availableValue}
                onChange={(event) => setCreateForm((current) => ({ ...current, availableValue: event.target.value }))}
                placeholder={createForm.type === 'DIRETORIA_OBRAS' ? 'Sem valor' : '0,00'}
                className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold disabled:text-slate-400"
              />
            </label>
            <label className="space-y-2">
              <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Observacao</span>
              <input value={createForm.note} onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold" />
            </label>
            <button type="button" onClick={() => void createBatch()} disabled={operating} className="bg-slate-900 text-white px-6 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
              Criar lote
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-6">
        <section className="bg-white border border-slate-200 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Lotes</h3>
          {batches.map((batch) => (
            <button
              type="button"
              key={batch.id}
              onClick={() => void openBatch(batch.id)}
              className={`w-full text-left border p-4 transition-colors ${currentBatch?.id === batch.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-slate-900">Lote #{batch.id}</p>
                  <p className="text-[9px] font-black uppercase text-slate-400 mt-1">{batchTypeLabel(batch.type)}</p>
                </div>
                <span className={`border px-2 py-1 text-[8px] font-black uppercase ${statusClass(batch.status)}`}>{batch.status.replace('_', ' ')}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] font-black uppercase text-slate-400">
                <span>Limite<br /><strong className="text-slate-800">{formatMoney(batch.availableValue)}</strong></span>
                <span>Selecionado<br /><strong className="text-slate-800">{formatMoney(batch.selectedValue)}</strong></span>
                <span>Pedidos<br /><strong className="text-slate-800">{batch.itemsCount}</strong></span>
              </div>
            </button>
          ))}
          {batches.length === 0 && <p className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">Nenhum lote encontrado.</p>}
        </section>

        <section className="bg-white border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
          {!currentBatch ? (
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selecione um lote para gerenciar os pedidos.</p>
          ) : (
            <>
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Lote #{currentBatch.id}</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                    {currentBatch.originSector} para {currentBatch.targetSector} | criado por {currentBatch.createdByUserName} em {formatDate(currentBatch.createdAt)}
                  </p>
                  {currentBatch.rejectionReason && <p className="mt-2 text-xs font-bold text-rose-700">Recusa: {currentBatch.rejectionReason}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentBatch.canApprove && <button type="button" onClick={() => void approveBatch()} className="bg-emerald-600 text-white px-4 py-3 text-[10px] font-black uppercase tracking-widest">Aprovar</button>}
                  {currentBatch.canReject && <button type="button" onClick={() => void rejectBatch()} className="bg-white border border-rose-200 text-rose-700 px-4 py-3 text-[10px] font-black uppercase tracking-widest">Recusar</button>}
                  {currentBatch.canCancel && <button type="button" onClick={() => void cancelBatch()} className="bg-white border border-slate-300 text-slate-700 px-4 py-3 text-[10px] font-black uppercase tracking-widest">Cancelar</button>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <p className="text-[9px] font-black uppercase text-slate-400">Valor disponivel</p>
                  <p className="text-sm font-black text-slate-900 mt-1">{formatMoney(currentBatch.availableValue)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <p className="text-[9px] font-black uppercase text-slate-400">Selecionado</p>
                  <p className="text-sm font-black text-slate-900 mt-1">{formatMoney(selectedValue)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <p className="text-[9px] font-black uppercase text-slate-400">Pedidos</p>
                  <p className="text-sm font-black text-slate-900 mt-1">{selectedOrderIds.length}</p>
                </div>
              </div>

              {currentBatch.status === 'ABERTO' && (
                <div className="border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px_180px_auto_auto] gap-3 items-end">
                    <label className="space-y-2">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Buscar pedidos</span>
                      <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Codigo, titulo, obra ou tipo" className="w-full bg-white border border-slate-200 px-4 py-3 text-xs font-bold" />
                    </label>
                    <label className="space-y-2">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Obra</span>
                      <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="w-full bg-white border border-slate-200 px-4 py-3 text-xs font-black uppercase">
                        <option value="">Todas</option>
                        {(context?.projectOptions || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-3 h-[42px]">
                      <input type="checkbox" checked={selectedOnlyFilter} onChange={(event) => setSelectedOnlyFilter(event.target.checked)} />
                      <span className="text-[9px] font-black uppercase text-slate-600">Selecionados</span>
                    </label>
                    <button type="button" onClick={() => void searchAvailableOrders()} className="bg-white border border-slate-300 text-slate-700 px-4 py-3 text-[10px] font-black uppercase tracking-widest">Filtrar</button>
                    <button type="button" onClick={clearSearchFilters} className="bg-white border border-slate-300 text-slate-700 px-4 py-3 text-[10px] font-black uppercase tracking-widest">Limpar</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentBatch.canSave && <button type="button" onClick={() => void saveSelection()} disabled={operating || autoSavingSelection} className="bg-white border border-slate-300 text-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">{autoSavingSelection ? 'Salvando...' : 'Salvar selecao'}</button>}
                    {currentBatch.canSubmit && <button type="button" onClick={() => void submitBatch()} disabled={operating || autoSavingSelection} className="bg-slate-900 text-white px-4 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Enviar para aprovacao</button>}
                  </div>
                </div>
              )}

              <div className="border border-slate-200 p-4">
                <label className="space-y-2 block">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Filtrar lista exibida</span>
                  <input value={localListFilter} onChange={(event) => setLocalListFilter(event.target.value)} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold" placeholder="Filtra sem perder pedidos selecionados" />
                </label>
              </div>

              <div className="overflow-x-auto border border-slate-200">
                <table className="w-full min-w-[980px] text-left">
                  <thead className="bg-slate-50 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      {currentBatch.status === 'ABERTO' && currentBatch.canSave && <th className="px-4 py-4 w-12"></th>}
                      <th className="px-4 py-4">Pedido</th>
                      <th className="px-4 py-4">Obra</th>
                      <th className="px-4 py-4">Data desejada</th>
                      <th className="px-4 py-4 text-right">Valor</th>
                      <th className="px-4 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleOrders.map((order) => {
                      const selected = selectedOrderIds.includes(order.id);
                      return (
                        <tr key={order.id} className={selected ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                          {currentBatch.status === 'ABERTO' && currentBatch.canSave && (
                            <td className="px-4 py-4">
                              <input type="checkbox" checked={selected} disabled={autoSavingSelection} onChange={() => toggleOrder(order.id)} />
                            </td>
                          )}
                          <td className="px-4 py-4">
                            <p className="text-xs font-black uppercase text-slate-900">{order.orderCode || `#${order.id}`}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">{order.title}</p>
                          </td>
                          <td className="px-4 py-4 text-[10px] font-black uppercase text-slate-700">{order.projectName}</td>
                          <td className="px-4 py-4 text-[10px] font-bold text-slate-500">{formatDate(order.expectedDate)}</td>
                          <td className="px-4 py-4 text-right text-[10px] font-black text-slate-900">{formatMoney(order.value)}</td>
                          <td className="px-4 py-4">
                            <span className="border border-slate-200 bg-white px-2 py-1 text-[8px] font-black uppercase text-slate-600">
                              {order.priorityApproved ? 'Prioridade aprovada' : (order.sectorStatus || order.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleOrders.length === 0 && (
                      <tr>
                        <td colSpan={currentBatch.status === 'ABERTO' && currentBatch.canSave ? 6 : 5} className="p-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">
                          Nenhum pedido encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
