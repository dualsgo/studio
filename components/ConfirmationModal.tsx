import React from 'react';
import { Icon } from './Icon';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info' | 'success'; 
  isAlert?: boolean; // If true, only shows Confirm button (acting as OK)
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'warning',
  isAlert = false
}) => {
  if (!isOpen) return null;

  const colors = {
    danger: { bg: 'bg-red-50', text: 'text-red-600', button: 'bg-red-600 hover:bg-red-700', icon: 'report_problem' },
    warning: { bg: 'bg-orange-50', text: 'text-orange-600', button: 'bg-orange-500 hover:bg-orange-600', icon: 'warning' },
    info: { bg: 'bg-blue-50', text: 'text-blue-600', button: 'bg-blue-600 hover:bg-blue-700', icon: 'info' },
    success: { bg: 'bg-green-50', text: 'text-green-600', button: 'bg-green-600 hover:bg-green-700', icon: 'check_circle' }
  };

  const style = colors[type];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl transform transition-all scale-100">
        <div className="flex flex-col items-center text-center gap-4">
          <div className={`w-12 h-12 rounded-full ${style.bg} ${style.text} flex items-center justify-center mb-2`}>
            <Icon name={style.icon} className="text-2xl" />
          </div>
          
          <h3 className="text-lg font-extrabold text-slate-900 leading-tight">
            {title}
          </h3>
          
          <p className="text-sm font-medium text-slate-500 whitespace-pre-wrap">
            {message}
          </p>

          <div className="flex gap-3 w-full mt-4">
            {!isAlert && (
              <button 
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-extrabold hover:bg-slate-50 transition-all focus:ring-2 focus:ring-slate-100 outline-none"
              >
                {cancelText}
              </button>
            )}
            <button 
              onClick={() => { onConfirm(); if(isAlert) onClose(); }}
              className={`flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-extrabold shadow-lg transition-all focus:ring-2 focus:ring-offset-2 outline-none ${style.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
