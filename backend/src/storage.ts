import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectsCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AttachmentKind } from "@prisma/client";

const storageRegion = String(process.env.AWS_REGION || "").trim();
const storageBucket = String(process.env.AWS_S3_BUCKET || "").trim();
const storagePrefix = String(process.env.AWS_S3_PREFIX || "csc").trim().replace(/^\/+|\/+$/g, "");
const signedUrlExpiresIn = Number(process.env.AWS_S3_SIGNED_URL_TTL_SECONDS || 3600);

const s3Client = storageRegion && storageBucket
  ? new S3Client({ region: storageRegion })
  : null;

export const isS3Enabled = Boolean(s3Client && storageBucket);

type PersistableAttachmentPayload = {
  kind: AttachmentKind;
  name: string;
  originalName: string | null;
  data: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageKey?: string | null;
};

function isDataUrl(value: string) {
  return /^data:/i.test(value || "");
}

function sanitizeFileName(value: string) {
  const normalized = String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "arquivo";
}

function parseDataUrl(dataUrl: string) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid attachment payload");
  }

  const [, mimeType, base64] = match;
  return {
    mimeType,
    buffer: Buffer.from(base64, "base64"),
  };
}

function buildStorageKey(kind: AttachmentKind, fileName: string) {
  const safeName = sanitizeFileName(fileName);
  const kindPrefix = kind.toLowerCase();
  return `${storagePrefix}/${kindPrefix}/${randomUUID()}-${safeName}`;
}

export async function persistAttachment(payload: PersistableAttachmentPayload) {
  if (
    payload.storageProvider === "S3" &&
    payload.storageKey &&
    !isDataUrl(payload.data || "")
  ) {
    return {
      kind: payload.kind,
      name: payload.name,
      originalName: payload.originalName,
      data: null,
      storageProvider: "S3",
      storageBucket: payload.storageBucket || storageBucket,
      storageKey: payload.storageKey,
      mimeType: payload.mimeType,
      size: payload.size,
      uploadedAt: payload.uploadedAt,
    };
  }

  if (!isS3Enabled || !isDataUrl(payload.data || "")) {
    return {
      kind: payload.kind,
      name: payload.name,
      originalName: payload.originalName,
      data: payload.data || null,
      storageProvider: null,
      storageBucket: null,
      storageKey: null,
      mimeType: payload.mimeType,
      size: payload.size,
      uploadedAt: payload.uploadedAt,
    };
  }

  const { buffer, mimeType } = parseDataUrl(payload.data);
  const key = buildStorageKey(payload.kind, payload.originalName || payload.name);

  await s3Client!.send(new PutObjectCommand({
    Bucket: storageBucket,
    Key: key,
    Body: buffer,
    ContentType: payload.mimeType || mimeType || "application/octet-stream",
    ContentDisposition: `inline; filename="${sanitizeFileName(payload.originalName || payload.name)}"`,
  }));

  return {
    kind: payload.kind,
    name: payload.name,
    originalName: payload.originalName,
    data: null,
    storageProvider: "S3",
    storageBucket,
    storageKey: key,
    mimeType: payload.mimeType || mimeType || "application/octet-stream",
    size: payload.size || buffer.length,
    uploadedAt: payload.uploadedAt,
  };
}

export async function resolveAttachmentData(attachment: {
  data?: string | null;
  mimeType: string;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageKey?: string | null;
}) {
  if (attachment.data) {
    return attachment.data;
  }

  if (
    attachment.storageProvider === "S3" &&
    attachment.storageKey &&
    (attachment.storageBucket || storageBucket) &&
    s3Client
  ) {
    return getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: attachment.storageBucket || storageBucket,
        Key: attachment.storageKey,
        ResponseContentType: attachment.mimeType || "application/octet-stream",
      }),
      { expiresIn: Number.isFinite(signedUrlExpiresIn) ? signedUrlExpiresIn : 3600 }
    );
  }

  return "";
}

export async function deleteStoredAttachments(
  attachments: Array<{ storageProvider?: string | null; storageBucket?: string | null; storageKey?: string | null }>
) {
  if (!s3Client) return;

  const buckets = new Map<string, { Key: string }[]>();
  for (const attachment of attachments) {
    if (attachment.storageProvider !== "S3" || !attachment.storageKey) continue;
    const bucket = attachment.storageBucket || storageBucket;
    if (!bucket) continue;
    const entries = buckets.get(bucket) || [];
    entries.push({ Key: attachment.storageKey });
    buckets.set(bucket, entries);
  }

  for (const [bucket, keys] of buckets.entries()) {
    for (let index = 0; index < keys.length; index += 1000) {
      const chunk = keys.slice(index, index + 1000);
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk, Quiet: true },
      }));
    }
  }
}
