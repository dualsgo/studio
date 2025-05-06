
'use client';

import React, { useMemo } from 'react';
import type { Employee, ScheduleData, ShiftCode, ShiftType, DayOfWeek } from './types'; // Import necessary types
import { ShiftCell } from './ShiftCell';
import { getScheduleKey } from './utils'; // Removed getDatesInRange import from here
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Edit, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { shiftTypeToHoursMap, availableRoles as defaultAvailableRoles, getTimeOptionsForDate } from './types'; // Import maps and constants

interface ShiftTableProps {
  employees: Employee[];
  schedule: ScheduleData;
  dates: Date[]; // Accept pre-calculated dates for the month
  onShiftChange: (empId: number, date: Date, newShift: ShiftCode) => void;
  onDetailChange: (empId: number, date: Date, field: 'role' | 'baseHours', value: string) => void;
  onEditEmployee: (employee: Employee) => void;
  onDeleteEmployee: (empId: number) => void;
}

export function ShiftTable({
  employees,
  schedule,
  dates, // Use the passed dates prop
  onShiftChange,
  onDetailChange,
  onEditEmployee,
  onDeleteEmployee,
}: ShiftTableProps) {

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
       for (let i = 0; i < 7; i++) { // Check this date and 6 before it
           const checkDate = new Date(date);
           checkDate.setDate(date.getDate() - i);
           if (schedule[getScheduleKey(empId, checkDate)]?.shift === 'T') {
                consecutiveDaysCount++;
           } else if (i > 0) { // Stop checking backwards if a non-T day is found
                break;
           }
       }
       const consecutiveDaysViolation = consecutiveDaysCount > 6;

       // 2. Consecutive Sundays Check (> 3 ending *on this date*)
       let consecutiveSundaysViolation = false;
       if (date.getDay() === 0) { // Check only if today is Sunday
           let consecutiveSundaysCount = 0;
           for (let i = 0; i < 4; i++) { // Check this Sunday and 3 before it
               const checkSunday = new Date(date);
               checkSunday.setDate(date.getDate() - i * 7);
               if (schedule[getScheduleKey(empId, checkSunday)]?.shift === 'T') {
                    consecutiveSundaysCount++;
               } else {
                    break; // Stop checking backwards if a non-T Sunday is found
               }
           }
           consecutiveSundaysViolation = consecutiveSundaysCount > 3;
       }

        // 3. Fixed Day Off Check (Working on the designated fixed day off)
        const dayOfWeek = date.getDay(); // 0..6
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {
            "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6
        };
        const fixedDayNum = employee.fixedDayOff ? fixedDayMapping[employee.fixedDayOff] : undefined;
        // Violation occurs if today is the fixed day off AND the shift is 'T'
        const fixedDayOffViolation = fixedDayNum !== undefined && dayOfWeek === fixedDayNum; // Simplified: Violation if it's the fixed day and shift is 'T' (checked earlier)

       return {
           consecutiveDays: consecutiveDaysViolation,
           consecutiveSundays: consecutiveSundaysViolation,
           fixedDayOff: fixedDayOffViolation
       };
   };


  return (
    <div className="relative overflow-auto w-full h-full">
      <Table className="min-w-full border-collapse relative table-fixed"> {/* Added table-fixed */}
        <TableHeader className="sticky top-0 z-10 bg-card shadow-sm"> {/* Changed bg-background to bg-card */}
            <TableRow>
              {/* Sticky Employee Name Header */}
              <TableHead className="sticky left-0 z-20 bg-card p-2 border w-40 min-w-[160px] text-center font-semibold">
                Colaborador
              </TableHead>
              {/* Sticky Actions Header */}
               <TableHead className="sticky left-[160px] z-20 bg-card p-2 border w-24 min-w-[96px] max-w-[96px] text-center font-semibold"> {/* Adjust left offset */}
                 Ações
               </TableHead>
              {/* Date Headers */}
              {dates.map(date => (
                <TableHead key={date.toISOString()} className="p-1 border w-20 min-w-[80px] max-w-[80px] text-center font-semibold text-xs"> {/* Adjusted width, padding, font size */}
                  {/* Use EEE dd for short day name and date */}
                  {format(date, 'EEE dd', { locale: ptBR })}
                </TableHead>
              ))}
            </TableRow>
        </TableHeader>
         <TableBody>
          {employees.length === 0 ? (
             <TableRow>
                {/* Span across all columns: 1 (Name) + 1 (Actions) + number of dates */}
                <TableCell colSpan={dates.length + 2} className="text-center p-8 text-muted-foreground">
                    Nenhum colaborador encontrado para os filtros aplicados.
                </TableCell>
            </TableRow>
          ) : (
            employees.map(emp => (
                <TableRow key={emp.id} className="hover:bg-muted/10 group h-16"> {/* Increased row height */}
                  {/* Sticky Employee Name Cell */}
                  <TableCell className="sticky left-0 z-10 bg-card group-hover:bg-muted/10 p-2 border font-medium whitespace-nowrap w-40 min-w-[160px]">
                      {emp.name}
                  </TableCell>

                   {/* Sticky Actions Cell */}
                   <TableCell className="sticky left-[160px] z-10 bg-card group-hover:bg-muted/10 p-1 border w-24 min-w-[96px] max-w-[96px] text-center">
                      <div className="flex justify-center items-center space-x-1 h-full"> {/* Ensure vertical centering */}
                           <TooltipProvider delayDuration={100}>
                               <Tooltip>
                                   <TooltipTrigger asChild>
                                       <Button aria-label={`Editar ${emp.name}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditEmployee(emp)}>
                                           <Edit className="h-4 w-4" />
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
                                      <Button aria-label={`Remover ${emp.name}`} variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/90" onClick={() => onDeleteEmployee(emp.id)}>
                                          <Trash2 className="h-4 w-4" />
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
                    // Violation exists if the shift is 'T' and any violation flag is true
                    const hasViolation = cellData?.shift === 'T' && (violations.consecutiveDays || violations.consecutiveSundays || violations.fixedDayOff);

                    const currentShift = cellData?.shift || 'D'; // Default to Disponible
                    let roleForCell = '';
                    let hoursForCell = '';

                    // Populate role/hours only if the shift is 'T' or 'H'
                    if (currentShift === 'T' || currentShift === 'H') {
                         roleForCell = cellData?.role || emp.defaultRole || ''; // Use scheduled role, fallback to employee default
                          // Use scheduled hours, fallback to default based on employee's defaultShiftType
                         hoursForCell = cellData?.baseHours || (emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum' ? shiftTypeToHoursMap[emp.defaultShiftType] : '');
                     }

                    return (
                      <TableCell key={date.toISOString()} className="p-0 border w-20 min-w-[80px] max-w-[80px] h-full relative"> {/* Ensure full height */}
                         {/* Violation Indicator - Positioned at top-right */}
                         {hasViolation && (
                            <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        {/* Make the trigger clickable/focusable for accessibility */}
                                        <button className="absolute top-0.5 right-0.5 p-0 z-10 text-yellow-500 hover:text-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-600 rounded-full" aria-label="Violação de regra">
                                            <AlertTriangle className="h-3 w-3" />
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
                          {/* Shift Cell Component */}
                          <div className="w-full h-full"> {/* Wrapper to ensure ShiftCell fills the TableCell */}
                              <ShiftCell
                                shift={currentShift}
                                role={roleForCell}
                                baseHours={hoursForCell}
                                date={date}
                                availableRoles={defaultAvailableRoles} // Pass global roles
                                // availableTimes is now handled internally by ShiftCell based on date
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
    </div>
  );
}
