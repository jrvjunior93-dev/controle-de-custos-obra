
import React, { useEffect, useState } from 'react';
import { Project, ExecutedCost, MacroItem, Attachment } from '../types';

interface CostModuleProps {
  project: Project;
  onSave: (costs: ExecutedCost[]) => void;
  canManageCosts: boolean;
}

async function loadGeminiService() {
  return await import('../geminiService');
}

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const formatMoneyInput = (value?: number) => value == null ? '' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
};

export const CostModule: React.FC<CostModuleProps> = ({ project, onSave, canManageCosts }) => {
  const [costs, setCosts] = useState<ExecutedCost[]>(project.costs || []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    setCosts(project.costs || []);
  }, [project.costs]);
  
  // FUNÇÃO CORRIGIDA: Pega data local SEM fuso horário UTC
  const getTodayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [currentCost, setCurrentCost] = useState<Partial<ExecutedCost>>({
    id: '',
    description: '',
    macroItemId: '',
    unit: 'un',
    quantity: 1,
    unitValue: 0,
    totalValue: 0,
    date: '', 
    entryDate: getTodayLocal(), 
    attachments: []
  });

  const normalizeDate = (dateStr: string) => {
    if (!dateStr) return '';
    const cleaned = dateStr.trim();
    // Caso DD/MM/YYYY
    if (cleaned.includes('/')) {
      const p = cleaned.split('/');
      if (p.length === 3) {
        if (p[2].length === 4) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
      }
    }
    return cleaned.substring(0, 10);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const getOriginOrderLabel = (cost: ExecutedCost) => {
    if (!cost.originOrderId) return 'Lançamento manual';
    const order = (project.orders || []).find((item) => item.id === cost.originOrderId);
    if (!order) return 'Pedido vinculado';
    return order.orderCode ? `Pedido ${order.orderCode}` : `Pedido ${order.title}`;
  };

  const generateUniqueCode = () => {
    const d = new Date();
    const datePart = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `REF-${datePart}-${randomStr}`;
  };

  const removeCurrentAttachment = (attachmentId: string) => {
    setCurrentCost((prev) => ({ ...prev, attachments: (prev.attachments || []).filter((attachment) => attachment.id !== attachmentId) }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const results: Partial<ExecutedCost>[] = [];

    // Added explicit type cast to File[] to prevent 'unknown' errors in the loop
    for (const file of Array.from(files) as File[]) {
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        alert(`O arquivo ${file.name} excede o limite de 10 MB para importacao.`);
        continue;
      }
      const uniqueCode = generateUniqueCode();
      const extension = file.name.split('.').pop();
      const newFileName = `${uniqueCode}.${extension}`;

      try {
        const reader = new FileReader();
        const fullBase64: string = await new Promise((res) => {
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(file);
        });

        const { extractCostData } = await loadGeminiService();
        const extracted = await extractCostData({ fileBase64: fullBase64.split(',')[1], mimeType: file.type });
        if (!extracted?.description && !extracted?.totalValue) {
          throw new Error('Nenhum dado de custo foi identificado no arquivo.');
        }

        results.push({
          ...extracted,
          id: crypto.randomUUID(),
          date: normalizeDate(extracted.date || ''),
          entryDate: getTodayLocal(),
          attachments: [{
            id: crypto.randomUUID(),
            name: newFileName,
            originalName: file.name,
            data: fullBase64,
            type: file.type,
            size: file.size,
            uploadDate: new Date().toISOString()
          }]
        });
      } catch (err) {
        console.error(err);
        const { getGeminiErrorMessage } = await loadGeminiService();
        alert(getGeminiErrorMessage(err));
      }
    }

    if (results.length > 0) {
      const first = results[0];
      setCurrentCost(prev => ({ 
        ...prev, 
        ...first, 
        date: normalizeDate(first.date || ''),
        attachments: [...(prev.attachments || []), ...(first.attachments || [])] 
      }));
    } else {
      alert('A IA n?o conseguiu identificar dados v?lidos nos arquivos enviados.');
    }
    
    setIsProcessing(false);
    e.target.value = '';
  };

  const handleSaveCost = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!confirm(isEditing ? 'Confirmar alteracoes deste custo?' : 'Confirmar registro deste custo?')) return;
    const costToSave = { 
      ...currentCost, 
      id: isEditing ? currentCost.id : crypto.randomUUID(),
      entryDate: currentCost.entryDate || getTodayLocal()
    } as ExecutedCost;
    
    const newCosts = isEditing ? costs.map(c => c.id === costToSave.id ? costToSave : c) : [...costs, costToSave];
    setCosts(newCosts);
    onSave(newCosts);
    setIsModalOpen(false);
    setIsEditing(false);
    setCurrentCost({ description: '', macroItemId: '', unit: 'un', quantity: 1, unitValue: 0, totalValue: 0, date: '', entryDate: getTodayLocal(), attachments: [] });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Custos Executados</h3>
          <p className="text-sm text-slate-500 font-medium">Reconhecimento inteligente de documentos de ate 10 MB.</p>
        </div>
        {canManageCosts && (
          <button onClick={() => { setIsEditing(false); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all">
            <i className="fas fa-plus"></i> Novo Lançamento
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Datas (Doc/Lanc)</th>
              <th className="px-6 py-4">Fornecedor</th>
              <th className="px-6 py-4">Origem</th>
              <th className="px-6 py-4">Código Ref.</th>
              <th className="px-6 py-4 text-right">Total</th>
              <th className="px-6 py-4 w-28 text-center">{canManageCosts ? 'Ações' : ''}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...costs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(cost => (
              <tr key={cost.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-xs font-black text-slate-500 font-mono">
                  <div className="text-slate-800">{cost.date ? new Date(cost.date + 'T12:00:00').toLocaleDateString('pt-BR') : '--/--/----'}</div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Lanc: {new Date(cost.entryDate + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-black text-slate-800 uppercase text-xs truncate max-w-[200px]">{cost.description}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${cost.originOrderId ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {getOriginOrderLabel(cost)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    {cost.attachments.map(att => (
                      <span key={att.id} className="text-[9px] font-black text-blue-600 uppercase truncate max-w-[150px]">{att.name}</span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-black text-slate-900 font-mono text-sm">R$ {formatCurrency(cost.totalValue)}</td>
                <td className="px-6 py-4 text-center">
                  {canManageCosts && (
                    <div className="flex justify-center gap-1">
                      <button onClick={() => { setCurrentCost(cost); setIsEditing(true); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm('Excluir este custo?')) return;
                          const newCosts = costs.filter(c => c.id !== cost.id);
                          setCosts(newCosts);
                          onSave(newCosts);
                        }}
                        className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!canManageCosts && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-500">
          Ajuste manual de custos disponível apenas para o superadmin.
        </div>
      )}

      {isModalOpen && canManageCosts && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-800 uppercase">Lançamento de Custo</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 p-2"><i className="fas fa-times text-xl"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="bg-slate-50 p-12 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center hover:bg-slate-100 transition-all cursor-pointer">
                    <label className="cursor-pointer block">
                      <div className="bg-slate-900 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
                        <i className={isProcessing ? "fas fa-spinner fa-spin text-white text-2xl" : "fas fa-file-upload text-white text-2xl"}></i>
                      </div>
                      <h4 className="font-black text-slate-800 text-lg uppercase">Anexar Documento</h4>
                      <input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} />
                    </label>
                  </div>
                  <div className="space-y-2">
                    {currentCost.attachments?.map((att, idx) => (
                      <div key={idx} className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex justify-between">
                        <span className="text-[10px] font-black text-blue-700 uppercase">{att.name}</span>
                        <button type="button" onClick={() => removeCurrentAttachment(att.id)} className="text-rose-600 hover:text-rose-700 text-xs font-black uppercase">
                          <i className="fas fa-times mr-1"></i> Excluir
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <form className="space-y-5" onSubmit={handleSaveCost}>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                      <select required className="w-full border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-800 text-xs shadow-sm uppercase" value={currentCost.macroItemId} onChange={e => setCurrentCost({...currentCost, macroItemId: e.target.value})}>
                        <option value="">Selecione...</option>
                        {project.budget.map(m => <option key={m.id} value={m.id}>{m.description}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label>
                      <input required className="w-full border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-800 text-xs shadow-sm uppercase" value={currentCost.description} onChange={e => setCurrentCost({...currentCost, description: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-blue-600 uppercase">Data Doc (IA)</label>
                        <input type="date" className="w-full border-2 border-blue-100 rounded-xl px-4 py-3 font-black text-slate-800 text-xs bg-blue-50/20" value={currentCost.date} onChange={e => setCurrentCost({...currentCost, date: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Data Registro</label>
                        <input type="date" readOnly className="w-full border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-400 text-xs bg-slate-50 cursor-not-allowed" value={currentCost.entryDate} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Valor Total</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">R$</span>
                          <input type="text" inputMode="decimal" className="w-full border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-black text-blue-600 text-sm shadow-sm bg-blue-50" value={formatMoneyInput(currentCost.totalValue)} onChange={e => setCurrentCost({...currentCost, totalValue: parseMoneyInput(e.target.value)})} placeholder="0,00" />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all mt-4">Salvar Lançamento</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};








