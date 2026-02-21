import React, { memo } from 'react';
import { Employee, ShiftType } from '../types';
import { SHIFT_DEFINITIONS } from '../constants';

export interface DayInfo {
  num: string;
  weekday: string;
  isSunday: boolean;
  isHoliday: boolean;
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
  onSelectDay: (idx: number) => void;
  openConfirmation: (options: any) => void;
  checkInterstice?: (emp: Employee, dayIdx: number) => boolean;
  validateSunday2x1?: (emp: Employee, dayIdx: number) => boolean;
}

const ShiftCell: React.FC<{ shift: ShiftType, isSunday: boolean, isHoliday: boolean, hasConflict: boolean, hasWarning: boolean }> = ({ shift, isSunday, isHoliday, hasConflict, hasWarning }) => {
  const baseClasses = 'w-full h-10 flex items-center justify-center text-xs font-extrabold rounded-md transition-all';
  let colorClasses = 'bg-slate-100 text-slate-400';

  switch (shift) {
    case 'T': colorClasses = 'bg-sky-100 text-sky-700'; break;
    case 'F': colorClasses = 'bg-orange-100 text-orange-600'; break;
    case 'FF': colorClasses = 'bg-red-100 text-red-700'; break;
    case 'C': colorClasses = 'bg-teal-100 text-teal-700'; break;
    case 'FE': colorClasses = 'bg-indigo-100 text-indigo-700'; break;
  }
  
  if (hasConflict) colorClasses = 'bg-red-500 text-white animate-pulse';
  else if (hasWarning) colorClasses = 'bg-yellow-400 text-white';

  return <div className={`${baseClasses} ${colorClasses}`}>{shift}</div>;
};

export const ShiftRow: React.FC<ShiftRowProps> = memo(({
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
  onSelectDay,
  openConfirmation,
  checkInterstice,
  validateSunday2x1
}) => {

  const shiftForDay = (dayIdx: number) => (emp.shifts[monthKey] || [])[dayIdx] || 'F';
  const dailyHourForDay = (dayIdx: number) => (emp.dailyHours[monthKey] || [])[dayIdx] || emp.workPeriod;
  const dailyShiftNameForDay = (dayIdx: number) => (emp.dailyShiftNames?.[monthKey] || [])[dayIdx] || emp.shiftName;

  const handleShiftChange = (dayIdx: number, currentShift: ShiftType) => {
    if (!isEditable || isSelectedDayLocked) return;
    const shifts: ShiftType[] = ['T', 'F', 'FF', 'C', 'FE'];
    const nextIndex = (shifts.indexOf(currentShift) + 1) % shifts.length;
    onUpdateShift(emp.id, dayIdx, shifts[nextIndex]);
  };

  return (
    <tr className="hover:bg-slate-50 transition-colors duration-150">
      <td className="sticky-col p-2 border-r border-slate-100 min-w-[200px]">
        <div className="font-extrabold text-sm text-slate-800 truncate">{emp.name}</div>
        <div className="text-[10px] font-bold text-slate-400 uppercase">{emp.shiftName}</div>
      </td>
      
      {/* Details for Selected Day */}
      <td className="p-2 border-r border-slate-100 min-w-[180px]">
        {isEditable ? (
          <div className='flex flex-col gap-1'>
             <select 
              value={dailyShiftNameForDay(selectedDayIdx)}
              onChange={(e) => onUpdateEmployeeDailyShiftName(emp.id, selectedDayIdx, e.target.value)}
              className='w-full bg-white border-slate-200 rounded-md text-xs font-bold p-2 focus:ring-1 focus:ring-orange-500 focus:border-orange-500'
             >
                {SHIFT_DEFINITIONS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
             </select>
          </div>
        ) : (
          <div>
            <div className="font-bold text-xs text-slate-700">{dailyShiftNameForDay(selectedDayIdx)}</div>
            <div className="text-[10px] font-medium text-slate-500">{dailyHourForDay(selectedDayIdx)}</div>
          </div>
        )}
      </td>

      {filteredDays.map((day, i) => {
        const currentShift = shiftForDay(day.originalIdx);
        const isSelected = day.originalIdx === selectedDayIdx;

        // Validation logic
        const hasIntersticeConflict = checkInterstice ? !checkInterstice(emp, day.originalIdx) : false;
        const hasSundayWarning = validateSunday2x1 ? !validateSunday2x1(emp, day.originalIdx) : false;

        return (
          <td 
            key={day.num} 
            onClick={() => onSelectDay(day.originalIdx)}
            onDoubleClick={() => handleShiftChange(day.originalIdx, currentShift)}
            className={`p-1.5 border-r border-slate-100/50 text-center align-middle cursor-pointer transition-colors ${isSelected ? 'bg-orange-50' : ''}`}
            title={`Clique para selecionar, duplo clique para alterar. Conflito: ${hasIntersticeConflict}, Aviso Domingo: ${hasSundayWarning}`}
          >
            <ShiftCell 
              shift={currentShift} 
              isSunday={day.isSunday} 
              isHoliday={day.isHoliday} 
              hasConflict={hasIntersticeConflict} 
              hasWarning={hasSundayWarning && currentShift === 'T'}
            />
          </td>
        )
      })}
    </tr>
  );
});
