import express from "express";
import cors from "cors";
import "dotenv/config";
import { PrismaClient, UserRole, OrderStatus, InstallmentStatus, AttachmentKind } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { deleteStoredAttachments, persistAttachment, resolveAttachmentData } from "./storage.js";
import { extractBudgetData, extractCostData, extractInstallmentData, getGeminiErrorMessage } from "./gemini.js";

const prisma = new PrismaClient();
const app = express();
app.disable("x-powered-by");

const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-me";
const nodeEnv = process.env.NODE_ENV || "development";
const corsAllowedOrigins = String(
  process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const SYSTEM_USER_ID = "system";
const GLOBAL_ADMIN_ROLES: UserRole[] = [UserRole.SUPERADMIN];
const PROJECT_MANAGER_ROLES: UserRole[] = [UserRole.SUPERADMIN, UserRole.ADMIN];
const ORDER_TITLE_MAX_LENGTH = 190;

const bulkProjectsSchema = z.object({ projects: z.array(z.any()) });
const bulkUsersSchema = z.object({ users: z.array(z.any()) });
const projectPayloadSchema = z.object({ project: z.any() });
const userPayloadSchema = z.object({ user: z.any() });
const orderTypesSchema = z.object({ orderTypes: z.array(z.string()) });
const sectorStatusesSchema = z.object({ statuses: z.array(z.string()) });
const importOrdersSchema = z.object({ rows: z.array(z.any()) });
const sectorPayloadSchema = z.object({
  sector: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().trim().min(2),
  })
});
const updateOwnProfileSchema = z.object({
  name: z.string().trim().min(2),
  currentPassword: z.string().trim().min(1).optional(),
  newPassword: z.string().trim().min(6).optional(),
});
const geminiExtractionSchema = z.object({
  fileBase64: z.string().optional(),
  mimeType: z.string().optional(),
  extractedText: z.string().optional(),
});

type AuthUser = { id: string; role: UserRole };
type AuthRequest = express.Request & { authUser?: AuthUser };

const attachmentSummarySelect = {
  id: true,
  kind: true,
  name: true,
  originalName: true,
  storageProvider: true,
  storageBucket: true,
  storageKey: true,
  mimeType: true,
  size: true,
  uploadedAt: true,
} as const;

const projectInclude = {
  budget: true,
  costs: { include: { attachments: { select: attachmentSummarySelect } } },
  installments: { include: { attachments: { select: attachmentSummarySelect } } },
  orders: {
    include: {
      orderType: true,
      currentSector: true,
      sectorAccess: { include: { sector: true } },
      requester: true,
      responsible: true,
      attachments: { select: attachmentSummarySelect },
      messages: {
        include: {
          user: true,
          attachments: { select: attachmentSummarySelect },
        }
      }
    }
  }
} as const;

if (nodeEnv === "production" && jwtSecret === "dev-secret-change-me") {
  throw new Error("JWT_SECRET must be set in production.");
}

if (!Number.isFinite(port) || port <= 0) {
  throw new Error("PORT must be a valid positive number.");
}

if (nodeEnv === "production" && corsAllowedOrigins.length === 0) {
  throw new Error("CORS_ALLOWED_ORIGINS or FRONTEND_URL must be set in production.");
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (nodeEnv !== "production") return callback(null, true);
    if (corsAllowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "50mb" }));

function normalizeRole(role: unknown): UserRole {
  return Object.values(UserRole).includes(role as UserRole) ? (role as UserRole) : UserRole.MEMBRO;
}

function getRoleRank(role: UserRole) {
  switch (role) {
    case UserRole.SUPERADMIN:
      return 4;
    case UserRole.ADMIN:
      return 3;
    case UserRole.ADMIN_OBRA:
      return 2;
    default:
      return 1;
  }
}

function buildToken(user: AuthUser) {
  return jwt.sign(user, jwtSecret, { expiresIn: "8h" });
}

function decimalToNumber(value: any) {
  return value === null || value === undefined ? 0 : Number(value);
}

function truncateText(value: unknown, maxLength: number) {
  const normalized = String(value || "").trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function parseImportedMoney(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source) return { value: 0, valid: false };

  const normalized = source.replace(/\s/g, "").replace(/[Rr]\$/g, "");
  if (normalized === "-" || normalized === "--") {
    return { value: 0, valid: true };
  }
  const commaCount = (normalized.match(/,/g) || []).length;
  const dotCount = (normalized.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      const parsed = Number(normalized.replace(/\./g, "").replace(",", "."));
      return { value: Number.isFinite(parsed) ? parsed : 0, valid: Number.isFinite(parsed) };
    }
    const parsed = Number(normalized.replace(/,/g, ""));
    return { value: Number.isFinite(parsed) ? parsed : 0, valid: Number.isFinite(parsed) };
  }

  if (commaCount > 0) {
    const parts = normalized.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      const parsed = Number(`${parts[0].replace(/\./g, "")}.${parts[1]}`);
      return { value: Number.isFinite(parsed) ? parsed : 0, valid: Number.isFinite(parsed) };
    }
    const parsed = Number(normalized.replace(/,/g, ""));
    return { value: Number.isFinite(parsed) ? parsed : 0, valid: Number.isFinite(parsed) };
  }

  if (dotCount > 0) {
    const parts = normalized.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      const parsed = Number(normalized);
      return { value: Number.isFinite(parsed) ? parsed : 0, valid: Number.isFinite(parsed) };
    }
    const parsed = Number(normalized.replace(/\./g, ""));
    return { value: Number.isFinite(parsed) ? parsed : 0, valid: Number.isFinite(parsed) };
  }

  const parsed = Number(normalized);
  return { value: Number.isFinite(parsed) ? parsed : 0, valid: Number.isFinite(parsed) };
}

function parseDateOnly(value: unknown) {
  const source = String(value || "").trim();
  const brMatch = source.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(`${year}-${month}-${day}T12:00:00`);
  }
  const candidate = source ? `${source}T12:00:00` : new Date().toISOString();
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseDateTime(value: unknown) {
  const source = String(value || "").trim();
  const brMatch = source.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brMatch) {
    const [, day, month, year, hours = "12", minutes = "00", seconds = "00"] = brMatch;
    return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
  }
  const parsed = new Date(source || new Date().toISOString());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toOptionalText(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeDateOnlyInput(value: unknown) {
  return formatDateOnly(parseDateOnly(value));
}

function normalizeSectorAccessIds(values: unknown[]) {
  return Array.from(new Set((values || []).map((value: any) => Number(value)).filter(Boolean))).sort((a, b) => a - b);
}

function attachmentSignatureFromPayload(payload: any) {
  return [
    String(payload?.storageProvider || ""),
    String(payload?.storageBucket || ""),
    String(payload?.storageKey || ""),
    String(payload?.name || ""),
    String(payload?.originalName || ""),
    String(payload?.type || payload?.mimeType || ""),
    Number(payload?.size || 0),
    payload?.uploadDate ? parseDateTime(payload.uploadDate).toISOString() : "",
    payload?.storageKey ? "" : String(payload?.data || "").length,
  ].join("|");
}

function attachmentSignatureFromStored(attachment: any) {
  return [
    String(attachment?.storageProvider || ""),
    String(attachment?.storageBucket || ""),
    String(attachment?.storageKey || ""),
    String(attachment?.name || ""),
    String(attachment?.originalName || ""),
    String(attachment?.mimeType || ""),
    Number(attachment?.size || 0),
    attachment?.uploadedAt ? new Date(attachment.uploadedAt).toISOString() : "",
    attachment?.storageKey ? "" : String(attachment?.data || "").length,
  ].join("|");
}

function attachmentListsMatch(payloads: any[], stored: any[]) {
  if ((payloads || []).length !== (stored || []).length) return false;
  const payloadSignatures = (payloads || []).map(attachmentSignatureFromPayload).sort();
  const storedSignatures = (stored || []).map(attachmentSignatureFromStored).sort();
  return payloadSignatures.every((signature, index) => signature === storedSignatures[index]);
}

function normalizeProjectCode(value: unknown) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

function normalizeLegacyStatus(value: unknown): OrderStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PAGA" || normalized === "PAGO" || normalized === "CONCLUIDO" || normalized === "CONCLUÍDO") {
    return OrderStatus.CONCLUIDO;
  }
  if (normalized === "CANCELADO" || normalized === "CANCELADA") {
    return OrderStatus.CANCELADO;
  }
  if (normalized === "EM ANALISE" || normalized === "EM_ANALISE") {
    return OrderStatus.EM_ANALISE;
  }
  if (normalized === "AGUARDANDO INFORMACAO" || normalized === "AGUARDANDO_INFORMACAO") {
    return OrderStatus.AGUARDANDO_INFORMACAO;
  }
  return OrderStatus.PENDENTE;
}

async function allocateOrderNumber(tx: any, projectId: number) {
  await tx.$executeRaw`UPDATE obras SET ultimo_numero_pedido = LAST_INSERT_ID(ultimo_numero_pedido + 1) WHERE id = ${projectId}`;
  const rows = await tx.$queryRaw<any[]>`SELECT LAST_INSERT_ID() AS value`;
  return Number(rows?.[0]?.value || 0);
}

async function toAttachment(payload: any, kind: AttachmentKind) {
  return persistAttachment({
    kind,
    name: String(payload.name || "arquivo"),
    originalName: payload.originalName ? String(payload.originalName) : null,
    data: String(payload.data || ""),
    mimeType: String(payload.type || payload.mimeType || "application/octet-stream"),
    size: Number(payload.size || 0),
    uploadedAt: parseDateTime(payload.uploadDate || payload.uploadedAt),
    storageProvider: payload.storageProvider ? String(payload.storageProvider) : null,
    storageBucket: payload.storageBucket ? String(payload.storageBucket) : null,
    storageKey: payload.storageKey ? String(payload.storageKey) : null,
  });
}

async function toAttachments(payloads: any[] | undefined, kind: AttachmentKind) {
  return Promise.all((payloads || []).map((payload: any) => toAttachment(payload, kind)));
}

function sanitizeUser(user: any) {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    managerId: user.managerId ? String(user.managerId) : undefined,
    sectorId: user.sectorId ? String(user.sectorId) : undefined,
    sectorName: user.sector?.name || undefined,
    assignedProjectIds: (user.assignedProjects || []).map((item: any) => String(item.projectId))
  };
}

function sanitizeSector(sector: any) {
  return {
    id: String(sector.id),
    name: sector.name,
    statuses: (sector.statuses || [])
      .filter((item: any) => item.isActive !== false)
      .sort((a: any, b: any) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map((item: any) => item.name),
  };
}

function isObraSectorName(name?: string | null) {
  return String(name || "").trim().toUpperCase() === "OBRA";
}

function shouldUseAssignedProjectScope(user?: { role: UserRole; sector?: { name?: string | null } | null }) {
  if (!user) return true;
  if (GLOBAL_ADMIN_ROLES.includes(user.role)) return false;
  return !user.sector || isObraSectorName(user.sector.name);
}

async function mapAttachment(attachment: any) {
  return {
    id: String(attachment.id),
    name: attachment.name,
    originalName: attachment.originalName || undefined,
    data: await resolveAttachmentData(attachment),
    type: attachment.mimeType,
    size: attachment.size,
    uploadDate: attachment.uploadedAt.toISOString(),
    storageProvider: attachment.storageProvider || undefined,
    storageBucket: attachment.storageBucket || undefined,
    storageKey: attachment.storageKey || undefined,
  };
}

function collectOrderAttachmentRefs(order: any) {
  return [
    ...(order.attachments || []),
    ...((order.messages || []).flatMap((message: any) => message.attachments || [])),
  ];
}

function collectProjectAttachmentRefs(project: any) {
  return [
    ...((project.costs || []).flatMap((cost: any) => cost.attachments || [])),
    ...((project.installments || []).flatMap((installment: any) => installment.attachments || [])),
    ...((project.orders || []).flatMap((order: any) => collectOrderAttachmentRefs(order))),
  ];
}

async function mapOrderFromDb(order: any, projectName: string) {
  return {
    id: String(order.id),
    orderCode: order.orderCode,
    externalCode: order.externalCode || undefined,
    projectId: String(order.projectId),
    projectName,
    title: order.title,
    type: order.orderType?.name || "",
    description: order.description,
    macroItemId: order.macroItemId ? String(order.macroItemId) : undefined,
    currentSectorId: order.currentSectorId ? String(order.currentSectorId) : undefined,
    currentSectorName: order.currentSector?.name || undefined,
    accessibleSectorIds: Array.from(new Set((order.sectorAccess || []).map((item: any) => String(item.sectorId)))),
    expectedDate: formatDateOnly(order.expectedDate),
    status: order.status,
    sectorStatus: order.sectorStatus || undefined,
    requesterId: String(order.requesterUserId),
    requesterName: order.requester?.name || "",
    responsibleId: order.assignedUserId ? String(order.assignedUserId) : undefined,
    responsibleName: order.responsible?.name || undefined,
    attachments: await Promise.all((order.attachments || []).filter((item: any) => item.kind === AttachmentKind.REQUEST).map(mapAttachment)),
    completionAttachment: (order.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION)
      ? await mapAttachment((order.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION))
      : undefined,
    completionNote: order.completionNote || undefined,
    cancellationReason: order.cancellationReason || undefined,
    messages: await Promise.all((order.messages || []).map(async (message: any) => ({
      id: String(message.id),
      userId: message.userId ? String(message.userId) : SYSTEM_USER_ID,
      userName: message.isSystem ? "SISTEMA" : (message.user?.name || "SISTEMA"),
      text: message.body,
      date: message.createdAt.toISOString(),
      attachments: await Promise.all((message.attachments || []).map(mapAttachment))
    }))),
    createdAt: order.createdAt.toISOString(),
    value: order.requestedValue ? decimalToNumber(order.requestedValue) : undefined,
  };
}

function canUserAccessOrder(order: any, userId: number, role: UserRole, sectorId?: number | null) {
  if (GLOBAL_ADMIN_ROLES.includes(role)) return true;
  if (role === UserRole.ADMIN || role === UserRole.ADMIN_OBRA) return true;
  if (order.requesterUserId === userId || order.assignedUserId === userId) return true;

  const accessibleSectorIds = Array.from(new Set((order.sectorAccess || []).map((item: any) => item.sectorId)));
  if (!order.currentSectorId && accessibleSectorIds.length === 0) return true;

  if (!sectorId) return false;
  return accessibleSectorIds.includes(sectorId) || order.currentSectorId === sectorId;
}

async function mapProjectFromDb(project: any, authUser?: any) {
  const scopedOrders = authUser
    ? (project.orders || []).filter((order: any) => canUserAccessOrder(order, authUser.id, authUser.role, authUser.sectorId))
    : (project.orders || []);

  return {
    id: String(project.id),
    code: project.code,
    name: project.name,
    location: project.location,
    startDate: formatDateOnly(project.startDate),
    notes: project.notes || "",
    budget: (project.budget || []).map((item: any) => ({
      id: String(item.id),
      description: item.description,
      budgetedValue: decimalToNumber(item.budgetedValue),
    })),
    costs: await Promise.all((project.costs || []).map(async (cost: any) => ({
      id: String(cost.id),
      macroItemId: String(cost.macroItemId),
      description: cost.description,
      itemDetail: cost.itemDetail || undefined,
      unit: cost.unit,
      quantity: decimalToNumber(cost.quantity),
      unitValue: decimalToNumber(cost.unitValue),
      totalValue: decimalToNumber(cost.totalValue),
      date: formatDateOnly(cost.occurredAt),
      entryDate: formatDateOnly(cost.recordedAt),
      attachments: await Promise.all((cost.attachments || []).map(mapAttachment)),
    }))),
    installments: await Promise.all((project.installments || []).map(async (installment: any) => {
      const attachment = (installment.attachments || []).find((item: any) => item.kind === AttachmentKind.ATTACHMENT);
      const paymentProof = (installment.attachments || []).find((item: any) => item.kind === AttachmentKind.PAYMENT_PROOF);
      return {
        id: String(installment.id),
        provider: installment.provider,
        description: installment.description,
        totalValue: decimalToNumber(installment.totalValue),
        installmentNumber: installment.installmentNumber,
        totalInstallments: installment.totalInstallments,
        dueDate: formatDateOnly(installment.dueDate),
        value: decimalToNumber(installment.value),
        digitalLine: installment.digitalLine || undefined,
        status: installment.status,
        attachment: attachment ? await mapAttachment(attachment) : undefined,
        paymentProof: paymentProof ? await mapAttachment(paymentProof) : undefined,
        macroItemId: String(installment.macroItemId),
      };
    })),
    orders: await Promise.all(scopedOrders.map((order: any) => mapOrderFromDb(order, project.name)))
  };
}

function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    req.authUser = jwt.verify(token, jwtSecret) as AuthUser;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(roles: UserRole[]) {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

async function getUserProjectScope(userId: number) {
  const rows = await prisma.userProject.findMany({ where: { userId }, select: { projectId: true } });
  return rows.map((row) => row.projectId);
}

async function canAccessProject(user: AuthUser | undefined, projectId: number) {
  if (!user || !Number.isFinite(projectId)) return false;
  if (GLOBAL_ADMIN_ROLES.includes(user.role)) return true;
  const scopedUser = await getScopedAuthUser(Number(user.id));
  if (!scopedUser || !scopedUser.isActive) return false;
  if (!shouldUseAssignedProjectScope(scopedUser)) return true;
  const projectIds = await getUserProjectScope(Number(user.id));
  return projectIds.includes(projectId);
}

async function getScopedAuthUser(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { assignedProjects: true, sector: true },
  });
}

async function resolveOrderTypesByName(tx: any) {
  const orderTypes = await tx.orderType.findMany({ where: { isActive: true } });
  return new Map<string, any>(orderTypes.map((type: any) => [type.name.toUpperCase(), type]));
}

async function ensureOrderType(tx: any, name: string) {
  const normalizedName = String(name || "").trim().toUpperCase();
  if (!normalizedName) return null;
  const existing = await tx.orderType.findFirst({ where: { name: normalizedName } });
  if (existing) return existing;
  const last = await tx.orderType.findFirst({ orderBy: { sortOrder: "desc" } });
  return tx.orderType.create({
    data: {
      name: normalizedName,
      sortOrder: (last?.sortOrder || 0) + 1,
      isActive: true,
    }
  });
}

async function upsertProjectGraph(tx: any, projectPayload: any, existingProjectId?: number | null) {
  const existingProject = existingProjectId
    ? await tx.project.findUnique({ where: { id: existingProjectId }, include: projectInclude })
    : null;
  const baseData = {
    code: normalizeProjectCode(projectPayload.code || projectPayload.name),
    name: String(projectPayload.name || "").trim(),
    location: String(projectPayload.location || "").trim(),
    startDate: parseDateOnly(projectPayload.startDate),
    notes: toOptionalText(projectPayload.notes),
  };

  const project = existingProjectId
    ? await tx.project.update({ where: { id: existingProjectId }, data: baseData })
    : await tx.project.create({ data: baseData });

  if (existingProject) {
    await deleteStoredAttachments(collectProjectAttachmentRefs(existingProject));
  }

  await tx.order.deleteMany({ where: { projectId: project.id } });
  await tx.installment.deleteMany({ where: { projectId: project.id } });
  await tx.cost.deleteMany({ where: { projectId: project.id } });
  await tx.macroItem.deleteMany({ where: { projectId: project.id } });

  const macroMap = new Map<string, any>();
  for (const item of projectPayload.budget || []) {
    const created = await tx.macroItem.create({
      data: {
        projectId: project.id,
        description: String(item.description || "").trim(),
        budgetedValue: Number(item.budgetedValue || 0),
      }
    });
    macroMap.set(String(item.id || created.id), created);
    macroMap.set(String(created.id), created);
  }

  for (const installment of projectPayload.installments || []) {
    const macro = macroMap.get(String(installment.macroItemId || ""));
    if (!macro) continue;

    await tx.installment.create({
      data: {
        projectId: project.id,
        macroItemId: macro.id,
        provider: String(installment.provider || "").trim(),
        description: String(installment.description || "").trim(),
        totalValue: Number(installment.totalValue || 0),
        installmentNumber: Number(installment.installmentNumber || 1),
        totalInstallments: Number(installment.totalInstallments || 1),
        dueDate: parseDateOnly(installment.dueDate),
        value: Number(installment.value || 0),
        digitalLine: toOptionalText(installment.digitalLine),
        status: installment.status === InstallmentStatus.PAID ? InstallmentStatus.PAID : InstallmentStatus.PENDING,
        attachments: {
          create: [
            ...(installment.attachment ? [await toAttachment(installment.attachment, AttachmentKind.ATTACHMENT)] : []),
            ...(installment.paymentProof ? [await toAttachment(installment.paymentProof, AttachmentKind.PAYMENT_PROOF)] : [])
          ]
        }
      }
    });
  }

  const userIds = Array.from(new Set(
    (projectPayload.orders || []).flatMap((order: any) => [
      order.requesterId,
      order.responsibleId,
      ...((order.messages || []).map((message: any) => message.userId))
    ]).filter((value: any) => value && value !== SYSTEM_USER_ID).map((value: any) => Number(value))
  ));
  const users = userIds.length > 0 ? await tx.user.findMany({ where: { id: { in: userIds } } }) : [];
  const userMap = new Map<number, any>(users.map((user: any) => [user.id, user]));
  const orderTypeMap = await resolveOrderTypesByName(tx);
  const sectorIds = Array.from(new Set(
    (projectPayload.orders || []).flatMap((order: any) => [
      order.currentSectorId,
      ...((order.accessibleSectorIds || [])),
    ]).filter((value: any) => value != null && value !== '').map((value: any) => Number(value))
  ));
  const sectors = sectorIds.length > 0 ? await tx.sector.findMany({ where: { id: { in: sectorIds }, isActive: true }, include: { statuses: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } }) : [];
  const sectorMap = new Map<number, any>(sectors.map((sector: any) => [sector.id, sector]));

  for (const order of projectPayload.orders || []) {
    const macro = order.macroItemId ? macroMap.get(String(order.macroItemId || "")) : null;
    const requester = userMap.get(Number(order.requesterId));
    const responsible = order.responsibleId ? userMap.get(Number(order.responsibleId)) : null;
    let orderType = orderTypeMap.get(String(order.type || "").toUpperCase()) || [...orderTypeMap.values()][0];
    if (!orderType && order.type) {
      orderType = await ensureOrderType(tx, order.type);
      if (orderType) orderTypeMap.set(orderType.name.toUpperCase(), orderType);
    }
    if (!requester || !orderType) continue;

    const orderCode = String(order.orderCode || "").trim() || `${project.code}-${await allocateOrderNumber(tx, project.id)}`;
    const currentSectorId = order.currentSectorId ? Number(order.currentSectorId) : null;
    const normalizedSectorStatus = String(order.sectorStatus || "").trim().toUpperCase() || null;
    const accessibleSectorIds = Array.from(new Set([
      ...(order.accessibleSectorIds || []).map((value: any) => Number(value)),
      ...(currentSectorId ? [currentSectorId] : []),
    ])).filter((value) => sectorMap.has(value));

    await tx.order.create({
      data: {
        projectId: project.id,
        orderTypeId: orderType.id,
        macroItemId: macro?.id || null,
        requesterUserId: requester.id,
        assignedUserId: responsible?.id || null,
        currentSectorId: currentSectorId && sectorMap.has(currentSectorId) ? currentSectorId : null,
        orderCode,
        externalCode: toOptionalText(order.externalCode),
        title: String(order.title || "").trim(),
        description: String(order.description || "").trim(),
        expectedDate: parseDateOnly(order.expectedDate),
        status: Object.values(OrderStatus).includes(order.status) ? order.status : OrderStatus.PENDENTE,
        sectorStatus: normalizedSectorStatus,
        completionNote: toOptionalText(order.completionNote),
        cancellationReason: toOptionalText(order.cancellationReason),
        requestedValue: order.value ?? null,
        createdAt: parseDateTime(order.createdAt),
        attachments: {
          create: [
            ...(await toAttachments(order.attachments, AttachmentKind.REQUEST)),
            ...(order.completionAttachment ? [await toAttachment(order.completionAttachment, AttachmentKind.COMPLETION)] : [])
          ]
        },
        sectorAccess: {
          create: accessibleSectorIds.map((sectorId) => ({
            sectorId,
            grantedAt: new Date(),
          }))
        },
        messages: {
          create: await Promise.all((order.messages || []).map(async (message: any) => {
            const messageUserId = message.userId && message.userId !== SYSTEM_USER_ID ? Number(message.userId) : null;
            return {
              userId: messageUserId || null,
              body: String(message.text || "").trim(),
              isSystem: !messageUserId,
              createdAt: parseDateTime(message.date),
              attachments: {
                create: await toAttachments(message.attachments, AttachmentKind.MESSAGE)
              }
            };
          }))
        }
      }
    });
  }

  for (const cost of projectPayload.costs || []) {
    const macro = macroMap.get(String(cost.macroItemId || ""));
    if (!macro) continue;

    await tx.cost.create({
      data: {
        projectId: project.id,
        macroItemId: macro.id,
        description: String(cost.description || "").trim(),
        itemDetail: toOptionalText(cost.itemDetail),
        unit: String(cost.unit || "un"),
        quantity: Number(cost.quantity || 0),
        unitValue: Number(cost.unitValue || 0),
        totalValue: Number(cost.totalValue || 0),
        occurredAt: parseDateOnly(cost.date),
        recordedAt: parseDateOnly(cost.entryDate),
        attachments: {
          create: await toAttachments(cost.attachments, AttachmentKind.COST_DOCUMENT)
        }
      }
    });
  }

  return tx.project.findUnique({ where: { id: project.id }, include: projectInclude });
}

async function upsertScopedOrder(tx: any, projectId: number, orderPayload: any, authUser: AuthUser) {
  const project = await tx.project.findUnique({ where: { id: projectId }, include: { budget: true } });
  if (!project) {
    const error = new Error("Project not found") as Error & { status?: number };
    error.status = 404;
    throw error;
  }

  const existingOrderId = Number(orderPayload?.id);
  const existingOrder = Number.isFinite(existingOrderId)
    ? await tx.order.findFirst({
        where: { id: existingOrderId, projectId },
        include: {
          orderType: true,
          attachments: true,
          messages: { include: { attachments: true } },
          currentSector: true,
          sectorAccess: true,
        }
      })
    : null;

  const macro = orderPayload.macroItemId ? project.budget.find((item: any) => String(item.id) === String(orderPayload.macroItemId)) : null;
  const orderTypeMap = await resolveOrderTypesByName(tx);
  let orderType = orderTypeMap.get(String(orderPayload.type || '').toUpperCase()) || [...orderTypeMap.values()][0];
  if (!orderType && orderPayload.type) {
    orderType = await ensureOrderType(tx, orderPayload.type);
  }
  const requesterId = existingOrder?.requesterUserId || Number(orderPayload.requesterId || authUser.id);
  const requester = await tx.user.findUnique({ where: { id: requesterId } });
  const actorUser = await tx.user.findUnique({ where: { id: Number(authUser.id) }, include: { sector: true } });
  const requestedSectorId = orderPayload.currentSectorId ? Number(orderPayload.currentSectorId) : null;
  const sectorIds = Array.from(new Set([
    ...((orderPayload.accessibleSectorIds || []).map((value: any) => Number(value)).filter(Boolean)),
    ...(existingOrder?.sectorAccess || []).map((item: any) => item.sectorId),
    ...(existingOrder?.currentSectorId ? [existingOrder.currentSectorId] : []),
    ...(requestedSectorId ? [requestedSectorId] : []),
  ]));
  const validSectors = sectorIds.length > 0
    ? await tx.sector.findMany({ where: { id: { in: sectorIds }, isActive: true }, include: { statuses: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } })
    : [];

  if ((orderPayload.macroItemId && !macro) || !orderType || !requester) {
    const error = new Error("Invalid order payload") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  if (requestedSectorId && !validSectors.some((sector: any) => sector.id === requestedSectorId)) {
    const error = new Error("Invalid sector assignment") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const requestAttachmentsPayload = Array.isArray(orderPayload.attachments) && orderPayload.attachments.length > 0
    ? orderPayload.attachments
    : (existingOrder?.attachments || []).filter((item: any) => item.kind === AttachmentKind.REQUEST).map((item: any) => ({
        name: item.name,
        originalName: item.originalName,
        data: item.data || "",
        type: item.mimeType,
        mimeType: item.mimeType,
        size: item.size,
        uploadDate: item.uploadedAt,
        storageProvider: item.storageProvider,
        storageBucket: item.storageBucket,
        storageKey: item.storageKey,
      }));
  const completionAttachmentPayload = orderPayload.completionAttachment
    ? orderPayload.completionAttachment
    : ((existingOrder?.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION)
      ? {
          name: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).name,
          originalName: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).originalName,
          data: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).data || "",
          type: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).mimeType,
          mimeType: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).mimeType,
          size: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).size,
          uploadDate: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).uploadedAt,
          storageProvider: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).storageProvider,
          storageBucket: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).storageBucket,
          storageKey: (existingOrder.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION).storageKey,
        }
      : null);
  const preservedStorageRefs = new Set(
    [
      ...requestAttachmentsPayload,
      ...(completionAttachmentPayload ? [completionAttachmentPayload] : []),
      ...((orderPayload.messages || []).flatMap((message: any) => message.attachments || [])),
    ]
      .filter((attachment: any) => attachment?.storageProvider === "S3" && attachment?.storageKey)
      .map((attachment: any) => `${attachment.storageBucket || ""}:${attachment.storageKey}`)
  );

  const normalizedStatus = Object.values(OrderStatus).includes(orderPayload.status) ? orderPayload.status : OrderStatus.PENDENTE;
  const normalizedSectorStatus = String(orderPayload.sectorStatus || "").trim().toUpperCase() || null;
  const normalizedTitle = String(orderPayload.title || '').trim();
  const normalizedDescription = String(orderPayload.description || '').trim();
  const normalizedType = String(orderPayload.type || '').trim().toUpperCase();
  const normalizedExpectedDate = normalizeDateOnlyInput(orderPayload.expectedDate);
  const normalizedExternalCode = toOptionalText(orderPayload.externalCode);
  const normalizedCompletionNote = toOptionalText(orderPayload.completionNote);
  const normalizedCancellationReason = toOptionalText(orderPayload.cancellationReason);
  const normalizedValue = orderPayload.value ?? null;
  const requestAttachmentEntities = (existingOrder?.attachments || []).filter((item: any) => item.kind === AttachmentKind.REQUEST);
  const completionAttachmentEntity = (existingOrder?.attachments || []).find((item: any) => item.kind === AttachmentKind.COMPLETION) || null;
  const statusSectorId = requestedSectorId || existingOrder?.currentSectorId || null;
  const statusSector = statusSectorId ? validSectors.find((sector: any) => sector.id === statusSectorId) : null;
  const canActorEditSectorStatus = !!actorUser && (
    authUser.role === UserRole.SUPERADMIN ||
    authUser.role === UserRole.ADMIN ||
    (actorUser.sectorId != null && actorUser.sectorId === statusSectorId)
  );

  if (normalizedSectorStatus && statusSector && !(statusSector.statuses || []).some((item: any) => item.name === normalizedSectorStatus)) {
    const error = new Error("Invalid sector status") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  if (authUser.role === UserRole.MEMBRO) {
    const requesterId = Number(orderPayload?.requesterId || authUser.id);
    if (!existingOrder && requesterId !== Number(authUser.id)) {
      const error = new Error("Forbidden") as Error & { status?: number };
      error.status = 403;
      throw error;
    }
  }

  if (existingOrder) {
    const existingRequestAttachmentEntities = requestAttachmentEntities;
    const existingAccessibleSectorIds = normalizeSectorAccessIds((existingOrder.sectorAccess || []).map((item: any) => item.sectorId));
    const requestedAccessibleSectorIds = normalizeSectorAccessIds(sectorIds);
    const messagesOnlyAllowed =
      normalizedTitle === existingOrder.title &&
      normalizedDescription === existingOrder.description &&
      normalizedType === String(existingOrder.orderType?.name || '').trim().toUpperCase() &&
      normalizedExpectedDate === formatDateOnly(existingOrder.expectedDate) &&
      normalizedStatus === existingOrder.status &&
      normalizedExternalCode === (existingOrder.externalCode || null) &&
      Number(normalizedValue ?? 0) === Number(existingOrder.requestedValue ?? 0) &&
      (macro?.id || null) === (existingOrder.macroItemId || null) &&
      (requestedSectorId || null) === (existingOrder.currentSectorId || null) &&
      requestedAccessibleSectorIds.length === existingAccessibleSectorIds.length &&
      requestedAccessibleSectorIds.every((value, index) => value === existingAccessibleSectorIds[index]) &&
      normalizedCompletionNote === (existingOrder.completionNote || null) &&
      normalizedCancellationReason === (existingOrder.cancellationReason || null) &&
      normalizedSectorStatus === (existingOrder.sectorStatus || null) &&
      attachmentListsMatch(requestAttachmentsPayload, existingRequestAttachmentEntities) &&
      ((!completionAttachmentPayload && !completionAttachmentEntity) || (!!completionAttachmentPayload && !!completionAttachmentEntity && attachmentSignatureFromPayload(completionAttachmentPayload) === attachmentSignatureFromStored(completionAttachmentEntity)));

    const sectorStatusOnlyAllowed = canActorEditSectorStatus &&
      normalizedTitle === existingOrder.title &&
      normalizedDescription === existingOrder.description &&
      normalizedType === String(existingOrder.orderType?.name || '').trim().toUpperCase() &&
      normalizedExpectedDate === formatDateOnly(existingOrder.expectedDate) &&
      normalizedStatus === existingOrder.status &&
      normalizedExternalCode === (existingOrder.externalCode || null) &&
      Number(normalizedValue ?? 0) === Number(existingOrder.requestedValue ?? 0) &&
      (macro?.id || null) === (existingOrder.macroItemId || null) &&
      (requestedSectorId || null) === (existingOrder.currentSectorId || null) &&
      requestedAccessibleSectorIds.length === existingAccessibleSectorIds.length &&
      requestedAccessibleSectorIds.every((value, index) => value === existingAccessibleSectorIds[index]) &&
      normalizedCompletionNote === (existingOrder.completionNote || null) &&
      normalizedCancellationReason === (existingOrder.cancellationReason || null) &&
      attachmentListsMatch(requestAttachmentsPayload, existingRequestAttachmentEntities) &&
      ((!completionAttachmentPayload && !completionAttachmentEntity) || (!!completionAttachmentPayload && !!completionAttachmentEntity && attachmentSignatureFromPayload(completionAttachmentPayload) === attachmentSignatureFromStored(completionAttachmentEntity)));

    if (authUser.role === UserRole.MEMBRO && !messagesOnlyAllowed && !sectorStatusOnlyAllowed) {
      const error = new Error("Forbidden") as Error & { status?: number };
      error.status = 403;
      throw error;
    }

    const financialFieldsChanged =
      Number(normalizedValue ?? 0) !== Number(existingOrder.requestedValue ?? 0) ||
      (macro?.id || null) !== (existingOrder.macroItemId || null);

    if (authUser.role === UserRole.ADMIN_OBRA) {
      const structuralFieldsChanged =
        normalizedTitle !== existingOrder.title ||
        normalizedDescription !== existingOrder.description ||
        normalizedType !== String(existingOrder.orderType?.name || '').trim().toUpperCase() ||
        normalizedExpectedDate !== formatDateOnly(existingOrder.expectedDate) ||
        normalizedExternalCode !== (existingOrder.externalCode || null) ||
        !attachmentListsMatch(requestAttachmentsPayload, existingRequestAttachmentEntities);

      const sectorStatusChanged = normalizedSectorStatus !== (existingOrder.sectorStatus || null);
      if (financialFieldsChanged || structuralFieldsChanged || (sectorStatusChanged && !canActorEditSectorStatus)) {
        const error = new Error("Forbidden") as Error & { status?: number };
        error.status = 403;
        throw error;
      }
    }
  }

  if (existingOrder) {
    await deleteStoredAttachments(
      collectOrderAttachmentRefs(existingOrder).filter((attachment: any) => !preservedStorageRefs.has(`${attachment.storageBucket || ""}:${attachment.storageKey || ""}`))
    );
    await tx.order.delete({ where: { id: existingOrder.id } });
  }

  const responsibleId = orderPayload.responsibleId ? Number(orderPayload.responsibleId) : null;
  const created = await tx.order.create({
    data: {
      projectId,
      orderTypeId: orderType.id,
      macroItemId: macro?.id || null,
      currentSectorId: requestedSectorId || null,
      requesterUserId: requester.id,
      assignedUserId: responsibleId || null,
      orderCode: existingOrder?.orderCode || `${project.code}-${await allocateOrderNumber(tx, projectId)}`,
      externalCode: toOptionalText(orderPayload.externalCode),
      title: String(orderPayload.title || '').trim(),
      description: String(orderPayload.description || '').trim(),
      expectedDate: parseDateOnly(orderPayload.expectedDate),
      status: Object.values(OrderStatus).includes(orderPayload.status) ? orderPayload.status : OrderStatus.PENDENTE,
      sectorStatus: normalizedSectorStatus,
      completionNote: toOptionalText(orderPayload.completionNote),
      cancellationReason: toOptionalText(orderPayload.cancellationReason),
      requestedValue: orderPayload.value ?? null,
      createdAt: parseDateTime(orderPayload.createdAt),
      attachments: {
        create: [
          ...(await toAttachments(requestAttachmentsPayload, AttachmentKind.REQUEST)),
          ...(completionAttachmentPayload ? [await toAttachment(completionAttachmentPayload, AttachmentKind.COMPLETION)] : [])
        ]
      },
      sectorAccess: {
        create: validSectors.map((sector: any) => ({
          sectorId: sector.id,
        }))
      },
      messages: {
        create: await Promise.all((orderPayload.messages || []).map(async (message: any) => {
          const messageUserId = message.userId && message.userId !== SYSTEM_USER_ID ? Number(message.userId) : null;
          return {
            userId: messageUserId || null,
            body: String(message.text || '').trim(),
            isSystem: !messageUserId,
            createdAt: parseDateTime(message.date),
            attachments: {
              create: await toAttachments(message.attachments, AttachmentKind.MESSAGE)
            }
          };
        }))
      }
    },
    include: {
      orderType: true,
      currentSector: true,
      sectorAccess: { include: { sector: true } },
      requester: true,
      responsible: true,
      attachments: true,
      messages: { include: { user: true, attachments: true } }
    }
  });

  return mapOrderFromDb(created, project.name);
}

async function upsertUserRecord(tx: any, userId: number | null, userPayload: any, actorRole: UserRole | undefined) {
  const existingUser = userId ? await tx.user.findUnique({ where: { id: userId } }) : null;
  const requestedRole = normalizeRole(userPayload.role);
  const managerId = userPayload.managerId ? Number(userPayload.managerId) : null;
  const sectorId = userPayload.sectorId ? Number(userPayload.sectorId) : null;

  if ((requestedRole === UserRole.SUPERADMIN || existingUser?.role === UserRole.SUPERADMIN) && actorRole !== UserRole.SUPERADMIN) {
    const error = new Error("Only SUPERADMIN can manage SUPERADMIN users") as Error & { status?: number };
    error.status = 403;
    throw error;
  }

  const email = String(userPayload.email || "").trim().toLowerCase();
  const name = String(userPayload.name || "").trim();
  const password = String(userPayload.password || "").trim();

  if (!email || !name) {
    const error = new Error("Name and email are required") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  if (!existingUser && !password) {
    const error = new Error("Password is required for new users") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const passwordHash = password
    ? (/^\$2[aby]\$/.test(password) ? password : await bcrypt.hash(password, 10))
    : existingUser?.passwordHash;

  if (managerId && (!Number.isFinite(managerId) || managerId === existingUser?.id || requestedRole === UserRole.SUPERADMIN)) {
    const error = new Error("Invalid manager assignment") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  if (managerId) {
    const manager = await tx.user.findUnique({ where: { id: managerId } });
    if (!manager || !manager.isActive) {
      const error = new Error("Manager not found") as Error & { status?: number };
      error.status = 400;
      throw error;
    }

    if (manager.role === UserRole.MEMBRO || getRoleRank(manager.role) <= getRoleRank(requestedRole)) {
      const error = new Error("Manager must have a higher hierarchy level") as Error & { status?: number };
      error.status = 400;
      throw error;
    }
  }

  const projectIds: number[] = Array.from(new Set((userPayload.assignedProjectIds || []).map((value: any) => Number(value)).filter(Boolean))) as number[];

  if (sectorId) {
    const sector = await tx.sector.findUnique({ where: { id: sectorId } });
    if (!sector || !sector.isActive) {
      const error = new Error("Sector not found") as Error & { status?: number };
      error.status = 400;
      throw error;
    }
  }

  if (requestedRole !== UserRole.SUPERADMIN && projectIds.length === 0) {
    const error = new Error("At least one project must be assigned") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const savedUser = existingUser
    ? await tx.user.update({
        where: { id: existingUser.id },
        data: {
          email,
          name,
          role: requestedRole,
          managerId: requestedRole === UserRole.SUPERADMIN ? null : managerId,
          sectorId: requestedRole === UserRole.SUPERADMIN ? null : sectorId,
          isActive: true,
          passwordHash,
        }
      })
    : await tx.user.create({
        data: {
          email,
          name,
          role: requestedRole,
          managerId: requestedRole === UserRole.SUPERADMIN ? null : managerId,
          sectorId: requestedRole === UserRole.SUPERADMIN ? null : sectorId,
          isActive: true,
          passwordHash,
        }
      });

  await tx.userProject.deleteMany({ where: { userId: savedUser.id } });

  if (requestedRole !== UserRole.SUPERADMIN) {
    await tx.userProject.createMany({
      data: projectIds.map((projectId: number) => ({ userId: savedUser.id, projectId })),
      skipDuplicates: true,
    });
  }

  const fullUser = await tx.user.findUnique({ where: { id: savedUser.id }, include: { assignedProjects: true, sector: true } });
  return sanitizeUser(fullUser);
}

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      environment: nodeEnv,
      database: "up"
    });
  } catch {
    res.status(500).json({
      ok: false,
      environment: nodeEnv,
      database: "down"
    });
  }
});

app.get("/projects", requireAuth, async (req: AuthRequest, res) => {
  const authUser = req.authUser;
  if (!authUser) return res.status(401).json({ error: "Unauthorized" });
  const scopedUser = await getScopedAuthUser(Number(authUser.id));
  if (!scopedUser || !scopedUser.isActive) return res.status(401).json({ error: "Unauthorized" });

  const where = GLOBAL_ADMIN_ROLES.includes(authUser.role) || !shouldUseAssignedProjectScope(scopedUser)
    ? undefined
    : { id: { in: await getUserProjectScope(Number(authUser.id)) } };

  const projects = await prisma.project.findMany({ where, include: projectInclude, orderBy: { updatedAt: "desc" } });
  res.json(await Promise.all(projects.map((project) => mapProjectFromDb(project, scopedUser))));
});

app.put("/projects/:id", requireAuth, async (req: AuthRequest, res) => {
  const parsed = projectPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const projectId = Number(req.params.id);
  const isCreate = !Number.isFinite(projectId);
  if (isCreate && (!req.authUser || !GLOBAL_ADMIN_ROLES.includes(req.authUser.role))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!isCreate && (!req.authUser || !PROJECT_MANAGER_ROLES.includes(req.authUser.role) || !(await canAccessProject(req.authUser, projectId)))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const saved = await prisma.$transaction((tx: any) => upsertProjectGraph(tx, parsed.data.project, isCreate ? null : projectId));
  res.json(await mapProjectFromDb(saved));
});

app.delete("/projects/:id", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: "Invalid project id" });
  const existingProject = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
  if (existingProject) {
    await deleteStoredAttachments(collectProjectAttachmentRefs(existingProject));
  }
  await prisma.project.delete({ where: { id: projectId } });
  res.json({ ok: true });
});

app.put("/projects/:projectId/orders/:orderId", requireAuth, async (req: AuthRequest, res) => {
  if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId) || !(await canAccessProject(req.authUser, projectId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const parsed = z.object({ order: z.any() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  try {
    const savedOrder = await prisma.$transaction((tx: any) => upsertScopedOrder(tx, projectId, { ...parsed.data.order, id: req.params.orderId }, req.authUser!));
    res.json(savedOrder);
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Unable to save order" });
  }
});

app.delete("/projects/:projectId/orders/:orderId", requireAuth, async (req: AuthRequest, res) => {
  if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
  const projectId = Number(req.params.projectId);
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(projectId) || !Number.isFinite(orderId) || !(await canAccessProject(req.authUser, projectId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, projectId },
    include: { attachments: true, messages: { include: { attachments: true } } }
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  const canDeleteOrder = req.authUser.role === UserRole.SUPERADMIN || req.authUser.role === UserRole.ADMIN;
  if (!canDeleteOrder) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await deleteStoredAttachments(collectOrderAttachmentRefs(order));
  await prisma.order.delete({ where: { id: orderId } });
  res.json({ ok: true });
});

app.post("/projects/bulk", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (req: AuthRequest, res) => {
  const parsed = bulkProjectsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });

  for (const project of parsed.data.projects) {
    const projectId = Number(project?.id);
    if (!Number.isFinite(projectId)) {
      if (!GLOBAL_ADMIN_ROLES.includes(req.authUser.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    } else if (!(await canAccessProject(req.authUser, projectId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.$transaction((tx: any) => upsertProjectGraph(tx, project, Number.isFinite(projectId) ? projectId : null));
  }

  res.json({ ok: true });
});

app.get("/users", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (_req, res) => {
  const users = await prisma.user.findMany({ include: { assignedProjects: true, sector: true }, orderBy: { name: "asc" } });
  res.json(users.map(sanitizeUser));
});

app.get("/sectors", requireAuth, async (_req, res) => {
  const sectors = await prisma.sector.findMany({
    where: { isActive: true },
    include: { statuses: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    orderBy: { name: "asc" },
  });
  res.json(sectors.map(sanitizeSector));
});

app.put("/sectors/:id", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (req, res) => {
  const parsed = sectorPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const sectorId = Number(req.params.id);
  const sectorName = parsed.data.sector.name.trim().toUpperCase();
  const savedSector = Number.isFinite(sectorId)
    ? await prisma.sector.update({
        where: { id: sectorId },
        data: { name: sectorName, isActive: true },
        include: { statuses: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } }
      })
    : await prisma.sector.create({
        data: { name: sectorName, isActive: true },
        include: { statuses: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } }
      });

  res.json(sanitizeSector(savedSector));
});

app.put("/sectors/:id/statuses", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (req, res) => {
  const parsed = sectorStatusesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const sectorId = Number(req.params.id);
  if (!Number.isFinite(sectorId)) return res.status(400).json({ error: "Invalid sector id" });

  const normalizedNames = Array.from(
    new Set(parsed.data.statuses.map((name) => String(name || "").trim().toUpperCase()).filter(Boolean))
  );

  const savedSector = await prisma.$transaction(async (tx) => {
    await tx.sectorOrderStatus.deleteMany({ where: { sectorId } });
    if (normalizedNames.length > 0) {
      await tx.sectorOrderStatus.createMany({
        data: normalizedNames.map((name, index) => ({
          sectorId,
          name,
          sortOrder: index,
          isActive: true,
        }))
      });
    }
    return tx.sector.findUnique({
      where: { id: sectorId },
      include: { statuses: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } }
    });
  });

  if (!savedSector) return res.status(404).json({ error: "Sector not found" });
  res.json(sanitizeSector(savedSector));
});

app.put("/users/:id", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (req: AuthRequest, res) => {
  const parsed = userPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  try {
    const userId = Number(req.params.id);
    const savedUser = await prisma.$transaction((tx: any) => upsertUserRecord(tx, Number.isFinite(userId) ? userId : null, parsed.data.user, req.authUser?.role));
    res.json(savedUser);
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Unable to save user" });
  }
});

app.delete("/users/:id", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (req: AuthRequest, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid user id" });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === UserRole.SUPERADMIN && req.authUser?.role !== UserRole.SUPERADMIN) {
    return res.status(403).json({ error: "Only SUPERADMIN can delete SUPERADMIN users" });
  }
  await prisma.user.delete({ where: { id: userId } });
  res.json({ ok: true });
});

app.post("/users/bulk", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (req: AuthRequest, res) => {
  const parsed = bulkUsersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  try {
    for (const user of parsed.data.users) {
      const userId = Number(user?.id);
      await prisma.$transaction((tx: any) => upsertUserRecord(tx, Number.isFinite(userId) ? userId : null, user, req.authUser?.role));
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Unable to save users" });
  }
});

app.get("/order-types", requireAuth, async (_req, res) => {
  const rows = await prisma.orderType.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  res.json(rows.map((row) => row.name));
});

app.put("/order-types", requireAuth, requireRole(GLOBAL_ADMIN_ROLES), async (req, res) => {
  const parsed = orderTypesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const names = Array.from(new Set(parsed.data.orderTypes.map((name) => name.trim().toUpperCase()).filter(Boolean)));
  await prisma.$transaction(async (tx) => {
    await tx.orderType.deleteMany({});
    await tx.orderType.createMany({ data: names.map((name, sortOrder) => ({ name, sortOrder, isActive: true })) });
  });

  res.json({ ok: true });
});

app.post("/orders/import", requireAuth, async (req: AuthRequest, res) => {
  const parsed = importOrdersSchema.safeParse(req.body);
  if (!parsed.success || !req.authUser) return res.status(400).json({ error: "Invalid payload" });
  const canImportOrders = req.authUser.role === UserRole.SUPERADMIN;
  if (!canImportOrders) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const summary = await prisma.$transaction(async (tx: any) => {
      const imported: any[] = [];
      const skipped: any[] = [];
      const orderTypeMap = await resolveOrderTypesByName(tx);
      const projects = await tx.project.findMany({ include: { budget: true } });
      const requester = await tx.user.findUnique({
        where: { id: Number(req.authUser!.id) },
        include: { assignedProjects: true }
      });
      if (!requester) throw new Error("Requester not found");
      const canImportAllProjects = req.authUser!.role === UserRole.SUPERADMIN;
      const assignedProjectIds = new Set((requester.assignedProjects || []).map((item: any) => item.projectId));

      for (const row of parsed.data.rows) {
        const projectCode = normalizeProjectCode(row.projectCode || row.codigoObra || row.codigo_obra);
        const projectName = String(row.projectName || row.obra || row.project || "").trim().toUpperCase();
        const project = projects.find((item: any) =>
          (projectCode && item.code === projectCode) ||
          (!projectCode && item.name.trim().toUpperCase() === projectName)
        );

        if (!project) {
          skipped.push({ row, reason: "Projeto não encontrado" });
          continue;
        }

        if (!canImportAllProjects && !assignedProjectIds.has(project.id)) {
          skipped.push({ row, reason: "Sem permissao para importar nesta obra" });
          continue;
        }

        const externalCode = toOptionalText(row.externalCode || row.codigo || row.codigoExterno);
        if (externalCode) {
          const duplicate = await tx.order.findFirst({ where: { projectId: project.id, externalCode } });
          if (duplicate) {
            skipped.push({ row, reason: "Pedido já importado para esta obra" });
            continue;
          }
        }

        const typeName = String(row.type || row.tipo || row.tipoSolicitacao || row.tipo_solicitacao || "OUTROS").trim().toUpperCase();
        let orderType = orderTypeMap.get(typeName);
        if (!orderType) {
          orderType = await ensureOrderType(tx, typeName);
          if (orderType) orderTypeMap.set(orderType.name.toUpperCase(), orderType);
        }
        if (!orderType) {
          skipped.push({ row, reason: "Tipo de pedido inválido" });
          continue;
        }

        const macroName = String(row.macroItem || row.itemMacro || row.item_macro || "").trim().toUpperCase();
        const macro = macroName ? (project.budget || []).find((item: any) => item.description.trim().toUpperCase() === macroName) : null;
        const rawTitle = String(row.title || row.titulo || "").trim();
        const rawDescription = String(row.description || row.descricao || row.title || row.titulo || "Pedido importado do sistema legado").trim();
        const safeTitle = truncateText(rawTitle || rawDescription || "PEDIDO IMPORTADO", ORDER_TITLE_MAX_LENGTH);
        const parsedValue = parseImportedMoney(
          row.value ??
          row.valor ??
          row.valorGeral ??
          row.valor_geral ??
          row.valorTotal ??
          row.valor_total ??
          row.geral
        );
        if (!parsedValue.valid) {
          skipped.push({ row, reason: "Valor ausente ou inválido" });
          continue;
        }
        const orderCode = `${project.code}-${await allocateOrderNumber(tx, project.id)}`;
        const created = await tx.order.create({
          data: {
            projectId: project.id,
            orderTypeId: orderType.id,
            macroItemId: macro?.id || null,
            requesterUserId: requester.id,
            assignedUserId: null,
            orderCode,
            externalCode,
            title: safeTitle,
            description: rawDescription,
            expectedDate: parseDateOnly(row.expectedDate || row.dataVencimento || row.data_vencimento),
            status: normalizeLegacyStatus(row.status || row.situacao),
            completionNote: null,
            cancellationReason: null,
            requestedValue: parsedValue.value,
            createdAt: parseDateTime(row.createdAt || row.dataRegistro || row.data_registro || new Date().toISOString()),
            messages: {
              create: [{
                userId: null,
                body: `Pedido importado do sistema legado${externalCode ? ` com código ${externalCode}` : ""}.`,
                isSystem: true,
                createdAt: new Date(),
              }]
            }
          },
          include: {
            orderType: true,
            requester: true,
            responsible: true,
            attachments: true,
            messages: { include: { user: true, attachments: true } }
          }
        });

        imported.push({
          id: String(created.id),
          orderCode: created.orderCode,
          externalCode: created.externalCode || undefined,
          projectId: String(created.projectId),
          projectName: project.name,
          title: created.title,
          type: created.orderType?.name || '',
          description: created.description,
          macroItemId: created.macroItemId ? String(created.macroItemId) : undefined,
          expectedDate: formatDateOnly(created.expectedDate),
          status: created.status,
          requesterId: String(created.requesterUserId),
          requesterName: created.requester?.name || '',
          responsibleId: undefined,
          responsibleName: undefined,
          attachments: [],
          messages: (created.messages || []).map((message: any) => ({
            id: String(message.id),
            userId: message.userId ? String(message.userId) : SYSTEM_USER_ID,
            userName: message.isSystem ? "SISTEMA" : (message.user?.name || "SISTEMA"),
            text: message.body,
            date: message.createdAt.toISOString(),
            attachments: [],
          })),
          createdAt: created.createdAt.toISOString(),
          value: created.requestedValue ? decimalToNumber(created.requestedValue) : undefined,
        });
      }

      return { imported, skipped };
    });

    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Unable to import orders" });
  }
});

app.post("/auth/login", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email.toLowerCase(), isActive: true },
    include: { assignedProjects: true, sector: true }
  });

  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const validPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!validPassword) return res.status(401).json({ error: "Invalid credentials" });

  const token = buildToken({ id: String(user.id), role: user.role });
  res.json({ token, user: sanitizeUser(user) });
});

app.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
  const userId = Number(req.authUser.id);
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { assignedProjects: true, sector: true } });
  if (!user || !user.isActive) return res.status(401).json({ error: "Unauthorized" });
  res.json(sanitizeUser(user));
});

app.put("/auth/profile", requireAuth, async (req: AuthRequest, res) => {
  if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });

  const parsed = updateOwnProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { name, currentPassword, newPassword } = parsed.data;
  const userId = Number(req.authUser.id);
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { assignedProjects: true, sector: true } });
  if (!user || !user.isActive) return res.status(401).json({ error: "Unauthorized" });

  const nextName = String(name || "").trim();
  if (!nextName) return res.status(400).json({ error: "Name is required" });

  let passwordHash = user.passwordHash;
  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: "Current password is required to change password" });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: "Current password is invalid" });
    }

    passwordHash = await bcrypt.hash(newPassword, 10);
  }

  const savedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: nextName,
      passwordHash,
    },
    include: { assignedProjects: true, sector: true }
  });

  res.json(sanitizeUser(savedUser));
});

app.post("/ai/extract/budget", requireAuth, async (req: AuthRequest, res) => {
  const parsed = geminiExtractionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  try {
    const result = await extractBudgetData(parsed.data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getGeminiErrorMessage(error) });
  }
});

app.post("/ai/extract/cost", requireAuth, async (req: AuthRequest, res) => {
  const parsed = geminiExtractionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  try {
    const result = await extractCostData(parsed.data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getGeminiErrorMessage(error) });
  }
});

app.post("/ai/extract/installment", requireAuth, async (req: AuthRequest, res) => {
  const parsed = geminiExtractionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  try {
    const result = await extractInstallmentData(parsed.data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getGeminiErrorMessage(error) });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const server = app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Closing API...`);
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
