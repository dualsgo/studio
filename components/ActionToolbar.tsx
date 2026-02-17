import React from 'react';
import { Icon } from './Icon';

interface ActionToolbarProps {
  onExportExcel: () => void;
  onExportPDF: () => void;
  openConfirmation: (options: any) => void;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({ onExportExcel, onExportPDF, openConfirmation }) => {
  
  const handleExportExcel = () => {
    openConfirmation({
        title: "Exportar para Excel",
        message: "Deseja baixar o relatório completo da escala em formato CSV compatível com Excel?",
        type: 'info',
        confirmText: 'Baixar',
        onConfirm: onExportExcel
    });
  };

  const handleExportPDF = () => {
    // PDF (Print) usually doesn't need a confirmation if it just opens the print dialog, 
    // but consistent UI suggests a modal might be nice to explain what to do (e.g. "Select Landscape").
    openConfirmation({
        title: "Gerar PDF",
        message: "O sistema irá preparar a visualização de impressão.\n\nRecomendado: Selecione 'Paisagem' (Landscape) e 'A4' nas configurações da impressora.",
        type: 'info',
        confirmText: 'Visualizar Impressão',
        onConfirm: onExportPDF
    });
  };

  const handleBackup = () => {
      openConfirmation({
          title: "Backup em Nuvem",
          message: "Esta funcionalidade requer a integração com Backend (Fase 2).\n\nAtualmente os dados são salvos apenas localmente durante a sessão.",
          type: 'warning',
          isAlert: true
      });
  };

  return (
    <div className="flex flex-wrap items-center gap-4 mb-8 animate-fade-in no-print">
      <div className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl shadow-md">
        <Icon name="offline_bolt" fill className="text-orange-400" />
        <span className="text-[11px] font-extrabold uppercase tracking-widest">Painel de Ações</span>
      </div>
      
      <button 
        onClick={handleExportExcel}
        className="flex items-center gap-3 px-5 py-3 rounded-xl border border-slate-200 transition-all bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm group"
      >
        <div className="w-8 h-8 bg-green-50 text-green-600 rounded-lg flex items-center justify-center border border-transparent group-hover:border-current/10">
          <Icon name="table_view" className="text-lg" />
        </div>
        <span className="text-sm font-bold text-slate-700">Exportar Excel</span>
      </button>

      <button 
        onClick={handleExportPDF}
        className="flex items-center gap-3 px-5 py-3 rounded-xl border border-slate-200 transition-all bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm group"
      >
        <div className="w-8 h-8 bg-red-50 text-red-600 rounded-lg flex items-center justify-center border border-transparent group-hover:border-current/10">
          <Icon name="picture_as_pdf" className="text-lg" />
        </div>
        <span className="text-sm font-bold text-slate-700">Gerar PDF</span>
      </button>

      <button 
        onClick={handleBackup}
        className="flex items-center gap-3 px-5 py-3 rounded-xl border border-slate-200 transition-all bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm group"
      >
        <div className="w-8 h-8 bg-sky-50 text-sky-600 rounded-lg flex items-center justify-center border border-transparent group-hover:border-current/10">
          <Icon name="cloud_upload" className="text-lg" />
        </div>
        <span className="text-sm font-bold text-slate-700">Backup Nuvem</span>
      </button>

      <div className="hidden xl:flex items-center gap-3 ml-auto px-6 py-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
        <Icon name="info" className="text-orange-500 text-sm" />
        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">Escalas de domingos são rotativas automaticamente.</p>
      </div>
    </div>
  );
};
