
import React, { memo } from 'react';
import { Employee, ShiftType } from '../types';

export interface DayInfo {
  num: string;
  weekday: string;
  isSunday: boolean;
  isHoliday: boolean;
  isPast: boolean;
  dateStr: string;
  originalIdx: number;
}

interface ShiftRowProps {
  emp: Employee;
  filteredDays: DayInfo[];
  selectedDayIdx: number;
  isSelectedDayLocked: boolean;
  monthKey: string;
  availableHours: string[];
  isEditable: boolean;
  onUpdateShift: (empId: string, dayIdx: number, newShift: ShiftType) => void;
  onUpdateEmployeeDailyHour: (empId: string, dayIdx: number, newHour: string) => void;
  onSelectDay: (idx: number) => void;
}

const ShiftRowComponent: React.FC<ShiftRowProps> = ({
  emp,
  filteredDays,
  selectedDayIdx,
  isSelectedDayLocked,
  monthKey,
  availableHours,
  isEditable,
  onUpdateShift,
  onUpdateEmployeeDailyHour,
  onSelectDay
}) => {

  const getDayShift = (day: DayInfo) => {
    if (emp.vacationStart && emp.vacationEnd) {
      if (day.dateStr >= emp.vacationStart && day.dateStr <= emp.vacationEnd) return 'FE';
    }
    const monthShifts = emp.shifts[monthKey] || [];
    return monthShifts[day.originalIdx] || 'F';
  };

  const getDayHour = (dayIdx: number) => {
    const monthDailyHours = emp.dailyHours[monthKey] || [];
    return monthDailyHours[dayIdx] || emp.workPeriod;
  };

  const handleCellClick = (day: DayInfo) => {
    if (day.isPast) {
        alert("Dias anteriores não podem ser editados para preservar o histórico.");
        return;
    }
    if (!isEditable) {
        onSelectDay(day.originalIdx);
        return;
    }
    
    // Check if shift is FE (vacation) - derived from getDayShift logic
    // We need to check if vacation covers this day.
    const currentShift = getDayShift(day);
    if (currentShift === 'FE') return;

    const current = currentShift;
    const cycle: Record<ShiftType, ShiftType> = { 'T': 'F', 'F': 'FF', 'FF': 'C', 'C': 'T', 'FE': 'FE' };
    const nextShift = cycle[current as ShiftType] || 'T';

    if (confirm(`Deseja alterar o turno de ${emp.name} para "${nextShift}"?`)) {
      onUpdateShift(emp.id, day.originalIdx, nextShift);
      onSelectDay(day.originalIdx);
    }
  };

  const getShiftTextColor = (hour: string) => {
    if (hour.includes('10h')) return 'text-orange-600'; 
    if (hour.includes('12h')) return 'text-sky-600'; 
    if (hour.includes('13h40')) return 'text-indigo-600'; 
    return 'text-slate-900';
  };

  return (
    <tr className="group hover:bg-slate-50/50 transition-colors">
      <td className="sticky-col p-4 border-r border-slate-100 group-hover:bg-slate-50">
        <div className="flex flex-col">
          <span className={`font-extrabold text-xs uppercase tracking-tight ${getShiftTextColor(getDayHour(selectedDayIdx))}`}>
            {emp.name}
          </span>
          {emp.isYoungApprentice && <span className="text-[8px] font-extrabold text-teal-600 uppercase tracking-widest mt-0.5">Jovem Aprendiz</span>}
        </div>
      </td>
      <td className="p-3 border-r border-slate-100 bg-slate-50/30">
        <select 
          value={getDayHour(selectedDayIdx)}
          disabled={isSelectedDayLocked}
          onChange={(e) => onUpdateEmployeeDailyHour(emp.id, selectedDayIdx, e.target.value)}
          className={`bg-transparent w-full text-[11px] font-extrabold focus:ring-0 border-none p-0 cursor-pointer outline-none transition-colors ${getShiftTextColor(getDayHour(selectedDayIdx))} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {availableHours.map(h => <option key={h} value={h}>{h}</option>)}
          {!availableHours.includes(getDayHour(selectedDayIdx)) && <option value={getDayHour(selectedDayIdx)}>{getDayHour(selectedDayIdx)}</option>}
        </select>
      </td>
      {filteredDays.map((day) => {
        const shift = getDayShift(day);
        const isLocked = day.isPast;
        
        // selectedDayIdx is global index. day.originalIdx is global index.
        const isSelected = selectedDayIdx === day.originalIdx;
        const isHighlight = day.isSunday || day.isHoliday;

        return (
          <td 
            key={day.num} 
            className={`p-2 text-center relative border-r border-slate-100/50 ${isSelected ? 'bg-orange-50/30' : ''} ${isHighlight ? 'bg-orange-50/10' : ''}`}
          >
            {isHighlight && <div className="absolute inset-y-0 left-0 right-0 border-x-2 border-orange-400/10 pointer-events-none"></div>}
            <button 
              disabled={isLocked && isEditable}
              onClick={() => handleCellClick(day)}
              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-[10px] font-extrabold shadow-sm transition-all ${
                isEditable && !isLocked && shift !== 'FE' ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-default'
              } ${isLocked ? 'opacity-90 grayscale-[0.3]' : ''} ${
                shift === 'T' ? 'bg-sky-600' : 
                shift === 'F' ? 'bg-orange-500' : 
                shift === 'FF' ? 'bg-red-500' : 
                shift === 'C' ? 'bg-teal-500' : 'bg-indigo-600'
              }`}
            >
              {shift}
            </button>
          </td>
        );
      })}
    </tr>
  );
};

export const ShiftRow = memo(ShiftRowComponent);
