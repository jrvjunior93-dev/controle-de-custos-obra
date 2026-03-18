import React, { useMemo, useState } from 'react';
import { Project, User, UserRole, isGlobalAdmin } from '../types';

interface UsersManagementProps {
  users: User[];
  projects: Project[];
  currentUser: User;
  onSaveUser: (user: User) => Promise<void>;
  onDeleteUser: (user: User) => Promise<void>;
  onImportFullBackup?: (data: any) => void;
}

const protectedUserIds = new Set(['admin-1', 'superadmin-1']);
const roleLabels: Record<UserRole, string> = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN CENTRAL',
  ADMIN_OBRA: 'ADMIN OBRA',
  MEMBRO: 'MEMBRO',
};
const roleRank: Record<UserRole, number> = {
  MEMBRO: 1,
  ADMIN_OBRA: 2,
  ADMIN: 3,
  SUPERADMIN: 4,
};

export const UsersManagement: React.FC<UsersManagementProps> = ({ users, projects, currentUser, onSaveUser, onDeleteUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formUser, setFormUser] = useState<Partial<User>>({
    name: '',
    email: '',
    password: '',
    role: 'MEMBRO',
    managerId: undefined,
    assignedProjectIds: [],
  });

  const canManageSuperadmin = currentUser.role === 'SUPERADMIN';
  const selectedRole = (formUser.role || 'MEMBRO') as UserRole;

  const managerOptions = useMemo(
    () => users.filter((candidate) => {
      if (candidate.id === editingUserId) return false;
      if (selectedRole === 'SUPERADMIN' || isGlobalAdmin(selectedRole)) return false;
      return roleRank[candidate.role] > roleRank[selectedRole];
    }),
    [editingUserId, selectedRole, users]
  );

  const isProtectedUser = (userLike: Partial<User>) => userLike.role === 'SUPERADMIN' || (userLike.id ? protectedUserIds.has(userLike.id) : false);
  const getManagerName = (managerId?: string) => users.find((candidate) => candidate.id === managerId)?.name || 'SEM GESTOR';

  const handleOpenCreate = () => {
    setEditingUserId(null);
    setFormUser({
      name: '',
      email: '',
      password: '',
      role: 'MEMBRO',
      managerId: undefined,
      assignedProjectIds: [],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    if (user.role === 'SUPERADMIN' && !canManageSuperadmin) {
      alert('Somente o SUPERADMIN pode editar outro SUPERADMIN.');
      return;
    }

    setEditingUserId(user.id);
    setFormUser({ ...user, password: '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedRole === 'SUPERADMIN' && !canManageSuperadmin) {
      return alert('Somente o SUPERADMIN pode cadastrar ou promover outro SUPERADMIN.');
    }

    if (!isGlobalAdmin(selectedRole) && formUser.managerId) {
      const manager = users.find((candidate) => candidate.id === formUser.managerId);
      if (!manager || roleRank[manager.role] <= roleRank[selectedRole]) {
        return alert('Selecione um gestor com nivel hierarquico superior ao usuario.');
      }
    }

    const payload = {
      ...formUser,
      role: selectedRole,
      email: (formUser.email || '').trim().toLowerCase(),
      managerId: isGlobalAdmin(selectedRole) ? undefined : formUser.managerId,
      assignedProjectIds: isGlobalAdmin(selectedRole) ? [] : (formUser.assignedProjectIds || []),
    };

    if (!isGlobalAdmin(selectedRole) && payload.assignedProjectIds.length === 0) {
      return alert('Selecione ao menos uma obra para usuarios de obra ou membros.');
    }

    const targetName = payload.name || 'este usuario';
    const confirmationMessage = editingUserId
      ? `Confirmar alteracoes do usuario "${targetName}"?`
      : `Confirmar cadastro do usuario "${targetName}"?`;

    if (!confirm(confirmationMessage)) return;

    const currentEditingUser = editingUserId ? users.find((u) => u.id === editingUserId) : null;
    const userToPersist: User = editingUserId
      ? ({ ...currentEditingUser, ...payload, id: editingUserId } as User)
      : ({ ...(payload as User), id: crypto.randomUUID() } as User);

    try {
      await onSaveUser(userToPersist);
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      alert('Nao foi possivel salvar o usuario no banco de dados.');
    }
  };

  const deleteUser = async (userToDelete: User) => {
    if (isProtectedUser(userToDelete)) return alert('Usuario protegido do sistema.');
    if (!confirm('Excluir usuario permanentemente?')) return;

    try {
      await onDeleteUser(userToDelete);
    } catch (error) {
      console.error(error);
      alert('Nao foi possivel excluir o usuario no banco de dados.');
    }
  };

  const toggleProject = (projectId: string) => {
    const current = formUser.assignedProjectIds || [];
    if (current.includes(projectId)) {
      setFormUser({ ...formUser, assignedProjectIds: current.filter((id) => id !== projectId) });
      return;
    }
    setFormUser({ ...formUser, assignedProjectIds: [...current, projectId] });
  };

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-10">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Acessos & Backend</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Gerenciamento centralizado de equipe, niveis e hierarquia.</p>
        </div>
        <div className="flex gap-4">
          <button onClick={handleOpenCreate} className="bg-slate-900 hover:bg-black text-white px-8 py-4 font-black uppercase text-xs tracking-widest shadow-xl transition-all">
            Novo usuario
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
            <tr>
              <th className="px-6 py-5">Colaborador</th>
              <th className="px-6 py-5">Perfil</th>
              <th className="px-6 py-5">Gestor</th>
              <th className="px-6 py-5">Acessos</th>
              <th className="px-6 py-5 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const userIsProtected = isProtectedUser(u);
              const canEditUser = !userIsProtected || canManageSuperadmin;

              return (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="font-black text-slate-900 uppercase text-xs">{u.name}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">{u.email}</div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`text-[9px] font-black px-2.5 py-1 uppercase border ${u.role === 'SUPERADMIN' ? 'bg-amber-500 text-white border-amber-500' : u.role === 'ADMIN' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {roleLabels[u.role]}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-[10px] font-bold text-slate-500 uppercase">
                    {isGlobalAdmin(u.role) ? 'GESTAO GLOBAL' : getManagerName(u.managerId)}
                  </td>
                  <td className="px-6 py-5 text-[10px] font-bold text-slate-500 uppercase">
                    {isGlobalAdmin(u.role) ? 'Acesso global' : `${u.assignedProjectIds?.length || 0} obra(s)`}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      {canEditUser && (
                        <button onClick={() => handleOpenEdit(u)} className="p-3 bg-slate-100 text-blue-600 hover:bg-blue-600 hover:text-white transition-all">
                          <i className="fas fa-user-edit"></i>
                        </button>
                      )}
                      {!userIsProtected && (
                        <button onClick={() => { void deleteUser(u); }} className="p-3 bg-slate-100 text-slate-400 hover:bg-rose-600 hover:text-white transition-all">
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[130] p-6">
          <div className="bg-white w-full max-w-3xl shadow-2xl border border-slate-800 animate-in zoom-in duration-200">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">{editingUserId ? 'Atualizar colaborador' : 'Novo colaborador'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <i className="fas fa-times text-2xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome completo</label>
                  <input required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs uppercase outline-none focus:border-blue-500" value={formUser.name || ''} onChange={(e) => setFormUser({ ...formUser, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</label>
                  <input required type="email" className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs outline-none focus:border-blue-500" value={formUser.email || ''} onChange={(e) => setFormUser({ ...formUser, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha {editingUserId ? '(opcional)' : ''}</label>
                  <input required={!editingUserId} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs outline-none focus:border-blue-500" value={formUser.password || ''} onChange={(e) => setFormUser({ ...formUser, password: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perfil</label>
                  <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs uppercase outline-none focus:border-blue-500" value={selectedRole} onChange={(e) => setFormUser({ ...formUser, role: e.target.value as UserRole, managerId: undefined, assignedProjectIds: isGlobalAdmin(e.target.value as UserRole) ? [] : formUser.assignedProjectIds })}>
                    <option value="MEMBRO">Membro</option>
                    <option value="ADMIN_OBRA">Admin de obra</option>
                    <option value="ADMIN">Admin central</option>
                    {canManageSuperadmin && <option value="SUPERADMIN">Superadmin</option>}
                  </select>
                </div>
              </div>

              {!isGlobalAdmin(selectedRole) && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gestor direto</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 font-black text-slate-800 text-xs uppercase outline-none focus:border-blue-500" value={formUser.managerId || ''} onChange={(e) => setFormUser({ ...formUser, managerId: e.target.value || undefined })}>
                      <option value="">SEM GESTOR</option>
                      {managerOptions.map((manager) => (
                        <option key={manager.id} value={manager.id}>{manager.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase text-slate-500">
                    Gestores validos: apenas usuarios com nivel superior ao perfil selecionado.
                  </div>
                </div>
              )}

              {!isGlobalAdmin(selectedRole) && (
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Obras autorizadas</label>
                  <div className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-bold uppercase text-amber-700">
                    Vinculo obrigatorio: membro e admin de obra precisam ter pelo menos uma obra selecionada.
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-slate-100 p-4 bg-slate-50">
                    {projects.map((p) => (
                      <label key={p.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white">
                        <input type="checkbox" checked={formUser.assignedProjectIds?.includes(p.id) || false} onChange={() => toggleProject(p.id)} className="w-4 h-4 text-blue-600 rounded-none" />
                        <span className="text-[10px] font-bold text-slate-600 uppercase">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px]">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-900 text-white py-4 font-black uppercase text-[10px] shadow-xl">{editingUserId ? 'Salvar alteracoes' : 'Cadastrar usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
