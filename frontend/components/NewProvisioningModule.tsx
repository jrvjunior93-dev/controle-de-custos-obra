import React, { useEffect, useMemo, useState } from 'react';
import { dbService } from '../apiClient';
import { ProvisioningContext, ProvisioningStatus, User } from '../types';

interface NewProvisioningModuleProps {
  user: User;
  onCreated?: () => void;
}

const PRIORITY_OPTIONS = [
  { value: '', label: 'Nao definida' },
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'CRITICA', label: 'Critica' },
];

const INITIAL_STATUS_OPTIONS: Array<{ value: ProvisioningStatus; label: string }> = [
  { value: 'PREVISTO', label: 'Previsto' },
  { value: 'EM_ANALISE', label: 'Em analise' },
];

const formatMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const numeric = Number(digits) / 100;
  return numeric.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseMoneyInput = (value: string) => {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  return Number(normalized || 0);
};

export const NewProvisioningModule: React.FC<NewProvisioningModuleProps> = ({ onCreated }) => {
  const [context, setContext] = useState<ProvisioningContext | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: '',
    dueDate: '',
    itemMacro: '',
    description: '',
    forecastValue: '',
    supplier: '',
    priority: '',
    status: 'PREVISTO' as ProvisioningStatus,
    comment: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await dbService.getProvisioningContext();
        setContext(data);
      } catch (error) {
        console.error(error);
        alert('Nao foi possivel carregar o contexto de provisionamento.');
      }
    }

    void load();
  }, []);

  const itemMacroSuggestions = useMemo(
    () => Array.from(new Set((context?.categories || []).map((category) => String(category.name || '').trim()).filter(Boolean))),
    [context]
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.projectId || !form.dueDate || !form.itemMacro.trim() || !form.description.trim() || !parseMoneyInput(form.forecastValue)) {
      alert('Preencha obra, data prevista, item macro, descricao e valor previsto.');
      return;
    }

    try {
      setSaving(true);
      await dbService.createProvisioning({
        projectId: form.projectId,
        itemMacro: form.itemMacro.trim().toUpperCase(),
        description: form.description.trim(),
        supplier: form.supplier.trim(),
        dueDate: form.dueDate,
        forecastValue: parseMoneyInput(form.forecastValue),
        priority: form.priority || undefined,
        status: form.status,
        comment: form.comment.trim(),
      });
      alert('Provisao criada com sucesso.');
      setForm({
        projectId: '',
        dueDate: '',
        itemMacro: '',
        description: '',
        forecastValue: '',
        supplier: '',
        priority: '',
        status: 'PREVISTO',
        comment: '',
      });
      onCreated?.();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel criar a provisao.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      <section className="bg-white border border-slate-200 shadow-sm p-8 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600">Provisionamento</p>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Nova Provisao</h2>
            <p className="max-w-3xl text-sm text-slate-500">
              Registre uma previsao gerencial de desembolso com o mesmo padrao operacional do modulo de referencia, preservando o visual do sistema atual.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:min-w-[28rem]">
            <div className="border border-blue-100 bg-blue-50 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Fluxo</p>
              <p className="mt-2 text-sm font-bold text-slate-700">A criacao registra a provisao e o acompanhamento posterior acontece no detalhe.</p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Anexos</p>
              <p className="mt-2 text-sm font-bold text-slate-700">Os anexos podem ser enviados depois, na tela de detalhe da provisao.</p>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="bg-white border border-slate-200 shadow-sm p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Obra</label>
            <select
              value={form.projectId}
              onChange={(e) => setForm((current) => ({ ...current, projectId: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500"
            >
              <option value="">Selecione...</option>
              {(context?.projectOptions || []).map((project) => (
                <option key={project.id} value={project.id}>{project.code} - {project.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Prevista de Desembolso</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((current) => ({ ...current, dueDate: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item Macro</label>
            <input
              type="text"
              value={form.itemMacro}
              onChange={(e) => setForm((current) => ({ ...current, itemMacro: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500"
              list="provisioning-item-macro-options"
              placeholder="Ex.: CONCRETAGEM, LOCACAO, COMBUSTIVEL"
            />
            <datalist id="provisioning-item-macro-options">
              {itemMacroSuggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2 xl:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descricao</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
              rows={6}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              placeholder="Descreva o contexto financeiro da provisao."
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor Previsto</label>
            <input
              value={form.forecastValue}
              onChange={(e) => setForm((current) => ({ ...current, forecastValue: formatMoneyInput(e.target.value) }))}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black outline-none focus:border-blue-500"
              placeholder="0,00"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fornecedor</label>
            <input
              value={form.supplier}
              onChange={(e) => setForm((current) => ({ ...current, supplier: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black outline-none focus:border-blue-500"
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prioridade</label>
            <select
              value={form.priority}
              onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value || 'EMPTY'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status Inicial</label>
            <select
              value={form.status}
              onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as ProvisioningStatus }))}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500"
            >
              {INITIAL_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 xl:col-span-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Comentario Inicial</label>
            <textarea
              value={form.comment}
              onChange={(e) => setForm((current) => ({ ...current, comment: e.target.value }))}
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              placeholder="Opcional. Registre uma observacao inicial para contextualizar a previsao."
            />
          </div>
        </div>

        <div className="rounded-none border border-blue-100 bg-blue-50 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Observacao Operacional</p>
          <p className="mt-2 text-sm text-slate-700">
            Nesta etapa, os anexos ficam para depois da criacao, na tela de detalhe da provisao. Assim o cadastro inicial fica mais rapido e alinhado ao modulo modelo.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => onCreated?.()} className="border border-slate-200 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="bg-slate-900 text-white px-8 py-4 font-black uppercase text-[10px] tracking-widest shadow-xl disabled:opacity-60">
            {saving ? 'Salvando...' : 'Criar Provisao'}
          </button>
        </div>
      </form>
    </div>
  );
};
