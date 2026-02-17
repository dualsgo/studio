
import React from 'react';
import { Icon } from './Icon';

export const ActionToolbar: React.FC = () => {
  const actions = [
    { label: 'Exportar Excel', icon: 'table_view', color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Gerar PDF', icon: 'picture_as_pdf', color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Backup Nuvem', icon: 'cloud_upload', color: 'text-sky-600', bg: 'bg-sky-50' }
  ];

  return (
    <div className="flex flex-wrap items-center gap-4 mb-8 animate-fade-in">
      <div className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl shadow-md">
        <Icon name="offline_bolt" fill className="text-orange-400" />
        <span className="text-[11px] font-extrabold uppercase tracking-widest">Painel de Ações</span>
      </div>
      
      {actions.map((action, idx) => (
        <button 
          key={idx}
          onClick={() => confirm(`Deseja iniciar a operação: ${action.label}?`)}
          className={`flex items-center gap-3 px-5 py-3 rounded-xl border border-slate-200 transition-all bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm group`}
        >
          <div className={`w-8 h-8 ${action.bg} ${action.color} rounded-lg flex items-center justify-center border border-transparent group-hover:border-current/10`}>
            <Icon name={action.icon} className="text-lg" />
          </div>
          <span className="text-sm font-bold text-slate-700">{action.label}</span>
        </button>
      ))}

      <div className="hidden xl:flex items-center gap-3 ml-auto px-6 py-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
        <Icon name="info" className="text-orange-500 text-sm" />
        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">Escalas de domingos são rotativas automaticamente.</p>
      </div>
    </div>
  );
};
