import React, { useState } from 'react';
import { Attachment, ExecutedCost, Order, OrderMessage, OrderStatus, Project, Sector, User, canManageAssignedOrders } from '../types';
import { AttachmentViewerModal } from './AttachmentViewerModal';
import { dbService } from '../apiClient';

interface OrdersModuleProps {
  project: Project;
  sectors: Sector[];
  user: User;
  onUpdate: (project: Project) => Promise<void> | void;
  onPersistOrder: (projectId: string, order: Order) => Promise<Order>;
  onDeleteOrder: (projectId: string, orderId: string) => Promise<void>;
}

const formatMoney = (value?: number) => `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatMoneyInput = (value?: number) => value == null ? '' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : undefined;
};

const canPreviewAttachmentInline = (attachment: Attachment) => attachment.type.startsWith('image/') || attachment.type === 'application/pdf' || attachment.name.toLowerCase().endsWith('.pdf');
const formatOrderDate = (value?: string) => value ? new Date(value).toLocaleDateString('pt-BR') : '-';

export const OrdersModule: React.FC<OrdersModuleProps> = ({ project, sectors, user, onUpdate, onPersistOrder, onDeleteOrder }) => {
  const canManageProjectOrders = user.role === 'SUPERADMIN' || (canManageAssignedOrders(user.role) && user.assignedProjectIds?.includes(project.id));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState<Order | null>(null);
  const [actionType, setActionType] = useState<'COMPLETE' | 'CANCEL' | 'NONE'>('NONE');
  const [actionText, setActionText] = useState('');
  const [actionAttachments, setActionAttachments] = useState<Attachment[]>([]);
  const [messageText, setMessageText] = useState('');
  const [messageAttachments, setMessageAttachments] = useState<Attachment[]>([]);
  const [incorporateCost, setIncorporateCost] = useState(false);
  const [editableOrderValue, setEditableOrderValue] = useState(0);
  const [finalValue, setFinalValue] = useState(0);
  const [finalDate, setFinalDate] = useState(new Date().toISOString().split('T')[0]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [selectedMacroItemId, setSelectedMacroItemId] = useState('');
  const [selectedForwardSectorId, setSelectedForwardSectorId] = useState('');
  const [selectedSectorStatus, setSelectedSectorStatus] = useState('');
  const [isEditingSectorStatus, setIsEditingSectorStatus] = useState(false);
  const [newOrder, setNewOrder] = useState<Partial<Order>>({
    title: '',
    type: '',
    description: '',
    macroItemId: '',
    currentSectorId: '',
    expectedDate: '',
    value: undefined,
    attachments: []
  });

  const orders = project.orders || [];
  const isOtherOrderType = (value?: string) => String(value || '').trim().toUpperCase() === 'OUTROS';
  const isNewOrderOtherType = isOtherOrderType(newOrder.type);
  const isOrderActive = (order: Order) => order.status !== 'CONCLUIDO' && order.status !== 'CANCELADO';
  const canOpenOrderDetails = (order: Order) => isOrderActive(order) || user.role === 'SUPERADMIN' || user.role === 'ADMIN';
  const canTreatOrder = (order: Order) => canManageProjectOrders && isOrderActive(order);
  const canReopenOrder = (order: Order) => canManageProjectOrders && (order.status === 'CONCLUIDO' || order.status === 'CANCELADO');
  const canEditFinancialFields = user.role === 'SUPERADMIN' || user.role === 'ADMIN';
  const canDeleteOrderDirectly = user.role === 'SUPERADMIN' || user.role === 'ADMIN';
  const canCommentOnOrder = (order: Order) => isOrderActive(order);
  const canForwardOrder = (order: Order) => canManageProjectOrders && isOrderActive(order);
  const canEditSectorStatus = (order: Order) => isOrderActive(order) && (
    user.role === 'SUPERADMIN' ||
    user.role === 'ADMIN' ||
    (!!user.sectorId && (order.currentSectorId === user.sectorId || (order.accessibleSectorIds || []).includes(user.sectorId)))
  );
  const findSectorName = (sectorId?: string) => sectors.find((sector) => sector.id === sectorId)?.name;
  const getSectorStatuses = (sectorId?: string) => sectors.find((sector) => sector.id === sectorId)?.statuses || [];
  const getEditableSectorStatuses = (order: Order) => {
    if (user.role === 'SUPERADMIN' || user.role === 'ADMIN') {
      return getSectorStatuses(user.sectorId || order.currentSectorId);
    }
    return getSectorStatuses(user.sectorId);
  };
  const getMessageMeta = (order: Order, message: OrderMessage) => {
    if (message.userId === 'system') {
      return { label: 'Sistema', classes: 'bg-slate-50 border-slate-300 ml-0 mr-6' };
    }
    if (message.text.startsWith('Pedido cancelado:')) {
      return { label: 'Cancelamento', classes: 'bg-rose-50 border-rose-300 ml-6' };
    }
    if (message.userId === order.requesterId) {
      return { label: 'Resposta do membro', classes: 'bg-emerald-50 border-emerald-400 ml-6' };
    }
    return { label: 'Solicitação da central', classes: 'bg-blue-50 border-blue-400 mr-6' };
  };

  const resetActionState = () => {
    setActionType('NONE');
    setActionText('');
    setActionAttachments([]);
    setMessageText('');
    setMessageAttachments([]);
    setIncorporateCost(false);
    setEditableOrderValue(0);
    setFinalValue(0);
    setFinalDate(new Date().toISOString().split('T')[0]);
  };

  const openOrderModal = (order: Order) => {
    if (!canOpenOrderDetails(order)) {
      alert('Somente ADMIN CENTRAL e SUPERADMIN podem abrir pedidos finalizados ou cancelados.');
      return;
    }
    setIsActionModalOpen(order);
    resetActionState();
    const currentValue = Number(order.value || 0);
    setEditableOrderValue(currentValue);
    setFinalValue(currentValue);
    setSelectedMacroItemId(order.macroItemId || '');
    setSelectedForwardSectorId(order.currentSectorId || '');
    setSelectedSectorStatus(order.sectorStatus || '');
    setIsEditingSectorStatus(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, target: 'NEW' | 'ACTION' | 'MESSAGE') => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const uploaded: Attachment[] = [];
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const fileData: string = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      uploaded.push({
        id: crypto.randomUUID(),
        name: `REQ-${Date.now()}-${file.name}`,
        originalName: file.name,
        data: fileData,
        type: file.type,
        size: file.size,
        uploadDate: new Date().toISOString()
      });
    }

    if (target === 'NEW') {
      setNewOrder((current) => ({ ...current, attachments: [...(current.attachments || []), ...uploaded] }));
    } else if (target === 'MESSAGE') {
      setMessageAttachments((current) => [...current, ...uploaded]);
    } else {
      setActionAttachments((current) => [...current, ...uploaded]);
    }

    event.target.value = '';
  };

  const removeNewOrderAttachment = (attachmentId: string) => {
    setNewOrder((current) => ({ ...current, attachments: (current.attachments || []).filter((attachment) => attachment.id !== attachmentId) }));
  };

  const removeActionAttachment = (attachmentId: string) => {
    setActionAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const removeMessageAttachment = (attachmentId: string) => {
    setMessageAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const renderAttachmentList = (attachments: Attachment[], onRemove: (attachmentId: string) => void, emptyLabel: string) => (
    attachments.length === 0 ? (
      <p className="text-[10px] font-bold text-slate-400 uppercase">{emptyLabel}</p>
    ) : (
      <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-100 p-3 bg-slate-50">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="flex items-center justify-between bg-white border border-slate-100 px-3 py-2">
            <span className="text-[10px] font-black text-slate-700 uppercase truncate pr-3">{attachment.originalName || attachment.name}</span>
            <button type="button" onClick={() => onRemove(attachment.id)} className="text-rose-500 hover:text-rose-700 text-xs font-black uppercase">Excluir</button>
          </div>
        ))}
      </div>
    )
  );

  const downloadAttachment = (attachment: Attachment) => {
    void (async () => {
      const resolvedAttachment = await refreshAttachmentData(attachment);
      const link = document.createElement('a');
      link.href = resolvedAttachment.data;
      link.download = resolvedAttachment.originalName || resolvedAttachment.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    })();
  };

  const refreshAttachmentData = async (attachment: Attachment) => {
    if (attachment.storageProvider !== 'S3' || !attachment.storageKey) return attachment;
    try {
      const result = await dbService.resolveAttachmentData(attachment);
      return result?.data ? { ...attachment, data: result.data } : attachment;
    } catch (error) {
      console.error('Erro ao renovar URL do anexo:', error);
      return attachment;
    }
  };

  const handlePreviewAttachment = (attachment: Attachment) => {
    void (async () => {
      const resolvedAttachment = await refreshAttachmentData(attachment);
      if (!resolvedAttachment.data) {
        alert('Arquivo indisponível para visualização no momento.');
        return;
      }
      if (canPreviewAttachmentInline(resolvedAttachment)) {
        setPreviewAttachment(resolvedAttachment);
        return;
      }
      window.open(resolvedAttachment.data, '_blank', 'noopener,noreferrer');
    })();
  };

  const mergeOrderIntoProject = (order: Order) => ({
    ...project,
    orders: orders.some((item) => item.id === order.id)
      ? orders.map((item) => item.id === order.id ? order : item)
      : [...orders, order]
  });

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedType = String(newOrder.type || '').trim().toUpperCase();
    const isOtherType = isOtherOrderType(normalizedType);

    if (!newOrder.title?.trim()) return alert('Preencha o título do pedido.');
    if (!normalizedType) return alert('Preencha o tipo do pedido.');
    if (sectors.length > 0 && !newOrder.currentSectorId) return alert('Selecione o setor de destino do pedido.');
    if (!newOrder.expectedDate) return alert('Preencha a data desejada.');
    if (!isOtherType && !newOrder.macroItemId) return alert('Selecione um item macro para apropriação.');
    if (!isOtherType && (newOrder.value === undefined || newOrder.value === null || Number(newOrder.value) <= 0)) {
      return alert('Preencha o valor previsto do pedido.');
    }
    if (!confirm(`Confirmar envio do pedido "${newOrder.title}"?`)) return;

    const order: Order = {
      id: crypto.randomUUID(),
      projectId: project.id,
      projectName: project.name,
      title: newOrder.title.trim(),
      type: normalizedType,
      description: newOrder.description?.trim() || '',
      macroItemId: newOrder.macroItemId || '',
      currentSectorId: newOrder.currentSectorId || '',
      currentSectorName: findSectorName(newOrder.currentSectorId || ''),
      accessibleSectorIds: newOrder.currentSectorId ? [newOrder.currentSectorId] : [],
      expectedDate: newOrder.expectedDate || '',
      value: Number(newOrder.value || 0),
      status: 'PENDENTE',
      requesterId: user.id,
      requesterName: user.name,
      attachments: newOrder.attachments || [],
      messages: [{
        id: crypto.randomUUID(),
        userId: 'system',
        userName: 'SISTEMA',
        text: newOrder.currentSectorId ? `Pedido enviado para o setor ${findSectorName(newOrder.currentSectorId || '')}.` : 'Pedido protocolado.',
        date: new Date().toISOString()
      }],
      createdAt: new Date().toISOString()
    };

    try {
      await onPersistOrder(project.id, order);
      setIsModalOpen(false);
      setNewOrder({ title: '', type: '', description: '', macroItemId: '', currentSectorId: '', expectedDate: '', value: undefined, attachments: [] });
    } catch (error) {
      console.error('Erro ao criar pedido:', error);
      alert('Não foi possível salvar o pedido. Tente novamente.');
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!canDeleteOrderDirectly) return alert('Somente ADMIN CENTRAL e SUPERADMIN podem excluir pedidos.');
    if (confirm(`Deseja realmente excluir o pedido "${order.title}" permanentemente?`)) {
      try {
        await onDeleteOrder(project.id, order.id);
        if (isActionModalOpen?.id === order.id) {
          setIsActionModalOpen(null);
        }
      } catch (error) {
        console.error('Erro ao excluir pedido:', error);
        alert('Não foi possível excluir o pedido. Tente novamente.');
      }
    }
  };

  const handleSendMessage = async (order: Order) => {
    if (!canCommentOnOrder(order)) return alert('Este pedido não aceita mais interações.');
    if (!messageText.trim()) return alert('Escreva sua interação.');
    if (!confirm(`Confirmar envio da interação para o pedido "${order.title}"?`)) return;
    const msg: OrderMessage = {
      id: crypto.randomUUID(),
      userId: user.id,
      userName: user.name,
      text: messageText.trim(),
      date: new Date().toISOString(),
      attachments: messageAttachments.length > 0 ? messageAttachments : undefined
    };
    const updated = {
      ...order,
      messages: [...(order.messages || []), msg]
    };
    try {
      const savedOrder = await onPersistOrder(project.id, updated);
      setIsActionModalOpen(savedOrder);
      setMessageText('');
      setMessageAttachments([]);
    } catch (error) {
      console.error('Erro ao salvar interação do pedido:', error);
      alert('Não foi possível salvar a interação. Tente novamente.');
    }
  };

  const handleAction = async () => {
    if (!isActionModalOpen || actionType === 'NONE') return;
    if (!canTreatOrder(isActionModalOpen)) return alert('Você não pode tratar este pedido.');
    if (actionType === 'CANCEL' && !actionText.trim()) return alert('Preencha a mensagem do cancelamento antes de continuar.');
    const actionLabel = actionType === 'COMPLETE' ? 'concluir' : 'cancelar';
    if (!confirm(`Confirmar a ação de ${actionLabel} para o pedido "${isActionModalOpen.title}"?`)) return;

    const updatedOrder: Order = {
      ...isActionModalOpen,
      value: canEditFinancialFields ? Number(editableOrderValue || 0) : isActionModalOpen.value,
      macroItemId: canEditFinancialFields ? (selectedMacroItemId || undefined) : isActionModalOpen.macroItemId
    };
    let newCost: ExecutedCost | null = null;

    if (actionType === 'COMPLETE') {
      updatedOrder.status = 'CONCLUIDO';
      updatedOrder.completionAttachment = actionAttachments[0] || undefined;
      updatedOrder.completionNote = actionText;
      if (incorporateCost) {
        if (!updatedOrder.macroItemId) return alert('Selecione um item macro antes de incorporar o pedido como custo.');
        const costValue = Number(finalValue || editableOrderValue || 0);
        newCost = {
          id: crypto.randomUUID(),
          macroItemId: updatedOrder.macroItemId!,
          description: `[PEDIDO] ${updatedOrder.title}`,
          itemDetail: updatedOrder.description,
          unit: 'un',
          quantity: 1,
          unitValue: costValue,
          totalValue: costValue,
          date: finalDate,
          entryDate: new Date().toISOString().split('T')[0],
          attachments: [...updatedOrder.attachments, ...actionAttachments],
          originOrderId: updatedOrder.id
        };
      }
    } else if (actionType === 'CANCEL') {
      updatedOrder.status = 'CANCELADO';
      updatedOrder.cancellationReason = actionText.trim();
      updatedOrder.messages = [...(updatedOrder.messages || []), {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        text: `Pedido cancelado: ${actionText.trim()}`,
        date: new Date().toISOString(),
        attachments: actionAttachments.length > 0 ? actionAttachments : undefined
      }];
    }

    const costsWithoutOrder = (project.costs || []).filter((cost) => cost.originOrderId !== updatedOrder.id);
    try {
      const savedOrder = await onPersistOrder(project.id, updatedOrder);
      const shouldPersistCosts = !!newCost || costsWithoutOrder.length !== (project.costs || []).length;
      if (shouldPersistCosts) {
        await onUpdate({
          ...project,
          orders: orders.map((item) => item.id === savedOrder.id ? savedOrder : item),
          costs: newCost ? [...costsWithoutOrder, newCost] : costsWithoutOrder
        });
      }
      setIsActionModalOpen(savedOrder);
      setActionType('NONE');
      setActionText('');
      setActionAttachments([]);
    } catch (error) {
      console.error('Erro ao atualizar status do pedido:', error);
      alert('Não foi possível concluir a atualização do pedido. Tente novamente.');
    }
  };

  const handleUpdateMacroItem = () => {
    if (!isActionModalOpen) return;
    if (!selectedMacroItemId) return alert('Selecione um item macro para vincular ao pedido.');
    if (!confirm(`Vincular o item macro ao pedido "${isActionModalOpen.title}"?`)) return;

    const macroName = project.budget.find((macro) => macro.id === selectedMacroItemId)?.description || 'ITEM MACRO';
    const updatedOrder: Order = {
      ...isActionModalOpen,
      macroItemId: selectedMacroItemId,
      messages: [...(isActionModalOpen.messages || []), {
        id: crypto.randomUUID(),
        userId: 'system',
        userName: 'SISTEMA',
        text: `${user.name} alterou a apropriação do pedido para ${macroName}.`,
        date: new Date().toISOString()
      }]
    };
    void (async () => {
      const savedOrder = await onPersistOrder(project.id, updatedOrder);
      setIsActionModalOpen(savedOrder);
      setIsEditingSectorStatus(false);
    })();
  };

  const handleSaveSectorStatus = () => {
    if (!isActionModalOpen) return;
    if (!canEditSectorStatus(isActionModalOpen)) return alert('Você não pode alterar o status deste setor.');
    const availableStatuses = getEditableSectorStatuses(isActionModalOpen);
    if (availableStatuses.length === 0) return alert('Não há status configurados para o setor atual.');
    if (selectedSectorStatus && !availableStatuses.includes(selectedSectorStatus)) return alert('Selecione um status válido.');
    if ((selectedSectorStatus || '') === (isActionModalOpen.sectorStatus || '')) return;
    if (!confirm(`Salvar o status setorial do pedido "${isActionModalOpen.title}"?`)) return;

    const updatedOrder: Order = {
      ...isActionModalOpen,
      sectorStatus: selectedSectorStatus || undefined,
      messages: [...(isActionModalOpen.messages || []), {
        id: crypto.randomUUID(),
        userId: 'system',
        userName: 'SISTEMA',
        text: selectedSectorStatus
          ? `${user.name} alterou o status do setor para ${selectedSectorStatus}.`
          : `${user.name} removeu o status do setor.`,
        date: new Date().toISOString()
      }]
    };
    void (async () => {
      const savedOrder = await onPersistOrder(project.id, updatedOrder);
      setIsActionModalOpen(savedOrder);
    })();
  };

  const handleForwardOrder = () => {
    if (!isActionModalOpen) return;
    if (!canForwardOrder(isActionModalOpen)) return;
    if (!selectedForwardSectorId) return alert('Selecione o setor de destino.');
    if (selectedForwardSectorId === isActionModalOpen.currentSectorId) return alert('Selecione um setor diferente do atual.');

    const nextSectorName = findSectorName(selectedForwardSectorId) || 'SETOR';
    const previousSectorName = isActionModalOpen.currentSectorName || 'SEM SETOR';
    if (!confirm(`Encaminhar o pedido "${isActionModalOpen.title}" para o setor "${nextSectorName}"?`)) return;

    const updatedOrder: Order = {
      ...isActionModalOpen,
      currentSectorId: selectedForwardSectorId,
      currentSectorName: nextSectorName,
      accessibleSectorIds: Array.from(new Set([...(isActionModalOpen.accessibleSectorIds || []), ...(isActionModalOpen.currentSectorId ? [isActionModalOpen.currentSectorId] : []), selectedForwardSectorId])),
      responsibleId: undefined,
      responsibleName: undefined,
      status: 'PENDENTE',
      messages: [...(isActionModalOpen.messages || []), {
        id: crypto.randomUUID(),
        userId: 'system',
        userName: 'SISTEMA',
        text: `Pedido encaminhado de ${previousSectorName} para ${nextSectorName} por ${user.name}.`,
        date: new Date().toISOString()
      }]
    };

    void (async () => {
      const savedOrder = await onPersistOrder(project.id, updatedOrder);
      setIsActionModalOpen(savedOrder);
    })();
  };

  const handleReopenOrder = () => {
    if (!isActionModalOpen) return;
    if (!canReopenOrder(isActionModalOpen)) return alert('Você não pode reabrir este pedido.');
    if (!confirm(`Reabrir o pedido "${isActionModalOpen.title}"?`)) return;

    const updatedOrder: Order = {
      ...isActionModalOpen,
      status: 'PENDENTE',
      messages: [...(isActionModalOpen.messages || []), {
        id: crypto.randomUUID(),
        userId: 'system',
        userName: 'SISTEMA',
        text: `${user.name} reabriu o pedido.`,
        date: new Date().toISOString()
      }]
    };

    void (async () => {
      const savedOrder = await onPersistOrder(project.id, updatedOrder);
      setIsActionModalOpen(savedOrder);
    })();
  };

const getStatusColor = (status: OrderStatus) => {
  switch (status) {
      case 'PENDENTE':
        return 'bg-amber-100 text-amber-700';
      case 'EM_ANALISE':
        return 'bg-blue-100 text-blue-700';
      case 'AGUARDANDO_INFORMACAO':
        return 'bg-purple-100 text-purple-700';
      case 'CONCLUIDO':
        return 'bg-emerald-100 text-emerald-700';
      case 'CANCELADO':
        return 'bg-rose-100 text-rose-700';
      default:
        return 'bg-slate-100 text-slate-700';
  }
};

const renderListStatusBadge = (order: Order) => {
  if (order.sectorStatus) {
    return (
      <span className="inline-flex text-[8px] font-black uppercase px-2 py-1 rounded-none whitespace-nowrap bg-blue-50 text-blue-700 border border-blue-200">
        {order.sectorStatus}
      </span>
    );
  }

  return (
    <span title={order.status.replace('_', ' ')} className={`inline-flex text-[8px] font-black uppercase px-2 py-1 rounded-none whitespace-nowrap ${getStatusColor(order.status)}`}>
      {order.status.replace('_', ' ')}
    </span>
  );
};

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4 bg-white p-5 sm:p-8 rounded-none border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Pedidos de Obra</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Fluxo de solicitações de campo para o escritório central.</p>
        </div>
        {!canManageProjectOrders && <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-black text-white px-10 py-4 rounded-none font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95">Novo Pedido</button>}
      </div>

      <div className="hidden lg:block bg-white border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left table-fixed">
            <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-4 py-4 w-[8%]">Data Solic.</th>
                <th className="px-4 py-4 w-[8%]">Data Desejada</th>
                <th className="px-4 py-4 w-[11%]">Código</th>
                <th className="px-4 py-4 w-[10%]">Obra / Origem</th>
                <th className="px-4 py-4 w-[12%]">Título do Pedido</th>
                <th className="px-4 py-4 w-[15%]">Descrição</th>
                <th className="px-4 py-4 w-[10%]">Tipo</th>
                <th className="px-4 py-4 w-[8%]">Valor</th>
                <th className="px-4 py-4 w-[7%]">Status</th>
                <th className="px-4 py-4 w-[9%]">Solicitante</th>
                <th className="px-4 py-4 w-[12%]">Setor Atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openOrderModal(order)}>
                  <td className="px-4 py-4 text-[10px] font-bold text-slate-500 font-mono whitespace-nowrap">{formatOrderDate(order.createdAt)}</td>
                  <td className="px-4 py-4 text-[10px] font-bold text-slate-500 font-mono whitespace-nowrap">{formatOrderDate(order.expectedDate)}</td>
                  <td className="px-4 py-4">
                    <div className="text-[10px] font-black text-slate-900 uppercase whitespace-nowrap" title={order.orderCode || 'Código pendente'}>{order.orderCode || 'Código pendente'}</div>
                    {order.externalCode && <div className="text-[9px] text-amber-600 font-bold uppercase whitespace-nowrap truncate" title={`Legado: ${order.externalCode}`}>Legado: {order.externalCode}</div>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900 uppercase text-xs truncate" title={project.name}>{project.name}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase truncate" title={order.requesterName}>{order.requesterName}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900 uppercase text-xs truncate" title={order.title}>{order.title}</div>
                    <div className="text-[9px] text-blue-600 font-bold uppercase tracking-tighter truncate" title={project.budget.find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}>{project.budget.find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-[10px] text-slate-600 font-bold leading-relaxed line-clamp-3" title={order.description || '-'}>{order.description || '-'}</div>
                  </td>
                  <td className="px-4 py-4 text-[10px] font-black text-blue-600 uppercase truncate" title={order.type}>{order.type}</td>
                  <td className="px-4 py-4 text-[10px] font-black text-slate-700 whitespace-nowrap">{formatMoney(order.value)}</td>
                  <td className="px-4 py-4">{renderListStatusBadge(order)}</td>
                  <td className="px-4 py-4 text-[10px] font-black uppercase text-slate-600 truncate" title={order.requesterName}>{order.requesterName}</td>
                  <td className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 truncate" title={order.currentSectorName || 'SEM SETOR'}>{order.currentSectorName || 'SEM SETOR'}</td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={11} className="px-6 py-12 text-center text-slate-300 font-black uppercase text-xs tracking-widest">Nenhum pedido registrado nesta obra.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:hidden space-y-4">
        {orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((order) => (
          <div key={order.id} className="bg-white border border-slate-200 shadow-sm p-4 space-y-4 cursor-pointer" onClick={() => openOrderModal(order)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-black text-slate-900 uppercase text-sm">{order.title}</div>
                <div className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">{project.budget.find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}</div>
              </div>
              {renderListStatusBadge(order)}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[10px] font-bold uppercase">
              <div className="bg-slate-50 border border-slate-100 p-3"><div className="text-slate-400">Data Solic.</div><div className="text-slate-700 mt-1">{formatOrderDate(order.createdAt)}</div></div>
              <div className="bg-slate-50 border border-slate-100 p-3"><div className="text-slate-400">Data Desejada</div><div className="text-slate-700 mt-1">{formatOrderDate(order.expectedDate)}</div></div>
              <div className="bg-slate-50 border border-slate-100 p-3 col-span-2"><div className="text-slate-400">Código</div><div className="text-slate-900 mt-1">{order.orderCode || 'Código pendente'}</div>{order.externalCode && <div className="text-amber-600 mt-1">Legado: {order.externalCode}</div>}</div>
              <div className="bg-slate-50 border border-slate-100 p-3 col-span-2"><div className="text-slate-400">Obra / Origem</div><div className="text-slate-900 mt-1">{project.name}</div></div>
              <div className="bg-slate-50 border border-slate-100 p-3 col-span-2"><div className="text-slate-400">Título do Pedido</div><div className="text-slate-900 mt-1">{order.title}</div><div className="text-slate-500 mt-1">{project.budget.find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}</div></div>
              <div className="bg-slate-50 border border-slate-100 p-3 col-span-2"><div className="text-slate-400">Descrição</div><div className="text-slate-900 mt-1 normal-case leading-relaxed">{order.description || '-'}</div></div>
              <div className="bg-slate-50 border border-slate-100 p-3"><div className="text-slate-400">Tipo</div><div className="text-blue-600 mt-1">{order.type}</div></div>
              <div className="bg-slate-50 border border-slate-100 p-3"><div className="text-slate-400">Valor</div><div className="text-slate-900 mt-1">{formatMoney(order.value)}</div></div>
              <div className="bg-slate-50 border border-slate-100 p-3"><div className="text-slate-400">Solicitante</div><div className="text-slate-700 mt-1">{order.requesterName}</div></div>
              <div className="bg-slate-50 border border-slate-100 p-3"><div className="text-slate-400">Setor Atual</div><div className="text-slate-700 mt-1">{order.currentSectorName || 'Sem setor'}</div></div>
            </div>
          </div>
        ))}
        {orders.length === 0 && <div className="bg-white border border-slate-200 p-12 text-center text-slate-300 font-black uppercase text-xs tracking-widest">Nenhum pedido registrado nesta obra.</div>}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 sm:p-6">
          <div className="bg-white w-full max-w-3xl max-h-[95vh] shadow-2xl overflow-y-auto">
            <div className="bg-slate-900 p-5 sm:p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Protocolar Novo Pedido</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white"><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleCreateOrder} className="p-5 sm:p-8 md:p-10 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título do Pedido</label>
                  <input required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs" value={newOrder.title} onChange={(e) => setNewOrder({ ...newOrder, title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apropriação (Item Macro)</label>
                  <select required={!isNewOrderOtherType} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs uppercase" value={newOrder.macroItemId} onChange={(e) => setNewOrder({ ...newOrder, macroItemId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {project.budget.map((macro) => <option key={macro.id} value={macro.id}>{macro.description}</option>)}
                  </select>
                </div>
              </div>
              {sectors.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Setor de Destino</label>
                  <select required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs uppercase" value={newOrder.currentSectorId || ''} onChange={(e) => setNewOrder({ ...newOrder, currentSectorId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Pedido</label>
                  <input required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs uppercase" value={newOrder.type} onChange={(e) => setNewOrder({ ...newOrder, type: e.target.value.toUpperCase() })} placeholder="EX: COMPRA DE MATERIAL / OUTROS" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Previsto (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                    <input required={!isNewOrderOtherType} type="text" inputMode="decimal" className="w-full bg-slate-50 border border-slate-200 px-12 py-3 font-black text-slate-800 text-xs" value={formatMoneyInput(newOrder.value)} onChange={(e) => setNewOrder({ ...newOrder, value: parseMoneyInput(e.target.value) })} placeholder={isNewOrderOtherType ? 'Opcional para OUTROS' : '0,00'} />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição / Justificativa</label>
                <textarea rows={4} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs" value={newOrder.description} onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Desejada</label>
                  <input required type="date" className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs" value={newOrder.expectedDate} onChange={(e) => setNewOrder({ ...newOrder, expectedDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anexos (Cotação/Doc)</label>
                  <input type="file" multiple className="w-full text-xs font-black text-slate-400 file:bg-slate-100 file:border-none file:px-4 file:py-3 file:mr-4 file:font-black file:uppercase file:cursor-pointer" onChange={(e) => void handleFileUpload(e, 'NEW')} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Arquivos anexados</label>
                {renderAttachmentList(newOrder.attachments || [], removeNewOrderAttachment, 'Nenhum anexo selecionado.')}
              </div>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px]">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-900 text-white py-4 font-black uppercase text-[10px] shadow-xl">Enviar Solicitação</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isActionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-[120] p-4 sm:p-6">
          <div className="bg-white w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
            <div className="p-5 sm:p-8 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`text-[9px] font-black uppercase px-2 py-1 ${getStatusColor(isActionModalOpen.status)} block w-fit`}>{isActionModalOpen.status.replace('_', ' ')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 block w-fit">
                      {isActionModalOpen.sectorStatus || 'Sem status setorial'}
                    </span>
                    {canEditSectorStatus(isActionModalOpen) && (
                      <button
                        type="button"
                        onClick={() => setIsEditingSectorStatus((current) => !current)}
                        className="w-7 h-7 border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-slate-300"
                        title="Editar status do setor"
                      >
                        <i className="fas fa-pen text-[10px]"></i>
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{isActionModalOpen.title}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Por {isActionModalOpen.requesterName} em {new Date(isActionModalOpen.createdAt).toLocaleString('pt-BR')}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canDeleteOrderDirectly && (
                  <button type="button" onClick={() => handleDeleteOrder(isActionModalOpen)} className="bg-rose-50 text-rose-600 border border-rose-200 px-4 py-3 text-[9px] font-black uppercase shadow-sm">
                    Excluir
                  </button>
                )}
                <button onClick={() => setIsActionModalOpen(null)} className="text-slate-400 hover:text-slate-600 px-2"><i className="fas fa-times text-xl"></i></button>
              </div>
            </div>
            {isEditingSectorStatus && (getEditableSectorStatuses(isActionModalOpen).length > 0 || isActionModalOpen.sectorStatus) && (
              <div className="px-5 sm:px-8 py-4 border-b border-slate-100 bg-white">
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    className="flex-1 bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase"
                    value={selectedSectorStatus}
                    onChange={(event) => setSelectedSectorStatus(event.target.value)}
                    disabled={!canEditSectorStatus(isActionModalOpen)}
                  >
                    <option value="">Sem status setorial</option>
                    {getEditableSectorStatuses(isActionModalOpen).map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <button type="button" onClick={handleSaveSectorStatus} className="bg-slate-900 text-white px-5 py-3 text-[10px] font-black uppercase tracking-widest shadow-sm">
                    Salvar Status
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10 grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-10">
              <div className="space-y-8">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Descrição da Solicitação</label>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed bg-slate-50 p-5 border border-slate-100 italic">"{isActionModalOpen.description}"</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-100 p-4">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Código do Pedido</label>
                    <p className="text-[10px] font-black text-slate-900">{isActionModalOpen.orderCode || 'Será gerado pelo backend'}</p>
                  </div>
                  <div className="bg-white border border-slate-100 p-4">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Código Externo</label>
                    <p className="text-[10px] font-black text-slate-900">{isActionModalOpen.externalCode || 'Não informado'}</p>
                  </div>
                  <div className="bg-white border border-slate-100 p-4 sm:col-span-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Setor Atual</label>
                    <p className="text-[10px] font-black text-slate-900 uppercase">{isActionModalOpen.currentSectorName || 'SEM SETOR DEFINIDO'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-100 p-4">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Apropriação</label>
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-blue-600 uppercase">{project.budget.find((macro) => macro.id === isActionModalOpen.macroItemId)?.description || 'Item macro não vinculado'}</p>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 font-black text-[10px] uppercase"
                        value={selectedMacroItemId}
                        onChange={(event) => setSelectedMacroItemId(event.target.value)}
                        disabled={!canEditFinancialFields || !isOrderActive(isActionModalOpen)}
                      >
                        <option value="">Selecione...</option>
                        {project.budget.map((macro) => <option key={macro.id} value={macro.id}>{macro.description}</option>)}
                      </select>
                      {canEditFinancialFields && isOrderActive(isActionModalOpen) && (
                        <button type="button" onClick={handleUpdateMacroItem} className="w-full bg-slate-900 text-white py-2 font-black uppercase text-[9px] tracking-widest">
                          Salvar Item Macro
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-100 p-4">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Valor Atual</label>
                    <p className="text-[10px] font-black text-slate-800">{formatMoney(isActionModalOpen.value)}</p>
                  </div>
                </div>
                {canForwardOrder(isActionModalOpen) && sectors.length > 0 && (
                  <div className="bg-white border border-slate-100 p-4 space-y-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase block">Encaminhar para Outro Setor</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-3 py-2 font-black text-[10px] uppercase" value={selectedForwardSectorId} onChange={(event) => setSelectedForwardSectorId(event.target.value)}>
                      <option value="">Selecione...</option>
                      {sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
                    </select>
                    <button type="button" onClick={handleForwardOrder} className="w-full bg-slate-900 text-white py-2 font-black uppercase text-[9px] tracking-widest">
                      Encaminhar Pedido
                    </button>
                  </div>
                )}
                {isActionModalOpen.attachments && isActionModalOpen.attachments.length > 0 && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Anexos do Pedido</label>
                    <div className="flex flex-wrap gap-2">
                      {isActionModalOpen.attachments.map((attachment) => (
                        <div key={attachment.id} className="flex items-center gap-2">
                          <button type="button" onClick={() => handlePreviewAttachment(attachment)} className="px-3 py-2 bg-blue-50 border border-blue-200 text-[9px] font-black uppercase text-blue-700">
                            Visualizar
                          </button>
                          <button type="button" onClick={() => downloadAttachment(attachment)} className="px-3 py-2 bg-white border border-slate-200 text-[9px] font-black uppercase text-slate-600">
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isActionModalOpen.messages.length > 0 && (
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Histórico de Mensagens</label>
                    <div className="space-y-4 max-h-60 overflow-y-auto pr-4">
                      {isActionModalOpen.messages.map((message) => {
                        const meta = getMessageMeta(isActionModalOpen, message);
                        return (
                        <div key={message.id} className={`p-4 border-l-4 ${meta.classes}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] font-black uppercase text-slate-900">{message.userName}</span>
                            <span className="text-[8px] font-bold text-slate-400">{new Date(message.date).toLocaleString('pt-BR')}</span>
                          </div>
                          <div className="mb-2 text-[8px] font-black uppercase tracking-widest text-slate-500">{meta.label}</div>
                          <p className="text-[11px] font-medium text-slate-600">{message.text}</p>
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {message.attachments.map((attachment) => (
                                <div key={attachment.id} className="flex items-center gap-2">
                                  <button type="button" onClick={() => handlePreviewAttachment(attachment)} className="px-3 py-2 bg-blue-50 border border-blue-200 text-[9px] font-black uppercase text-blue-700">
                                    Visualizar
                                  </button>
                                  <button type="button" onClick={() => downloadAttachment(attachment)} className="px-3 py-2 bg-white border border-slate-200 text-[9px] font-black uppercase text-slate-600">
                                    Download
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )})}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-8 border-l border-slate-100 space-y-6">
                {canReopenOrder(isActionModalOpen) && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Gerenciar Pedido</h4>
                    <button onClick={handleReopenOrder} className="w-full bg-emerald-50 text-emerald-700 border border-emerald-200 py-4 font-black uppercase text-[10px] shadow-sm">
                      Reabrir Pedido
                    </button>
                  </div>
                )}

                {canManageProjectOrders && isActionModalOpen.status !== 'CONCLUIDO' && isActionModalOpen.status !== 'CANCELADO' && (
                  <>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Tratamento do Pedido</h4>
                    <div className="flex bg-white p-1 shadow-sm border border-slate-200">
                      {[{ id: 'COMPLETE', label: 'Concluir' }, { id: 'CANCEL', label: 'Cancelar' }].map((item) => (
                        <button key={item.id} onClick={() => setActionType(item.id as 'COMPLETE' | 'CANCEL')} className={`flex-1 py-3 text-[9px] font-black uppercase transition-all ${actionType === item.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>{item.label}</button>
                      ))}
                    </div>
                    {actionType !== 'NONE' && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        {canEditFinancialFields && (
                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase">Valor do Pedido (R$)</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                              <input type="text" inputMode="decimal" className="w-full bg-white border border-slate-200 pl-12 pr-4 py-4 font-bold text-xs" value={formatMoneyInput(editableOrderValue)} onChange={(e) => { const nextValue = parseMoneyInput(e.target.value) || 0; setEditableOrderValue(nextValue); if (incorporateCost && actionType === 'COMPLETE') setFinalValue(nextValue); }} placeholder="0,00" />
                            </div>
                          </div>
                        )}
                        {actionType === 'COMPLETE' && (
                          <div className="bg-emerald-50 p-4 border border-emerald-100 space-y-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input type="checkbox" checked={incorporateCost} onChange={(e) => { const checked = e.target.checked; setIncorporateCost(checked); if (checked) setFinalValue(Number(editableOrderValue || isActionModalOpen.value || 0)); }} className="w-4 h-4" />
                              <span className="text-[9px] font-black uppercase text-emerald-700">Gerar custo da obra ao concluir</span>
                            </label>
                            {incorporateCost && (
                              <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-black">R$</span>
                                  <input type="text" inputMode="decimal" className="w-full bg-white border border-slate-200 pl-10 pr-3 py-3 font-black text-xs" value={formatMoneyInput(finalValue)} onChange={(e) => setFinalValue(parseMoneyInput(e.target.value) || 0)} placeholder="0,00" />
                                </div>
                                <input type="date" className="bg-white border border-slate-200 p-3 font-black text-xs" value={finalDate} onChange={(e) => setFinalDate(e.target.value)} />
                              </div>
                            )}
                          </div>
                        )}
                        <textarea className="w-full bg-white border border-slate-200 p-4 font-bold text-xs" rows={4} placeholder={actionType === 'COMPLETE' ? 'Observações finais...' : 'Motivo do cancelamento...'} value={actionText} onChange={(e) => setActionText(e.target.value)} />
                        <div className="space-y-2">
                          <input type="file" multiple className="text-[10px] font-bold" onChange={(e) => void handleFileUpload(e, 'ACTION')} />
                          {renderAttachmentList(actionAttachments, removeActionAttachment, 'Nenhum anexo selecionado para esta ação.')}
                        </div>
                        <button onClick={handleAction} className="w-full bg-slate-900 text-white py-4 font-black uppercase text-[10px] shadow-xl">Confirmar Ação</button>
                      </div>
                    )}
                  </>
                )}

                {canCommentOnOrder(isActionModalOpen) && (
                  <div className="space-y-4 pt-4 border-t border-slate-200">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Interações Livres</h4>
                    <textarea className="w-full bg-white border border-slate-200 p-4 font-bold text-xs" rows={4} placeholder="Registre uma orientação, alinhamento ou resposta livre..." value={messageText} onChange={(e) => setMessageText(e.target.value)} />
                    <input type="file" multiple className="text-[10px] font-bold" onChange={(e) => void handleFileUpload(e, 'MESSAGE')} />
                    {renderAttachmentList(messageAttachments, removeMessageAttachment, 'Nenhum anexo selecionado para esta mensagem.')}
                    <button onClick={() => handleSendMessage(isActionModalOpen)} className="w-full bg-purple-600 text-white py-4 font-black uppercase text-[10px] shadow-xl">Adicionar Interação</button>
                  </div>
                )}

                {isActionModalOpen.status === 'CONCLUIDO' && (
                  <div className="bg-emerald-50 p-6 border-l-4 border-emerald-500">
                    <h4 className="text-[11px] font-black text-emerald-700 uppercase mb-2">Pedido Concluído</h4>
                    {isActionModalOpen.completionNote && <p className="text-xs text-emerald-800 font-medium mb-3">"{isActionModalOpen.completionNote}"</p>}
                    {isActionModalOpen.completionAttachment && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => handlePreviewAttachment(isActionModalOpen.completionAttachment!)} className="px-3 py-2 bg-blue-50 border border-blue-200 text-[9px] font-black uppercase text-blue-700">
                          Visualizar Anexo Final
                        </button>
                        <button type="button" onClick={() => downloadAttachment(isActionModalOpen.completionAttachment!)} className="px-3 py-2 bg-white border border-slate-200 text-[9px] font-black uppercase text-slate-600">
                          Download
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] font-black text-emerald-700 uppercase">Valor final registrado: {formatMoney(isActionModalOpen.value)}</p>
                  </div>
                )}

                {isActionModalOpen.status === 'CANCELADO' && (
                  <div className="bg-rose-50 p-6 border-l-4 border-rose-500">
                    <h4 className="text-[11px] font-black text-rose-700 uppercase mb-2">Pedido Cancelado</h4>
                    <p className="text-xs text-rose-800 font-medium italic">"{isActionModalOpen.cancellationReason || 'Sem motivo informado.'}"</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} onDownload={downloadAttachment} />
    </div>
  );
};
