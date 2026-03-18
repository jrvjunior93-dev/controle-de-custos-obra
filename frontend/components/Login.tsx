import React, { useState } from 'react';
import { User } from '../types';
import { dbService } from '../apiClient';

interface LoginProps {
  onLogin: (u: User, token: string) => void;
  isLoading?: boolean;
}

export const Login: React.FC<LoginProps> = ({ onLogin, isLoading }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    try {
      const { token, user } = await dbService.login(normalizedEmail, normalizedPassword);
      onLogin(user, token);
    } catch {
      setError('Credenciais inválidas. Verifique e-mail e senha.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white shadow-2xl overflow-hidden border border-slate-800">
        <div className="bg-slate-900 p-10 text-center border-b border-slate-800">
          <div className="bg-blue-600 w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-xl">
            <i className="fas fa-hard-hat text-white text-3xl"></i>
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">CSC - BRAPE</h2>
          <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.3em] mt-2 leading-none">Controle Técnico de Custos</p>

          {isLoading && (
            <div className="mt-4 flex items-center justify-center gap-2 text-[9px] font-black text-emerald-400 uppercase animate-pulse">
              <i className="fas fa-spinner fa-spin"></i> Carregando...
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-6">
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-4 text-rose-600 text-[10px] font-black uppercase tracking-wider text-center leading-relaxed">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail de acesso</label>
            <input
              required
              type="email"
              className="w-full bg-slate-50 border border-slate-200 px-5 py-4 font-black text-slate-800 text-sm outline-none focus:border-blue-500 transition-colors"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha</label>
            <div className="relative">
              <input
                required
                type={showPassword ? 'text' : 'password'}
                className="w-full bg-slate-50 border border-slate-200 px-5 py-4 pr-14 font-black text-slate-800 text-sm outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 px-4 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 hover:bg-black text-white py-5 font-black uppercase text-xs tracking-[0.2em] shadow-2xl transition-all active:scale-95 disabled:opacity-50"
          >
            {isLoading ? 'Aguarde...' : 'Entrar no sistema'}
          </button>
        </form>

      </div>
    </div>
  );
};
