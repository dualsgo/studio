import React from 'react';
import { Icon } from './Icon';
import { Employee, MonthYear } from '../types';

interface DaySummaryCardProps {
  employees: Employee[];
  selectedDayIdx: number;
  currentMY: MonthYear;
}

export const DaySummaryCard: React.FC<DaySummaryCardProps> = ({ employees, selectedDayIdx, currentMY }) => {

  const monthKey = `${currentMY.year}-${currentMY.month.toString().padStart(2, '0')}`;

  const workingEmployees = employees.filter(emp => (emp.shifts[monthKey] || [])[selectedDayIdx] === 'T');
  const offEmployees = employees.filter(emp => (emp.shifts[monthKey] || [])[selectedDayIdx] !== 'T');

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Card de Presença */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start gap-5">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
          <Icon name="groups" className="text-3xl text-green-700" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-500 uppercase">Presentes no Dia</p>
          <p className="text-4xl font-extrabold text-slate-900">{workingEmployees.length}</p>
        </div>
      </div>

      {/* Card de Folga */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start gap-5">
        <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center">
          <Icon name="event_busy" className="text-3xl text-orange-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-500 uppercase">Folgas e Férias</p>
          <p className="text-4xl font-extrabold text-slate-900">{offEmployees.length}</p>
        </div>
      </div>
      
      {/* Card de Alertas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start gap-5">
        <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center">
          <Icon name="notification_important" className="text-3xl text-yellow-700" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-500 uppercase">Alertas da Escala</p>
          <p className="text-4xl font-extrabold text-slate-900">0</p>
        </div>
      </div>
    </div>
  );
};
