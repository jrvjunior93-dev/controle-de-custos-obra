import React, { useMemo, useState } from 'react';
import { Attachment, ExecutedCost, Order, OrderStatus, Project, Sector, User, canManageAssignedOrders } from '../types';
import { AttachmentViewerModal } from './AttachmentViewerModal';
import { dbService } from '../apiClient';

interface GlobalOrdersModuleProps {
  projects: Project[];
  sectors: Sector[];
  user: User;
  onUpdateProjects: (all: Project[]) => void;
  onPersistProject: (project: Project) => Promise<void>;
  onPersistMemberOrder: (projectId: string, order: Order) => Promise<void>;
  onDeleteMemberOrder: (projectId: string, orderId: string) => Promise<void>;
  orderTypes: string[];
}

const formatMoneyInput = (value?: number) => value == null ? '' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : undefined;
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

const canPreviewAttachmentInline = (attachment: Attachment) => attachment.type.startsWith('image/') || attachment.type === 'application/pdf' || attachment.name.toLowerCase().endsWith('.pdf');
const isObraSectorName = (name?: string) => String(name || '').trim().toUpperCase() === 'OBRA';

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

const downloadAttachment = (attachment: Attachment) => {
  const link = document.createElement('a');
  link.href = attachment.data;
  link.download = attachment.originalName || attachment.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

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

export const GlobalOrdersModule: React.FC<GlobalOrdersModuleProps> = ({ projects, sectors, user, onUpdateProjects, onPersistProject, onPersistMemberOrder, onDeleteMemberOrder, orderTypes }) => {
  const canManageAllOrders = canManageAssignedOrders(user.role);
  const canImportOrders = user.role === 'SUPERADMIN';
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
  const [incorporateCost, setIncorporateCost] = useState(false);
  const [editableOrderValue, setEditableOrderValue] = useState<number>(0);
  const [finalValue, setFinalValue] = useState<number>(0);
  const [finalDate, setFinalDate] = useState(new Date().toISOString().split('T')[0]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedMacroItemId, setSelectedMacroItemId] = useState('');
  const [selectedForwardSectorId, setSelectedForwardSectorId] = useState('');
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

    const matchSearch = !searchTerm || order.title.toLowerCase().includes(searchTerm) || (order.description || '').toLowerCase().includes(searchTerm);
    const matchStatus = filterStatus.length === 0 || filterStatus.includes(order.status);
    const matchProject = filterProject.length === 0 || filterProject.includes(order.projectId);
    const matchType = filterType.length === 0 || filterType.includes(order.type);
    const matchMinValue = minValue == null || normalizedValue >= minValue;
    const matchMaxValue = maxValue == null || normalizedValue <= maxValue;
    const matchDesiredDateRange = matchesDesiredDateRange(order.expectedDate, filterStartDate, filterEndDate);

    return matchSearch && matchStatus && matchProject && matchType && matchMinValue && matchMaxValue && matchDesiredDateRange;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [rawOrders, filterSearch, filterStatus, filterProject, filterType, filterMinValue, filterMaxValue, filterStartDate, filterEndDate]);

  const usesAssignedProjectScope = !canManageAllOrders && (!user.sectorName || isObraSectorName(user.sectorName));
  const assignedProjects = canManageAllOrders || !usesAssignedProjectScope ? projects : projects.filter((project) => user.assignedProjectIds?.includes(project.id));
  const isOtherOrderType = (value?: string) => String(value || '').trim().toUpperCase() === 'OUTROS';
  const isNewOrderOtherType = isOtherOrderType(newOrder.type);
  const isOrderActive = (order: Order) => order.status !== 'CONCLUIDO' && order.status !== 'CANCELADO';
  const canTreatOrder = (order: Order) => canManageAllOrders && isOrderActive(order);
  const canEditFinancialFields = user.role === 'SUPERADMIN' || user.role === 'ADMIN';
  const canDeleteOrderDirectly = user.role === 'SUPERADMIN' || user.role === 'ADMIN';
  const canCommentOnOrder = (order: Order) => isOrderActive(order);
  const activeProjectForModal = isActionModalOpen ? projects.find((project) => project.id === isActionModalOpen.projectId) : null;
  const canEditMacroItem = (order: Order) => canEditFinancialFields && isOrderActive(order);
  const canEditOrderValueDirectly = (order: Order) => canEditFinancialFields && !!order;
  const findSectorName = (sectorId?: string) => sectors.find((sector) => sector.id === sectorId)?.name;
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

  const handlePreviewAttachment = (attachment: Attachment) => {
    if (!attachment.data) {
      alert('Arquivo indisponível para visualização no momento.');
      return;
    }
    if (canPreviewAttachmentInline(attachment)) {
      setPreviewAttachment(attachment);
      return;
    }
    window.open(attachment.data, '_blank', 'noopener,noreferrer');
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
    setSelectedOrderIds([order.id]);
    setIsBulkActionModalOpen(false);
    setIsActionModalOpen(order);
    resetActionState();
    const currentValue = Number(order.value || 0);
    setEditableOrderValue(currentValue);
    setFinalValue(currentValue);
    setSelectedMacroItemId(order.macroItemId || '');
    setSelectedForwardSectorId(order.currentSectorId || '');
  };

  const persistMemberOrder = (projectId: string, order: Order) => {
    if (!canManageAllOrders) {
      void onPersistMemberOrder(projectId, order);
    }
  };

  const persistProjectState = (project: Project) => {
    if (canManageAllOrders) {
      void onPersistProject(project);
    }
  };

  const handleCreateOrder = (event: React.FormEvent) => {
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
    onUpdateProjects(projects.map((project) => project.id === targetProject.id ? updatedProject : project));
    if (canManageAllOrders) {
      persistProjectState(updatedProject);
    } else {
      void onPersistMemberOrder(targetProject.id, order);
    }
    setIsModalOpen(false);
    setNewOrder({ projectId: '', title: '', type: '', description: '', macroItemId: '', currentSectorId: '', expectedDate: '', value: undefined, attachments: [] });
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
        alert('Nenhum pedido vÃ¡lido foi encontrado no arquivo.');
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
    { value: 'PENDENTE', label: 'Pendente' },
    { value: 'EM_ANALISE', label: 'Em Análise' },
    { value: 'AGUARDANDO_INFORMACAO', label: 'Info Solicitada' },
    { value: 'CONCLUIDO', label: 'Concluído' },
    { value: 'CANCELADO', label: 'Cancelado' },
  ];
  const typeFilterItems = orderTypes.map((type) => ({ value: type, label: type }));
  const selectedOrders = filteredOrders.filter((order) => selectedOrderIds.includes(order.id));
  const selectedOrdersCount = selectedOrders.length;

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

  const handleBulkForwardOrders = () => {
    if (!canManageAllOrders) return alert('Somente administradores podem encaminhar pedidos em massa.');
    if (selectedOrdersCount < 2) return;
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

    if (updatedProject) {
      persistProjectState(updatedProject);
    }

    if (updatedOrder) {
      setIsActionModalOpen(updatedOrder);
      if (incorporateCost) setFinalValue(Number(updatedOrder.value || 0));
    }
  };

  const handleProjectMutation = (projectId: string, mutate: (project: Project) => Project) => {
    const targetProject = projects.find((project) => project.id === projectId);
    if (!targetProject) return null;

    const nextProject = mutate(targetProject);
    onUpdateProjects(projects.map((project) => project.id === projectId ? nextProject : project));
    return nextProject;
  };

  const handleSendMessage = () => {
    if (!isActionModalOpen || !messageText.trim()) return alert('Escreva a interação que deseja registrar.');
    if (!canCommentOnOrder(isActionModalOpen)) return alert('Este pedido não aceita mais interações.');
    if (!confirm(`Adicionar interação ao pedido "${isActionModalOpen.title}"?`)) return;

    let updatedOrder: Order | null = null;
    const updatedProject = handleProjectMutation(isActionModalOpen.projectId, (project) => ({
      ...project,
      orders: (project.orders || []).map((item) => {
        if (item.id !== isActionModalOpen.id) return item;
        updatedOrder = {
          ...item,
          messages: [...(item.messages || []), {
            id: crypto.randomUUID(),
            userId: user.id,
            userName: user.name,
            text: messageText.trim(),
            date: new Date().toISOString(),
            attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
          }]
        };
        return updatedOrder;
      })
    }));

    if (updatedProject) {
      if (canManageAllOrders) {
        persistProjectState(updatedProject);
      } else if (updatedOrder) {
        persistMemberOrder(isActionModalOpen.projectId, updatedOrder);
      }
    }

    if (updatedOrder) {
      setIsActionModalOpen(updatedOrder);
    }

    setMessageText('');
    setMessageAttachments([]);
  };

  const handleDecision = () => {
    if (!isActionModalOpen || actionType === 'NONE') return;
    if (!canTreatOrder(isActionModalOpen)) return alert('Você não pode tratar este pedido.');
    if (actionType === 'CANCEL' && !actionText.trim()) return alert('Preencha a mensagem do cancelamento antes de continuar.');
    const actionLabel = actionType === 'COMPLETE' ? 'finalizar' : 'cancelar';
    if (!confirm(`Confirmar a ação de ${actionLabel} para o pedido "${isActionModalOpen.title}"?`)) return;

    const updated: Order = {
      ...isActionModalOpen,
      value: canEditFinancialFields ? Number(editableOrderValue || 0) : isActionModalOpen.value,
      macroItemId: canEditFinancialFields ? (selectedMacroItemId || undefined) : isActionModalOpen.macroItemId,
    };
    let newCost: ExecutedCost | null = null;

    if (actionType === 'COMPLETE') {
      updated.status = 'CONCLUIDO';
      updated.completionNote = actionText;
      updated.completionAttachment = actionAttachments[0] || undefined;
      if (incorporateCost) {
        if (!updated.macroItemId) {
          return alert('Selecione um item macro antes de incorporar o pedido como custo.');
        }
        const costValue = Number(finalValue || editableOrderValue || 0);
        newCost = {
          id: crypto.randomUUID(),
          macroItemId: updated.macroItemId!,
          description: `[PEDIDO] ${updated.title}`,
          itemDetail: updated.description,
          unit: 'un',
          quantity: 1,
          unitValue: costValue,
          totalValue: costValue,
          date: finalDate,
          entryDate: new Date().toISOString().split('T')[0],
          attachments: [...updated.attachments, ...actionAttachments],
          originOrderId: updated.id
        };
      }
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

    const updatedProject = handleProjectMutation(updated.projectId, (project) => ({
      ...project,
      orders: (project.orders || []).map((order) => order.id === updated.id ? updated : order),
      costs: newCost ? [...(project.costs || []), newCost] : (project.costs || [])
    }));

    if (updatedProject) {
      if (canManageAllOrders) {
        persistProjectState(updatedProject);
      } else {
        persistMemberOrder(updated.projectId, updated);
      }
    }

    setIsActionModalOpen(updated);
    setActionType('NONE');
    setActionText('');
    setActionAttachments([]);
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

    if (updatedProject) {
      persistProjectState(updatedProject);
    }

    if (updatedOrder) {
      setIsActionModalOpen(updatedOrder);
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

    if (updatedProject) {
      persistProjectState(updatedProject);
    }
    if (updatedOrder) {
      setIsActionModalOpen(updatedOrder);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-6 relative">
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
        <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Filtrar por título..." className="bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold outline-none" />
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
        <div className="bg-slate-900 text-white border border-slate-800 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-xl">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest">Seleção de Pedidos</p>
            <p className="text-xs font-bold text-slate-300 mt-1">
              {selectedOrdersCount === 1 ? '1 pedido selecionado.' : `${selectedOrdersCount} pedidos selecionados.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenSelectionModal}
              className="bg-white text-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest shadow-sm"
            >
              {selectedOrdersCount === 1 ? 'Gerenciar Pedido' : 'Encaminhar em Massa'}
            </button>
            <button
              type="button"
              onClick={clearSelectedOrders}
              className="bg-transparent border border-slate-600 text-white px-4 py-3 text-[10px] font-black uppercase tracking-widest"
            >
              Limpar Seleção
            </button>
          </div>
        </div>
      )}

      <div className="hidden lg:block bg-white border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left table-fixed">
            <thead className="bg-slate-50 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-4 py-5 w-[4%]">Sel.</th>
                <th className="px-4 py-5 w-[8%]">Data do Pedido</th>
                <th className="px-4 py-5 w-[8%]">Data Desejada</th>
                <th className="px-4 py-5 w-[12%]">Código do Pedido</th>
                <th className="px-5 py-5 w-[11%]">Obra / Origem</th>
                <th className="px-5 py-5 w-[12%]">Título do Pedido</th>
                <th className="px-5 py-5 w-[15%]">Descrição</th>
                <th className="px-4 py-5 w-[13%]">Tipo do Pedido</th>
                <th className="px-4 py-5 w-[10%]">Valor do Pedido</th>
                <th className="px-4 py-5 w-[11%]">Status Atual</th>
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
                  <td className="px-4 py-6" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleOrderSelection(order)}
                    />
                  </td>
                  <td className="px-4 py-6 text-[10px] font-bold text-slate-500 font-mono whitespace-nowrap">{formatOrderDate(order.createdAt)}</td>
                  <td className="px-4 py-6 text-[10px] font-bold text-slate-500 font-mono whitespace-nowrap">{formatOrderDate(order.expectedDate)}</td>
                  <td className="px-4 py-6">
                    <div className="font-black text-slate-900 uppercase text-xs whitespace-nowrap" title={order.orderCode || 'Código pendente'}>{order.orderCode || 'Código pendente'}</div>
                    {order.externalCode && <div className="text-[9px] text-amber-600 font-bold uppercase whitespace-nowrap truncate" title={`Legado: ${order.externalCode}`}>Legado: {order.externalCode}</div>}
                  </td>
                  <td className="px-5 py-6">
                    <div className="font-black text-slate-900 uppercase text-xs truncate" title={order.projectName}>{order.projectName}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase truncate" title={order.requesterName}>{order.requesterName}</div>
                  </td>
                  <td className="px-5 py-6">
                    <div className="font-black text-slate-900 uppercase text-xs truncate" title={order.title}>{order.title}</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase mt-1 truncate" title={(projects.find((project) => project.id === order.projectId)?.budget || []).find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}>
                      {(projects.find((project) => project.id === order.projectId)?.budget || []).find((macro) => macro.id === order.macroItemId)?.description || 'Item macro não vinculado'}
                    </div>
                  </td>
                  <td className="px-5 py-6">
                    <div className="text-[10px] text-slate-600 font-bold leading-relaxed line-clamp-3" title={order.description || '-'}>{order.description || '-'}</div>
                  </td>
                  <td className="px-4 py-6">
                    <div className="text-[10px] text-blue-600 font-black uppercase tracking-tight truncate" title={order.type}>{order.type}</div>
                  </td>
                  <td className="px-4 py-6">
                    <div className="text-[10px] text-slate-700 font-black whitespace-nowrap">R$ {(order.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </td>
                  <td className="px-4 py-6">
                    <span title={order.status.replace('_', ' ')} className={`inline-flex text-[8px] font-black uppercase px-2 py-1 border whitespace-nowrap ${
                      order.status === 'CONCLUIDO' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      order.status === 'PENDENTE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-slate-50 text-slate-600 border-slate-100'}`}
                    >
                      {order.status.replace('_', ' ')}
                    </span>
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
              <span className={`text-[8px] font-black uppercase px-2 py-1 border ${
                order.status === 'CONCLUIDO' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                order.status === 'PENDENTE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                'bg-slate-50 text-slate-600 border-slate-100'}`}
              >
                {order.status.replace('_', ' ')}
              </span>
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
          <div className="bg-white w-full max-w-6xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col max-h-[95vh]">
            <div className="p-5 sm:p-8 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <span className="text-[9px] font-black uppercase px-2 py-1 bg-slate-900 text-white mb-2 block w-fit">{isActionModalOpen.status}</span>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{isActionModalOpen.title}</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Obra: {isActionModalOpen.projectName}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canDeleteOrderDirectly && (
                  <button type="button" onClick={() => handleDeleteOrder(isActionModalOpen)} className="bg-rose-50 text-rose-600 border border-rose-200 px-4 py-3 text-[9px] font-black uppercase shadow-sm">
                    Excluir
                  </button>
                )}
                <button onClick={() => setIsActionModalOpen(null)} className="text-slate-400 hover:text-slate-900 px-2"><i className="fas fa-times text-2xl"></i></button>
              </div>
            </div>
            <div className="flex-1 p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-8">
              <div className="bg-slate-50 p-6 border-l-4 border-slate-900">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Descrição da Solicitação</p>
                <p className="text-sm font-bold text-slate-700 italic">"{isActionModalOpen.description}"</p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase">Código do Pedido</p>
                    <p className="text-sm font-black text-slate-900">{isActionModalOpen.orderCode || 'Será gerado pelo backend'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase">Código Externo</p>
                    <p className="text-sm font-black text-slate-900">{isActionModalOpen.externalCode || 'Não informado'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Setor Atual</p>
                    <p className="text-sm font-black text-slate-900 uppercase">{isActionModalOpen.currentSectorName || 'SEM SETOR DEFINIDO'}</p>
                  </div>
                </div>
                <p className="text-[10px] font-black text-slate-500 uppercase mt-4">Valor Atual do Pedido</p>
                <p className="text-lg font-black text-slate-900">R$ {(isActionModalOpen.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                {canEditOrderValueDirectly(isActionModalOpen) && (
                  <div className="mt-4 space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase">Editar Valor do Pedido</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full bg-white border border-slate-200 pl-12 pr-4 py-3 font-black text-sm"
                          value={formatMoneyInput(editableOrderValue)}
                          onChange={(e) => setEditableOrderValue(parseMoneyInput(e.target.value) || 0)}
                          placeholder="0,00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveOrderValue}
                        className="bg-slate-900 text-white px-5 py-3 text-[10px] font-black uppercase tracking-widest shadow-sm"
                      >
                        Salvar Valor
                      </button>
                    </div>
                  </div>
                )}
                {isActionModalOpen.attachments && isActionModalOpen.attachments.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Anexos do Pedido</p>
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
              </div>

              <div className="bg-white border border-slate-200 p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Macro do Pedido</p>
                    <p className="text-xs font-bold text-slate-500">Use este campo para complementar pedidos importados sem apropriação.</p>
                  </div>
                  {canEditMacroItem(isActionModalOpen) && (
                    <button type="button" onClick={handleUpdateMacroItem} className="px-4 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest shadow-sm">
                      Salvar Item Macro
                    </button>
                  )}
                </div>
                <select
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500"
                  value={selectedMacroItemId}
                  onChange={(event) => setSelectedMacroItemId(event.target.value)}
                  disabled={!canEditMacroItem(isActionModalOpen)}
                >
                  <option value="">Selecione...</option>
                  {(activeProjectForModal?.budget || []).map((macro) => (
                    <option key={macro.id} value={macro.id}>{macro.description}</option>
                  ))}
                </select>
              </div>

              {canManageAllOrders && isOrderActive(isActionModalOpen) && sectors.length > 0 && (
                <div className="bg-white border border-slate-200 p-6 space-y-3">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Encaminhar para Outro Setor</p>
                    <p className="text-xs font-bold text-slate-500">O pedido mantém histórico completo e acesso para os setores envolvidos.</p>
                  </div>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500"
                    value={selectedForwardSectorId}
                    onChange={(event) => setSelectedForwardSectorId(event.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {sectors.map((sector) => (
                      <option key={sector.id} value={sector.id}>{sector.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={handleForwardOrder} className="w-full bg-slate-900 text-white py-3 font-black uppercase text-[10px] tracking-widest shadow-sm">
                    Encaminhar Pedido
                  </button>
                </div>
              )}

              {canManageAllOrders && (isActionModalOpen.status === 'PENDENTE' || isActionModalOpen.status === 'EM_ANALISE' || isActionModalOpen.status === 'AGUARDANDO_INFORMACAO') && (
                <div className="space-y-6 pt-6 border-t border-slate-100">
                  <h4 className="text-lg font-black uppercase tracking-tighter">Despacho da Central</h4>
                  <div className="flex gap-2">
                    {['COMPLETE', 'CANCEL'].map((type) => (
                      <button key={type} onClick={() => setActionType(type as 'COMPLETE' | 'CANCEL')} className={`flex-1 py-4 text-[10px] font-black uppercase border-2 transition-all ${actionType === type ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-400 border-slate-100'}`}>
                        {type === 'COMPLETE' ? 'Finalizar' : 'Cancelar'}
                      </button>
                    ))}
                  </div>
                  {actionType !== 'NONE' && (
                    <div className="space-y-4 animate-in slide-in-from-top-4 duration-300">
                      {canEditFinancialFields && (
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase">Valor do Pedido (R$)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                            <input type="text" inputMode="decimal" className="w-full bg-white border border-slate-200 pl-11 pr-3 py-3 font-black text-sm" value={formatMoneyInput(editableOrderValue)} onChange={(e) => { const nextValue = parseMoneyInput(e.target.value) || 0; setEditableOrderValue(nextValue); if (incorporateCost && actionType === 'COMPLETE') setFinalValue(nextValue); }} placeholder="0,00" />
                          </div>
                        </div>
                      )}
                      {actionType === 'COMPLETE' && (
                        <div className="bg-blue-50 p-6 space-y-4 border border-blue-100 mb-4">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={incorporateCost} onChange={(e) => { const checked = e.target.checked; setIncorporateCost(checked); if (checked) setFinalValue(Number(editableOrderValue || isActionModalOpen.value || 0)); }} className="w-4 h-4 text-blue-600 rounded-none" />
                            <span className="text-[10px] font-black uppercase text-blue-900">Incorporar custo automaticamente na obra</span>
                          </label>
                          {incorporateCost && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase">Valor Final (R$)</label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                                  <input type="text" inputMode="decimal" className="w-full bg-white border border-slate-200 pl-11 pr-3 py-2 font-black text-sm" value={formatMoneyInput(finalValue)} onChange={(e) => setFinalValue(parseMoneyInput(e.target.value) || 0)} placeholder="0,00" />
                                </div>
                              </div>
                              <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase">Data do Custo</label>
                                <input type="date" className="w-full bg-white border border-slate-200 px-3 py-2 font-black text-xs" value={finalDate} onChange={(e) => setFinalDate(e.target.value)} />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <textarea value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder={actionType === 'COMPLETE' ? 'Justificativa ou parecer técnico...' : 'Motivo do cancelamento...'} className="w-full bg-slate-50 border border-slate-200 p-4 font-bold text-xs" rows={4} />
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Anexos da ação</label>
                        <input type="file" multiple className="text-[10px] font-bold" onChange={(e) => void handleFileUpload(e, 'ACTION')} />
                        {renderAttachmentList(actionAttachments, removeActionAttachment, 'Nenhum anexo selecionado para esta ação.')}
                      </div>
                      <button onClick={handleDecision} className="w-full bg-blue-600 text-white py-5 font-black uppercase text-xs tracking-widest shadow-xl">Confirmar Despacho</button>
                    </div>
                  )}
                </div>
              )}

              {canCommentOnOrder(isActionModalOpen) && (
                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interações Livres</h4>
                  <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 font-bold text-xs" rows={4} placeholder="Registre uma orientação, alinhamento ou resposta livre do pedido..." />
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Anexos da mensagem</label>
                    <input type="file" multiple className="text-[10px] font-bold" onChange={(e) => void handleFileUpload(e, 'MESSAGE')} />
                    {renderAttachmentList(messageAttachments, removeMessageAttachment, 'Nenhum anexo selecionado para esta mensagem.')}
                  </div>
                  <button onClick={handleSendMessage} className="w-full bg-slate-900 text-white py-4 font-black uppercase text-[10px] shadow-xl">Adicionar Interação</button>
                </div>
              )}

              {isActionModalOpen.messages && isActionModalOpen.messages.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Histórico de Mensagens</h4>
                  <div className="space-y-4">
                    {isActionModalOpen.messages.map((message) => {
                      const meta = getMessageMeta(isActionModalOpen, message);
                      return (
                      <div key={message.id} className={`p-4 border-l-4 ${meta.classes}`}>
                        <div className="flex justify-between text-[8px] font-black uppercase text-slate-400 mb-1">
                          <span>{message.userName}</span>
                          <span>{new Date(message.date).toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="mb-2 text-[8px] font-black uppercase tracking-widest">{meta.label}</div>
                        <p className="text-xs font-bold text-slate-600 italic">"{message.text}"</p>
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
          </div>
        </div>
      )}

      {isBulkActionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[125] p-4 sm:p-6">
          <div className="bg-white w-full max-w-3xl max-h-[95vh] shadow-2xl overflow-y-auto border border-slate-800">
            <div className="p-5 sm:p-8 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <span className="text-[9px] font-black uppercase px-2 py-1 bg-slate-900 text-white mb-2 block w-fit">Ação em Massa</span>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Encaminhar Pedidos</h3>
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
