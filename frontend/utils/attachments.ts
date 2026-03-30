import { dbService } from '../apiClient';
import { Attachment } from '../types';

export const canPreviewAttachmentInline = (attachment: Attachment) =>
  attachment.type.startsWith('image/') ||
  attachment.type === 'application/pdf' ||
  attachment.name.toLowerCase().endsWith('.pdf');

export const resolveAttachmentForAccess = async (attachment: Attachment): Promise<Attachment> => {
  if (attachment.storageProvider !== 'S3' || !attachment.storageKey) return attachment;

  const result = await dbService.resolveAttachmentData(attachment);
  if (!result?.data) return attachment;
  return { ...attachment, data: result.data };
};

export const triggerAttachmentDownload = async (attachment: Attachment) => {
  const resolvedAttachment = await resolveAttachmentForAccess(attachment);
  if (!resolvedAttachment.data) {
    throw new Error('Arquivo indisponível para download.');
  }

  const link = document.createElement('a');
  link.href = resolvedAttachment.data;
  link.download = resolvedAttachment.originalName || resolvedAttachment.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
