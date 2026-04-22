import React, { useState } from 'react';
import { Project } from '../types';

interface ProjectListProps {
  projects: Project[];
  onSelect: (id: string) => void;
  onAdd: (p: any) => void;
  onDelete: (project: Project) => void;
  onUpdateProjectCode: (projectId: string, code: string) => Promise<void>;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canManageProject: boolean;
  canEditProjectCode: boolean;
}

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onSelect, onAdd, onDelete, onUpdateProjectCode, canCreateProject, canDeleteProject, canManageProject, canEditProjectCode }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProject, setNewProject] = useState({ code: '', name: '', location: '', startDate: '', notes: '' });
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [codeDraft, setCodeDraft] = useState('');
  const [isSavingCode, setIsSavingCode] = useState(false);

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`Confirmar cadastro da obra "${newProject.name}"?`)) return;
    onAdd(newProject);
    setNewProject({ code: '', name: '', location: '', startDate: '', notes: '' });
    setIsModalOpen(false);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto rounded-none">
      <div className="flex justify-between items-end mb-8 rounded-none">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Gestão de Obras</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            {canCreateProject ? 'Controle total do portfólio de projetos.' : 'Gestão operacional das obras vinculadas ao seu perfil.'}
          </p>
        </div>
        {canCreateProject && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-none font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95"
          >
            Nova Obra
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="bg-white border-4 border-dashed border-slate-100 rounded-none p-24 text-center">
          <div className="bg-slate-50 w-24 h-24 rounded-none flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-folder-open text-slate-200 text-4xl"></i>
          </div>
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">Nenhuma obra vinculada</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 rounded-none">
          {projects.map((project) => {
            const budgeted = project.budget.reduce((acc, item) => acc + item.budgetedValue, 0);
            const executed = (project.costs || []).reduce((acc, item) => acc + item.totalValue, 0);

            return (
              <div key={project.id} className="bg-white rounded-none shadow-sm border border-slate-200 hover:shadow-2xl transition-all group flex flex-col">
                <div className="p-8 flex-1 rounded-none">
                  <div className="flex justify-between items-start mb-6 rounded-none">
                    <div className="bg-slate-900 text-white p-3 shadow-lg">
                      <i className="fas fa-building text-2xl"></i>
                    </div>
                    {(canDeleteProject || canEditProjectCode) && (
                      <div className="flex items-center gap-3">
                        {canEditProjectCode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProject(project);
                              setCodeDraft(project.code || '');
                              setIsEditingCode(true);
                            }}
                            className="text-slate-200 hover:text-slate-700 p-1 transition-colors"
                            title="Editar codigo da obra"
                          >
                            <i className="fas fa-pen"></i>
                          </button>
                        )}
                        {canDeleteProject && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!confirm(`Excluir a obra "${project.name}" permanentemente?`)) return;
                              onDelete(project);
                            }}
                            className="text-slate-200 hover:text-red-500 p-1 transition-colors"
                            title="Excluir obra"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 mb-1 uppercase tracking-tighter leading-none">{project.name}</h3>
                  <div className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mb-2">{project.code}</div>
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-6">
                    <i className="fas fa-map-marker-alt"></i>
                    {project.location}
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">
                      <span>Orçado</span>
                      <span>Executado</span>
                    </div>
                    <div className="flex justify-between text-xs font-black text-slate-900 font-mono">
                      <span>R$ {formatCurrency(budgeted)}</span>
                      <span className="text-blue-600">R$ {formatCurrency(executed)}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-none overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-1000 rounded-none" style={{ width: `${Math.min(100, (executed / (budgeted || 1)) * 100)}%` }}></div>
                    </div>
                  </div>
                </div>
                <button onClick={() => onSelect(project.id)} className="w-full bg-slate-900 py-5 text-white font-black uppercase text-[10px] tracking-[0.3em] hover:bg-black transition-all rounded-none shadow-inner">
                  {canManageProject ? 'Gerenciar Obra' : 'Visualizar'} <i className="fas fa-arrow-right ml-2"></i>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isEditingCode && editingProject && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 rounded-none">
          <div className="bg-white rounded-none w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center rounded-none bg-slate-900 text-white">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest">Editar codigo</h3>
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">{editingProject.name}</p>
              </div>
              <button
                onClick={() => { if (!isSavingCode) { setIsEditingCode(false); setEditingProject(null); } }}
                className="text-slate-400 hover:text-white"
                title="Fechar"
                disabled={isSavingCode}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-8 space-y-4 rounded-none">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Codigo da Obra</label>
                <input
                  required
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 px-5 py-4 font-black text-slate-800 text-sm uppercase outline-none focus:border-blue-500 transition-colors"
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                  placeholder="EX: OBRA7"
                  disabled={isSavingCode}
                />
              </div>
              <button
                onClick={async () => {
                  const next = String(codeDraft || '').trim();
                  if (!next) { alert('Informe o codigo da obra.'); return; }
                  try {
                    setIsSavingCode(true);
                    await onUpdateProjectCode(editingProject.id, next);
                    setIsEditingCode(false);
                    setEditingProject(null);
                    alert('Codigo atualizado!');
                  } catch (e: any) {
                    alert(e?.message || 'Nao foi possivel atualizar o codigo.');
                  } finally {
                    setIsSavingCode(false);
                  }
                }}
                className="w-full bg-slate-900 hover:bg-black text-white py-5 font-black uppercase text-xs tracking-[0.2em] shadow-2xl transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isSavingCode}
              >
                {isSavingCode ? 'Salvando...' : 'Salvar Codigo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {canCreateProject && isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 rounded-none">
          <div className="bg-white rounded-none w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center rounded-none bg-slate-900 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">Cadastrar Nova Obra</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6 rounded-none">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Código da Obra</label>
                <input required type="text" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 font-black text-slate-800 text-sm uppercase outline-none focus:border-blue-500 transition-colors" value={newProject.code} onChange={(e) => setNewProject({ ...newProject, code: e.target.value.toUpperCase() })} placeholder="EX: OBRA1" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome da Obra</label>
                <input required type="text" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 font-black text-slate-800 text-sm outline-none focus:border-blue-500 transition-colors" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} placeholder="EX: EDIFÍCIO HORIZONTE" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Localização</label>
                <input required type="text" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 font-black text-slate-800 text-sm outline-none focus:border-blue-500 transition-colors" value={newProject.location} onChange={(e) => setNewProject({ ...newProject, location: e.target.value })} placeholder="EX: SÃO PAULO, SP" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data de Início</label>
                <input required type="date" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 font-black text-slate-800 text-sm outline-none focus:border-blue-500 transition-colors" value={newProject.startDate} onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações Técnicas</label>
                <textarea rows={3} className="w-full bg-slate-50 border border-slate-200 px-5 py-4 font-black text-slate-800 text-sm outline-none focus:border-blue-500 transition-colors" value={newProject.notes} onChange={(e) => setNewProject({ ...newProject, notes: e.target.value })} placeholder="DETALHES DO PROJETO..." />
              </div>
              <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white py-5 font-black uppercase text-xs tracking-[0.2em] shadow-2xl transition-all active:scale-95">
                Registrar Obra
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
