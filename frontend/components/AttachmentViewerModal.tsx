import React from 'react';
import { Attachment } from '../types';

interface AttachmentViewerModalProps {
  attachment: Attachment | null;
  onClose: () => void;
  onDownload: (attachment: Attachment) => void;
}

export const AttachmentViewerModal: React.FC<AttachmentViewerModalProps> = ({ attachment, onClose, onDownload }) => {
  if (!attachment) return null;

  const isImage = attachment.type.startsWith('image/');
  const isPdf = attachment.type === 'application/pdf' || attachment.name.toLowerCase().endsWith('.pdf');

  return (
    <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center z-[140] p-6">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visualização de anexo</p>
            <h3 className="text-sm font-black text-slate-900 uppercase truncate">{attachment.originalName || attachment.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onDownload(attachment)} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase">
              <i className="fas fa-download mr-2"></i>Download
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2">
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 p-4">
          {isImage && (
            <img src={attachment.data} alt={attachment.originalName || attachment.name} className="max-w-full max-h-[75vh] mx-auto rounded-xl shadow-lg" />
          )}

          {isPdf && (
            <iframe src={attachment.data} title={attachment.originalName || attachment.name} className="w-full h-[75vh] bg-white rounded-xl border border-slate-200" />
          )}

          {!isImage && !isPdf && (
            <div className="h-[60vh] flex flex-col items-center justify-center text-center bg-white rounded-xl border border-slate-200">
              <i className="fas fa-file text-5xl text-slate-300 mb-4"></i>
              <p className="text-sm font-black text-slate-700 uppercase mb-2">Pré-visualização indisponível</p>
              <p className="text-xs font-bold text-slate-400 uppercase mb-6">Use o download para abrir este arquivo.</p>
              <button onClick={() => onDownload(attachment)} className="bg-slate-900 text-white px-5 py-3 rounded-lg text-[10px] font-black uppercase">
                <i className="fas fa-download mr-2"></i>Baixar arquivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
