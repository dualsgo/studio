
import React from 'react';
import { Icon } from './Icon';
import { MonthYear } from '../types';

interface HeaderProps {
  currentView: 'dashboard' | 'team';
  onViewChange: (view: 'dashboard' | 'team') => void;
  currentMY: MonthYear;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange, currentMY }) => {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:px-10 sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-12">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onViewChange('dashboard')}>
          <div className="w-9 h-9 text-orange-500 transition-transform group-hover:scale-110">
             <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path clipRule="evenodd" d="M24 18.4228L42 11.475V34.3663C42 34.7796 41.7457 35.1504 41.3601 35.2992L24 42V18.4228Z" fill="currentColor" fillRule="evenodd"></path>
                <path clipRule="evenodd" d="M24 8.18819L33.4123 11.574L24 15.2071L14.5877 11.574L24 8.18819ZM9 15.8487L21 20.4805V37.6263L9 32.9945V15.8487ZM27 37.6263V20.4805L39 15.8487V32.9945L27 37.6263ZM25.354 2.29885C24.4788 1.98402 23.5212 1.98402 22.646 2.29885L4.98454 8.65208C3.7939 9.08038 3 10.2097 3 11.475V34.3663C3 36.0196 4.01719 37.5026 5.55962 38.098L22.9197 44.7987C23.6149 45.0671 24.3851 45.0671 25.0803 44.7987L42.4404 38.098C43.9828 37.5026 45 36.0196 45 34.3663V11.475C45 10.2097 44.2061 9.08038 43.0155 8.65208L25.354 2.29885Z" fill="currentColor" fillRule="evenodd"></path>
            </svg>
          </div>
          <h2 className="text-slate-900 text-xl font-extrabold leading-tight tracking-tighter">RI HAPPY</h2>
        </div>
        <nav className="hidden lg:flex items-center gap-10">
          <button 
            onClick={() => onViewChange('dashboard')}
            className={`text-xs font-extrabold uppercase tracking-widest transition-all ${currentView === 'dashboard' ? 'text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Escalas Mensais
          </button>
          <button 
            onClick={() => onViewChange('team')}
            className={`text-xs font-extrabold uppercase tracking-widest transition-all ${currentView === 'team' ? 'text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Gestão Equipe
          </button>
        </nav>
      </div>
      
      <div className="flex items-center gap-5">
        <div className="hidden sm:flex items-center bg-slate-50 rounded-lg px-4 py-2 border border-slate-200 gap-3">
          <Icon name="calendar_today" className="text-orange-600 text-sm" />
          <span className="text-xs font-extrabold text-slate-700 uppercase">{months[currentMY.month]} {currentMY.year}</span>
        </div>
        <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white font-extrabold text-xs shadow-md uppercase tracking-tighter">LOJA</div>
      </div>
    </header>
  );
};
