import React, { useState } from 'react';
import { Employee } from '../types';
import { Icon } from './Icon';
import { SHIFT_HOURS, SHIFT_DEFINITIONS } from '../constants';

interface TeamViewProps {
  employees: Employee[];
  onUpdateEmployee: (empId: string, data: Partial<Employee>) => void;
  onDeleteEmployee: (empId: string) => void;
  onAddEmployee: (name: string, isYoung: boolean, courseDay: string, shiftName: string) => void;
  openConfirmation: (options: any) => void;
}

export const TeamView: React.FC<TeamViewProps> = ({ employees, onUpdateEmployee, onDeleteEmployee, onAddEmployee, openConfirmation }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [isYoung, setIsYoung] = useState(false);
  const [courseDay, setCourseDay] = useState('Segunda-feira');
  const [shiftName, setShiftName] = useState('Abertura');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      openConfirmation({
        title: "Confirmar Cadastro",
        message: `Deseja cadastrar o colaborador ${newName}?`,
        type: 'info',
        onConfirm: () => {
             onAddEmployee(newName, isYoung, courseDay, shiftName);
             setNewName('');
             setIsYoung(false);
             setShiftName('Abertura');
             setShowAddModal(false);
        }
      });
    }
  };

  const handleUpdateShiftName = (emp: Employee, newShiftName: string) => {
    openConfirmation({
        title: "Alterar Turno Padrão",
        message: `Deseja alterar o turno padrão de ${emp.name} para ${newShiftName}? Isso atualizará o horário padrão também.`,
        onConfirm: () => onUpdateEmployee(emp.id, { shiftName: newShiftName })
    });
  };

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
           <h3 className="text-2xl font-extrabold text-slate-900">Equipe Operacional</h3>
           <p className="text-sm font-bold text-slate-400">Adicione, remova ou edite dados contratuais dos colaboradores.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-orange-500 text-white px-6 py-2.5 rounded-xl font-extrabold text-sm shadow-md hover:bg-orange-600 transition-all flex items-center gap-2"
        >
          <Icon name="person_add" /> Novo Colaborador
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h4 className="text-xl font-extrabold text-slate-900 mb-6">Cadastrar Colaborador</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Nome Completo</label>
                <input autoFocus type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Nome do colaborador" />
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <input type="checkbox" id="isYoung" checked={isYoung} onChange={(e) => setIsYoung(e.target.checked)} className="w-5 h-5 accent-orange-500 rounded" />
                <label htmlFor="isYoung" className="text-sm font-extrabold text-slate-700">Jovem Aprendiz</label>
              </div>

              {isYoung && (
                <div className="animate-fade-in">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Dia de Curso</label>
                    <select value={courseDay} onChange={(e) => setCourseDay(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none">
                        {['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'].map(d => <option key={d}>{d}</option>)}
                    </select>
                </div>
              )}

              <div>
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Turno</label>
                  <select value={shiftName} onChange={(e) => setShiftName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none">
                      {SHIFT_DEFINITIONS.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
                  </select>
              </div>

              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-6 py-3 border border-slate-200 rounded-xl font-extrabold text-slate-400 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl font-extrabold shadow-lg hover:bg-orange-600 transition-all">Cadastrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {employees.map(emp => (
          <div key={emp.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-6">
              <div className="flex flex-col">
                  <h4 className="font-extrabold text-lg text-slate-900 leading-tight uppercase">{emp.name}</h4>
                  {emp.isYoungApprentice ? (
                    <span className="text-[9px] font-extrabold text-teal-600 uppercase tracking-widest mt-1">Jovem Aprendiz (Curso: {emp.courseDay})</span>
                  ) : (
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">Colaborador CLT</span>
                  )}
              </div>
              <button 
                onClick={() => openConfirmation({
                    title: "Excluir Colaborador",
                    message: `Deseja excluir ${emp.name} permanentemente?`,
                    type: 'danger',
                    confirmText: 'Excluir',
                    onConfirm: () => onDeleteEmployee(emp.id)
                })}
                className="w-10 h-10 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center border border-red-100"
              >
                <Icon name="delete" className="text-lg" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Turno Padrão</label>
                <select 
                    value={emp.shiftName} 
                    onChange={(e) => handleUpdateShiftName(emp, e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold p-3 outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {SHIFT_DEFINITIONS.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Início Férias</label>
                  <input type="date" value={emp.vacationStart || ''} onChange={(e) => onUpdateEmployee(emp.id, { vacationStart: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-lg text-[11px] font-bold p-2.5 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Fim Férias</label>
                  <input type="date" value={emp.vacationEnd || ''} onChange={(e) => onUpdateEmployee(emp.id, { vacationEnd: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-lg text-[11px] font-bold p-2.5 outline-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Folga Fixa Sugerida</label>
                <select value={emp.preferredDayOff} onChange={(e) => onUpdateEmployee(emp.id, { preferredDayOff: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold p-3 outline-none focus:ring-2 focus:ring-orange-500">
                  {['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
