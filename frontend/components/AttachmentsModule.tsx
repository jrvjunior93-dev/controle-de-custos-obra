import React, { useState } from 'react';
import { Project, Attachment } from '../types';
// @ts-ignore
import JSZip from 'jszip';
import { AttachmentViewerModal } from './AttachmentViewerModal';

interface FileRow {
  att: Attachment;
  origin: string;
  date: string;
  provider: string;
  sourceType: 'COST_ATTACHMENT' | 'INSTALLMENT_ATTACHMENT' | 'PAYMENT_PROOF';
  sourceId: string;
}

interface AttachmentsModuleProps {
  project: Project;
  onUpdate: (p: Project) => void;
  isAdmin: boolean;
}

export const AttachmentsModule: React.FC<AttachmentsModuleProps> = ({ project, onUpdate, isAdmin }) => {
  const [filter, setFilter] = useState('');
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  const allAttachments: FileRow[] = [];

  (project.costs || []).forEach((cost) => {
    (cost.attachments || []).forEach((att) => {
      allAttachments.push({
        att,
        origin: 'CUSTO EXECUTADO',
        date: cost.date,
        provider: cost.description,
        sourceType: 'COST_ATTACHMENT',
        sourceId: cost.id
      });
    });
  });

  (project.installments || []).forEach((inst) => {
    if (inst.attachment) {
      allAttachments.push({
        att: inst.attachment,
        origin: 'BOLETO / PARCELA',
        date: inst.dueDate,
        provider: inst.provider,
        sourceType: 'INSTALLMENT_ATTACHMENT',
        sourceId: inst.id
      });
    }

    if (inst.paymentProof) {
      allAttachments.push({
        att: inst.paymentProof,
        origin: 'COMPROVANTE PGTO',
        date: inst.dueDate,
        provider: inst.provider,
        sourceType: 'PAYMENT_PROOF',
        sourceId: inst.id
      });
    }
  });

  const filtered = allAttachments
    .filter(
      (a) =>
        a.provider.toLowerCase().includes(filter.toLowerCase()) ||
        a.att.name.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const base64ToBlob = (base64Data: string, contentType: string) => {
    const sliceSize = 512;
    const byteCharacters = atob(base64Data.split(',')[1]);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  };

  const downloadFile = (att: Attachment) => {
    try {
      const blob = base64ToBlob(att.data, att.type);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = att.name;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Erro ao baixar arquivo:', err);
    }
  };

  const removeAttachment = (file: FileRow) => {
    if (!isAdmin) return;
    if (!confirm(`Excluir arquivo ${file.att.name}?`)) return;

    if (file.sourceType === 'COST_ATTACHMENT') {
      const updatedCosts = (project.costs || []).map((cost) =>
        cost.id === file.sourceId ? { ...cost, attachments: (cost.attachments || []).filter((a) => a.id !== file.att.id) } : cost
      );
      onUpdate({ ...project, costs: updatedCosts });
      return;
    }

    const updatedInstallments = (project.installments || []).map((inst) => {
      if (inst.id !== file.sourceId) return inst;
      if (file.sourceType === 'INSTALLMENT_ATTACHMENT') return { ...inst, attachment: undefined };
      return { ...inst, paymentProof: undefined };
    });

    onUpdate({ ...project, installments: updatedInstallments });
  };

  const downloadAllAsZip = async () => {
    if (filtered.length === 0) return;
    setIsDownloadingAll(true);
    try {
      const zip = new JSZip();

      for (const item of filtered) {
        const base64Content = item.att.data.split(',')[1];
        zip.file(`${item.provider}_${item.att.name}`, base64Content, { base64: true });
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ARQUIVOS_OBRA_${project.name.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Erro ao gerar ZIP:', err);
      alert('Erro ao compactar arquivos. Tente baixar individualmente.');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 rounded-none">
      <div className="flex flex-col md:flex-row justify-between items-end bg-white p-8 rounded-none border border-slate-200 shadow-sm gap-4">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Central de Arquivos</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Dossiê digital completo com todos os comprovantes da obra.</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto rounded-none">
          <input
            className="flex-1 md:w-80 border border-slate-200 rounded-none px-6 py-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500 shadow-inner bg-slate-50"
            placeholder="Buscar por fornecedor ou arquivo..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            onClick={downloadAllAsZip}
            disabled={filtered.length === 0 || isDownloadingAll}
            className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-none font-black uppercase text-xs flex items-center gap-3 shadow-xl transition-all active:scale-95 disabled:opacity-30"
          >
            <i className={isDownloadingAll ? 'fas fa-spinner fa-spin' : 'fas fa-file-zipper text-lg'}></i>
            {isDownloadingAll ? 'Compactando...' : 'Download em Lote (ZIP)'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 rounded-none">
        {filtered.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-white rounded-none border-4 border-dashed border-slate-100">
            <i className="fas fa-folder-open text-slate-100 text-8xl mb-6"></i>
            <p className="text-slate-300 font-black uppercase tracking-[0.4em]">Nenhum arquivo encontrado no projeto</p>
          </div>
        ) : (
          filtered.map((item, idx) => (
            <div key={idx} className="bg-white rounded-none border border-slate-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden flex flex-col">
              <div className="p-6 flex-1 space-y-4 rounded-none">
                <div className="flex justify-between items-start rounded-none">
                  <div className={`w-14 h-14 rounded-none flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${item.att.type.startsWith('image/') ? 'bg-amber-50 text-amber-500' : 'bg-rose-50 text-rose-500'}`}>
                    <i className={item.att.type.startsWith('image/') ? 'fas fa-image text-2xl' : 'fas fa-file-pdf text-2xl'}></i>
                  </div>
                  <span className="bg-slate-50 text-slate-400 px-3 py-1 rounded-none text-[9px] font-black uppercase border border-slate-100">
                    {(item.att.size / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div className="rounded-none">
                  <h4 className="font-black text-slate-800 uppercase text-xs leading-tight mb-1 truncate" title={item.att.name}>
                    {item.att.name}
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.provider}</p>
                </div>

                <div className="pt-4 border-t border-slate-50 flex justify-between items-center rounded-none">
                  <div>
                    <span className="block text-[8px] font-black text-slate-300 uppercase">Origem</span>
                    <span className="text-[10px] font-black text-blue-600 uppercase">{item.origin}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] font-black text-slate-300 uppercase">Data Ref</span>
                    <span className="text-[10px] font-black text-slate-500 font-mono">{new Date(item.date).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>

              <div className={`grid ${isAdmin ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
                <button
                  onClick={() => setPreviewAttachment(item.att)}
                  className="w-full py-4 bg-blue-50 hover:bg-blue-600 hover:text-white transition-colors text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 rounded-none text-blue-600"
                >
                  <i className="fas fa-eye"></i> Visualizar
                </button>
                <button
                  onClick={() => downloadFile(item.att)}
                  className="w-full py-4 bg-slate-50 group-hover:bg-slate-900 group-hover:text-white transition-colors text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 rounded-none"
                >
                  <i className="fas fa-download"></i> Baixar
                </button>
                {isAdmin && (
                  <button
                    onClick={() => removeAttachment(item)}
                    className="w-full py-4 bg-rose-50 hover:bg-rose-600 hover:text-white transition-colors text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 rounded-none text-rose-600"
                  >
                    <i className="fas fa-trash-alt"></i> Excluir
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <AttachmentViewerModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} onDownload={downloadFile} />
    </div>
  );
};

