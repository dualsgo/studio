import React, { useState, useMemo } from 'react';
import { Employee, ShiftType, MonthYear } from '../types';
import { Icon } from './Icon';
import { SHIFT_HOURS } from '../constants';
import { ShiftRow, DayInfo } from './ShiftRow';

interface ShiftGridProps {
  employees: Employee[];
  currentMY: MonthYear;
  selectedDayIdx: number;
  today: Date;
  onSelectDay: (idx: number) => void;
  onUpdateShift: (empId: string, dayIdx: number, newShift: ShiftType) => void;
  onUpdateEmployeeDailyHour: (empId: string, dayIdx: number, newHour: string) => void;
  onUpdateEmployeeDailyShiftName: (empId: string, dayIdx: number, newShiftName: string) => void;
  onShareWhatsApp: (dayIdx: number) => void;
  onGenerateNextMonth: () => void;
  onResetMonth: () => void;
  onNextMonth: () => void;
  onPrevMonth: () => void;
  openConfirmation: (options: any) => void;
}

export const ShiftGrid: React.FC<ShiftGridProps> = ({ 
  employees, 
  currentMY,
  selectedDayIdx,
  today,
  onSelectDay,
  onUpdateShift, 
  onUpdateEmployeeDailyHour,
  onUpdateEmployeeDailyShiftName,
  onShareWhatsApp, 
  onGenerateNextMonth,
  onResetMonth,
  onNextMonth,
  onPrevMonth,
  openConfirmation
}) => {
  const [isEditable, setIsEditable] = useState(false);
  const [filter, setFilter] = useState<'all' | 'sunday' | 'holiday'>('all');

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const daysInMonth = useMemo(() => {
    const date = new Date(currentMY.year, currentMY.month + 1, 0);
    return date.getDate();
  }, [currentMY]);

  const days = useMemo(() => {
    const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    return Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(currentMY.year, currentMY.month, i + 1);
      const isPast = (currentMY.year < currentYear) || 
                     (currentMY.year === currentYear && currentMY.month < currentMonth) ||
                     (currentMY.year === currentYear && currentMY.month === currentMonth && (i + 1) < currentDay);

      return {
        num: (i + 1).toString().padStart(2, '0'),
        weekday: weekdays[date.getDay()],
        isSunday: date.getDay() === 0,
        isHoliday: false, // In a real app, check against a holiday list
        isPast,
        dateStr: `${currentMY.year}-${(currentMY.month + 1).toString().padStart(2, '0')}-${(i + 1).toString().padStart(2, '0')}`
      };
    });
  }, [currentMY, daysInMonth, today]);

  const filteredDays: DayInfo[] = useMemo(() => {
    const mapped = days.map((d, i) => ({ ...d, originalIdx: i }));
    if (filter === 'sunday') return mapped.filter(d => d.isSunday);
    if (filter === 'holiday') return mapped.filter(d => d.isHoliday);
    return mapped;
  }, [days, filter]);

  const monthKey = `${currentMY.year}-${currentMY.month.toString().padStart(2, '0')}`;

  const currentDayType = days[selectedDayIdx] ? (days[selectedDayIdx].isSunday ? 'SUNDAY' : (days[selectedDayIdx].isHoliday ? 'HOLIDAY' : 'WEEKDAY')) : 'WEEKDAY';
  const availableHours = SHIFT_HOURS[currentDayType];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col w-full animate-fade-in">
      {/* Top Nav */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onPrevMonth} className="p-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all text-slate-600"><Icon name="chevron_left" /></button>
          <div className="bg-white px-6 py-2 rounded-lg border border-slate-200 shadow-sm">
            <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-tight">{months[currentMY.month]} {currentMY.year}</h3>
          </div>
          <button onClick={onNextMonth} className="p-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all text-slate-600"><Icon name="chevron_right" /></button>
        </div>
        
        <div className="flex items-center gap-2">
            <button onClick={onResetMonth} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-extrabold hover:bg-slate-50 hover:text-slate-900 transition-all">
                <Icon name="history" className="text-sm" /> Limpar Mês
            </button>
            <button onClick={onGenerateNextMonth} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-extrabold hover:bg-orange-600 shadow-sm transition-all">
                <Icon name="auto_mode" className="text-sm" /> Gerar Próximo Mês
            </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between bg-white sticky top-0 z-30 gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-md text-[11px] font-extrabold transition-all ${filter === 'all' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}>Mês Inteiro</button>
            <button onClick={() => setFilter('sunday')} className={`px-4 py-1.5 rounded-md text-[11px] font-extrabold transition-all ${filter === 'sunday' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}>Somente Domingos</button>
          </div>
          
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 p-1 rounded-lg">
             <select 
               value={selectedDayIdx} 
               onChange={(e) => onSelectDay(parseInt(e.target.value))}
               className="bg-transparent text-[11px] font-extrabold text-green-700 focus:ring-0 border-none py-1 pl-2 outline-none"
             >
               {days.map((d, i) => <option key={i} value={i}>Dia {d.num} ({d.weekday})</option>)}
             </select>
             <button onClick={() => onShareWhatsApp(selectedDayIdx)} className="px-4 py-1.5 bg-green-600 text-white rounded-md text-[11px] font-extrabold hover:bg-green-700 transition-all flex items-center gap-2">
               <Icon name="send" className="text-[14px]" /> Enviar WhatsApp
             </button>
          </div>
        </div>

        <button onClick={() => setIsEditable(!isEditable)} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-extrabold transition-all border ${isEditable ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
          <Icon name={isEditable ? 'check_circle' : 'edit_square'} className="text-sm" />
          {isEditable ? 'Salvar Alterações' : 'Modo de Edição'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[1400px]">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-200">
              <th className="sticky-col p-4 border-r border-slate-100 min-w-[200px] shadow-none">Colaborador</th>
              <th className="p-4 border-r border-slate-100 min-w-[180px] bg-slate-50">Horário (Dia {days[selectedDayIdx]?.num})</th>
              {filteredDays.map((day) => (
                <th 
                  key={day.num} 
                  onClick={() => onSelectDay(day.originalIdx)} 
                  className={`p-3 text-center min-w-[62px] cursor-pointer transition-colors relative border-r border-slate-100/50 ${selectedDayIdx === day.originalIdx ? 'bg-orange-50' : ''} ${day.isSunday || day.isHoliday ? 'bg-orange-50/30' : ''}`}
                >
                  {(day.isSunday || day.isHoliday) && <div className="absolute inset-0 border-2 border-orange-400 pointer-events-none opacity-50"></div>}
                  <div className={`text-sm font-extrabold ${day.isSunday ? 'text-orange-600' : 'text-slate-900'}`}>{day.num}</div>
                  <div className="text-[9px] font-bold opacity-60">{day.weekday}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <ShiftRow 
                key={emp.id}
                emp={emp}
                filteredDays={filteredDays}
                selectedDayIdx={selectedDayIdx}
                isSelectedDayLocked={days[selectedDayIdx]?.isPast}
                monthKey={monthKey}
                availableHours={availableHours}
                isEditable={isEditable}
                onUpdateShift={onUpdateShift}
                onUpdateEmployeeDailyHour={onUpdateEmployeeDailyHour}
                onUpdateEmployeeDailyShiftName={onUpdateEmployeeDailyShiftName}
                onSelectDay={onSelectDay}
                openConfirmation={openConfirmation}
              />
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Footer Info */}
      <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex flex-wrap gap-6 items-center">
         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-sky-600"></div> <span className="text-[10px] font-extrabold text-slate-500 uppercase">Trabalho</span></div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-orange-500"></div> <span className="text-[10px] font-extrabold text-slate-500 uppercase">Folga</span></div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500"></div> <span className="text-[10px] font-extrabold text-slate-500 uppercase">Feriado</span></div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-teal-500"></div> <span className="text-[10px] font-extrabold text-slate-500 uppercase">Curso</span></div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-indigo-600"></div> <span className="text-[10px] font-extrabold text-slate-500 uppercase">Férias</span></div>
         <div className="ml-auto flex items-center gap-2 opacity-60">
            <Icon name="lock" className="text-xs" />
            <span className="text-[10px] font-bold text-slate-400">Dias passados estão bloqueados automaticamente</span>
         </div>
      </div>
    </div>
  );
};
