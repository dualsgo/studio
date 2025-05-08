
'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry, SortOrder } from './types'; // Import SortOrder
import { ShiftCell } from './ShiftCell';
import { getScheduleKey } from './utils';
import { format as formatDate, isEqual, startOfDay, addDays } from 'date-fns'; // Renamed format to formatDate
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from '@/components/ui/table'; // Added TableHeader
import { AlertTriangle, Edit, Trash2, CalendarPlus, CalendarMinus, ArrowUpDown } from 'lucide-react'; // Added ArrowUpDown
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { shiftCodeToDescription, availableRoles } from './types'; // Import shiftCodeToDescription and availableRoles
import { cn } from '@/lib/utils'; // Import cn

interface ShiftTableProps {
  employees: Employee[];
  schedule: ScheduleData;
  dates: Date[];
  holidays: Date[];
  sortOrder: SortOrder; // Add sortOrder prop
  onSortChange: () => void; // Add handler for sort change
  onShiftChange: (empId: number, date: Date, newShift: ShiftCode) => void;
  onDetailChange: (empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => void;
  onEditEmployee: (employee: Employee) => void;
  onDeleteEmployee: (empId: number) => void;
  onToggleHoliday: (date: Date) => void;
  isHolidayFn: (date: Date) => boolean; // Add isHolidayFn to props
}

// Abbreviated day names for table header
const dayAbbreviations: Record<number, string> = {
    0: 'DOM', 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SÁB'
};

// Define minimum and maximum widths for columns
const EMPLOYEE_COL_MIN_WIDTH = '120px'; // Wider employee column
const ACTION_COL_WIDTH = '70px'; // Fixed width for actions
const DATE_COL_MIN_WIDTH = '45px'; // Slightly wider minimum date cell width
const DATE_COL_MAX_WIDTH = '60px'; // Maximum date cell width


export function ShiftTable({
  employees,
  schedule,
  dates,
  holidays,
  sortOrder, // Destructure sortOrder
  onSortChange, // Destructure onSortChange
  onShiftChange,
  onDetailChange,
  onEditEmployee,
  onDeleteEmployee,
  onToggleHoliday,
  isHolidayFn, // Use isHolidayFn from props
}: ShiftTableProps) {

    // Check for rule violations for visual feedback
    const checkViolations = useCallback((empId: number, date: Date): { consecutiveDays: boolean; consecutiveSundays: boolean; fixedDayOff: boolean } => {
        const employee = employees.find(e => e.id === empId);
        if (!employee) return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };

        const key = getScheduleKey(empId, date);
        const currentShift = schedule[key]?.shift;

        // Violations only apply if the shift is 'TRABALHA'
        if (currentShift !== 'TRABALHA') {
            return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };
        }

        // 1. Consecutive Days Check (> 6 ending *on this date*)
        let consecutiveDaysCount = 1; // Start with 1 for the current date
        for (let i = 1; i <= 6; i++) { // Check previous 6 days
            const checkDate = addDays(date, -i);
            if (schedule[getScheduleKey(empId, checkDate)]?.shift === 'TRABALHA') {
                 consecutiveDaysCount++;
            } else {
                 break; // Stop if a non-T day is found
            }
        }
        const consecutiveDaysViolation = consecutiveDaysCount > 6;


       // 2. Consecutive Sundays Check (> 3 ending *on this date*)
       let consecutiveSundaysViolation = false;
       if (date.getDay() === 0) { // If the current date is a Sunday
           let consecutiveSundaysCount = 1; // Start with 1 for the current Sunday
           for (let i = 1; i <= 3; i++) { // Check previous 3 Sundays
               const checkSunday = addDays(date, -i * 7);
               if (schedule[getScheduleKey(empId, checkSunday)]?.shift === 'TRABALHA') {
                    consecutiveSundaysCount++;
               } else {
                    break; // Stop if a previous Sunday wasn't 'T'
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
    }, [employees, schedule]); // Dependencies: employees and schedule


  return (
    <div className="relative overflow-x-auto w-full h-full">
      <Table className="min-w-full border-collapse relative table-fixed"> {/* Use table-fixed */}
        <colgroup>
          <col style={{ minWidth: EMPLOYEE_COL_MIN_WIDTH, width: EMPLOYEE_COL_MIN_WIDTH }} />
          <col style={{ width: ACTION_COL_WIDTH }} />
          {dates.map(date => (
            <col key={date.toISOString()} style={{ minWidth: DATE_COL_MIN_WIDTH, maxWidth: DATE_COL_MAX_WIDTH }} />
          ))}
        </colgroup>
        <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
            <TableRow>
              {/* Sticky Employee Name Header with Sort Button */}
              <TableHead
                 className="sticky left-0 z-20 bg-card p-1 sm:p-2 border text-xs sm:text-sm text-center font-semibold whitespace-nowrap"
                 style={{ minWidth: EMPLOYEE_COL_MIN_WIDTH, width: EMPLOYEE_COL_MIN_WIDTH }}
              >
                <div className="flex items-center justify-center">
                    Colaborador
                    <Button variant="ghost" size="icon" onClick={onSortChange} className="ml-1 h-5 w-5 p-0">
                        <ArrowUpDown className="h-3 w-3" />
                        <span className="sr-only">Ordenar por nome</span>
                    </Button>
                </div>
              </TableHead>
              {/* Sticky Actions Header */}
               <TableHead
                 className="sticky left-[var(--employee-col-width)] z-20 bg-card p-1 border text-center font-semibold text-xs sm:text-sm"
                 style={{
                   left: EMPLOYEE_COL_MIN_WIDTH, // Pin based on exact width
                   width: ACTION_COL_WIDTH
                 }}
               >
                 Ações
               </TableHead>
              {/* Date Headers */}
              {dates.map(date => {
                  const holidayStatus = isHolidayFn(date);
                  return (
                    <TableHead
                        key={date.toISOString()}
                        className={cn(
                            "p-1 border text-center font-semibold text-[10px] sm:text-xs leading-tight", // Base styles
                            holidayStatus ? "bg-primary/10 ring-1 ring-primary/20" : "" // Highlight holiday header
                        )}
                        style={{ minWidth: DATE_COL_MIN_WIDTH, maxWidth: DATE_COL_MAX_WIDTH }} // Apply width styles
                    >
                        <div className="flex flex-col items-center justify-center">
                            <span className={cn(holidayStatus ? "text-primary font-bold" : "")}>{dayAbbreviations[date.getDay()]}</span>
                            <span className={cn(holidayStatus ? "text-primary font-bold" : "")}>{formatDate(date, 'dd', { locale: ptBR })}</span>
                            {/* Holiday Toggle Button */}
                            <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4 p-0 mt-0.5"
                                            onClick={() => onToggleHoliday(date)}
                                        >
                                            {holidayStatus ? <CalendarMinus className="h-3 w-3 text-destructive" /> : <CalendarPlus className="h-3 w-3 text-primary/70" />}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs p-1">
                                        {holidayStatus ? "Remover Feriado" : "Marcar Feriado"}
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
                    Nenhum colaborador encontrado. Adicione colaboradores para começar.
                </TableCell>
            </TableRow>
          ) : (
            employees.map(emp => (
                <TableRow key={emp.id} className="hover:bg-muted/10 group h-auto">
                  {/* Sticky Employee Name Cell */}
                  <TableCell
                    className="sticky left-0 z-10 bg-card group-hover:bg-muted/10 p-1 sm:p-2 border font-medium whitespace-nowrap text-xs sm:text-sm"
                    style={{ minWidth: EMPLOYEE_COL_MIN_WIDTH, width: EMPLOYEE_COL_MIN_WIDTH }}
                   >
                      {emp.name}
                  </TableCell>
                   {/* Sticky Actions Cell */}
                   <TableCell
                     className="sticky left-[var(--employee-col-width)] z-10 bg-card group-hover:bg-muted/10 p-0.5 sm:p-1 border text-center"
                     style={{
                       left: EMPLOYEE_COL_MIN_WIDTH, // Pin based on exact width
                       width: ACTION_COL_WIDTH
                     }}
                   >
                      <div className="flex flex-col sm:flex-row justify-center items-center space-y-0.5 sm:space-y-0 sm:space-x-0.5 h-full">
                           <TooltipProvider delayDuration={100}>
                               <Tooltip>
                                   <TooltipTrigger asChild>
                                       <Button aria-label={`Editar ${emp.name}`} variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7" onClick={() => onEditEmployee(emp)}>
                                           <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                                       </Button>
                                   </TooltipTrigger>
                                   <TooltipContent side="top" className="text-xs p-1">Editar Colaborador</TooltipContent>
                               </Tooltip>
                           </TooltipProvider>
                           <TooltipProvider delayDuration={100}>
                               <Tooltip>
                                   <TooltipTrigger asChild>
                                       <Button aria-label={`Remover ${emp.name}`} variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7 text-destructive hover:text-destructive/90" onClick={() => onDeleteEmployee(emp.id)}>
                                           <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                       </Button>
                                   </TooltipTrigger>
                                   <TooltipContent side="top" className="text-xs p-1">Remover Colaborador</TooltipContent>
                               </Tooltip>
                           </TooltipProvider>
                      </div>
                  </TableCell>

                  {/* Schedule Cells */}
                  {dates.map(date => {
                    const key = getScheduleKey(emp.id, date);
                    const cellData = schedule[key];
                    const violations = checkViolations(emp.id, date);
                    const holidayStatus = isHolidayFn(date); // Use isHolidayFn from props

                    const scheduleEntry: ScheduleEntry = cellData || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                    const hasAnyViolation = violations.consecutiveDays || violations.consecutiveSundays || violations.fixedDayOff;

                    return (
                      <TableCell
                        key={key}
                        className={cn(
                            "p-0 border relative h-12 min-h-[3rem]", // Base cell styles
                             holidayStatus && scheduleEntry.shift !== 'FF' ? "bg-primary/5" : ""
                         )}
                         style={{ minWidth: DATE_COL_MIN_WIDTH, maxWidth: DATE_COL_MAX_WIDTH }} // Apply width styles
                         >
                          <TooltipProvider delayDuration={hasAnyViolation ? 0 : 500}>
                            <Tooltip open={hasAnyViolation ? undefined : false}> {/* Control tooltip visibility */}
                              <TooltipTrigger asChild>
                                <div> {/* Wrap ShiftCell for TooltipTrigger if it doesn't spread props */}
                                  <ShiftCell
                                    shift={scheduleEntry.shift}
                                    role={scheduleEntry.role}
                                    baseHours={scheduleEntry.baseHours}
                                    holidayReason={scheduleEntry.holidayReason}
                                    date={date}
                                    availableRoles={availableRoles}
                                    isHoliday={holidayStatus}
                                    onChange={(newShift) => onShiftChange(emp.id, date, newShift)}
                                    onDetailChange={(field, value) => onDetailChange(emp.id, date, field, value)}
                                    hasViolation={hasAnyViolation && scheduleEntry.shift === 'TRABALHA'}
                                  />
                                </div>
                              </TooltipTrigger>
                              {hasAnyViolation && scheduleEntry.shift === 'TRABALHA' && (
                                <TooltipContent side="bottom" className="text-xs p-1.5 bg-yellow-500 text-black max-w-xs">
                                  <div className="flex items-center">
                                    <AlertTriangle className="h-4 w-4 mr-1.5 text-black" />
                                    <ul className="list-none p-0 m-0 space-y-0.5">
                                      {violations.consecutiveDays && <li>Mais de 6 dias de trabalho consecutivos.</li>}
                                      {violations.consecutiveSundays && <li>Mais de 3 domingos trabalhados consecutivos.</li>}
                                      {violations.fixedDayOff && <li>Trabalhando na folga fixa ({employees.find(e => e.id === emp.id)?.fixedDayOff}).</li>}
                                    </ul>
                                  </div>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
        </TableBody>
      </Table>
    </div>
  );
}
