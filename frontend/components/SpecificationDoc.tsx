
import React, { useState } from 'react';

interface SpecificationDocProps {
  orderTypes: string[];
  onUpdateOrderTypes: (types: string[]) => void;
}

export const SpecificationDoc: React.FC<SpecificationDocProps> = ({ orderTypes, onUpdateOrderTypes }) => {
  const [newType, setNewType] = useState('');

  const addType = () => {
    if (newType.trim() && !orderTypes.includes(newType.toUpperCase())) {
      const normalizedType = newType.toUpperCase();
      if (!confirm(`Adicionar o tipo de pedido "${normalizedType}"?`)) return;
      onUpdateOrderTypes([...orderTypes, normalizedType]);
      setNewType('');
    }
  };

  const removeType = (t: string) => {
    if (!confirm(`Remover o tipo de pedido "${t}"?`)) return;
    onUpdateOrderTypes(orderTypes.filter(item => item !== t));
  };

  return (
    <div className="max-w-5xl mx-auto p-10 space-y-16 animate-in fade-in duration-500">
      <section className="bg-white p-12 border border-slate-200 shadow-2xl space-y-10">
        <div className="border-b border-slate-100 pb-8">
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">Configurações Globais</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em] mt-3">Painel administrativo de parametrização do sistema.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          <div className="space-y-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-3">
              <i className="fas fa-tags text-blue-600"></i> Tipos de Pedidos
            </h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">Defina as categorias disponíveis para novos pedidos de obra. Essas opções aparecerão para todos os colaboradores do campo.</p>
            
            <div className="flex gap-2">
              <input 
                value={newType}
                onChange={e => setNewType(e.target.value)}
                placeholder="EX: MATERIAL ELÉTRICO"
                className="flex-1 bg-slate-50 border border-slate-200 px-4 py-3 font-black text-xs uppercase outline-none focus:border-blue-500"
              />
              <button onClick={addType} className="bg-slate-900 text-white px-6 py-3 font-black uppercase text-xs shadow-xl"><i className="fas fa-plus"></i></button>
            </div>

            <div className="flex flex-wrap gap-2 pt-4">
              {orderTypes.map(t => (
                <div key={t} className="bg-slate-100 border border-slate-200 px-4 py-2 flex items-center gap-3 group">
                  <span className="text-[10px] font-black text-slate-600 uppercase">{t}</span>
                  <button onClick={() => removeType(t)} className="text-slate-300 hover:text-rose-500 transition-colors"><i className="fas fa-times-circle"></i></button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-3">
              <i className="fas fa-info-circle text-blue-600"></i> Manual da Central
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-4">
                <span className="w-8 h-8 bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs shrink-0">1</span>
                <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase">Pedidos concluídos com "Incorpar Custo" geram lançamentos automáticos no orçamento da obra.</p>
              </li>
              <li className="flex gap-4">
                <span className="w-8 h-8 bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs shrink-0">2</span>
                <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase">O link gerado nas obras é temporário e expira ao fechar a sessão por segurança.</p>
              </li>
              <li className="flex gap-4">
                <span className="w-8 h-8 bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs shrink-0">3</span>
                <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase">Sincronize os dados sempre que criar novos usuarios para garantir acesso imediato em outros computadores.</p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 p-12 text-white shadow-2xl">
        <h3 className="text-2xl font-black uppercase tracking-tighter mb-8">Arquitetura de Dados v3.5</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <p className="text-blue-400 font-black text-[10px] uppercase mb-2">Processamento IA</p>
            <p className="text-xs font-medium text-slate-400 leading-relaxed uppercase">Gemini 3 Flash-Preview integrado para extração multilingue e reconhecimento de tabelas complexas.</p>
          </div>
          <div>
            <p className="text-blue-400 font-black text-[10px] uppercase mb-2">Infraestrutura</p>
            <p className="text-xs font-medium text-slate-400 leading-relaxed uppercase">Persistencia via API backend e MySQL, com estrategia de backup e recuperacao.</p>
          </div>
          <div>
            <p className="text-blue-400 font-black text-[10px] uppercase mb-2">Segurança</p>
            <p className="text-xs font-medium text-slate-400 leading-relaxed uppercase">Criptografia AES-256 em repouso e TLS 1.3 para tráfego de documentos técnicos.</p>
          </div>
        </div>
      </section>
    </div>
  );
};




