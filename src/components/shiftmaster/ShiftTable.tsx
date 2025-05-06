
'use client';

import React, { useState, useCallback } from 'react'; // Added useState, useCallback
import type { Employee, ScheduleData, ShiftCode, DayOfWeek } from './types';
import { ShiftCell } from './ShiftCell';
import { getScheduleKey } from './utils';
import { format, isEqual, startOfDay } from 'date-fns'; // Added isEqual, startOfDay
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Edit, Trash2, CalendarHeart } from 'lucide-react'; // Added CalendarHeart for holiday toggle
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { shiftTypeToHoursMap, availableRoles as defaultAvailableRoles, shiftCodeToDescription } from './types'; // Import maps and constants
import { cn } from '@/lib/utils'; // Import cn

interface ShiftTableProps {
  employees: Employee[];
  schedule: ScheduleData;
  dates: Date[];
  holidays: Date[]; // New prop for holidays
  onShiftChange: (empId: number, date: Date, newShift: ShiftCode) => void;
  onDetailChange: (empId: number, date: Date, field: 'role' | 'baseHours', value: string) => void;
  onEditEmployee: (employee: Employee) => void;
  onDeleteEmployee: (empId: number) => void;
  onToggleHoliday: (date: Date) => void; // New callback for toggling holiday
}

// Abbreviated day names for table header
const dayAbbreviations: Record<number, string> = {
    0: 'DOM', 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SAB'
};

export function ShiftTable({
  employees,
  schedule,
  dates,
  holidays, // Use holidays prop
  onShiftChange,
  onDetailChange,
  onEditEmployee,
  onDeleteEmployee,
  onToggleHoliday, // Use toggle holiday callback
}: ShiftTableProps) {

   // Helper to check if a date is a holiday
   const isHoliday = useCallback((date: Date): boolean => {
      const startOfDate = startOfDay(date);
      return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDate));
   }, [holidays]);

   // Check for rule violations for visual feedback
   const checkViolations = (empId: number, date: Date): { consecutiveDays: boolean; consecutiveSundays: boolean; fixedDayOff: boolean } => {
       const employee = employees.find(e => e.id === empId);
       if (!employee) return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };

       const key = getScheduleKey(empId, date);
       const currentShift = schedule[key]?.shift;

       // Violations only apply if the shift is 'T' (Trabalha)
       if (currentShift !== 'T') {
           return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };
       }

       // 1. Consecutive Days Check (> 6 ending *on this date*)
       let consecutiveDaysCount = 0;
       for (let i = 0; i < 7; i++) {
           const checkDate = new Date(date);
           checkDate.setDate(date.getDate() - i);
           if (schedule[getScheduleKey(empId, checkDate)]?.shift === 'T') {
                consecutiveDaysCount++;
           } else if (i > 0) {
                break;
           }
       }
       const consecutiveDaysViolation = consecutiveDaysCount > 6;

       // 2. Consecutive Sundays Check (> 3 ending *on this date*)
       let consecutiveSundaysViolation = false;
       if (date.getDay() === 0) {
           let consecutiveSundaysCount = 0;
           for (let i = 0; i < 4; i++) {
               const checkSunday = new Date(date);
               checkSunday.setDate(date.getDate() - i * 7);
               if (schedule[getScheduleKey(empId, checkSunday)]?.shift === 'T') {
                    consecutiveSundaysCount++;
               } else {
                    break;
               }
           }
           consecutiveSundaysViolation = consecutiveSundaysCount > 3;
       }

       // 3. Fixed Day Off Check (Working on the designated fixed day off)
        const dayOfWeek = date.getDay();
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {
            "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6
        };
        const fixedDayNum = employee.fixedDayOff ? fixedDayMapping[employee.fixedDayOff] : undefined;
        const fixedDayOffViolation = fixedDayNum !== undefined && dayOfWeek === fixedDayNum;

       return {
           consecutiveDays: consecutiveDaysViolation,
           consecutiveSundays: consecutiveSundaysViolation,
           fixedDayOff: fixedDayOffViolation
       };
   };


  return (
    <div className="relative overflow-x-auto w-full h-full"> {/* Allow horizontal scroll */}
      <Table className="min-w-full border-collapse relative table-auto"> {/* Use table-auto for content-based width */}
        <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
            <TableRow>
              {/* Sticky Employee Name Header */}
              <TableHead className="sticky left-0 z-20 bg-card p-1 sm:p-2 border text-xs sm:text-sm text-center font-semibold whitespace-nowrap w-auto min-w-[100px]"> {/* Adjust width */}
                Colaborador
              </TableHead>
              {/* Sticky Actions Header */}
               <TableHead className="sticky left-[calc(100px+theme(spacing.px))] md:left-[calc(120px+theme(spacing.px))] z-20 bg-card p-1 border w-16 min-w-[64px] max-w-[64px] text-center font-semibold text-xs sm:text-sm"> {/* Adjust width/left offset */}
                 Ações
               </TableHead>
              {/* Date Headers */}
              {dates.map(date => {
                  const holidayStatus = isHoliday(date);
                  return (
                    <TableHead
                        key={date.toISOString()}
                        className={cn(
                            "p-1 border text-center font-semibold text-[10px] sm:text-xs leading-tight w-10 min-w-[40px] max-w-[50px]", // Adjust width
                            holidayStatus ? "bg-primary/10" : "" // Highlight holiday header
                        )}
                    >
                        <div className="flex flex-col items-center justify-center">
                            <span>{dayAbbreviations[date.getDay()]}</span>
                            <span>{format(date, 'dd', { locale: ptBR })}</span>
                            {/* Holiday Toggle Button */}
                            <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className={cn(
                                                "h-4 w-4 p-0 mt-0.5 opacity-50 hover:opacity-100",
                                                holidayStatus ? "text-primary" : "text-muted-foreground"
                                            )}
                                            onClick={() => onToggleHoliday(date)}
                                            aria-label={holidayStatus ? "Remover feriado" : "Marcar como feriado"}
                                        >
                                            <CalendarHeart className="h-3 w-3" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="text-xs">
                                        {holidayStatus ? "Remover Feriado" : "Marcar como Feriado"}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </TableHead>
                  );
              })}
            </TableRow>
        </TableHeader>
         <TableBody>
          {employees.length === 0 ? (
             <TableRow>
                <TableCell colSpan={dates.length + 2} className="text-center p-4 sm:p-8 text-muted-foreground">
                    Nenhum colaborador encontrado.
                </TableCell>
            </TableRow>
          ) : (
            employees.map(emp => (
                <TableRow key={emp.id} className="hover:bg-muted/10 group h-auto"> {/* Auto height */}
                  {/* Sticky Employee Name Cell */}
                  <TableCell className="sticky left-0 z-10 bg-card group-hover:bg-muted/10 p-1 sm:p-2 border font-medium whitespace-nowrap text-xs sm:text-sm w-auto min-w-[100px]"> {/* Adjust width */}
                      {emp.name}
                  </TableCell>
                   {/* Sticky Actions Cell */}
                   <TableCell className="sticky left-[calc(100px+theme(spacing.px))] md:left-[calc(120px+theme(spacing.px))] z-10 bg-card group-hover:bg-muted/10 p-0.5 sm:p-1 border w-16 min-w-[64px] max-w-[64px] text-center"> {/* Adjust width/left offset */}
                      <div className="flex flex-col sm:flex-row justify-center items-center space-y-0.5 sm:space-y-0 sm:space-x-0.5 h-full">
                           <TooltipProvider delayDuration={100}>
                               <Tooltip>
                                   <TooltipTrigger asChild>
                                       <Button aria-label={`Editar ${emp.name}`} variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7" onClick={() => onEditEmployee(emp)}>
                                           <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                                       </Button>
                                   </TooltipTrigger>
                                   <TooltipContent side="top">
                                       <p>Editar Colaborador</p>
                                   </TooltipContent>
                               </Tooltip>
                           </TooltipProvider>
                          <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                  <TooltipTrigger asChild>
                                      <Button aria-label={`Remover ${emp.name}`} variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7 text-destructive hover:text-destructive/90" onClick={() => onDeleteEmployee(emp.id)}>
                                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                      </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-destructive text-destructive-foreground">
                                      <p>Remover Colaborador</p>
                                  </TooltipContent>
                              </Tooltip>
                          </TooltipProvider>
                      </div>
                  </TableCell>

                  {/* Schedule Cells */}
                  {dates.map(date => {
                    const key = getScheduleKey(emp.id, date);
                    const cellData = schedule[key];
                    const violations = checkViolations(emp.id, date);
                    const holidayStatus = isHoliday(date);
                    const hasViolation = cellData?.shift === 'T' && (violations.consecutiveDays || violations.consecutiveSundays || violations.fixedDayOff);

                    const currentShift = cellData?.shift || 'F'; // Default to Folga
                    let roleForCell = '';
                    let hoursForCell = '';

                    if (currentShift === 'T') {
                         roleForCell = cellData?.role || emp.defaultRole || '';
                         hoursForCell = cellData?.baseHours || (emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum' ? shiftTypeToHoursMap[emp.defaultShiftType] : '');
                     }

                    return (
                      <TableCell key={date.toISOString()} className={cn(
                          "p-0 border h-full relative w-10 min-w-[40px] max-w-[50px]", // Adjust width
                          holidayStatus ? "bg-primary/5" : "" // Highlight holiday cells
                          )}>
                         {hasViolation && (
                            <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button className="absolute top-0.5 right-0.5 p-0 z-10 text-yellow-500 hover:text-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-600 rounded-full" aria-label="Violação de regra">
                                            <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs p-1 bg-destructive text-destructive-foreground">
                                        {violations.consecutiveDays && <p>Violação: +6 dias trab.</p>}
                                        {violations.consecutiveSundays && <p>Violação: +3 domingos trab.</p>}
                                        {violations.fixedDayOff && <p>Violação: Trab. na folga fixa.</p>}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                          )}
                          <div className="w-full h-full">
                              <ShiftCell
                                shift={currentShift}
                                role={roleForCell}
                                baseHours={hoursForCell}
                                date={date}
                                availableRoles={defaultAvailableRoles}
                                isHoliday={holidayStatus} // Pass holiday status
                                onChange={(newShift) => onShiftChange(emp.id, date, newShift)}
                                onDetailChange={(field, value) => onDetailChange(emp.id, date, field, value)}
                                hasViolation={hasViolation}
                              />
                          </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
        </TableBody>
      </Table>
       {/* Legend */}
       <div className="mt-4 p-2 border rounded bg-card text-sm">
            <h4 className="font-semibold mb-2">Legenda:</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(shiftCodeToDescription).map(([code, description]) => (
                    <div key={code} className="flex items-center gap-2">
                        <span className={cn(
                            'inline-block w-3 h-3 rounded-sm',
                            code === 'T' ? 'bg-destructive' : '',
                            code === 'F' ? 'bg-muted' : '',
                            code === 'FF' ? 'bg-accent' : '',
                        )}></span>
                        <span>{code}: {description}</span>
                    </div>
                ))}
                 <div className="flex items-center gap-2">
                     <CalendarHeart className="h-3 w-3 text-primary" />
                     <span>Dia marcado como Feriado</span>
                 </div>
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    <span>Violação de Regra</span>
                </div>
            </div>
        </div>
    </div>
  );
}
