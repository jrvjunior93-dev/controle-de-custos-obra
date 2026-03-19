import React, { Suspense, lazy, useEffect, useState } from 'react';

import { ProjectList } from './components/ProjectList';

import { Login } from './components/Login';

import { Project, ViewState, User, isGlobalAdmin, isProjectAdmin } from './types';
import { normalizePtText } from './utils/text';

import { dbService } from './apiClient';

const ProjectDetail = lazy(() => import('./components/ProjectDetail').then((module) => ({ default: module.ProjectDetail })));
const SpecificationDoc = lazy(() => import('./components/SpecificationDoc').then((module) => ({ default: module.SpecificationDoc })));
const UsersManagement = lazy(() => import('./components/UsersManagement').then((module) => ({ default: module.UsersManagement })));
const GlobalOrdersModule = lazy(() => import('./components/GlobalOrdersModule').then((module) => ({ default: module.GlobalOrdersModule })));



type SessionData = {

  user: User;

};



const normalizeUserRecord = (account: User): User => ({
  ...account,
  name: normalizePtText(account.name),
  email: String(account.email || '').trim().toLowerCase(),
});

const normalizeProjectRecord = (project: Project): Project => ({
  ...project,
  code: String(project.code || '').trim().toUpperCase(),
  name: normalizePtText(project.name),
  location: normalizePtText(project.location),
  notes: normalizePtText(project.notes),
  budget: (project.budget || []).map((item) => ({
    ...item,
    description: normalizePtText(item.description),
  })),
  costs: (project.costs || []).map((cost) => ({
    ...cost,
    description: normalizePtText(cost.description),
    itemDetail: cost.itemDetail ? normalizePtText(cost.itemDetail) : undefined,
    attachments: (cost.attachments || []).map((attachment) => ({
      ...attachment,
      name: normalizePtText(attachment.name),
      originalName: attachment.originalName ? normalizePtText(attachment.originalName) : undefined,
    })),
  })),
  installments: (project.installments || []).map((installment) => ({
    ...installment,
    provider: normalizePtText(installment.provider),
    description: normalizePtText(installment.description),
    attachment: installment.attachment ? {
      ...installment.attachment,
      name: normalizePtText(installment.attachment.name),
      originalName: installment.attachment.originalName ? normalizePtText(installment.attachment.originalName) : undefined,
    } : installment.attachment,
    paymentProof: installment.paymentProof ? {
      ...installment.paymentProof,
      name: normalizePtText(installment.paymentProof.name),
      originalName: installment.paymentProof.originalName ? normalizePtText(installment.paymentProof.originalName) : undefined,
    } : installment.paymentProof,
  })),
  orders: (project.orders || []).map((order) => ({
    ...order,
    projectName: normalizePtText(order.projectName),
    title: normalizePtText(order.title),
    type: normalizePtText(order.type),
    description: normalizePtText(order.description),
    requesterName: normalizePtText(order.requesterName),
    responsibleName: order.responsibleName ? normalizePtText(order.responsibleName) : undefined,
    completionNote: order.completionNote ? normalizePtText(order.completionNote) : undefined,
    cancellationReason: order.cancellationReason ? normalizePtText(order.cancellationReason) : undefined,
    attachments: (order.attachments || []).map((attachment) => ({
      ...attachment,
      name: normalizePtText(attachment.name),
      originalName: attachment.originalName ? normalizePtText(attachment.originalName) : undefined,
    })),
    completionAttachment: order.completionAttachment ? {
      ...order.completionAttachment,
      name: normalizePtText(order.completionAttachment.name),
      originalName: order.completionAttachment.originalName ? normalizePtText(order.completionAttachment.originalName) : undefined,
    } : undefined,
    messages: (order.messages || []).map((message) => ({
      ...message,
      userName: normalizePtText(message.userName),
      text: normalizePtText(message.text),
      attachments: (message.attachments || []).map((attachment) => ({
        ...attachment,
        name: normalizePtText(attachment.name),
        originalName: attachment.originalName ? normalizePtText(attachment.originalName) : undefined,
      })),
    })),
  })),
});

const ScreenFallback: React.FC = () => (
  <div className="p-10">
    <div className="bg-white border border-slate-200 shadow-sm p-8 text-[11px] font-black uppercase tracking-widest text-slate-400">
      Carregando módulo...
    </div>
  </div>
);

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_KEY = 'csc_brape_session';
const LAST_ACTIVITY_KEY = 'csc_brape_last_activity';

const App: React.FC = () => {

  const [user, setUser] = useState<User | null>(null);

  const [view, setView] = useState<ViewState>('PROJECT_LIST');

  const [projects, setProjects] = useState<Project[]>([]);

  const [users, setUsers] = useState<User[]>([]);

  const [orderTypes, setOrderTypes] = useState<string[]>([

    'COMPRA DE MATERIAL',

    'CONTRATACAO DE SERVICO',

    'LOCACAO DE EQUIPAMENTOS',

    'OUTROS'

  ]);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [isDataSynced, setIsDataSynced] = useState(false);

  const [isLoadingData, setIsLoadingData] = useState(true);

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', currentPassword: '', newPassword: '', confirmPassword: '' });

  const markSessionActivity = () => {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  };

  const clearSessionState = () => {
    setUser(null);
    dbService.clearAuthToken();
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    setView('PROJECT_LIST');
    setSelectedProjectId(null);
    setProjects([]);
    setUsers([]);
    setShowProfileMenu(false);
    setShowProfileModal(false);
  };

  const forceLogout = (message?: string) => {
    clearSessionState();
    if (message) alert(message);
  };



  const initData = async (currentUser?: User | null) => {

    setIsLoadingData(true);

    setIsDataSynced(false);



    const activeUser = currentUser || user;

    const canManageGlobalData = activeUser ? isGlobalAdmin(activeUser.role) : false;



    try {

      const apiProjects = await dbService.getProjects();

      const apiOrderTypes = await dbService.getOrderTypes();

      const apiUsers = canManageGlobalData ? await dbService.getUsers() : null;

      const nextProjects = (apiProjects || []).map(normalizeProjectRecord);
      const nextUsers = canManageGlobalData ? (apiUsers || []).map(normalizeUserRecord) : [];
      const nextOrderTypes = apiOrderTypes && apiOrderTypes.length > 0 ? apiOrderTypes : [
        'COMPRA DE MATERIAL',
        'CONTRATACAO DE SERVICO',
        'LOCACAO DE EQUIPAMENTOS',
        'OUTROS'
      ];

      setProjects(nextProjects);
      setUsers(nextUsers);
      setOrderTypes(nextOrderTypes);

      localStorage.setItem('csc_brape_projects', JSON.stringify(nextProjects));
      if (canManageGlobalData) {
        localStorage.setItem('csc_brape_users', JSON.stringify(nextUsers));
      } else {
        localStorage.removeItem('csc_brape_users');
      }

      setIsDataSynced(true);

    } catch (e) {

      console.error('Erro na sincronizacao com backend:', e);

      const savedProjects = localStorage.getItem('csc_brape_projects');
      setProjects(savedProjects ? JSON.parse(savedProjects).map(normalizeProjectRecord) : []);

      if (canManageGlobalData) {
        const savedUsers = localStorage.getItem('csc_brape_users');
        setUsers(savedUsers ? JSON.parse(savedUsers).map(normalizeUserRecord) : []);
      } else {
        setUsers([]);
      }

    } finally {

      setIsLoadingData(false);

    }

  };



  useEffect(() => {

    const token = dbService.getAuthToken();

    const session = sessionStorage.getItem(SESSION_KEY);
    const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);



    if (!token || !session) {

      setIsLoadingData(false);

      return;

    }

    if (!lastActivity || Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
      forceLogout('Sua sessao foi encerrada por inatividade.');
      setIsLoadingData(false);
      return;
    }



    const restoreSession = async () => {
      try {
        const refreshedUser = await dbService.me();
        setUser(normalizeUserRecord(refreshedUser));
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalizeUserRecord(refreshedUser) }));
        markSessionActivity();

        if (!isProjectAdmin(refreshedUser.role)) setView('ORDERS_GLOBAL');

        await initData(refreshedUser);
      } catch {
        dbService.clearAuthToken();
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);
        setIsLoadingData(false);
      }
    };

    void restoreSession();

  }, []);



  useEffect(() => {
    if (!user || !isDataSynced) return;

    const shouldRefresh = ['PROJECT_LIST', 'PROJECT_DETAIL', 'ORDERS_GLOBAL', 'USERS_MANAGEMENT', 'SPECIFICATION'].includes(view);
    if (!shouldRefresh) return;

    void initData(user);

  }, [view, selectedProjectId]);



  useEffect(() => {
    if (!user) return;

    const handleWindowVisibility = () => {
      if (document.visibilityState === 'hidden') return;
      void initData(user);
    };

    window.addEventListener('focus', handleWindowVisibility);
    document.addEventListener('visibilitychange', handleWindowVisibility);

    return () => {
      window.removeEventListener('focus', handleWindowVisibility);
      document.removeEventListener('visibilitychange', handleWindowVisibility);
    };
  }, [user]);


  useEffect(() => {
    if (!user) return undefined;

    let timeoutId: number | undefined;

    const resetInactivityTimeout = () => {
      markSessionActivity();
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        forceLogout('Sua sessao foi encerrada por inatividade.');
      }, INACTIVITY_TIMEOUT_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetInactivityTimeout, { passive: true }));
    resetInactivityTimeout();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetInactivityTimeout));
    };
  }, [user]);



  const handleLogin = async (u: User, token: string) => {

    dbService.setAuthToken(token);

    const authenticatedUser = await dbService.me().catch(() => u);

    setUser(normalizeUserRecord(authenticatedUser));

    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalizeUserRecord(authenticatedUser) }));
    markSessionActivity();



    if (!isProjectAdmin(authenticatedUser.role)) {

      setView('ORDERS_GLOBAL');

    } else {

      setView('PROJECT_LIST');

    }



    await initData(authenticatedUser);

  };



  const handleLogout = () => {

    if (!confirm('Deseja encerrar a sessao atual?')) return;

    clearSessionState();

  };



  const forceSync = async () => {

    if (!confirm('Deseja sincronizar os dados com o backend agora?')) return;

    await initData(user);

    setShowSyncModal(false);

    alert('Sincronizacao concluida!');

  };


  const handleSaveProject = async (project: Project) => {

    const savedProject = normalizeProjectRecord(await dbService.upsertProject(project));

    setProjects((currentProjects) => {
      const exists = currentProjects.some((item) => item.id === savedProject.id);
      const nextProjects = exists
        ? currentProjects.map((item) => item.id === savedProject.id ? savedProject : item)
        : [savedProject, ...currentProjects];

      localStorage.setItem('csc_brape_projects', JSON.stringify(nextProjects));
      return nextProjects;
    });
  };



  const handleDeleteProject = async (project: Project) => {

    await dbService.deleteProject(project.id);

    setProjects((currentProjects) => {
      const nextProjects = currentProjects.filter((item) => item.id !== project.id);
      localStorage.setItem('csc_brape_projects', JSON.stringify(nextProjects));
      return nextProjects;
    });

    if (selectedProjectId === project.id) {
      setSelectedProjectId(null);
      setView('PROJECT_LIST');
    }
  };



  const handleSaveUser = async (account: User) => {

    const savedUser = normalizeUserRecord(await dbService.upsertUser(account));

    setUsers((currentUsers) => {
      const exists = currentUsers.some((item) => item.id === savedUser.id);
      const nextUsers = exists
        ? currentUsers.map((item) => item.id === savedUser.id ? savedUser : item)
        : [...currentUsers, savedUser].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      localStorage.setItem('csc_brape_users', JSON.stringify(nextUsers));
      return nextUsers;
    });
  };



  const handleDeleteUser = async (account: User) => {

    await dbService.deleteUser(account.id);

    setUsers((currentUsers) => {
      const nextUsers = currentUsers.filter((item) => item.id !== account.id);
      localStorage.setItem('csc_brape_users', JSON.stringify(nextUsers));
      return nextUsers;
    });
  };

  const openProfileModal = () => {
    setProfileForm({ name: user.name, currentPassword: '', newPassword: '', confirmPassword: '' });
    setShowProfileModal(true);
    setShowProfileMenu(false);
  };

  const handleSaveProfile = async () => {
    const nextName = profileForm.name.trim();
    const nextPassword = profileForm.newPassword.trim();
    const currentPassword = profileForm.currentPassword.trim();

    if (!nextName) {
      alert('Informe o nome do usuario.');
      return;
    }

    if (nextPassword && nextPassword !== profileForm.confirmPassword.trim()) {
      alert('A confirmacao da nova senha nao confere.');
      return;
    }

    if (nextPassword && !currentPassword) {
      alert('Informe a senha atual para alterar a senha.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const savedUser = normalizeUserRecord(await dbService.updateMyProfile({
        name: nextName,
        currentPassword: currentPassword || undefined,
        newPassword: nextPassword || undefined,
      }));

      setUser(savedUser);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: savedUser }));
      markSessionActivity();
      setUsers((currentUsers) => currentUsers.map((item) => item.id === savedUser.id ? savedUser : item));
      setShowProfileModal(false);
      alert('Perfil atualizado com sucesso.');
    } catch (error: any) {
      alert(error?.message || 'Nao foi possivel atualizar o perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };


  const handleSyncMemberOrder = async (projectId: string, order: any) => {
    const savedOrder = await dbService.upsertProjectOrder(projectId, order);
    setProjects((currentProjects) => currentProjects.map((project) => {
      if (project.id !== projectId) return project;
      const normalizedOrder = normalizeProjectRecord({ ...project, orders: [savedOrder] }).orders?.[0] || savedOrder;
      const nextOrders = (project.orders || []).some((item) => item.id === order.id || item.id === normalizedOrder.id)
        ? (project.orders || []).map((item) => item.id === order.id || item.id === normalizedOrder.id ? normalizedOrder : item)
        : [...(project.orders || []), normalizedOrder];
      return { ...project, orders: nextOrders };
    }));
  };

  const handleDeleteMemberOrder = async (projectId: string, orderId: string) => {
    await dbService.deleteProjectOrder(projectId, orderId);
    setProjects((currentProjects) => currentProjects.map((project) => project.id === projectId ? { ...project, orders: (project.orders || []).filter((item) => item.id !== orderId) } : project));
  };



  if (!user) {

    return (

      <Login

        onLogin={handleLogin}

        isLoading={isLoadingData}

      />

    );

  }



  const canManageGlobalData = isGlobalAdmin(user.role);
  const canManageProjectPortfolio = isProjectAdmin(user.role) || user.role === 'ADMIN_OBRA';
  const visibleProjects = canManageGlobalData
    ? projects
    : projects.filter((project) => user.assignedProjectIds?.includes(project.id));



  return (

    <div className="min-h-screen flex flex-col">

      <header className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-50 no-print border-b border-slate-800">

        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => canManageProjectPortfolio ? setView('PROJECT_LIST') : setView('ORDERS_GLOBAL')}>

          <div className="bg-blue-600 p-2 shadow-lg group-hover:bg-blue-500 transition-colors"><i className="fas fa-hard-hat text-xl"></i></div>

          <div>

            <h1 className="text-xl font-black tracking-tighter uppercase leading-none">CSC - BRAPE</h1>

            <div className="flex items-center gap-2">

              <span className="text-blue-400 text-[9px] font-black uppercase tracking-[0.2em]">Engenharia & Custos</span>

              <button

                onClick={(e) => { e.stopPropagation(); setShowSyncModal(true); }}

                className={`flex items-center gap-1 text-[8px] font-black uppercase transition-colors ${isDataSynced ? 'text-emerald-400 hover:text-white' : 'text-amber-400 animate-pulse'}`}

              >

                <i className={`fas ${isDataSynced ? 'fa-database' : 'fa-spinner fa-spin'}`}></i>

                {isDataSynced ? 'Backend OK' : 'Sincronizando...'}

              </button>

            </div>

          </div>

        </div>



        <nav className="flex items-center gap-6">

          {canManageProjectPortfolio && (

            <button onClick={() => setView('PROJECT_LIST')} className={`hover:text-blue-400 transition-colors uppercase text-[10px] font-black tracking-widest ${view === 'PROJECT_LIST' || view === 'PROJECT_DETAIL' ? 'text-blue-400' : ''}`}>Obras</button>

          )}

          <button onClick={() => setView('ORDERS_GLOBAL')} className={`hover:text-blue-400 transition-colors uppercase text-[10px] font-black tracking-widest ${view === 'ORDERS_GLOBAL' ? 'text-blue-400' : ''}`}>Pedidos</button>

          {canManageGlobalData && (

            <>

              <button onClick={() => setView('USERS_MANAGEMENT')} className={`hover:text-blue-400 transition-colors uppercase text-[10px] font-black tracking-widest ${view === 'USERS_MANAGEMENT' ? 'text-blue-400' : ''}`}>Usuarios</button>

              <button onClick={() => setView('SPECIFICATION')} className={`hover:text-blue-400 transition-colors uppercase text-[10px] font-black tracking-widest ${view === 'SPECIFICATION' ? 'text-blue-400' : ''}`}>Config</button>

            </>

          )}

          <div className="h-6 w-px bg-slate-700 mx-2"></div>

          <div className="flex items-center gap-3 relative">

            <button
              onClick={() => setShowProfileMenu((current) => !current)}
              className="text-right hidden sm:block hover:text-blue-300 transition-colors"
              title="Meu perfil"
            >

              <p className="text-[10px] font-black uppercase tracking-tighter leading-none">{user.name}</p>

              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{user.role.replace('_', ' ')}</p>

            </button>

            <button
              onClick={() => setShowProfileMenu((current) => !current)}
              className="sm:hidden w-9 h-9 border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 transition-colors"
              title="Meu perfil"
            >
              <i className="fas fa-user"></i>
            </button>

            <button onClick={handleLogout} className="text-slate-500 hover:text-white transition-colors" title="Sair"><i className="fas fa-power-off"></i></button>

            {showProfileMenu && (
              <div className="absolute right-10 top-full mt-3 w-64 bg-white text-slate-900 border border-slate-200 shadow-2xl z-[80]">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-wider">{user.name}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{user.role.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={openProfileModal}
                  className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors"
                >
                  <i className="fas fa-id-card mr-2 text-blue-600"></i>Meu perfil
                </button>
              </div>
            )}

          </div>

        </nav>

      </header>



      <main className="flex-1 overflow-auto bg-slate-50">

        {view === 'PROJECT_LIST' && canManageProjectPortfolio && (

          <ProjectList projects={visibleProjects} onSelect={(id) => { setSelectedProjectId(id); setView('PROJECT_DETAIL'); }} onAdd={async (p) => handleSaveProject({ ...p, id: crypto.randomUUID(), code: String(p.code || '').trim().toUpperCase(), budget: [], costs: [], installments: [], orders: [] })} onDelete={handleDeleteProject} canCreateProject={canManageGlobalData} canDeleteProject={canManageGlobalData} canManageProject={canManageProjectPortfolio} />

        )}

        <Suspense fallback={<ScreenFallback />}>
          {view === 'PROJECT_DETAIL' && visibleProjects.find((p) => p.id === selectedProjectId) && (

            <ProjectDetail project={visibleProjects.find((p) => p.id === selectedProjectId)!} user={user} onUpdate={(up) => { void handleSaveProject(up); }} onBack={() => setView('PROJECT_LIST')} />

          )}

          {view === 'ORDERS_GLOBAL' && (

            <GlobalOrdersModule projects={visibleProjects} user={user} onUpdateProjects={(updatedProjects) => {
              const updatedMap = new Map(updatedProjects.map((project) => [project.id, project]));
              setProjects((currentProjects) => currentProjects.map((project) => updatedMap.get(project.id) || project));
            }} onPersistProject={handleSaveProject} onPersistMemberOrder={handleSyncMemberOrder} onDeleteMemberOrder={handleDeleteMemberOrder} orderTypes={orderTypes} />

          )}

          {view === 'USERS_MANAGEMENT' && canManageGlobalData && (

            <UsersManagement users={users} projects={projects} currentUser={user} onSaveUser={handleSaveUser} onDeleteUser={handleDeleteUser} onImportFullBackup={initData} />

          )}

          {view === 'SPECIFICATION' && canManageGlobalData && (

            <SpecificationDoc orderTypes={orderTypes} onUpdateOrderTypes={(types) => { setOrderTypes(types); dbService.saveOrderTypes(types); }} />

          )}
        </Suspense>

      </main>



      {showSyncModal && (

        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">

          <div className="bg-white max-w-sm w-full p-8 border border-slate-200 shadow-2xl space-y-6">

            <div className="text-center">

              <i className={`fas ${isDataSynced ? 'fa-circle-check text-emerald-500' : 'fa-circle-exclamation text-amber-500'} text-5xl mb-4`}></i>

              <h3 className="text-lg font-black uppercase tracking-tighter">Status do Backend</h3>

              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Conexao com API + MySQL.</p>

            </div>

            <div className="space-y-2">

              <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 border-b border-slate-100 pb-1">

                <span>Usuarios</span>

                <span className="text-slate-900">{users.length}</span>

              </div>

              <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 border-b border-slate-100 pb-1">

                <span>Projetos</span>

                <span className="text-slate-900">{projects.length}</span>

              </div>

            </div>

            <button

              onClick={forceSync}

              className="w-full bg-slate-900 text-white py-4 font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all"

            >

              Sincronizar Agora

            </button>

            <button

              onClick={() => setShowSyncModal(false)}

              className="w-full py-2 text-slate-400 font-black uppercase text-[9px]"

            >

              Fechar

            </button>

          </div>

        </div>

      )}

      {showProfileModal && (

        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-6">

          <div className="bg-white max-w-md w-full p-8 border border-slate-200 shadow-2xl space-y-5">

            <div>

              <h3 className="text-lg font-black uppercase tracking-tighter">Meu Perfil</h3>

              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Atualize nome e senha de acesso.</p>

            </div>

            <div className="space-y-4">

              <div>

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Nome</label>

                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((current) => ({ ...current, name: e.target.value }))}
                  className="w-full border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />

              </div>

              <div>

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Senha atual</label>

                <input
                  type="password"
                  value={profileForm.currentPassword}
                  onChange={(e) => setProfileForm((current) => ({ ...current, currentPassword: e.target.value }))}
                  className="w-full border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />

              </div>

              <div>

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Nova senha</label>

                <input
                  type="password"
                  value={profileForm.newPassword}
                  onChange={(e) => setProfileForm((current) => ({ ...current, newPassword: e.target.value }))}
                  className="w-full border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />

              </div>

              <div>

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Confirmar nova senha</label>

                <input
                  type="password"
                  value={profileForm.confirmPassword}
                  onChange={(e) => setProfileForm((current) => ({ ...current, confirmPassword: e.target.value }))}
                  className="w-full border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />

              </div>

            </div>

            <div className="flex gap-3">

              <button
                onClick={() => setShowProfileModal(false)}
                className="flex-1 py-3 border border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-widest"
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="flex-1 bg-slate-900 text-white py-3 font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
              >
                {isSavingProfile ? 'Salvando...' : 'Salvar Perfil'}
              </button>

            </div>

          </div>

        </div>

      )}



      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-slate-400 text-[9px] uppercase font-black tracking-[0.3em] no-print">CSC - BRAPE &copy; 2024</footer>

    </div>

  );

};



export default App;









