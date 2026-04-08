export interface MacroItem {
  id: string;
  description: string;
  budgetedValue: number;
}

export interface Attachment {
  id: string;
  name: string; 
  originalName?: string; 
  data: string;
  storageProvider?: string;
  storageBucket?: string;
  storageKey?: string;
  type: string;
  size: number;
  uploadDate: string;
}

export type ProvisioningStatus = 'RASCUNHO' | 'PREVISTO' | 'EM_ANALISE' | 'APROVADO' | 'CANCELADO' | 'REALIZADO';

export interface ProvisioningHistoryItem {
  id: string;
  action: string;
  description: string;
  statusFrom?: ProvisioningStatus;
  statusTo?: ProvisioningStatus;
  userId?: string;
  userName?: string;
  createdAt: string;
  attachments: Attachment[];
}

export interface ProvisioningCategory {
  id: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface ProvisioningRecord {
  id: string;
  code: string;
  projectId: string;
  projectName: string;
  categoryId: string;
  categoryName: string;
  title: string;
  description: string;
  supplier?: string;
  dueDate: string;
  forecastValue: number;
  status: ProvisioningStatus;
  comment?: string;
  createdByUserId: string;
  createdByUserName: string;
  updatedByUserId?: string;
  updatedByUserName?: string;
  approvedByUserId?: string;
  approvedByUserName?: string;
  approvedAt?: string;
  cancelledByUserId?: string;
  cancelledByUserName?: string;
  cancelledAt?: string;
  realizedAt?: string;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  history: ProvisioningHistoryItem[];
}

export interface ExecutedCost {
  id: string;
  macroItemId: string;
  description: string; 
  itemDetail?: string; 
  unit: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  date: string; 
  entryDate: string; 
  attachments: Attachment[];
  originInstallmentId?: string; 
  originOrderId?: string; 
}

export interface Installment {
  id: string;
  provider: string;
  description: string;
  totalValue: number;
  installmentNumber: number;
  totalInstallments: number;
  dueDate: string;
  value: number;
  digitalLine?: string;
  status: 'PENDING' | 'PAID';
  attachment: Attachment; 
  paymentProof?: Attachment; 
  macroItemId: string; 
}

export type OrderStatus = 'PENDENTE' | 'EM_ANALISE' | 'AGUARDANDO_INFORMACAO' | 'CONCLUIDO' | 'CANCELADO';

export interface OrderMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  date: string;
  attachments?: Attachment[];
}

export interface Order {
  id: string;
  orderCode?: string;
  externalCode?: string;
  projectId: string;
  projectName: string;
  title: string;
  type: string;
  description: string;
  macroItemId?: string;
  currentSectorId?: string;
  currentSectorName?: string;
  accessibleSectorIds?: string[];
  expectedDate: string;
  status: OrderStatus;
  sectorStatus?: string;
  requesterId: string;
  requesterName: string;
  responsibleId?: string;
  responsibleName?: string;
  attachments: Attachment[];
  completionAttachment?: Attachment;
  completionNote?: string;
  cancellationReason?: string;
  messages: OrderMessage[];
  createdAt: string;
  value?: number;
}

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'ADMIN_OBRA' | 'MEMBRO';

export const isGlobalAdmin = (role: UserRole) => role === 'SUPERADMIN';
export const isProjectAdmin = (role: UserRole) => role === 'SUPERADMIN' || role === 'ADMIN';
export const canManageAssignedOrders = (role: UserRole) => role === 'SUPERADMIN' || role === 'ADMIN' || role === 'ADMIN_OBRA';

export interface User {
  id: string;
  email: string;
  password?: string;
  name: string;
  role: UserRole;
  managerId?: string;
  sectorId?: string;
  sectorName?: string;
  canAccessProvisioning?: boolean;
  canCreateProvisioning?: boolean;
  canApproveProvisioning?: boolean;
  canViewProvisioningDashboard?: boolean;
  assignedProjectIds: string[];
}

export interface Sector {
  id: string;
  name: string;
  statuses?: string[];
}

export interface Project {
  id: string;
  code: string;
  name: string;
  location: string;
  startDate: string;
  notes: string;
  budget: MacroItem[];
  costs: ExecutedCost[];
  installments: Installment[];
  orders?: Order[]; 
}

export interface ProvisioningContext {
  permissions: {
    canAccess: boolean;
    canCreate: boolean;
    canApprove: boolean;
    canViewDashboard: boolean;
  };
  categories: ProvisioningCategory[];
  projectOptions: Array<{ id: string; code: string; name: string }>;
}

export interface ProvisioningDashboardData {
  totalRecords: number;
  totalForecastValue: number;
  byStatus: Array<{ status: ProvisioningStatus; count: number; totalValue: number }>;
  byProject: Array<{ projectId: string; projectName: string; count: number; totalValue: number }>;
  upcoming: ProvisioningRecord[];
}

export type ViewState =
  | 'PROJECT_LIST'
  | 'PROJECT_DETAIL'
  | 'SPECIFICATION'
  | 'USERS_MANAGEMENT'
  | 'ORDERS_GLOBAL'
  | 'PROVISIONING_LIST'
  | 'PROVISIONING_NEW'
  | 'PROVISIONING_DASHBOARD';
