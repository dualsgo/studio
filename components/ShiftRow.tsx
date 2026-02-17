import React, { memo } from 'react';
import { Employee, ShiftType } from '../types';
import { SHIFT_DEFINITIONS, ROLES } from '../constants';

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
  onUpdateEmployeeDailyShiftName: (empId: string, dayIdx: number, newShiftName: string) => void;
  onUpdateEmployeeDailyRole?: (empId: string, dayIdx: number, newRole: string) => void;
  onSelectDay: (idx: number) => void;
  openConfirmation: (options: any) => void;
  checkInterstice?: (emp: Employee, dayIdx: number) => boolean;
  validateSunday2x1?: (emp: Employee, dayIdx: number) => boolean;
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
  onUpdateEmployeeDailyShiftName,
  onUpdateEmployeeDailyRole,
  onSelectDay,
  openConfirmation,
  checkInterstice,
  validateSunday2x1
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

  const getDayShiftName = (dayIdx: number) => {
    const monthDailyShiftNames = emp.dailyShiftNames?.[monthKey] || [];
    return monthDailyShiftNames[dayIdx] || emp.shiftName;
  };
  
  const getDayRole = (dayIdx: number) => {
    const monthDailyRoles = emp.dailyRoles?.[monthKey] || [];
    return monthDailyRoles[dayIdx] || 'Vendedor';
  };

  const handleCellClick = (day: DayInfo) => {
    if (day.isPast) {
        openConfirmation({
            title: "Ação Bloqueada",
            message: "Dias anteriores não podem ser editados para preservar o histórico.",
            isAlert: true,
            type: 'info'
        });
        return;
    }
    if (!isEditable) {
        onSelectDay(day.originalIdx);
        return;
    }
    
    const currentShift = getDayShift(day);
    if (currentShift === 'FE') return;

    const current = currentShift;
    const cycle: Record<ShiftType, ShiftType> = { 'T': 'F', 'F': 'FF', 'FF': 'C', 'C': 'T', 'FE': 'FE' };
    const nextShift = cycle[current as ShiftType] || 'T';

    openConfirmation({
        title: "Alterar Turno",
        message: `Deseja alterar o status de ${emp.name} para "${nextShift}" no dia ${day.num}?`,
        onConfirm: () => {
            onUpdateShift(emp.id, day.originalIdx, nextShift);
            onSelectDay(day.originalIdx);
        }
    });
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
        <div className="flex flex-col gap-1">
            {/* Shift Name Dropdown */}
            <select
                value={getDayShiftName(selectedDayIdx)}
                disabled={isSelectedDayLocked}
                onChange={(e) => onUpdateEmployeeDailyShiftName(emp.id, selectedDayIdx, e.target.value)}
                className="bg-transparent w-full text-[10px] uppercase font-extrabold text-slate-500 focus:ring-0 border-none p-0 cursor-pointer outline-none mb-1 disabled:opacity-50"
            >
                {SHIFT_DEFINITIONS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>

            {/* Hours Dropdown */}
            <select 
              value={getDayHour(selectedDayIdx)}
              disabled={isSelectedDayLocked}
              onChange={(e) => onUpdateEmployeeDailyHour(emp.id, selectedDayIdx, e.target.value)}
              className={`bg-transparent w-full text-[11px] font-extrabold focus:ring-0 border-none p-0 cursor-pointer outline-none transition-colors ${getShiftTextColor(getDayHour(selectedDayIdx))} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {availableHours.map(h => <option key={h} value={h}>{h}</option>)}
              {!availableHours.includes(getDayHour(selectedDayIdx)) && <option value={getDayHour(selectedDayIdx)}>{getDayHour(selectedDayIdx)}</option>}
            </select>
            
            {/* Role Dropdown (New) */}
            {onUpdateEmployeeDailyRole && (
                 <select
                    value={getDayRole(selectedDayIdx)}
                    disabled={isSelectedDayLocked}
                    onChange={(e) => onUpdateEmployeeDailyRole(emp.id, selectedDayIdx, e.target.value)}
                    className="bg-transparent w-full text-[9px] uppercase font-bold text-slate-400 focus:ring-0 border-none p-0 cursor-pointer outline-none mt-1 disabled:opacity-50"
                >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            )}
        </div>
      </td>
      {filteredDays.map((day) => {
        const shift = getDayShift(day);
        const isLocked = day.isPast;
        
        const isSelected = selectedDayIdx === day.originalIdx;
        const isHighlight = day.isSunday || day.isHoliday;

        // Validation Checks
        const isIntersticeViolation = checkInterstice ? !checkInterstice(emp, day.originalIdx) : false;
        const isSundayViolation = (day.isSunday && validateSunday2x1) ? !validateSunday2x1(emp, day.originalIdx) : false;

        return (
          <td 
            key={day.num} 
            className={`p-2 text-center relative border-r border-slate-100/50 ${isSelected ? 'bg-orange-50/30' : ''} ${isHighlight ? 'bg-orange-50/10' : ''}`}
          >
            {isHighlight && <div className="absolute inset-y-0 left-0 right-0 border-x-2 border-orange-400/10 pointer-events-none"></div>}
            
            {/* Visual Indicators for Violations */}
            {isIntersticeViolation && <div className="absolute inset-0 bg-yellow-300/30 animate-pulse pointer-events-none" title="Interstício < 11h"></div>}
            {isSundayViolation && <div className="absolute inset-0 border-2 border-red-500 pointer-events-none" title="Violação Regra Domingo (2x1)"></div>}

            <button 
              disabled={isLocked && isEditable}
              onClick={() => handleCellClick(day)}
              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-[10px] font-extrabold shadow-sm transition-all relative z-10 ${
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
