import React, { useEffect, useState } from 'react';
import { MacroItem } from '../types';
import { normalizePtText } from '../utils/text';

interface BudgetModuleProps {
  budget: MacroItem[];
  onSave: (items: MacroItem[]) => void;
  onDraftChange?: (items: MacroItem[]) => void;
  draftKey?: string;
}

type ParsedBudgetRow = {
  description: string;
  budgetedValue: number;
};

type ImportedBudgetBatch = {
  id: string;
  fileName: string;
  itemIds: string[];
};

type XlsxModule = typeof import('xlsx');
type FeedbackState = { type: 'idle' | 'info' | 'success' | 'error'; message: string };

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const DESCRIPTION_HINTS = ['descricao', 'item', 'servico', 'etapa', 'grupo', 'macro', 'conta', 'insumo', 'discriminacao'];
const MACRO_DESCRIPTION_HINTS = ['descricao', 'servico', 'etapa', 'grupo', 'macro', 'conta', 'insumo', 'discriminacao'];
const VALUE_HINTS = ['valor', 'total', 'orcado', 'preco', 'custo', 'importancia', 'montante'];
const MACRO_CODE_PATTERN = /^\d+\.0$/;
const PROCESSING_STEPS = {
  READING: 'Carregando arquivo...',
  PARSING: 'Analisando estrutura do arquivo...',
  AI: 'Processando leitura com IA...',
} as const;

function normalizeHeader(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/%.-]/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeDescription(value: unknown) {
  return normalizePtText(String(value || '').replace(/\s+/g, ' ').trim());
}

function parseBrazilianNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value || '').trim();
  if (!text) return 0;
  const cleaned = text.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastDot > lastComma) {
      return Number(cleaned.replace(/,/g, '')) || 0;
    }
    return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (cleaned.includes(',')) {
    return Number(cleaned.replace(',', '.')) || 0;
  }
  return Number(cleaned) || 0;
}

function isLikelyDescription(value: unknown) {
  const normalized = normalizeDescription(value);
  if (!normalized) return false;
  const compact = normalizeHeader(normalized);
  if (!compact || compact.length < 4) return false;
  if (compact === 'total' || compact.startsWith('subtotal') || compact.includes('total geral')) return false;
  return /[a-z]/i.test(normalized) && parseBrazilianNumber(value) === 0;
}

function dedupeRows(rows: ParsedBudgetRow[]) {
  const map = new Map<string, ParsedBudgetRow>();
  for (const row of rows) {
    const key = `${row.description.toUpperCase()}::${row.budgetedValue.toFixed(2)}`;
    if (!map.has(key)) map.set(key, row);
  }
  return Array.from(map.values());
}

async function loadXlsx() {
  return await import('xlsx');
}

async function loadGeminiService() {
  return await import('../geminiService');
}

function findHeaderIndex(rows: (string | number | null)[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  rows.forEach((row, rowIndex) => {
    let score = 0;
    let foundItem = false;
    let foundDescription = false;
    let foundValue = false;

    row.forEach((cell) => {
      const normalized = normalizeHeader(cell);
      if (!normalized) return;
      if (!foundItem && normalized === 'item') {
        foundItem = true;
        score += 3;
        return;
      }
      if (!foundDescription && MACRO_DESCRIPTION_HINTS.some((hint) => normalized.includes(hint))) {
        foundDescription = true;
        score += 3;
        return;
      }
      if (!foundValue && VALUE_HINTS.some((hint) => normalized.includes(hint))) {
        foundValue = true;
        score += 2;
      }
    });

    if (foundItem && foundDescription) score += 4;
    if (foundDescription && foundValue) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  });

  return bestScore >= 5 ? bestIndex : -1;
}

function findColumnIndex(headers: string[], hints: string[], fallbackIndex = -1) {
  const directMatch = headers.findIndex((header) => hints.some((hint) => header.includes(hint)));
  if (directMatch >= 0) return directMatch;
  return fallbackIndex;
}

function extractMacroRows(rows: (string | number | null)[][]) {
  const headerRowIndex = findHeaderIndex(rows);
  if (headerRowIndex < 0) return [];

  const headers = rows[headerRowIndex].map((cell) => normalizeHeader(cell));
  const itemIndex = findColumnIndex(headers, ['item'], 0);
  const descriptionIndex = findColumnIndex(headers, MACRO_DESCRIPTION_HINTS, 3);
  const valueIndex = findColumnIndex(headers, ['valor total', 'valor', 'total'], 8);

  if (itemIndex < 0 || descriptionIndex < 0 || valueIndex < 0) return [];

  const macros: ParsedBudgetRow[] = [];
  for (const row of rows.slice(headerRowIndex + 1)) {
    const itemCode = String(row[itemIndex] || '').trim();
    if (!MACRO_CODE_PATTERN.test(itemCode)) continue;

    const description = normalizeDescription(row[descriptionIndex]);
    const budgetedValue = parseBrazilianNumber(row[valueIndex]);
    if (!description || budgetedValue <= 0) continue;

    macros.push({ description, budgetedValue });
  }

  return macros;
}

function extractBudgetFromWorkbook(workbook: XlsxModule['WorkBook'], XLSX: XlsxModule) {
  const macroParsed: ParsedBudgetRow[] = [];
  const parsed: ParsedBudgetRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
    });

    if (rows.length === 0) continue;

    const macroRows = extractMacroRows(rows);
    if (macroRows.length > 0) {
      macroParsed.push(...macroRows);
      continue;
    }

    const headerRowIndex = findHeaderIndex(rows);

    const headerIndex = headerRowIndex >= 0 ? headerRowIndex : 0;
    const headers = rows[headerIndex].map((cell) => normalizeHeader(cell));
    let descriptionIndex = headers.findIndex((header) => DESCRIPTION_HINTS.some((hint) => header.includes(hint)));
    let valueIndex = headers.findIndex((header) => VALUE_HINTS.some((hint) => header.includes(hint)));

    if (descriptionIndex < 0 || valueIndex < 0) {
      const sampleRow = rows.slice(headerIndex + 1).find((row) => row.some((cell) => normalizeDescription(cell)));
      if (sampleRow) {
        descriptionIndex = descriptionIndex < 0 ? sampleRow.findIndex((cell) => isLikelyDescription(cell)) : descriptionIndex;
        valueIndex = valueIndex < 0 ? sampleRow.findIndex((cell) => parseBrazilianNumber(cell) > 0) : valueIndex;
      }
    }

    if (descriptionIndex < 0 || valueIndex < 0) continue;

    for (const row of rows.slice(headerIndex + 1)) {
      const description = normalizeDescription(row[descriptionIndex]);
      const budgetedValue = parseBrazilianNumber(row[valueIndex]);
      if (!description || budgetedValue <= 0) continue;
      const normalizedDescription = normalizeHeader(description);
      if (normalizedDescription.includes('total geral') || normalizedDescription === 'total' || normalizedDescription.startsWith('subtotal')) continue;
      parsed.push({ description, budgetedValue });
    }
  }

  if (macroParsed.length > 0) {
    return dedupeRows(macroParsed);
  }

  return dedupeRows(parsed);
}

export const BudgetModule: React.FC<BudgetModuleProps> = ({ budget, onSave, onDraftChange, draftKey }) => {
  const [items, setItems] = useState<MacroItem[]>(budget);
  const [importedBatches, setImportedBatches] = useState<ImportedBudgetBatch[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>({ type: 'idle', message: '' });
  const [processingStep, setProcessingStep] = useState('');
  const [processingFileName, setProcessingFileName] = useState('');

  useEffect(() => {
    setItems(budget);
    setImportedBatches([]);
  }, [budget]);

  useEffect(() => {
    onDraftChange?.(items);
  }, [items, onDraftChange]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  const appendItems = (rows: ParsedBudgetRow[], fileName?: string) => {
    if (rows.length === 0) return { added: false, count: 0 };
    const existing = new Set(items.map((item) => `${normalizeHeader(item.description)}::${item.budgetedValue.toFixed(2)}`));
    const mapped = rows
      .map((row) => ({ id: crypto.randomUUID(), description: normalizePtText(row.description), budgetedValue: row.budgetedValue }))
      .filter((row) => !existing.has(`${normalizeHeader(row.description)}::${row.budgetedValue.toFixed(2)}`));
    if (mapped.length === 0) return { added: false, count: rows.length };
    setItems((current) => [...current, ...mapped]);
    if (fileName) {
      setImportedBatches((current) => [...current, { id: crypto.randomUUID(), fileName, itemIds: mapped.map((item) => item.id) }]);
    }
    return { added: true, count: rows.length };
  };

  const resetProcessing = () => {
    setIsProcessing(false);
    setProcessingStep('');
    setProcessingFileName('');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_IMPORT_FILE_SIZE) {
          alert(`O arquivo ${file.name} excede o limite de 10 MB para importacao.`);
          continue;
        }

        setIsProcessing(true);
        setProcessingFileName(file.name);
        setProcessingStep(PROCESSING_STEPS.READING);
        setFeedback({ type: 'info', message: `Processando arquivo: ${file.name}` });

        const lowerName = file.name.toLowerCase();
        const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') ||
          file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.type === 'application/vnd.ms-excel';
        const isCsv = lowerName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/csv' || file.type === 'text/plain';

        if (isExcel || isCsv) {
          setProcessingStep(PROCESSING_STEPS.PARSING);
          const XLSX = await loadXlsx();
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const localItems = extractBudgetFromWorkbook(workbook, XLSX);

          if (localItems.length > 0) {
            const result = appendItems(localItems, file.name);
            setFeedback({
              type: result.added ? 'success' : 'info',
              message: result.added
                ? `${result.count} item(ns) identificados na planilha ${file.name}.`
                : `Os itens identificados em ${file.name} ja estavam cadastrados no orcamento.`
            });
            continue;
          }

          setProcessingStep(PROCESSING_STEPS.AI);
          const csvBySheet = workbook.SheetNames.map((sheetName) => {
            const ws = workbook.Sheets[sheetName];
            return `ABA: ${sheetName}\n${XLSX.utils.sheet_to_csv(ws)}`;
          }).join('\n\n');

          const { extractBudgetData } = await loadGeminiService();
          const extracted = await extractBudgetData({ extractedText: csvBySheet.slice(0, 120000) });
          const filtered = (extracted || []).filter((item: any) => item?.description && Number(item?.budgetedValue) > 0);
          const result = appendItems(filtered, file.name);
          if (!result.added) throw new Error('Nenhum item de orcamento foi identificado no arquivo.');
          setFeedback({ type: 'success', message: `${filtered.length} item(ns) identificados pela IA em ${file.name}.` });
          continue;
        }

        setProcessingStep(PROCESSING_STEPS.AI);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
          reader.onerror = () => reject(new Error('Falha ao carregar o arquivo selecionado.'));
          reader.readAsDataURL(file);
        });
        const { extractBudgetData } = await loadGeminiService();
        const extracted = await extractBudgetData({ fileBase64: base64, mimeType: file.type });
        const filtered = (extracted || []).filter((item: any) => item?.description && Number(item?.budgetedValue) > 0);
        const result = appendItems(filtered, file.name);
        if (!result.added) throw new Error('Nenhum item de orcamento foi identificado no arquivo.');
        setFeedback({ type: 'success', message: `${filtered.length} item(ns) identificados pela IA em ${file.name}.` });
      }
    } catch (error) {
      console.error(error);
      const { getGeminiErrorMessage } = await loadGeminiService();
      const message = getGeminiErrorMessage(error);
      setFeedback({ type: 'error', message });
      alert(message);
    } finally {
      resetProcessing();
      event.target.value = '';
    }
  };

  const handleConfirmSave = async () => {
    if (!confirm('Confirmar salvamento do orcamento da obra?')) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave(items);
      if (draftKey) sessionStorage.removeItem(draftKey);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      alert('Erro ao salvar orcamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateItem = (id: string, field: keyof MacroItem, value: any) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: string) => {
    if (!confirm('Excluir este item do orcamento?')) return;
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const clearItems = () => {
    if (items.length === 0) return;
    if (!confirm('Limpar todo o orcamento desta obra?')) return;
    setItems([]);
    setImportedBatches([]);
    setFeedback({ type: 'info', message: 'Orcamento limpo. Confirme o salvamento para persistir a alteracao.' });
  };

  const removeImportedBatch = (batchId: string) => {
    const targetBatch = importedBatches.find((batch) => batch.id === batchId);
    if (!targetBatch) return;
    if (!confirm(`Excluir os itens importados do arquivo ${targetBatch.fileName}?`)) return;
    setItems((current) => current.filter((item) => !targetBatch.itemIds.includes(item.id)));
    setImportedBatches((current) => current.filter((batch) => batch.id !== batchId));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {isProcessing && (
        <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 flex items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <i className="fas fa-spinner fa-spin text-blue-400"></i>
            <div>
              <p className="text-sm font-black uppercase tracking-wide">{processingStep || 'Processando arquivo...'}</p>
              <p className="text-[11px] font-bold text-slate-300">{processingFileName}</p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase text-slate-400">Aguarde</span>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <i className="fas fa-check-circle"></i>
          <span className="font-bold">Orcamento salvo com sucesso!</span>
        </div>
      )}

      {feedback.type !== 'idle' && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${feedback.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : feedback.type === 'success' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          <i className={`fas ${feedback.type === 'error' ? 'fa-triangle-exclamation' : feedback.type === 'success' ? 'fa-wand-magic-sparkles' : 'fa-spinner fa-spin'}`}></i>
          <span className="font-bold text-sm">{feedback.message}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Estrutura Orcamentaria</h3>
            <p className="text-slate-500 text-sm">Aceita PDF, Excel (.xlsx, .xls), CSV e imagens de ate 10 MB, com leitura local e fallback por IA.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={clearItems} disabled={items.length === 0 || isProcessing} className={`bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${(items.length === 0 || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <i className="fas fa-eraser"></i> Limpar orcamento
            </button>
            <label className={`cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
              <i className={isProcessing ? 'fas fa-spinner fa-spin' : 'fas fa-file-excel'}></i>
              {isProcessing ? 'Processando...' : 'Importar orcamento'}
              <input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv" onChange={handleFileUpload} />
            </label>
            <button onClick={() => setItems((current) => [...current, { id: crypto.randomUUID(), description: '', budgetedValue: 0 }])} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all">
              <i className="fas fa-plus"></i> Novo Item
            </button>
          </div>
        </div>

        {importedBatches.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Arquivos importados nesta tela</p>
            {importedBatches.map((batch) => (
              <div key={batch.id} className="bg-white border border-slate-200 px-4 py-3 rounded-xl flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-700 uppercase truncate pr-4">{batch.fileName}</span>
                <button type="button" onClick={() => removeImportedBatch(batch.id)} className="text-rose-600 hover:text-rose-700 text-xs font-black uppercase">
                  <i className="fas fa-times mr-1"></i> Excluir
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="p-0">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Descricao do Item Macro</th>
                <th className="px-6 py-4 w-48 text-right">Valor Orcado (R$)</th>
                <th className="px-6 py-4 w-16 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-3">
                    <input className="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none font-medium text-slate-700 py-1" value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} placeholder="Ex: Infraestrutura..." />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="relative">
                      <span className="absolute left-0 top-1.5 text-slate-400 text-sm">R$</span>
                      <input type="number" step="0.01" className="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none font-bold text-slate-700 text-right py-1 pl-6" value={item.budgetedValue} onChange={(e) => updateItem(item.id, 'budgetedValue', parseFloat(e.target.value) || 0)} />
                    </div>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-400">Nenhum item orcado. Importe uma planilha ou adicione manualmente.</td>
                </tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="px-6 py-4 font-bold text-slate-600 text-right uppercase text-xs">Total Orcado</td>
                  <td className="px-6 py-4 text-right font-black text-slate-900 text-lg">R$ {formatCurrency(items.reduce((acc, current) => acc + current.budgetedValue, 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button disabled={isSaving || items.length === 0} onClick={handleConfirmSave} className={`bg-slate-800 hover:bg-slate-900 text-white px-8 py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center gap-2 ${(isSaving || items.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {isSaving ? <i className="fas fa-circle-notch fa-spin"></i> : null}
            {isSaving ? 'Salvando...' : 'Confirmar e Salvar Orcamento'}
          </button>
        </div>
      </div>
    </div>
  );
};
