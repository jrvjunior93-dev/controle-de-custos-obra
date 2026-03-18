import React, { useState } from 'react';
import { Attachment, ExecutedCost, Installment, Project } from '../types';

interface InstallmentsModuleProps {
  project: Project;
  onUpdate: (p: Project) => void;
}

type SubTab = 'A_PAGAR' | 'VENCIDOS' | 'PAGOS';

async function loadGeminiService() {
  return await import('../geminiService');
}

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const formatMoneyInput = (value?: number) => value == null ? '' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
};

export const InstallmentsModule: React.FC<InstallmentsModuleProps> = ({ project, onUpdate }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('A_PAGAR');
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterProvider, setFilterProvider] = useState('');
  const [paymentModal, setPaymentModal] = useState<{ installment: Installment; proof: Attachment | null } | null>(null);
  const [editModal, setEditModal] = useState<Installment | null>(null);
  const [stagedInstallments, setStagedInstallments] = useState<Installment[] | null>(null);
  const [bulkMacroId, setBulkMacroId] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

  const generateUniqueCode = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `REF-${dateStr}-${randomStr}`;
  };

  const removeStagedFile = (attachmentId: string) => {
    setStagedInstallments((current) => {
      if (!current) return current;
      const next = current.filter((installment) => installment.attachment.id !== attachmentId);
      return next.length > 0 ? next : null;
    });
  };

  const removePaymentProof = () => {
    if (!paymentModal) return;
    setPaymentModal({ ...paymentModal, proof: null });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const detected: Installment[] = [];

    for (const file of Array.from(files)) {
      try {
        if (file.size > MAX_IMPORT_FILE_SIZE) {
          alert(`O arquivo ${file.name} excede o limite de 10 MB para importacao.`);
          continue;
        }
        const uniqueCode = generateUniqueCode();
        const extension = file.name.split('.').pop();
        const newFileName = `${uniqueCode}.${extension}`;

        const reader = new FileReader();
        const fileData: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
          reader.readAsDataURL(file);
        });

        const base64 = fileData.split(',')[1];
        const { extractInstallmentData } = await loadGeminiService();
        const extracted = await extractInstallmentData({ fileBase64: base64, mimeType: file.type });
        if (!extracted?.provider && !(extracted?.installments && extracted.installments.length > 0) && !extracted?.totalValue) {
          throw new Error('Nenhuma parcela foi identificada no arquivo.');
        }

        const makeAttachment = (): Attachment => ({
          id: crypto.randomUUID(),
          name: newFileName,
          originalName: file.name,
          data: fileData,
          type: file.type,
          size: file.size,
          uploadDate: new Date().toISOString()
        });

        if (extracted.installments && extracted.installments.length > 0) {
          extracted.installments.forEach((installment: any, idx: number) => {
            detected.push({
              id: crypto.randomUUID(),
              provider: (extracted.provider || 'NÃO IDENTIFICADO').toUpperCase(),
              description: extracted.description || '',
              totalValue: extracted.totalValue || installment.value || 0,
              installmentNumber: idx + 1,
              totalInstallments: extracted.totalInstallments || extracted.installments.length,
              dueDate: installment.dueDate || today,
              value: installment.value || 0,
              digitalLine: extracted.digitalLine,
              status: 'PENDING',
              attachment: makeAttachment(),
              macroItemId: ''
            });
          });
        } else {
          detected.push({
            id: crypto.randomUUID(),
            provider: (extracted.provider || 'NÃO IDENTIFICADO').toUpperCase(),
            description: extracted.description || '',
            totalValue: extracted.totalValue || 0,
            installmentNumber: 1,
            totalInstallments: 1,
            dueDate: today,
            value: extracted.totalValue || 0,
            digitalLine: extracted.digitalLine,
            status: 'PENDING',
            attachment: makeAttachment(),
            macroItemId: ''
          });
        }
      } catch (err) {
        console.error('Erro na leitura IA:', err);
        const { getGeminiErrorMessage } = await loadGeminiService();
        alert(getGeminiErrorMessage(err));
      }
    }

    if (detected.length === 0) {
      alert('A IA não conseguiu identificar parcelas válidas nos arquivos enviados.');
    }

    setStagedInstallments((current) => ([...(current || []), ...detected]));
    setIsProcessing(false);
    e.target.value = '';
  };

  const saveStaged = () => {
    if (!stagedInstallments) return;

    const allAssigned = stagedInstallments.every((installment) => installment.macroItemId !== '');
    if (!allAssigned) {
      alert('Por favor, atribua um Item Macro para todas as parcelas.');
      return;
    }

    if (!confirm(`Confirmar registro de ${stagedInstallments.length} parcela(s)?`)) return;

    onUpdate({ ...project, installments: [...(project.installments || []), ...stagedInstallments] });
    setStagedInstallments(null);
    setBulkMacroId('');
  };

  const handleSaveEdit = () => {
    if (!editModal) return;
    if (!confirm(`Confirmar alteracoes da parcela de "${editModal.provider}"?`)) return;

    onUpdate({
      ...project,
      installments: project.installments.map((installment) => installment.id === editModal.id ? editModal : installment)
    });
    setEditModal(null);
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !paymentModal) return;

    const uniqueCode = generateUniqueCode();
    const extension = file.name.split('.').pop();
    const newFileName = `${uniqueCode}.${extension}`;
    const reader = new FileReader();
    const fileData: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Erro ao ler comprovante'));
      reader.readAsDataURL(file);
    });

    const proof: Attachment = {
      id: crypto.randomUUID(),
      name: newFileName,
      originalName: `COMPROVANTE_${file.name}`,
      data: fileData,
      type: file.type,
      size: file.size,
      uploadDate: new Date().toISOString()
    };

    setPaymentModal({ ...paymentModal, proof });
  };

  const handleMarkAsPaid = () => {
    if (!paymentModal || !paymentModal.proof) return;
    if (!confirm(`Confirmar baixa da parcela de "${paymentModal.installment.provider}"?`)) return;

    const installment = paymentModal.installment;
    const newCost: ExecutedCost = {
      id: crypto.randomUUID(),
      macroItemId: installment.macroItemId,
      description: installment.provider,
      itemDetail: `${installment.description} (Parc ${installment.installmentNumber}/${installment.totalInstallments})`,
      unit: 'un',
      quantity: 1,
      unitValue: installment.value,
      totalValue: installment.value,
      date: today,
      entryDate: today,
      attachments: [installment.attachment, paymentModal.proof],
      originInstallmentId: installment.id
    };

    const updatedInstallments = project.installments.map((item) =>
      item.id === installment.id ? { ...item, status: 'PAID' as const, paymentProof: paymentModal.proof! } : item
    );

    onUpdate({ ...project, costs: [...(project.costs || []), newCost], installments: updatedInstallments });
    setPaymentModal(null);
  };

  const applyBulkMacro = () => {
    if (!bulkMacroId || !stagedInstallments) return;
    if (!confirm('Aplicar a mesma categoria para todas as parcelas detectadas?')) return;
    setStagedInstallments(stagedInstallments.map((installment) => ({ ...installment, macroItemId: bulkMacroId })));
  };

  const installments = project.installments || [];
  const overdueInstallments = installments.filter((installment) => installment.status === 'PENDING' && installment.dueDate < today);
  const pendingInstallments = installments.filter((installment) => installment.status === 'PENDING' && installment.dueDate >= today);
  const paidInstallments = installments.filter((installment) => installment.status === 'PAID');

  const currentList = activeSubTab === 'VENCIDOS'
    ? overdueInstallments
    : activeSubTab === 'PAGOS'
      ? paidInstallments
      : pendingInstallments;

  const filteredInstallments = currentList
    .filter((installment) => installment.provider.toLowerCase().includes(filterProvider.toLowerCase()))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-end bg-white p-6 rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase">Boletos / Parcelas</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Gestão com apropriação imediata por categoria.</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(['A_PAGAR', 'VENCIDOS', 'PAGOS'] as SubTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSubTab(tab)}
                className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeSubTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
              >
                {tab === 'A_PAGAR' ? 'A Pagar' : tab === 'VENCIDOS' ? `Vencidos (${overdueInstallments.length})` : 'Pagos'}
              </button>
            ))}
          </div>
          <label className={`bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 cursor-pointer transition-all shadow-lg ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
            <i className={isProcessing ? 'fas fa-spinner fa-spin' : 'fas fa-file-invoice-dollar'}></i>
            {isProcessing ? 'Lendo Documentos...' : 'Novo Lançamento (IA)'}
            <input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <input
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            placeholder="Filtrar por fornecedor..."
            className="w-full md:w-80 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black uppercase text-slate-700"
          />
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Vencimento</th>
              <th className="px-6 py-4">Fornecedor</th>
              <th className="px-6 py-4">Categoria (Apropriado)</th>
              <th className="px-6 py-4 text-right">Valor</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredInstallments.map((installment) => (
              <tr key={installment.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-xs font-black text-slate-500 font-mono">{new Date(`${installment.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                <td className="px-6 py-4">
                  <div className="font-black text-slate-800 uppercase text-xs">{installment.provider}</div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase">{installment.attachment.name}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-black text-slate-600 uppercase bg-slate-50 px-2 py-1 rounded">
                    {project.budget.find((macroItem) => macroItem.id === installment.macroItemId)?.description || 'NÃO DEFINIDO'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-black text-slate-900 font-mono text-sm">R$ {formatCurrency(installment.value)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end items-center gap-3">
                    {installment.status === 'PENDING' && (
                      <>
                        <button onClick={() => setEditModal(installment)} className="p-2 text-slate-400 hover:text-blue-600 transition-all"><i className="fas fa-edit"></i></button>
                        <button onClick={() => setPaymentModal({ installment, proof: null })} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm transition-all active:scale-95">Pagar</button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        if (!confirm(`Excluir a parcela de "${installment.provider}"?`)) return;
                        onUpdate({ ...project, installments: project.installments.filter((item) => item.id !== installment.id) });
                      }}
                      className="p-2 text-slate-300 hover:text-rose-600 transition-all"
                    >
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredInstallments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
                  Nenhuma parcela encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 space-y-6 shadow-2xl animate-in zoom-in duration-150">
            <h3 className="text-xl font-black text-slate-800 uppercase">Editar Parcela</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Fornecedor</label>
                <input className="w-full border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-800 uppercase text-xs" value={editModal.provider} onChange={(e) => setEditModal({ ...editModal, provider: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Vencimento</label>
                <input type="date" className="w-full border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-800 text-xs" value={editModal.dueDate} onChange={(e) => setEditModal({ ...editModal, dueDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Valor (R$)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                  <input type="text" inputMode="decimal" className="w-full border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-black text-blue-600 text-sm" value={formatMoneyInput(editModal.value)} onChange={(e) => setEditModal({ ...editModal, value: parseMoneyInput(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Item Macro</label>
                <select className="w-full border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-800 uppercase text-xs" value={editModal.macroItemId} onChange={(e) => setEditModal({ ...editModal, macroItemId: e.target.value })}>
                  {project.budget.map((macroItem) => <option key={macroItem.id} value={macroItem.id}>{macroItem.description}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setEditModal(null)} className="flex-1 py-3 text-slate-400 font-black uppercase text-[10px]">Cancelar</button>
              <button onClick={handleSaveEdit} className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-[11px] shadow-xl">Salvar Alterações</button>
            </div>
          </div>
        </div>
      )}

      {stagedInstallments && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Revisão de Parcelas Detectadas</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Revise fornecedor, vencimento, valor e categoria antes de salvar.</p>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <label className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 cursor-pointer transition-all ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                  <i className={isProcessing ? 'fas fa-spinner fa-spin' : 'fas fa-plus'}></i>
                  {isProcessing ? 'Lendo...' : 'Adicionar Arquivos'}
                  <input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} />
                </label>
                <select className="border-none bg-transparent font-black text-[10px] uppercase text-slate-500 outline-none pr-8" value={bulkMacroId} onChange={(e) => setBulkMacroId(e.target.value)}>
                  <option value="">Aplicar Categoria em Lote...</option>
                  {project.budget.map((macroItem) => <option key={macroItem.id} value={macroItem.id}>{macroItem.description}</option>)}
                </select>
                <button onClick={applyBulkMacro} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase">Aplicar</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="mb-6 space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Arquivos importados</p>
                <div className="space-y-2">
                  {Array.from(new Map(stagedInstallments.map((installment) => [installment.attachment.id, installment.attachment])).values()).map((attachment) => (
                    <div key={attachment.id} className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-700 uppercase truncate pr-4">{attachment.originalName || attachment.name}</span>
                      <button type="button" onClick={() => removeStagedFile(attachment.id)} className="text-rose-600 hover:text-rose-700 text-xs font-black uppercase">
                        <i className="fas fa-times mr-1"></i> Excluir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <table className="w-full text-left">
                <thead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="pb-4">Vencimento</th>
                    <th className="pb-4">Fornecedor</th>
                    <th className="pb-4">Parcela</th>
                    <th className="pb-4">Valor (R$)</th>
                    <th className="pb-4 w-64">Item Macro (Obrigatório)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stagedInstallments.map((installment, idx) => (
                    <tr key={installment.id}>
                      <td className="py-4 pr-4">
                        <input
                          type="date"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 font-black text-[11px] text-slate-700"
                          value={installment.dueDate}
                          onChange={(e) => {
                            const next = [...stagedInstallments];
                            next[idx] = { ...next[idx], dueDate: e.target.value };
                            setStagedInstallments(next);
                          }}
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 font-black text-[11px] uppercase text-slate-800"
                          value={installment.provider}
                          onChange={(e) => {
                            const next = [...stagedInstallments];
                            next[idx] = { ...next[idx], provider: e.target.value.toUpperCase() };
                            setStagedInstallments(next);
                          }}
                        />
                      </td>
                      <td className="py-4 text-xs font-black text-slate-400">{installment.installmentNumber}/{installment.totalInstallments}</td>
                      <td className="py-4 pr-4">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-full border border-slate-200 rounded-xl pl-11 pr-3 py-2 font-black text-sm text-slate-900"
                            value={formatMoneyInput(installment.value)}
                            onChange={(e) => {
                              const nextValue = parseMoneyInput(e.target.value);
                              const next = [...stagedInstallments];
                              next[idx] = { ...next[idx], value: nextValue, totalValue: Math.max(next[idx].totalValue || 0, nextValue) };
                              setStagedInstallments(next);
                            }}
                            placeholder="0,00"
                          />
                        </div>
                      </td>
                      <td className="py-4">
                        <select
                          className="w-full border border-slate-200 rounded-xl px-4 py-2 font-black text-[10px] uppercase text-blue-600 bg-blue-50/30"
                          value={installment.macroItemId}
                          onChange={(e) => {
                            const next = [...stagedInstallments];
                            next[idx] = { ...next[idx], macroItemId: e.target.value };
                            setStagedInstallments(next);
                          }}
                        >
                          <option value="">Selecione...</option>
                          {project.budget.map((macroItem) => <option key={macroItem.id} value={macroItem.id}>{macroItem.description}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50 flex justify-end gap-4">
              <button
                onClick={() => {
                  if (!confirm('Descartar as parcelas detectadas sem salvar?')) return;
                  setStagedInstallments(null);
                }}
                className="px-8 py-4 font-black text-slate-400 uppercase text-xs"
              >
                Descartar
              </button>
              <button onClick={saveStaged} className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black uppercase text-xs shadow-xl transition-all active:scale-95">Salvar e Registrar Parcelas</button>
            </div>
          </div>
        </div>
      )}

      {paymentModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 space-y-6 animate-in zoom-in duration-200">
            <h3 className="text-xl font-black text-slate-800 uppercase">Confirmar Pagamento</h3>
            <div className="bg-slate-50 p-5 rounded-2xl space-y-2 border border-slate-200">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apropriação vinculada</p>
              <p className="text-xs font-black text-slate-600 uppercase bg-white px-2 py-1 rounded w-fit border border-slate-100">
                {project.budget.find((macroItem) => macroItem.id === paymentModal.installment.macroItemId)?.description}
              </p>
              <div className="pt-2">
                <p className="text-sm font-black text-slate-800 uppercase">{paymentModal.installment.provider}</p>
                <p className="text-2xl font-black text-blue-600 font-mono">R$ {formatCurrency(paymentModal.installment.value)}</p>
              </div>
            </div>
            <div className="space-y-4">
              <label className="w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors">
                <div className="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center text-slate-400">
                  <i className="fas fa-file-upload text-xl"></i>
                </div>
                <span className="text-[10px] font-black uppercase text-slate-500 text-center">
                  {paymentModal.proof ? `ARQUIVO: ${paymentModal.proof.name}` : 'Anexar Comprovante de Pagamento'}
                </span>
                <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleProofUpload} />
              </label>
              {paymentModal.proof && (
                <div className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-700 uppercase truncate pr-4">{paymentModal.proof.originalName || paymentModal.proof.name}</span>
                  <button type="button" onClick={removePaymentProof} className="text-rose-600 hover:text-rose-700 text-xs font-black uppercase">
                    <i className="fas fa-times mr-1"></i> Excluir
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setPaymentModal(null)} className="flex-1 py-3 text-slate-400 font-black uppercase text-[10px]">Cancelar</button>
              <button disabled={!paymentModal.proof} onClick={handleMarkAsPaid} className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-[11px] disabled:opacity-20 shadow-xl">Efetivar Baixa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
