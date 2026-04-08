import React, { useEffect, useState } from 'react';
import { dbService } from '../apiClient';
import { Attachment, ProvisioningContext, User } from '../types';

interface NewProvisioningModuleProps {
  user: User;
  onCreated?: () => void;
}

export const NewProvisioningModule: React.FC<NewProvisioningModuleProps> = ({ onCreated }) => {
  const [context, setContext] = useState<ProvisioningContext | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: '',
    categoryId: '',
    title: '',
    description: '',
    supplier: '',
    dueDate: '',
    forecastValue: '',
    comment: '',
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);

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
    setAttachments(mapped);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.projectId || !form.categoryId || !form.title.trim() || !form.description.trim() || !form.dueDate || !form.forecastValue) {
      alert('Preencha os campos obrigatorios.');
      return;
    }

    try {
      setSaving(true);
      await dbService.createProvisioning({
        projectId: form.projectId,
        categoryId: form.categoryId,
        title: form.title.trim(),
        description: form.description.trim(),
        supplier: form.supplier.trim(),
        dueDate: form.dueDate,
        forecastValue: Number(form.forecastValue.replace(/\./g, '').replace(',', '.')),
        comment: form.comment.trim(),
        attachments,
      });
      alert('Provisao criada com sucesso.');
      setForm({
        projectId: '',
        categoryId: '',
        title: '',
        description: '',
        supplier: '',
        dueDate: '',
        forecastValue: '',
        comment: '',
      });
      setAttachments([]);
      onCreated?.();
    } catch (error) {
      console.error(error);
      alert('Nao foi possivel criar a provisao.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      <form onSubmit={submit} className="bg-white border border-slate-200 shadow-sm p-8 space-y-8">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Nova Provisao</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">Registro de previsao financeira no mesmo padrao visual do sistema atual.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Obra</label>
            <select value={form.projectId} onChange={(e) => setForm((current) => ({ ...current, projectId: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500">
              <option value="">Selecione</option>
              {(context?.projectOptions || []).map((project) => (
                <option key={project.id} value={project.id}>{project.code} - {project.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categoria Macro</label>
            <select value={form.categoryId} onChange={(e) => setForm((current) => ({ ...current, categoryId: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500">
              <option value="">Selecione</option>
              {(context?.categories || []).map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Titulo</label>
            <input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descricao</label>
            <textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={5} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fornecedor</label>
            <input value={form.supplier} onChange={(e) => setForm((current) => ({ ...current, supplier: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Prevista</label>
            <input type="date" value={form.dueDate} onChange={(e) => setForm((current) => ({ ...current, dueDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor Previsto</label>
            <input value={form.forecastValue} onChange={(e) => setForm((current) => ({ ...current, forecastValue: e.target.value }))} placeholder="0,00" className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Comentario Inicial</label>
            <input value={form.comment} onChange={(e) => setForm((current) => ({ ...current, comment: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black outline-none focus:border-blue-500" />
          </div>
        </div>

        <div className="space-y-3 border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">Anexos Iniciais</h3>
          <input type="file" multiple onChange={(e) => void toAttachmentPayloads(e.target.files)} className="block w-full text-xs font-bold" />
          {attachments.length === 0 && <p className="text-[10px] font-bold uppercase text-slate-400">Nenhum arquivo selecionado.</p>}
          {attachments.map((attachment) => (
            <p key={attachment.id} className="text-[10px] font-black uppercase text-slate-600">{attachment.originalName || attachment.name}</p>
          ))}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="bg-slate-900 text-white px-8 py-4 font-black uppercase text-[10px] tracking-widest shadow-xl disabled:opacity-60">
            {saving ? 'Salvando...' : 'Criar Provisao'}
          </button>
        </div>
      </form>
    </div>
  );
};
