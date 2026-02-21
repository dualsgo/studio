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
  isAlert?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirmar', 
  cancelText = 'Cancelar', 
  type = 'info', 
  isAlert = false
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose(); // Close modal on confirm
  };

  const colors = {
    danger: { bg: 'bg-red-50', text: 'text-red-800', icon: 'error', confirmBg: 'bg-red-600 hover:bg-red-700' },
    warning: { bg: 'bg-yellow-50', text: 'text-yellow-800', icon: 'warning', confirmBg: 'bg-yellow-500 hover:bg-yellow-600' },
    info: { bg: 'bg-sky-50', text: 'text-sky-800', icon: 'info', confirmBg: 'bg-sky-600 hover:bg-sky-700' },
    success: { bg: 'bg-green-50', text: 'text-green-800', icon: 'check_circle', confirmBg: 'bg-green-600 hover:bg-green-700' }
  };

  const color = colors[type];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in no-print">
      <div className={`rounded-2xl p-8 max-w-sm w-full shadow-2xl ${color.bg}`}>
        <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center ${color.confirmBg.split(' ')[0].replace('bg-', 'bg-opacity-10')}`}>
                <Icon name={color.icon} className={`${color.text} text-2xl`} />
            </div>
            <div>
                <h3 className={`text-lg font-extrabold ${color.text}`}>{title}</h3>
                <p className={`mt-1 text-sm font-medium ${color.text} opacity-80`}>{message}</p>
            </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
            {!isAlert && (
              <button 
                onClick={onClose} 
                className="px-6 py-2.5 rounded-lg text-sm font-bold bg-black/5 hover:bg-black/10 text-slate-700 transition-colors"
              >
                {cancelText}
              </button>
            )}
            <button 
              onClick={handleConfirm} 
              className={`px-6 py-2.5 rounded-lg text-sm font-bold text-white shadow-lg transition-all ${color.confirmBg}`}
            >
              {confirmText}
            </button>
        </div>
      </div>
    </div>
  );
};
