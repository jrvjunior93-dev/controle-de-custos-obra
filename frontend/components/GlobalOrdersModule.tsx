import React, { useEffect, useMemo, useState } from 'react';
import { Attachment, ExecutedCost, Order, OrderMessage, OrderStatus, Project, Sector, User, canManageAssignedOrders } from '../types';
import { AttachmentViewerModal } from './AttachmentViewerModal';
import { canPreviewAttachmentInline, resolveAttachmentForAccess, triggerAttachmentDownload } from '../utils/attachments';

interface GlobalOrdersModuleProps {
  projects: Project[];
  sectors: Sector[];
  user: User;
  onUpdateProjects: (all: Project[]) => void;
  onPersistProject: (project: Project) => Promise<void>;
  onPersistMemberOrder: (projectId: string, order: Order) => Promise<Order>;
  onAddMemberOrderMessage: (projectId: string, orderId: string, message: Partial<OrderMessage>) => Promise<OrderMessage>;
  onDeleteMemberOrder: (projectId: string, orderId: string) => Promise<void>;
  orderTypes: string[];
}

const formatMoney = (value?: number) => `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatMoneyInput = (value?: number) => value == null ? '' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : undefined;
};

const isLegacyLinkedOrderCost = (cost: ExecutedCost, order: Order) => {
  const normalizedCostDescription = String(cost.description || '').trim().toUpperCase();
  const normalizedOrderDescription = `[PEDIDO] ${String(order.title || '').trim()}`.toUpperCase();
  const sameDescription = normalizedCostDescription === normalizedOrderDescription;
  const sameMacro = String(cost.macroItemId || '') === String(order.macroItemId || '');
  const sameValue = Number(cost.totalValue || 0) === Number(order.value || 0);
  const sameDetail = String(cost.itemDetail || '').trim() === String(order.description || '').trim();
  return sameDescription && sameMacro && sameValue && sameDetail;
};
const normalizeDateKey = (value?: string) => {
  if (!value) return '';
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatOrderDate = (value?: string) => {
  const key = normalizeDateKey(value);
  if (!key) return '-';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
};

const getOrderCodeSearchTokens = (order: Order) => {
  const fullCode = String(order.orderCode || '').trim().toLowerCase();
  if (!fullCode) return [];
  const suffix = fullCode.includes('-') ? fullCode.split('-').pop() || '' : '';
  return [fullCode, suffix].filter(Boolean);
};

const isObraSectorName = (name?: string) => String(name || '').trim().toUpperCase() === 'OBRA';
const isComprasSectorMember = (user: User) => user.role === 'MEMBRO' && String(user.sectorName || '').trim().toUpperCase() === 'COMPRAS';
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

const getEffectiveOrderStatusLabel = (order: Order) => order.sectorStatus || 'Sem status setorial';

const renderListStatusBadge = (order: Order) => {
  return (
    <span
      title={getEffectiveOrderStatusLabel(order)}
      className={`inline-flex text-[8px] font-black uppercase px-2 py-1 border whitespace-nowrap ${
        order.sectorStatus
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-slate-50 text-slate-600 border-slate-200'
      }`}
    >
      {getEffectiveOrderStatusLabel(order)}
    </span>
  );
};

const matchesDesiredDateRange = (expectedDate?: string, startDate?: string, endDate?: string) => {
  const targetDateKey = normalizeDateKey(expectedDate);
  const startDateKey = normalizeDateKey(startDate);
  const endDateKey = normalizeDateKey(endDate);

  if (startDateKey && (!targetDateKey || targetDateKey < startDateKey)) return false;
  if (endDateKey && (!targetDateKey || targetDateKey > endDateKey)) return false;
  return true;
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

const normalizeCsvHeader = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const parseCsvRows = (text: string) => {
  const sourceLines = text.split(/\r?\n/);
  const lines: string[] = [];
  let currentRecord = '';
  let quoteCount = 0;

  sourceLines.forEach((line) => {
    if (!currentRecord) {
      currentRecord = line;
    } else {
      currentRecord += `\n${line}`;
    }

    quoteCount += (line.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
      if (currentRecord.trim()) lines.push(currentRecord);
      currentRecord = '';
      quoteCount = 0;
    }
  });

  if (currentRecord.trim()) lines.push(currentRecord);
  if (lines.length < 2) return [];

  const splitLine = (line: string) => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ';' && !inQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current.trim());
    return values;
  };

  const headers = splitLine(lines[0]).map(normalizeCsvHeader);
  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return {
      externalCode: row['codigo'],
      projectCode: row['codigo obra'] || row['codigo_obra'],
      projectName: row['obra'],
      title: row['titulo'],
      description: row['descricao'],
      type: row['tipo de solicitacao'] || row['tipo_solicitacao'],
      value: row['valor'] || row['valor geral'] || row['valor_geral'] || row['valor total'] || row['valor_total'] || row['geral'],
      status: row['status'],
      createdAt: row['data registro'] || row['data_registro'],
      expectedDate: row['data vencimento'] || row['data_vencimento'],
      macroItem: row['item macro'] || row['item_macro'],
    };
  }).filter((row) => row.projectCode || row.projectName || row.description);
};

const downloadImportTemplate = () => {
  const template = [
    'Código;Código Obra;Obra;Título;Descrição;Tipo de Solicitação;Valor;Status;Data Registro;Data Vencimento;Item Macro',
    'LEG-001;OBRA1;OBRA MODELO;COMPRA DE MATERIAL ELETRICO;Compra de material para alimentação do quadro;COMPRA DE MATERIAL;1500,50;PENDENTE;18/03/2026;20/03/2026;',
  ].join('\n');
  const blob = new Blob(['\uFEFF', template], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'modelo_importacao_pedidos.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const buildImportSummary = (result: { imported?: any[]; skipped?: any[] }) => {
  const importedCount = result.imported?.length || 0;
  const skipped = result.skipped || [];
  const lines = [`Importação concluída. ${importedCount} pedido(s) importado(s) e ${skipped.length} ignorado(s).`];

  if (skipped.length > 0) {
    lines.push('', 'Linhas ignoradas:');
    skipped.slice(0, 15).forEach((item, index) => {
      const code = item?.row?.externalCode || item?.row?.codigo || item?.row?.projectCode || item?.row?.obra || `linha ${index + 1}`;
      lines.push(`- ${code}: ${item?.reason || 'Motivo não informado'}`);
    });
    if (skipped.length > 15) {
      lines.push(`- ... e mais ${skipped.length - 15} linha(s) ignorada(s).`);
    }
  }

  return lines.join('\n');
};

const GLOBAL_ORDERS_COLUMN_WIDTHS_KEY = 'csc_brape_global_orders_column_widths';

const exportOrdersToExcel = async (orders: Order[]) => {
  if (orders.length === 0) return;
  const XLSX = await import('xlsx');
  const rows = orders.map((order) => ({
    'Data do Pedido': formatOrderDate(order.createdAt),
    'Data Desejada': formatOrderDate(order.expectedDate),
    'Código do Pedido': order.orderCode || '',
    'Código Externo': order.externalCode || '',
    'Obra': order.projectName || '',
    'Título': order.title || '',
    'Descrição': order.description || '',
    'Tipo do Pedido': order.type || '',
    'Valor do Pedido': Number(order.value || 0),
    'Status Atual': order.status.replaceAll('_', ' '),
    'Status Setorial': order.sectorStatus || '',
    'Setor Atual': order.currentSectorName || '',
    'Solicitante': order.requesterName || '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pedidos');
  XLSX.writeFile(workbook, `pedidos_selecionados_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const GlobalOrdersModule: React.FC<GlobalOrdersModuleProps> = ({ projects, sectors, user, onUpdateProjects, onPersistProject, onPersistMemberOrder, onAddMemberOrderMessage, onDeleteMemberOrder, orderTypes }) => {
  const canManageAllOrders = canManageAssignedOrders(user.role);
  const canImportOrders = user.role === 'SUPERADMIN';
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const defaults = {
      select: 60,
      createdAt: 110,
      expectedDate: 110,
      orderCode: 160,
      project: 170,
      title: 180,
      description: 230,
      type: 170,
      value: 140,
      status: 170,
    };
    if (typeof window === 'undefined') return defaults;
    try {
      const saved = window.localStorage.getItem(GLOBAL_ORDERS_COLUMN_WIDTHS_KEY);
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  });
  const [resizingColumn, setResizingColumn] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState<Order | null>(null);
  const [actionType, setActionType] = useState<'COMPLETE' | 'CANCEL' | 'NONE'>('NONE');
  const [actionText, setActionText] = useState('');
  const [actionAttachments, setActionAttachments] = useState<Attachment[]>([]);
  const [messageText, setMessageText] = useState('');
  const [messageAttachments, setMessageAttachments] = useState<Attachment[]>([]);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string[]>([]);
  const [filterMinValue, setFilterMinValue] = useState('');
  const [filterMaxValue, setFilterMaxValue] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [isProjectFilterOpen, setIsProjectFilterOpen] = useState(false);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
  const [applyOrderCost, setApplyOrderCost] = useState(false);
  const [hasSavedCostAssignment, setHasSavedCostAssignment] = useState(false);
  const [editableOrderValue, setEditableOrderValue] = useState<number>(0);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedMacroItemId, setSelectedMacroItemId] = useState('');
  const [selectedForwardSectorId, setSelectedForwardSectorId] = useState('');
  const [selectedSectorStatus, setSelectedSectorStatus] = useState('');
  const [isEditingSectorStatus, setIsEditingSectorStatus] = useState(false);
  const [isSectorStatusModalOpen, setIsSectorStatusModalOpen] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isBulkActionModalOpen, setIsBulkActionModalOpen] = useState(false);
  const [bulkForwardSectorId, setBulkForwardSectorId] = useState('');
  const [newOrder, setNewOrder] = useState<Partial<Order>>({
    projectId: '',
    title: '',
    type: '',
    description: '',
    macroItemId: '',
    currentSectorId: '',
    expectedDate: '',
    value: undefined,
    attachments: []
  });

  const canUserSeeOrder = (order: Order) => {
    if (canManageAllOrders) return true;
    if (order.requesterId === user.id) return true;
    if (!user.sectorId) return false;
    return order.currentSectorId === user.sectorId || (order.accessibleSectorIds || []).includes(user.sectorId);
  };

  const rawOrders = useMemo(() => {
    const list: Order[] = [];
    projects.forEach((project) => {
      (project.orders || []).forEach((order) => {
        if (canUserSeeOrder(order)) list.push(order);
      });
    });
    return list;
  }, [projects, canManageAllOrders, user.id, user.sectorId]);

  const filteredOrders = useMemo(() => rawOrders.filter((order) => {
    const searchTerm = filterSearch.toLowerCase();
    const normalizedValue = Number(order.value || 0);
    const minValue = filterMinValue ? Number(filterMinValue) : null;
    const maxValue = filterMaxValue ? Number(filterMaxValue) : null;

    const matchSearch = !searchTerm
      || getOrderCodeSearchTokens(order).some((token) => token.includes(searchTerm))
      || order.title.toLowerCase().includes(searchTerm)
      || (order.description || '').toLowerCase().includes(searchTerm);
    const matchStatus = filterStatus.length === 0 || filterStatus.includes(getEffectiveOrderStatusLabel(order));
    const matchProject = filterProject.length === 0 || filterProject.includes(order.projectId);
    const matchType = filterType.length === 0 || filterType.includes(order.type);
    const matchMinValue = minValue == null || normalizedValue >= minValue;
    const matchMaxValue = maxValue == null || normalizedValue <= maxValue;
    const matchDesiredDateRange = matchesDesiredDateRange(order.expectedDate, filterStartDate, filterEndDate);

    return matchSearch && matchStatus && matchProject && matchType && matchMinValue && matchMaxValue && matchDesiredDateRange;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [rawOrders, filterSearch, filterStatus, filterProject, filterType, filterMinValue, filterMaxValue, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.max(70, resizingColumn.startWidth + (event.clientX - resizingColumn.startX));
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
    window.localStorage.setItem(GLOBAL_ORDERS_COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  const usesAssignedProjectScope = !canManageAllOrders && (!user.sectorName || isObraSectorName(user.sectorName));
  const assignedProjects = canManageAllOrders || !usesAssignedProjectScope ? projects : projects.filter((project) => user.assignedProjectIds?.includes(project.id));
  const isOtherOrderType = (value?: string) => String(value || '').trim().toUpperCase() === 'OUTROS';
  const isNewOrderOtherType = isOtherOrderType(newOrder.type);
  const isOrderActive = (order: Order) => order.status !== 'CONCLUIDO' && order.status !== 'CANCELADO';
  const canOpenOrderDetails = (order: Order) => isOrderActive(order) || user.role === 'SUPERADMIN' || user.role === 'ADMIN';
  const canTreatOrder = (order: Order) => canManageAllOrders && isOrderActive(order);
  const canReopenOrder = (order: Order) => canManageAllOrders && (order.status === 'CONCLUIDO' || order.status === 'CANCELADO');
  const canManageFinancialFields = user.role === 'SUPERADMIN' || user.role === 'ADMIN';
  const canEditOrderValue = canManageFinancialFields || isComprasSectorMember(user);
  const canDeleteOrderDirectly = user.role === 'SUPERADMIN' || user.role === 'ADMIN';
  const canCommentOnOrder = (order: Order) => isOrderActive(order);
  const canEditSectorStatus = (order: Order) => isOrderActive(order) && (
    user.role === 'SUPERADMIN' ||
    user.role === 'ADMIN' ||
    (!!user.sectorId && (order.currentSectorId === user.sectorId || (order.accessibleSectorIds || []).includes(user.sectorId)))
  );
  const activeProjectForModal = isActionModalOpen ? projects.find((project) => project.id === isActionModalOpen.projectId) : null;
  const canEditMacroItem = (order: Order) => canManageFinancialFields && isOrderActive(order);
  const canEditOrderValueDirectly = (order: Order) => canEditOrderValue && !!order && isOrderActive(order);
  const getLinkedOrderCost = (order: Order, project = activeProjectForModal) => (
    (project?.costs || []).find((cost) => cost.originOrderId === order.id)
    || (project?.costs || []).find((cost) => !cost.originOrderId && isLegacyLinkedOrderCost(cost, order))
    || null
  );
  const stripLinkedOrderCosts = (costs: ExecutedCost[], order: Order) => (
    costs.filter((cost) => cost.originOrderId !== order.id && !(!cost.originOrderId && isLegacyLinkedOrderCost(cost, order)))
  );
  const findLatestOrderSnapshot = (order: Order) => {
    const project = projects.find((item) => item.id === order.projectId);
    if (!project) return null;
    return (project.orders || []).find((item) => item.id === order.id || item.orderCode === order.orderCode) || null;
  };
  const buildOrderCostRecord = (order: Order, project: Project, existingCost?: ExecutedCost | null): ExecutedCost => {
    const today = new Date().toISOString().split('T')[0];
    const derivedAttachments = [
      ...(existingCost?.attachments || []),
      ...order.attachments,
      ...(order.completionAttachment ? [order.completionAttachment] : []),
    ].filter((attachment, index, list) => attachment && list.findIndex((item) => item.id === attachment.id) === index);
    const value = Number(order.value || 0);

    return {
      id: existingCost?.id || crypto.randomUUID(),
      macroItemId: order.macroItemId!,
      description: `[PEDIDO] ${order.title}`,
      itemDetail: order.description,
      unit: existingCost?.unit || 'un',
      quantity: 1,
      unitValue: value,
      totalValue: value,
      date: existingCost?.date || today,
      entryDate: existingCost?.entryDate || today,
      attachments: derivedAttachments,
      originOrderId: order.id,
    };
  };
  const findSectorName = (sectorId?: string) => sectors.find((sector) => sector.id === sectorId)?.name;
  const getSectorStatuses = (sectorId?: string) => sectors.find((sector) => sector.id === sectorId)?.statuses || [];
  const getEditableSectorStatuses = (order: Order) => {
    if (user.role === 'SUPERADMIN' || user.role === 'ADMIN') {
      return getSectorStatuses(user.sectorId || order.currentSectorId);
    }
    return getSectorStatuses(user.sectorId);
  };
  const getMessageMeta = (order: Order, message: Order['messages'][number]) => {
    if (message.userId === 'system') {
      return { label: 'Sistema', classes: 'bg-slate-50 border-slate-200 text-slate-500' };
    }
    if (message.text.startsWith('Pedido cancelado:')) {
      return { label: 'Cancelamento', classes: 'bg-rose-50 border-rose-200 text-rose-700' };
    }
    if (message.userId === order.requesterId) {
      return { label: 'Resposta do membro', classes: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
    }
    return { label: 'Solicitação da central', classes: 'bg-blue-50 border-blue-200 text-blue-700' };
  };
  const getMessagesForDisplay = (order: Order) => {
    const baseMessages = [...(order.messages || [])];
    if (order.completionAttachment || order.completionNote) {
      baseMessages.push({
        id: `legacy-completion-${order.id}`,
        userId: 'system',
        userName: 'SISTEMA',
        text: order.completionNote || 'Anexo legado do fluxo anterior de conclusão do pedido.',
        date: order.createdAt,
        attachments: order.completionAttachment ? [order.completionAttachment] : undefined,
      });
    }

    return baseMessages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const resetActionState = () => {
    setActionType('NONE');
    setActionText('');
    setActionAttachments([]);
    setMessageText('');
    setMessageAttachments([]);
    setApplyOrderCost(false);
    setEditableOrderValue(0);
  };

  const downloadAttachment = (attachment: Attachment) => {
    void (async () => {
      try {
        await triggerAttachmentDownload(attachment);
      } catch (error) {
        console.error('Erro ao baixar anexo:', error);
        alert('Arquivo indisponível para download no momento.');
      }
    })();
  };

  const handlePreviewAttachment = (attachment: Attachment) => {
    void (async () => {
      try {
        const resolvedAttachment = await resolveAttachmentForAccess(attachment);
        if (!resolvedAttachment.data) {
          alert('Arquivo indisponível para visualização no momento.');
          return;
        }
        if (canPreviewAttachmentInline(resolvedAttachment)) {
          setPreviewAttachment(resolvedAttachment);
          return;
        }
        window.open(resolvedAttachment.data, '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.error('Erro ao preparar visualização do anexo:', error);
        alert('Arquivo indisponível para visualização no momento.');
      }
    })();
  };

  const clearFilters = () => {
    setFilterSearch('');
    setFilterStatus([]);
    setFilterProject([]);
    setFilterType([]);
    setFilterMinValue('');
    setFilterMaxValue('');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  const toggleFilterValue = (current: string[], value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const formatFilterLabel = (selectedValues: string[], allLabel: string, items: { value: string; label: string }[]) => {
    if (selectedValues.length === 0) return allLabel;
    if (selectedValues.length === 1) return items.find((item) => item.value === selectedValues[0])?.label || allLabel;
    return `${selectedValues.length} selecionados`;
  };

  const openOrderModal = (order: Order) => {
    if (!canOpenOrderDetails(order)) {
      alert('Somente ADMIN CENTRAL e SUPERADMIN podem abrir pedidos finalizados ou cancelados.');
      return;
    }
    setSelectedOrderIds([order.id]);
    setIsBulkActionModalOpen(false);
    setIsActionModalOpen(order);
    resetActionState();
    const currentValue = Number(order.value || 0);
    setEditableOrderValue(currentValue);
    const linkedCostExists = !!getLinkedOrderCost(order, projects.find((project) => project.id === order.projectId));
    setApplyOrderCost(linkedCostExists);
    setHasSavedCostAssignment(linkedCostExists);
    setSelectedMacroItemId(order.macroItemId || '');
    setSelectedForwardSectorId(order.currentSectorId || '');
    setSelectedSectorStatus(order.sectorStatus || '');
    setIsEditingSectorStatus(false);
    setIsSectorStatusModalOpen(false);
  };
  useEffect(() => {
    if (!isActionModalOpen) return;
    const latestOrder = findLatestOrderSnapshot(isActionModalOpen);
    if (!latestOrder || latestOrder === isActionModalOpen) return;
    if ((latestOrder.messages || []).length < (isActionModalOpen.messages || []).length) return;

    setIsActionModalOpen(latestOrder);
    setSelectedSectorStatus(latestOrder.sectorStatus || '');
    setSelectedMacroItemId(latestOrder.macroItemId || '');
    setSelectedForwardSectorId(latestOrder.currentSectorId || '');
    setEditableOrderValue(Number(latestOrder.value || 0));
    const linkedCostExists = !!getLinkedOrderCost(latestOrder, projects.find((project) => project.id === latestOrder.projectId));
    setApplyOrderCost(linkedCostExists);
    setHasSavedCostAssignment(linkedCostExists);
  }, [projects, isActionModalOpen]);

  const persistMemberOrder = async (projectId: string, order: Order) => onPersistMemberOrder(projectId, order);

  const persistProjectState = async (project: Project) => {
    if (canManageAllOrders) {
      await onPersistProject(project);
    }
  };

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedType = String(newOrder.type || '').trim().toUpperCase();
    const isOtherType = isOtherOrderType(normalizedType);

    if (!newOrder.projectId) return alert('Por favor, selecione a Obra.');
    if (!newOrder.title?.trim()) return alert('Preencha o título do pedido.');
    if (!normalizedType) return alert('Preencha o tipo do pedido.');
    if (sectors.length > 0 && !newOrder.currentSectorId) return alert('Selecione o setor de destino do pedido.');
    if (!newOrder.expectedDate) return alert('Preencha a data desejada.');
    if (!isOtherType && !newOrder.macroItemId) return alert('Por favor, selecione a Apropriação de Custo.');
    if (!isOtherType && (newOrder.value === undefined || newOrder.value === null || Number(newOrder.value) <= 0)) {
      return alert('Preencha o valor previsto do pedido.');
    }

    const targetProject = projects.find((project) => project.id === newOrder.projectId);
    if (!targetProject) return;
    if (!confirm(`Confirmar abertura do pedido "${newOrder.title}" para a obra "${targetProject.name}"?`)) return;

    const order: Order = {
      id: crypto.randomUUID(),
      projectId: targetProject.id,
      projectName: targetProject.name,
      title: newOrder.title.trim().toUpperCase(),
      type: normalizedType,
      description: newOrder.description?.trim() || '',
      macroItemId: newOrder.macroItemId || '',
      currentSectorId: newOrder.currentSectorId || '',
      currentSectorName: findSectorName(newOrder.currentSectorId || ''),
      accessibleSectorIds: newOrder.currentSectorId ? [newOrder.currentSectorId] : [],
      expectedDate: newOrder.expectedDate || '',
      value: Number(newOrder.value || 0),
      status: 'PENDENTE',
      sectorStatus: 'PENDENTE',
      requesterId: user.id,
      requesterName: user.name,
      attachments: newOrder.attachments || [],
      messages: [{
        id: crypto.randomUUID(),
        userId: 'system',
        userName: 'SISTEMA',
        text: newOrder.currentSectorId ? `Pedido protocolado e enviado para o setor ${findSectorName(newOrder.currentSectorId || '')} por ${user.name}.` : `Pedido protocolado por ${user.name}.`,
        date: new Date().toISOString()
      }],
      createdAt: new Date().toISOString()
    };

    const updatedProject = { ...targetProject, orders: [...(targetProject.orders || []), order] };
    const previousProjects = projects;
    onUpdateProjects(projects.map((project) => project.id === targetProject.id ? updatedProject : project));
    try {
      await onPersistMemberOrder(targetProject.id, order);
      setIsModalOpen(false);
      setNewOrder({ projectId: '', title: '', type: '', description: '', macroItemId: '', currentSectorId: '', expectedDate: '', value: undefined, attachments: [] });
    } catch (error) {
      console.error('Erro ao criar pedido:', error);
      onUpdateProjects(previousProjects);
      alert('Não foi possível salvar o pedido. Tente novamente.');
    }
  };

  const handleImportOrders = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canImportOrders) {
      event.target.value = '';
      alert('Somente o SUPERADMIN pode importar pedidos.');
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const text = await file.text();
      const rows = parseCsvRows(text);
      if (rows.length === 0) {
        alert('Nenhum pedido valido foi encontrado no arquivo.');
        return;
      }

      const result = await dbService.importOrders(rows);
      const importedByProject = new Map<string, Order[]>();
      (result.imported || []).forEach((order) => {
        const current = importedByProject.get(order.projectId) || [];
        current.push(order);
        importedByProject.set(order.projectId, current);
      });

      const nextProjects = projects.map((project) => {
        const importedOrders = importedByProject.get(project.id);
        if (!importedOrders || importedOrders.length === 0) return project;
        return { ...project, orders: [...(project.orders || []), ...importedOrders] };
      });

      onUpdateProjects(nextProjects);
      alert(buildImportSummary(result));
    } catch (error: any) {
      alert(error?.message || 'Erro ao importar pedidos.');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, target: 'NEW' | 'ACTION' | 'MESSAGE') => {
    const files = event.target.files;
    if (!files) return;
    const uploaded: Attachment[] = [];

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const data: string = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      uploaded.push({
        id: crypto.randomUUID(),
        name: file.name,
        originalName: file.name,
        data,
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

  const projectFilterItems = assignedProjects.map((project) => ({ value: project.id, label: project.name }));
  const statusFilterItems = [
    { value: 'Sem status setorial', label: 'Sem status setorial' },
    ...Array.from(new Set(sectors.flatMap((sector) => sector.statuses || []).filter(Boolean))).map((status) => ({
      value: status,
      label: status,
    })),
  ];
  const typeFilterItems = orderTypes.map((type) => ({ value: type, label: type }));
  const selectedOrders = filteredOrders.filter((order) => selectedOrderIds.includes(order.id));
  const selectedOrdersCount = selectedOrders.length;
  const allFilteredOrderIds = filteredOrders.map((order) => order.id);
  const allFilteredSelected = filteredOrders.length > 0 && allFilteredOrderIds.every((id) => selectedOrderIds.includes(id));

  const getColumnStyle = (key: string) => ({
    width: `${columnWidths[key] || 120}px`,
    minWidth: `${columnWidths[key] || 120}px`,
  });

  const startColumnResize = (key: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingColumn({
      key,
      startX: event.clientX,
      startWidth: columnWidths[key] || 120,
    });
  };

  const renderColumnHeader = (key: string, label: string, className = '') => (
    <th className={`px-4 py-5 relative ${className}`} style={getColumnStyle(key)}>
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

  const clearSelectedOrders = () => {
    setSelectedOrderIds([]);
    setIsBulkActionModalOpen(false);
    setBulkForwardSectorId('');
  };

  const handleToggleOrderSelection = (order: Order) => {
    setSelectedOrderIds((current) => current.includes(order.id)
      ? current.filter((item) => item !== order.id)
      : [...current, order.id]);
  };

  const handleToggleSelectAllOrders = () => {
    if (filteredOrders.length === 0) return;
    setSelectedOrderIds((current) => {
      if (allFilteredSelected) {
        return current.filter((id) => !allFilteredOrderIds.includes(id));
      }
      return Array.from(new Set([...current, ...allFilteredOrderIds]));
    });
  };

  const handleOpenSelectionModal = () => {
    if (selectedOrdersCount === 0) return;
    if (selectedOrdersCount === 1) {
      openOrderModal(selectedOrders[0]);
      return;
    }
    setIsActionModalOpen(null);
    setBulkForwardSectorId('');
    setIsBulkActionModalOpen(true);
  };

  const handleExportSelectedOrders = async () => {
    if (selectedOrdersCount < 1) return;
    await exportOrdersToExcel(selectedOrders);
  };

  const handleOpenSingleForwardModal = () => {
    if (selectedOrdersCount !== 1) return;
    setIsActionModalOpen(null);
    setBulkForwardSectorId(selectedOrders[0].currentSectorId || '');
    setIsBulkActionModalOpen(true);
  };

  const handleBulkForwardOrders = () => {
    if (!canManageAllOrders) return alert('Somente administradores podem encaminhar pedidos em massa.');
    if (selectedOrdersCount < 1) return;
    if (!bulkForwardSectorId) return alert('Selecione o setor de destino.');

    const nextSectorName = findSectorName(bulkForwardSectorId) || 'SETOR';
    const invalidOrders = selectedOrders.filter((order) => !isOrderActive(order));
    if (invalidOrders.length > 0) {
      return alert('Remova da seleção os pedidos concluídos ou cancelados antes de encaminhar em massa.');
    }

    if (!confirm(`Encaminhar ${selectedOrdersCount} pedido(s) para o setor "${nextSectorName}"?`)) return;

    const selectedIds = new Set(selectedOrderIds);
    const nextProjects = projects.map((project) => {
      let changed = false;
      const nextOrders = (project.orders || []).map((order) => {
        if (!selectedIds.has(order.id)) return order;
        changed = true;
        const previousSectorName = order.currentSectorName || 'SEM SETOR';
        return {
          ...order,
          currentSectorId: bulkForwardSectorId,
          currentSectorName: nextSectorName,
          accessibleSectorIds: Array.from(new Set([...(order.accessibleSectorIds || []), ...(order.currentSectorId ? [order.currentSectorId] : []), bulkForwardSectorId])),
          responsibleId: undefined,
          responsibleName: undefined,
          status: 'PENDENTE' as OrderStatus,
          messages: [...(order.messages || []), {
            id: crypto.randomUUID(),
            userId: 'system',
            userName: 'SISTEMA',
            text: `Pedido encaminhado de ${previousSectorName} para ${nextSectorName} por ${user.name}.`,
            date: new Date().toISOString()
          }]
        };
      });
      return changed ? { ...project, orders: nextOrders } : project;
    });

    onUpdateProjects(nextProjects);
    nextProjects.forEach((project) => {
      if ((project.orders || []).some((order) => selectedIds.has(order.id))) {
        persistProjectState(project);
      }
    });

    clearSelectedOrders();
  };

  const handleDeleteOrder = (order: Order) => {
    if (!canDeleteOrderDirectly) return alert('Somente ADMIN CENTRAL e SUPERADMIN podem excluir pedidos.');
    if (!confirm('Excluir pedido permanentemente?')) return;

    const targetProject = projects.find((project) => project.id === order.projectId);
    if (!targetProject) return;

    const nextProject = {
      ...targetProject,
      orders: (targetProject.orders || []).filter((item) => item.id !== order.id)
    };

    onUpdateProjects(projects.map((project) => project.id === order.projectId ? nextProject : project));

    if (canManageAllOrders) {
      persistProjectState(nextProject);
    } else {
      void onDeleteMemberOrder(order.projectId, order.id);
    }

    if (isActionModalOpen?.id === order.id) {
      setIsActionModalOpen(null);
    }
  };

  const handleReopenOrder = () => {
    if (!isActionModalOpen) return;
    if (!canReopenOrder(isActionModalOpen)) return alert('Você não pode reabrir este pedido.');
    if (!confirm(`Reabrir o pedido "${isActionModalOpen.title}"?`)) return;

    let updatedOrder: Order | null = null;
    const updatedProject = handleProjectMutation(isActionModalOpen.projectId, (project) => ({
      ...project,
      orders: (project.orders || []).map((item) => {
        if (item.id !== isActionModalOpen.id) return item;
        updatedOrder = {
          ...item,
          status: 'PENDENTE',
          messages: [...(item.messages || []), {
            id: crypto.randomUUID(),
            userId: 'system',
            userName: 'SISTEMA',
            text: `${user.name} reabriu o pedido.`,
            date: new Date().toISOString()
          }]
        };
        return updatedOrder;
      }),
      costs: (project.costs || []).filter((cost) => cost.originOrderId !== isActionModalOpen.id)
    }));

    if (updatedOrder) {
      void (async () => {
        const savedOrder = await persistMemberOrder(isActionModalOpen.projectId, updatedOrder!);
        if (updatedProject) {
          await persistProjectState({ ...updatedProject, orders: (updatedProject.orders || []).map((item) => item.id === savedOrder.id ? savedOrder : item) });
        }
        setIsActionModalOpen(savedOrder);
        setApplyOrderCost(false);
      })();
    }
  };

  const handleSaveOrderValue = () => {
    if (!isActionModalOpen) return;
    if (!canEditOrderValueDirectly(isActionModalOpen)) return;
    if (!confirm(`Salvar o novo valor do pedido "${isActionModalOpen.title}"?`)) return;

    let updatedOrder: Order | null = null;
    const updatedProject = handleProjectMutation(isActionModalOpen.projectId, (project) => ({
      ...project,
      orders: (project.orders || []).map((item) => {
        if (item.id !== isActionModalOpen.id) return item;
        updatedOrder = {
          ...item,
          value: Number(editableOrderValue || 0),
          messages: [...(item.messages || []), {
            id: crypto.randomUUID(),
            userId: 'system',
            userName: 'SISTEMA',
            text: `${user.name} alterou o valor do pedido para R$ ${Number(editableOrderValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
            date: new Date().toISOString()
          }]
        };
        return updatedOrder;
      })
    }));

    if (updatedOrder) {
      void (async () => {
        const savedOrder = await persistMemberOrder(isActionModalOpen.projectId, updatedOrder!);
        setIsActionModalOpen(savedOrder);
        if (activeProjectForModal && getLinkedOrderCost(savedOrder, activeProjectForModal)) {
          const existingCost = getLinkedOrderCost(savedOrder, activeProjectForModal);
          const costsWithoutOrder = (activeProjectForModal.costs || []).filter((cost) => cost.originOrderId !== savedOrder.id);
          await persistProjectState({
            ...activeProjectForModal,
            costs: [...costsWithoutOrder, buildOrderCostRecord(savedOrder, activeProjectForModal, existingCost)],
          });
        }
      })();
    }
  };

  const handleSaveCostAssignment = async () => {
    if (!isActionModalOpen || !activeProjectForModal) return;
    if (!canManageFinancialFields) return alert('Você não pode alterar a vinculação de custo deste pedido.');
    if (applyOrderCost && !isActionModalOpen.macroItemId) return alert('Selecione um item macro antes de vincular o pedido ao custo.');

    const existingCost = getLinkedOrderCost(isActionModalOpen, activeProjectForModal);
    const costsWithoutOrder = stripLinkedOrderCosts(activeProjectForModal.costs || [], isActionModalOpen);
    const nextCosts = applyOrderCost
      ? [...costsWithoutOrder, buildOrderCostRecord(isActionModalOpen, activeProjectForModal, existingCost)]
      : costsWithoutOrder;

    try {
      await persistProjectState({
        ...activeProjectForModal,
        costs: nextCosts,
      });
      setHasSavedCostAssignment(applyOrderCost);
      alert(applyOrderCost ? 'Custo vinculado à obra com sucesso.' : 'Vinculação de custo removida com sucesso.');
    } catch (error) {
      console.error('Erro ao atualizar vínculo de custo do pedido:', error);
      alert('Não foi possível salvar a vinculação do custo. Tente novamente.');
    }
  };

  const handleSaveSectorStatus = async (nextStatus = selectedSectorStatus) => {
    if (!isActionModalOpen) return;
    if (!canEditSectorStatus(isActionModalOpen)) return alert('Voce nao pode alterar o status deste setor.');
    const availableStatuses = getEditableSectorStatuses(isActionModalOpen);
    if (availableStatuses.length === 0) return alert('Nao ha status configurados para o setor atual.');
    if (nextStatus && !availableStatuses.includes(nextStatus)) return alert('Selecione um status valido.');
    if ((nextStatus || '') === (isActionModalOpen.sectorStatus || '')) return;
    if (!confirm(
      	`Salvar o status setorial do pedido "${isActionModalOpen.title}"?`
    )) return;

    let updatedOrder: Order | null = null;
    const previousProjects = projects;
    handleProjectMutation(isActionModalOpen.projectId, (project) => ({
      ...project,
      orders: (project.orders || []).map((item) => {
        if (item.id !== isActionModalOpen.id) return item;
        updatedOrder = {
          ...item,
          sectorStatus: nextStatus || undefined,
          messages: [...(item.messages || []), {
            id: crypto.randomUUID(),
            userId: 'system',
            userName: 'SISTEMA',
            text: nextStatus
              ? `${user.name} alterou o status do setor para ${nextStatus}.`
              : `${user.name} removeu o status do setor.`,
            date: new Date().toISOString()
          }]
        };
        return updatedOrder;
      })
    }));

    if (!updatedOrder) return;

    try {
      const savedOrder = await persistMemberOrder(isActionModalOpen.projectId, updatedOrder);
      setIsActionModalOpen(savedOrder);
      setSelectedSectorStatus(savedOrder.sectorStatus || '');
      setIsEditingSectorStatus(false);
      setIsSectorStatusModalOpen(false);
    } catch (error) {
      console.error('Erro ao salvar status setorial do pedido:', error);
      onUpdateProjects(previousProjects);
      alert('Nao foi possivel salvar o status setorial. Tente novamente.');
    }
  };

  const handleProjectMutation = (projectId: string, mutate: (project: Project) => Project) => {
    const targetProject = projects.find((project) => project.id === projectId);
    if (!targetProject) return null;

    const nextProject = mutate(targetProject);
    onUpdateProjects(projects.map((project) => project.id === projectId ? nextProject : project));
    return nextProject;
  };

  const handleSendMessage = async () => {
    if (!isActionModalOpen || (!messageText.trim() && messageAttachments.length === 0)) {
      return alert('Escreva um comentario ou selecione ao menos um arquivo para enviar.');
    }
    if (!canCommentOnOrder(isActionModalOpen)) return alert('Este pedido não aceita mais interações.');
    if (!confirm(`Registrar envio no pedido "${isActionModalOpen.title}"?`)) return;
    try {
      const savedMessage = await onAddMemberOrderMessage(isActionModalOpen.projectId, isActionModalOpen.id, {
        userId: user.id,
        userName: user.name,
        text: messageText.trim() || 'Arquivos enviados.',
        date: new Date().toISOString(),
        attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
      });
      const savedOrder = {
        ...isActionModalOpen,
        messages: [...(isActionModalOpen.messages || []), savedMessage],
      };
      onUpdateProjects(projects.map((project) => project.id === isActionModalOpen.projectId ? {
        ...project,
        orders: (project.orders || []).map((item) => item.id === isActionModalOpen.id ? savedOrder : item)
      } : project));
      setIsActionModalOpen(savedOrder);
      const sentOnlyAttachments = !messageText.trim() && messageAttachments.length > 0;
      setMessageText('');
      setMessageAttachments([]);
      alert(sentOnlyAttachments ? 'Arquivo enviado com sucesso.' : 'Comentario enviado com sucesso.');
    } catch (error: any) {
      console.error('Erro ao salvar interação do pedido:', error);
      alert(error?.message || 'Não foi possível salvar a interação. Tente novamente.');
    }
  };

  const handleDecision = async () => {
    if (!isActionModalOpen || actionType === 'NONE') return;
    if (!canTreatOrder(isActionModalOpen)) return alert('Você não pode tratar este pedido.');
    if (actionType === 'CANCEL' && !actionText.trim()) return alert('Preencha a mensagem do cancelamento antes de continuar.');
    const actionLabel = actionType === 'COMPLETE' ? 'finalizar' : 'cancelar';
    if (!confirm(`Confirmar a ação de ${actionLabel} para o pedido "${isActionModalOpen.title}"?`)) return;

    const updated: Order = {
      ...isActionModalOpen,
      value: canEditOrderValue ? Number(editableOrderValue || 0) : isActionModalOpen.value,
      macroItemId: canManageFinancialFields ? (selectedMacroItemId || undefined) : isActionModalOpen.macroItemId,
    };

    if (actionType === 'COMPLETE') {
      updated.status = 'CONCLUIDO';
      updated.completionNote = actionText;
      updated.completionAttachment = actionAttachments[0] || undefined;
    } else if (actionType === 'CANCEL') {
      updated.status = 'CANCELADO';
      updated.cancellationReason = actionText.trim();
      updated.messages = [...(updated.messages || []), {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        text: `Pedido cancelado: ${actionText.trim()}`,
        date: new Date().toISOString(),
        attachments: actionAttachments.length > 0 ? actionAttachments : undefined
      }];
    }

    const previousProjects = projects;
    const updatedProject = handleProjectMutation(updated.projectId, (project) => ({
      ...project,
      orders: (project.orders || []).map((order) => order.id === updated.id ? updated : order),
    }));

    try {
      const savedOrder = await persistMemberOrder(updated.projectId, updated);
      setIsActionModalOpen(savedOrder);
      setActionType('NONE');
      setActionText('');
      setActionAttachments([]);
    } catch (error) {
      console.error('Erro ao concluir atualização do pedido:', error);
      onUpdateProjects(previousProjects);
      alert('Não foi possível salvar a alteração do pedido. Tente novamente.');
    }
  };

  const handleUpdateMacroItem = () => {
    if (!isActionModalOpen || !activeProjectForModal) return;
    if (!selectedMacroItemId) return alert('Selecione um item macro para vincular ao pedido.');
    if (!confirm(`Vincular o item macro ao pedido "${isActionModalOpen.title}"?`)) return;

    let updatedOrder: Order | null = null;
    const updatedProject = handleProjectMutation(isActionModalOpen.projectId, (project) => ({
      ...project,
      orders: (project.orders || []).map((item) => {
        if (item.id !== isActionModalOpen.id) return item;
        const macroName = (project.budget || []).find((macro) => macro.id === selectedMacroItemId)?.description || 'ITEM MACRO';
        updatedOrder = {
          ...item,
          macroItemId: selectedMacroItemId,
          messages: [...(item.messages || []), {
            id: crypto.randomUUID(),
            userId: 'system',
            userName: 'SISTEMA',
            text: `${user.name} alterou a apropriação do pedido para ${macroName}.`,
            date: new Date().toISOString()
          }]
        };
        return updatedOrder;
      })
    }));

    if (updatedOrder) {
      void (async () => {
        const savedOrder = await persistMemberOrder(isActionModalOpen.projectId, updatedOrder!);
        setIsActionModalOpen(savedOrder);
      })();
    }
  };

  const handleForwardOrder = () => {
    if (!isActionModalOpen) return;
    if (!canManageAllOrders || !isOrderActive(isActionModalOpen)) return;
    if (!selectedForwardSectorId) return alert('Selecione o setor de destino.');
    if (selectedForwardSectorId === isActionModalOpen.currentSectorId) return alert('Selecione um setor diferente do atual.');

    const nextSectorName = findSectorName(selectedForwardSectorId) || 'SETOR';
    const previousSectorName = isActionModalOpen.currentSectorName || 'SEM SETOR';
    if (!confirm(`Encaminhar o pedido "${isActionModalOpen.title}" para o setor "${nextSectorName}"?`)) return;

    let updatedOrder: Order | null = null;
    const updatedProject = handleProjectMutation(isActionModalOpen.projectId, (project) => ({
      ...project,
      orders: (project.orders || []).map((item) => {
        if (item.id !== isActionModalOpen.id) return item;
        updatedOrder = {
          ...item,
          currentSectorId: selectedForwardSectorId,
          currentSectorName: nextSectorName,
          accessibleSectorIds: Array.from(new Set([...(item.accessibleSectorIds || []), ...(item.currentSectorId ? [item.currentSectorId] : []), selectedForwardSectorId])),
          responsibleId: undefined,
          responsibleName: undefined,
          status: 'PENDENTE',
          messages: [...(item.messages || []), {
            id: crypto.randomUUID(),
            userId: 'system',
            userName: 'SISTEMA',
            text: `Pedido encaminhado de ${previousSectorName} para ${nextSectorName} por ${user.name}.`,
            date: new Date().toISOString()
          }]
        };
        return updatedOrder;
      })
    }));

    if (updatedOrder) {
      void (async () => {
        const savedOrder = await persistMemberOrder(isActionModalOpen.projectId, updatedOrder!);
        setIsActionModalOpen(savedOrder);
      })();
    }
  };

  return (
    <div className="w-full max-w-none mx-auto p-8 space-y-6 relative">
      <div className="bg-white p-8 border border-slate-200 shadow-xl flex flex-wrap justify-between items-end gap-4">
        <div>
          <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Central de Pedidos</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Gestão consolidada de suprimentos e aprovações de campo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canImportOrders && (
            <>
              <button type="button" onClick={downloadImportTemplate} className="bg-white border border-slate-300 text-slate-700 px-6 py-4 font-black uppercase text-xs tracking-widest shadow-sm hover:bg-slate-50">
                Baixar Modelo
              </button>
              <label className={`px-6 py-4 font-black uppercase text-xs tracking-widest shadow-sm border ${isImporting ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-emerald-600 text-white border-emerald-600 cursor-pointer hover:bg-emerald-700'}`}>
                {isImporting ? 'Importando...' : 'Importar Pedidos'}
                <input type="file" accept=".csv" className="hidden" disabled={isImporting} onChange={(event) => void handleImportOrders(event)} />
              </label>
            </>
          )}
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-black text-white px-10 py-4 font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 z-10">
            Novo Pedido
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 bg-white p-6 border border-slate-200">
        <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Filtrar por código do pedido..." className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold outline-none" />
        <div className="relative">
          <button type="button" onClick={() => { setIsProjectFilterOpen((current) => !current); setIsStatusFilterOpen(false); setIsTypeFilterOpen(false); }} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-left text-[10px] font-black uppercase flex items-center justify-between">
            <span>{formatFilterLabel(filterProject, 'Todas as Obras', projectFilterItems)}</span>
            <i className={`fas fa-chevron-${isProjectFilterOpen ? 'up' : 'down'} text-slate-400`}></i>
          </button>
          {isProjectFilterOpen && (
            <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 shadow-xl p-2 max-h-64 overflow-y-auto">
              {projectFilterItems.map((item) => (
                <label key={item.value} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={filterProject.includes(item.value)} onChange={() => toggleFilterValue(filterProject, item.value, setFilterProject)} />
                  <span className="text-[10px] font-black uppercase text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onClick={() => { setIsStatusFilterOpen((current) => !current); setIsProjectFilterOpen(false); setIsTypeFilterOpen(false); }} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-left text-[10px] font-black uppercase flex items-center justify-between">
            <span>{formatFilterLabel(filterStatus, 'Status (Todos)', statusFilterItems)}</span>
            <i className={`fas fa-chevron-${isStatusFilterOpen ? 'up' : 'down'} text-slate-400`}></i>
          </button>
          {isStatusFilterOpen && (
            <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 shadow-xl p-2 max-h-64 overflow-y-auto">
              {statusFilterItems.map((item) => (
                <label key={item.value} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={filterStatus.includes(item.value)} onChange={() => toggleFilterValue(filterStatus, item.value, setFilterStatus)} />
                  <span className="text-[10px] font-black uppercase text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onClick={() => { setIsTypeFilterOpen((current) => !current); setIsProjectFilterOpen(false); setIsStatusFilterOpen(false); }} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-left text-[10px] font-black uppercase flex items-center justify-between">
            <span>{formatFilterLabel(filterType, 'Tipo do Pedido (Todos)', typeFilterItems)}</span>
            <i className={`fas fa-chevron-${isTypeFilterOpen ? 'up' : 'down'} text-slate-400`}></i>
          </button>
          {isTypeFilterOpen && (
            <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 shadow-xl p-2 max-h-64 overflow-y-auto">
              {typeFilterItems.map((item) => (
                <label key={item.value} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={filterType.includes(item.value)} onChange={() => toggleFilterValue(filterType, item.value, setFilterType)} />
                  <span className="text-[10px] font-black uppercase text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <input type="number" min="0" step="0.01" value={filterMinValue} onChange={(e) => setFilterMinValue(e.target.value)} placeholder="Valor mínimo" className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold outline-none" />
        <input type="number" min="0" step="0.01" value={filterMaxValue} onChange={(e) => setFilterMaxValue(e.target.value)} placeholder="Valor máximo" className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold outline-none" />
        <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} title="Data desejada inicial" className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold outline-none" />
        <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} title="Data desejada final" className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold outline-none" />
        <button type="button" onClick={clearFilters} className="bg-white border border-slate-300 text-slate-700 px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50">
          Limpar Filtros
        </button>
      </div>

      {selectedOrdersCount > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-[115] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="px-2">
              <p className="text-xs font-black text-slate-700">
                {selectedOrdersCount === 1 ? '1 selecionado(a)' : `${selectedOrdersCount} selecionado(s)`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleOpenSelectionModal}
                className="bg-white border border-slate-300 text-slate-900 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50"
              >
                {selectedOrdersCount === 1 ? 'Ver' : 'Encaminhar'}
              </button>
              {selectedOrdersCount === 1 && canManageAllOrders && (
                <button
                  type="button"
                  onClick={handleOpenSingleForwardModal}
                  className="bg-white border border-slate-300 text-slate-900 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50"
                >
                  Enviar Setor
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleExportSelectedOrders()}
                className="bg-white border border-slate-300 text-slate-900 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50"
              >
                Exportar Excel
              </button>
              {selectedOrdersCount === 1 && canDeleteOrderDirectly && (
                <button
                  type="button"
                  onClick={() => void handleDeleteOrder(selectedOrders[0])}
                  className="bg-white border border-slate-300 text-slate-900 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50"
                >
                  Excluir Pedido
                </button>
              )}
              <button
                type="button"
                onClick={clearSelectedOrders}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden lg:block bg-white border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left table-fixed">
            <thead className="bg-slate-50 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-4 py-5 relative" style={getColumnStyle('select')}>
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleSelectAllOrders}
                      title={allFilteredSelected ? 'Limpar seleção' : 'Selecionar todos'}
                    />
                  </div>
                  <button
                    type="button"
                    onMouseDown={(event) => startColumnResize('select', event)}
                    className="absolute top-0 right-0 h-full w-3 cursor-col-resize group"
                    aria-label="Redimensionar coluna de seleção"
                  >
                    <span className="absolute right-1 top-1/2 h-6 w-px -translate-y-1/2 bg-slate-200 group-hover:bg-blue-400" />
                  </button>
                </th>
                {renderColumnHeader('createdAt', 'Data do Pedido')}
                {renderColumnHeader('expectedDate', 'Data Desejada')}
                {renderColumnHeader('orderCode', 'Código do Pedido')}
                {renderColumnHeader('project', 'Obra / Origem', 'px-5')}
                {renderColumnHeader('title', 'Título do Pedido', 'px-5')}
                {renderColumnHeader('description', 'Descrição', 'px-5')}
                {renderColumnHeader('type', 'Tipo do Pedido')}
                {renderColumnHeader('value', 'Valor do Pedido')}
                {renderColumnHeader('status', 'Status Atual')}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => {
                const isSelected = selectedOrderIds.includes(order.id);
                return (
                <tr
                  key={order.id}
                  className={`${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'} transition-colors cursor-pointer`}
                  onClick={() => handleToggleOrderSelection(order)}
                >
                  <td className="px-4 py-6" style={getColumnStyle('select')} onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleOrderSelection(order)}
                    />
                  </td>
                  <td className="px-4 py-6 text-[10px] font-bold text-slate-500 font-mono whitespace-nowrap" style={getColumnStyle('createdAt')}>{formatOrderDate(order.createdAt)}</td>
                  <td className="px-4 py-6 text-[10px] font-bold text-slate-500 font-mono whitespace-nowrap" style={getColumnStyle('expectedDate')}>{formatOrderDate(order.expectedDate)}</td>
                  <td className="px-4 py-6" style={getColumnStyle('orderCode')}>
                    <div className="font-black text-slate-900 uppercase text-xs whitespace-nowrap" title={order.orderCode || 'Código pendente'}>{order.orderCode || 'Código pendente'}</div>
                    {order.externalCode && <div className="text-[9px] text-amber-600 font-bold uppercase whitespace-nowrap truncate" title={`Legado: ${order.externalCode}`}>Legado: {order.externalCode}</div>}
                  </td>
                  <td className="px-5 py-6" style={getColumnStyle('project')}>
                    <div className="font-black text-slate-900 uppercase text-xs truncate" title={order.projectName}>{order.projectName}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase truncate" title={order.requesterName}>{order.requesterName}</div>
                  </td>
                  <td className="px-5 py-6" style={getColumnStyle('title')}>
                    <div className="font-black text-slate-900 uppercase text-xs truncate" title={order.title}>{order.title}</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase mt-1 truncate" title={(projects.find((project) => project.id === order.projectId)?.budget || []).find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}>
                      {(projects.find((project) => project.id === order.projectId)?.budget || []).find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}
                    </div>
                  </td>
                  <td className="px-5 py-6" style={getColumnStyle('description')}>
                    <div className="text-[10px] text-slate-600 font-bold leading-relaxed line-clamp-3" title={order.description || '-'}>{order.description || '-'}</div>
                  </td>
                  <td className="px-4 py-6" style={getColumnStyle('type')}>
                    <div className="text-[10px] text-blue-600 font-black uppercase tracking-tight truncate" title={order.type}>{order.type}</div>
                  </td>
                  <td className="px-4 py-6" style={getColumnStyle('value')}>
                    <div className="text-[10px] text-slate-700 font-black whitespace-nowrap">R$ {(order.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </td>
                  <td className="px-4 py-6" style={getColumnStyle('status')}>
                    {renderListStatusBadge(order)}
                  </td>
                </tr>
              )})}
              {filteredOrders.length === 0 && <tr><td colSpan={10} className="p-20 text-center text-slate-300 font-black uppercase text-xs tracking-[0.4em]">Nenhum pedido encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:hidden space-y-4">
        {filteredOrders.map((order) => (
          <div
            key={order.id}
            className={`border shadow-sm p-4 space-y-4 cursor-pointer ${selectedOrderIds.includes(order.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}
            onClick={() => handleToggleOrderSelection(order)}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div onClick={(event) => event.stopPropagation()} className="pt-1">
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.includes(order.id)}
                    onChange={() => handleToggleOrderSelection(order)}
                  />
                </div>
                <div>
                <div className="font-black text-slate-900 uppercase text-sm">{order.title}</div>
                <div className="text-[10px] text-slate-500 font-black uppercase">{order.projectName}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">{order.requesterName}</div>
              </div>
              </div>
              {renderListStatusBadge(order)}
            </div>

            <div className="grid grid-cols-2 gap-3 text-[10px] font-bold uppercase">
              <div className="bg-slate-50 border border-slate-100 p-3">
                <div className="text-slate-400">Data do Pedido</div>
                <div className="text-slate-700 mt-1">{formatOrderDate(order.createdAt)}</div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3">
                <div className="text-slate-400">Data Desejada</div>
                <div className="text-slate-700 mt-1">{formatOrderDate(order.expectedDate)}</div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3 col-span-2">
                <div className="text-slate-400">Código do Pedido</div>
                <div className="text-slate-900 mt-1">{order.orderCode || 'Código pendente'}</div>
                {order.externalCode && <div className="text-amber-600 mt-1">Legado: {order.externalCode}</div>}
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3">
                <div className="text-slate-400">Tipo do Pedido</div>
                <div className="text-blue-600 mt-1">{order.type}</div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3">
                <div className="text-slate-400">Valor do Pedido</div>
                <div className="text-slate-900 mt-1">R$ {(order.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3 col-span-2">
                <div className="text-slate-400">Título do Pedido</div>
                <div className="text-slate-900 mt-1">{order.title}</div>
                <div className="text-slate-500 mt-1">
                  {(projects.find((project) => project.id === order.projectId)?.budget || []).find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3 col-span-2">
                <div className="text-slate-400">Descrição</div>
                <div className="text-slate-900 mt-1 normal-case leading-relaxed">{order.description || '-'}</div>
              </div>
            </div>
          </div>
        ))}
        {filteredOrders.length === 0 && <div className="bg-white border border-slate-200 p-12 text-center text-slate-300 font-black uppercase text-xs tracking-[0.4em]">Nenhum pedido encontrado.</div>}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[110] p-4 sm:p-6">
          <div className="bg-white w-full max-w-2xl max-h-[95vh] shadow-2xl overflow-y-auto border border-slate-800 animate-in zoom-in duration-200">
            <div className="bg-slate-900 p-5 sm:p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Protocolar Novo Pedido</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white"><i className="fas fa-times text-2xl"></i></button>
            </div>
            <form onSubmit={handleCreateOrder} className="p-5 sm:p-8 md:p-10 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Obra Destino</label>
                  <select required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500" value={newOrder.projectId} onChange={(e) => setNewOrder({ ...newOrder, projectId: e.target.value, macroItemId: '' })}>
                    <option value="">Selecione...</option>
                    {assignedProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apropriação de Custo</label>
                  <select required={!isNewOrderOtherType} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500" value={newOrder.macroItemId} onChange={(e) => setNewOrder({ ...newOrder, macroItemId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {projects.find((project) => project.id === newOrder.projectId)?.budget.map((macro) => <option key={macro.id} value={macro.id}>{macro.description}</option>)}
                  </select>
                </div>
              </div>
              {sectors.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Setor de Destino</label>
                  <select required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500" value={newOrder.currentSectorId || ''} onChange={(e) => setNewOrder({ ...newOrder, currentSectorId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título do Pedido</label>
                <input required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500" value={newOrder.title} onChange={(e) => setNewOrder({ ...newOrder, title: e.target.value })} placeholder="EX: COMPRA DE FIOS 10MM" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Pedido</label>
                <select required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500" value={newOrder.type} onChange={(e) => setNewOrder({ ...newOrder, type: e.target.value })}>
                  <option value="">Selecione...</option>
                  {orderTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição Técnica / Detalhes</label>
                <textarea rows={3} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs outline-none focus:border-blue-500" value={newOrder.description} onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })} placeholder="Descreva quantidades, marcas ou detalhes importantes..." />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Desejada</label>
                  <input required type="date" className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs outline-none focus:border-blue-500" value={newOrder.expectedDate || ''} onChange={(e) => setNewOrder({ ...newOrder, expectedDate: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Previsto (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                    <input required={!isNewOrderOtherType} type="text" inputMode="decimal" className="w-full bg-slate-50 border border-slate-200 px-12 py-3 font-black text-xs outline-none focus:border-blue-500" value={formatMoneyInput(newOrder.value)} onChange={(e) => setNewOrder({ ...newOrder, value: parseMoneyInput(e.target.value) })} placeholder={isNewOrderOtherType ? 'Opcional para OUTROS' : '0,00'} />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anexos do Pedido</label>
                <input type="file" multiple className="text-[10px] font-bold" onChange={(e) => void handleFileUpload(e, 'NEW')} />
                {renderAttachmentList(newOrder.attachments || [], removeNewOrderAttachment, 'Nenhum anexo selecionado.')}
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white py-5 font-black uppercase text-xs tracking-widest shadow-2xl transition-all active:scale-95">Protocolar na Central</button>
            </form>
          </div>
        </div>
      )}

      {isActionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[120] p-4 sm:p-6">
          <div className="bg-white w-full max-w-7xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col max-h-[95vh]">
            <div className="p-5 sm:p-8 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 block w-fit">
                      {isActionModalOpen.sectorStatus || 'Sem status setorial'}
                    </span>
                    {canEditSectorStatus(isActionModalOpen) && (
                      <button
                        type="button"
                        onClick={() => { setSelectedSectorStatus(isActionModalOpen.sectorStatus || ''); setIsSectorStatusModalOpen(true); }}
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
              <button onClick={() => setIsActionModalOpen(null)} className="text-slate-400 hover:text-slate-600 px-2"><i className="fas fa-times text-xl"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-100/60">
              <div className="bg-white border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Descrição da Solicitação</label>
                <p className="text-sm font-bold text-slate-700 leading-relaxed bg-slate-50 p-5 border border-slate-200 italic">"{isActionModalOpen.description || 'Sem descrição informada.'}"</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Código do Pedido</label>
                  <p className="text-[10px] font-black text-slate-900">{isActionModalOpen.orderCode || 'Será gerado pelo backend'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Código Externo</label>
                  <p className="text-[10px] font-black text-slate-900">{isActionModalOpen.externalCode || 'Não informado'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Valor</label>
                  <p className="text-[10px] font-black text-slate-900">{formatMoney(isActionModalOpen.value)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Setor Atual</label>
                  <p className="text-[10px] font-black text-slate-900 uppercase">{isActionModalOpen.currentSectorName || 'SEM SETOR DEFINIDO'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Criado em</label>
                  <p className="text-[10px] font-black text-slate-900">{formatOrderDate(isActionModalOpen.createdAt)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Vencimento</label>
                  <p className="text-[10px] font-black text-slate-900">{formatOrderDate(isActionModalOpen.expectedDate)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 sm:col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Apropriação</label>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-blue-600 uppercase">{activeProjectForModal?.budget.find((macro) => macro.id === isActionModalOpen.macroItemId)?.description || 'Item macro não vinculado'}</p>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 font-black text-[10px] uppercase"
                      value={selectedMacroItemId}
                      onChange={(event) => setSelectedMacroItemId(event.target.value)}
                      disabled={!canEditMacroItem(isActionModalOpen)}
                    >
                      <option value="">Selecione...</option>
                      {(activeProjectForModal?.budget || []).map((macro) => (
                        <option key={macro.id} value={macro.id}>{macro.description}</option>
                      ))}
                    </select>
                    {canEditMacroItem(isActionModalOpen) && (
                      <button type="button" onClick={handleUpdateMacroItem} className="w-full bg-slate-900 text-white py-2 font-black uppercase text-[9px] tracking-widest">
                        Salvar Item Macro
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {isActionModalOpen.attachments && isActionModalOpen.attachments.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <label className="text-[9px] font-black text-slate-400 uppercase block">Anexos do Pedido</label>
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
              {canManageAllOrders && isOrderActive(isActionModalOpen) && sectors.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <label className="text-[9px] font-black text-slate-400 uppercase block">Encaminhar para Outro Setor</label>
                  <select className="w-full bg-white border border-slate-200 px-3 py-3 font-black text-[10px] uppercase" value={selectedForwardSectorId} onChange={(event) => setSelectedForwardSectorId(event.target.value)}>
                    <option value="">Selecione...</option>
                    {sectors.map((sector) => (
                      <option key={sector.id} value={sector.id}>{sector.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={handleForwardOrder} className="w-full bg-slate-900 text-white py-3 font-black uppercase text-[9px] tracking-widest shadow-sm">
                    Encaminhar Pedido
                  </button>
                </div>
              )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
              <div className="bg-white border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
                <h4 className="text-lg font-black text-slate-900">Histórico</h4>
                {getMessagesForDisplay(isActionModalOpen).length > 0 ? (
                  <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-2">
                    {getMessagesForDisplay(isActionModalOpen).map((message) => {
                      const meta = getMessageMeta(isActionModalOpen, message);
                      return (
                      <div key={message.id} className={`p-4 border-l-4 ${meta.classes}`}>
                        <div className="flex justify-between items-center mb-1 gap-3">
                          <span className="text-[10px] font-black uppercase text-slate-900">{message.userName}</span>
                          <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">{new Date(message.date).toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="mb-2 text-[8px] font-black uppercase tracking-widest text-slate-500">{meta.label}</div>
                        <p className="text-[11px] font-medium text-slate-600">{message.text}</p>
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {message.attachments.map((attachment) => (
                              <div key={attachment.id} className="bg-white/70 border border-slate-200 px-3 py-3">
                                <p className="text-[9px] font-black uppercase text-slate-700 break-all">
                                  {attachment.originalName || attachment.name}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <button type="button" onClick={() => handlePreviewAttachment(attachment)} className="px-3 py-2 bg-blue-50 border border-blue-200 text-[9px] font-black uppercase text-blue-700">
                                    Visualizar
                                  </button>
                                  <button type="button" onClick={() => downloadAttachment(attachment)} className="px-3 py-2 bg-white border border-slate-200 text-[9px] font-black uppercase text-slate-600">
                                    Download
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Nenhuma interação registrada.
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {canReopenOrder(isActionModalOpen) && (
                  <div className="bg-white border border-slate-200 shadow-sm p-5 sm:p-6 space-y-3">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Gerenciar Pedido</h4>
                    {canReopenOrder(isActionModalOpen) && (
                      <button
                        type="button"
                        onClick={handleReopenOrder}
                        className="w-full bg-emerald-50 text-emerald-700 border border-emerald-200 py-4 font-black uppercase text-[10px] shadow-sm"
                      >
                        Reabrir Pedido
                      </button>
                    )}
                  </div>
                )}

                <div className="bg-white border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Valor Atual</h4>
                  <p className="text-[10px] font-black text-slate-800">{formatMoney(isActionModalOpen.value)}</p>
                  {canEditOrderValueDirectly(isActionModalOpen) && (
                    <div className="mt-3 space-y-3">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full bg-slate-50 border border-slate-200 pl-12 pr-4 py-3 font-black text-sm"
                          value={formatMoneyInput(editableOrderValue)}
                          onChange={(e) => setEditableOrderValue(parseMoneyInput(e.target.value) || 0)}
                          placeholder="0,00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveOrderValue}
                        className="w-full bg-slate-900 text-white py-2 font-black uppercase text-[9px] tracking-widest"
                      >
                        Salvar Valor
                      </button>
                    </div>
                  )}
                </div>
                {canManageFinancialFields && (
                <div className="bg-white border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Atribuir Custo à Obra</h4>
                  <div className="bg-slate-50 border border-slate-200 p-4 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyOrderCost}
                        onChange={(event) => setApplyOrderCost(event.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-[10px] font-black uppercase text-slate-700">Vincular valor ao custo da obra</span>
                    </label>
                    {hasSavedCostAssignment && (
                      <p className="text-[10px] font-black uppercase text-emerald-600">
                        Pedido incluído no custo da obra
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleSaveCostAssignment()}
                      className="w-full bg-slate-900 text-white py-4 font-black uppercase text-[10px] shadow-xl"
                      >
                        Salvar Vinculação de Custo
                      </button>
                    </div>
                  </div>
                )}

                {canCommentOnOrder(isActionModalOpen) && (
                  <div className="bg-white border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Enviar Comentarios</h4>
                    <textarea className="w-full bg-white border border-slate-200 p-4 font-bold text-xs" rows={4} placeholder="Escreva um comentario..." value={messageText} onChange={(e) => setMessageText(e.target.value)} />
                    <button onClick={handleSendMessage} className="w-full bg-purple-600 text-white py-4 font-black uppercase text-[10px] shadow-xl">Enviar Comentario</button>
                  </div>
                )}

                {canCommentOnOrder(isActionModalOpen) && (
                  <div className="bg-white border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Enviar Anexos</h4>
                    <input type="file" multiple className="text-[10px] font-bold" onChange={(e) => void handleFileUpload(e, 'MESSAGE')} />
                    {renderAttachmentList(messageAttachments, removeMessageAttachment, 'Nenhum anexo selecionado para esta mensagem.')}
                    <button onClick={handleSendMessage} className="w-full bg-slate-900 text-white py-4 font-black uppercase text-[10px] shadow-xl">Enviar Arquivos</button>
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
        </div>
      )}

      {isActionModalOpen && isSectorStatusModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[140] p-4">
          <div className="bg-white w-full max-w-md border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Alterar Status do Setor</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase">{isActionModalOpen.title}</p>
              </div>
              <button type="button" onClick={() => setIsSectorStatusModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <select
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase"
              value={selectedSectorStatus}
              onChange={(event) => setSelectedSectorStatus(event.target.value)}
            >
              <option value="">Sem status setorial</option>
              {getEditableSectorStatuses(isActionModalOpen).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button type="button" onClick={() => setIsSectorStatusModalOpen(false)} className="flex-1 border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-600">Fechar</button>
              <button type="button" onClick={() => void handleSaveSectorStatus(selectedSectorStatus)} className="flex-1 bg-slate-900 text-white py-3 text-[10px] font-black uppercase tracking-widest">Salvar Status</button>
            </div>
          </div>
        </div>
      )}

      {isBulkActionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[125] p-4 sm:p-6">
          <div className="bg-white w-full max-w-3xl max-h-[95vh] shadow-2xl overflow-y-auto border border-slate-800">
            <div className="p-5 sm:p-8 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <span className="text-[9px] font-black uppercase px-2 py-1 bg-slate-900 text-white mb-2 block w-fit">Ação em Massa</span>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{selectedOrdersCount === 1 ? 'Encaminhar Pedido' : 'Encaminhar Pedidos'}</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{selectedOrdersCount} pedido(s) selecionado(s)</p>
              </div>
              <button onClick={() => setIsBulkActionModalOpen(false)} className="text-slate-400 hover:text-slate-900 px-2"><i className="fas fa-times text-2xl"></i></button>
            </div>
            <div className="p-5 sm:p-8 space-y-6">
              {canManageAllOrders ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enviar para Outro Setor</p>
                    <p className="text-xs font-bold text-slate-500">Selecione o setor de destino e confirme o envio em massa.</p>
                  </div>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500"
                    value={bulkForwardSectorId}
                    onChange={(event) => setBulkForwardSectorId(event.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {sectors.map((sector) => (
                      <option key={sector.id} value={sector.id}>{sector.name}</option>
                    ))}
                  </select>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button type="button" onClick={handleBulkForwardOrders} className="flex-1 bg-slate-900 text-white py-4 font-black uppercase text-[10px] tracking-widest shadow-sm">
                      Enviar
                    </button>
                    <button type="button" onClick={clearSelectedOrders} className="flex-1 bg-white border border-slate-300 text-slate-700 py-4 font-black uppercase text-[10px] tracking-widest">
                      Limpar Seleção
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 p-4 text-[10px] font-black uppercase text-amber-700">
                  Somente administradores podem encaminhar pedidos em massa.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} onDownload={downloadAttachment} />
    </div>
  );
};
