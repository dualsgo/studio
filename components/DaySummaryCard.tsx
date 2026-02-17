
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
  
  const getCounts = () => {
    const counts = {
      abertura: 0,
      intermediario: 0,
      fechamento: 0,
      folga: 0,
      curso: 0,
      ferias: 0,
      total: 0
    };

    employees.forEach(e => {
      const mShifts = e.shifts[monthKey] || [];
      const shift = mShifts[selectedDayIdx];
      const hForDay = (e.dailyHours[monthKey] || [])[selectedDayIdx] || e.workPeriod;

      if (shift === 'T' || shift === 'FF') {
        counts.total++;
        if (hForDay.includes('10h')) counts.abertura++;
        else if (hForDay.includes('12h')) counts.intermediario++;
        else if (hForDay.includes('13h40')) counts.fechamento++;
      } else if (shift === 'F') counts.folga++;
      else if (shift === 'C') counts.curso++;
      else if (shift === 'FE') counts.ferias++;
    });

    return counts;
  };

  const c = getCounts();

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="flex items-center gap-5 md:border-r border-slate-100 pr-8">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
            <Icon name="groups" className="text-3xl" fill />
          </div>
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Equipe Presente</p>
            <h3 className="text-3xl font-extrabold text-slate-900">{c.total}<span className="text-lg text-slate-300 ml-1 font-medium">/{employees.length}</span></h3>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1 text-orange-600">
              <Icon name="wb_twilight" className="text-sm" />
              <span className="text-[10px] font-extrabold uppercase tracking-tight">Abertura</span>
            </div>
            <p className="text-xl font-extrabold text-slate-900">{c.abertura} <span className="text-[10px] text-slate-400 font-bold uppercase">Colabs.</span></p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1 text-sky-600">
              <Icon name="sunny" className="text-sm" />
              <span className="text-[10px] font-extrabold uppercase tracking-tight">Intermediário</span>
            </div>
            <p className="text-xl font-extrabold text-slate-900">{c.intermediario} <span className="text-[10px] text-slate-400 font-bold uppercase">Colabs.</span></p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1 text-indigo-600">
              <Icon name="nightlight" className="text-sm" />
              <span className="text-[10px] font-extrabold uppercase tracking-tight">Fechamento</span>
            </div>
            <p className="text-xl font-extrabold text-slate-900">{c.fechamento} <span className="text-[10px] text-slate-400 font-bold uppercase">Colabs.</span></p>
          </div>
        </div>

        <div className="flex items-center gap-8 pl-0 md:pl-8 md:border-l border-slate-100">
          <div className="text-center group">
            <p className="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-tighter">Folgas</p>
            <div className="w-10 h-10 rounded-full bg-orange-100/50 flex items-center justify-center mx-auto text-orange-700 font-extrabold text-sm border border-orange-200">{c.folga}</div>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-tighter">Curso</p>
            <div className="w-10 h-10 rounded-full bg-teal-100/50 flex items-center justify-center mx-auto text-teal-700 font-extrabold text-sm border border-teal-200">{c.curso}</div>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-extrabold text-slate-400 uppercase mb-2 tracking-tighter">Férias</p>
            <div className="w-10 h-10 rounded-full bg-red-100/50 flex items-center justify-center mx-auto text-red-700 font-extrabold text-sm border border-red-200">{c.ferias}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
