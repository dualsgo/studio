
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

       if (currentShift !== 'T') {
           return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };
       }

       // 1. Consecutive Days Check (> 6 ending here)
       let consecutiveDaysCount = 0;
       for (let i = 0; i < 7; i++) {
           const checkDate = new Date(date);
           checkDate.setDate(date.getDate() - i);
           if (schedule[getScheduleKey(empId, checkDate)]?.shift === 'T') consecutiveDaysCount++;
           else if (i > 0) break;
       }
       const consecutiveDaysViolation = consecutiveDaysCount > 6;

       // 2. Consecutive Sundays Check (> 3 ending here)
       let consecutiveSundaysViolation = false;
       if (date.getDay() === 0) {
           let consecutiveSundaysCount = 0;
           for (let i = 0; i < 4; i++) {
               const checkSunday = new Date(date);
               checkSunday.setDate(date.getDate() - i * 7);
               if (schedule[getScheduleKey(empId, checkSunday)]?.shift === 'T') consecutiveSundaysCount++;
               else break;
           }
           consecutiveSundaysViolation = consecutiveSundaysCount > 3;
       }

        // 3. Fixed Day Off Check
        const dayOfWeek = date.getDay(); // 0..6
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {
            "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6
        };
        const fixedDayNum = employee.fixedDayOff ? fixedDayMapping[employee.fixedDayOff] : undefined;
        const fixedDayOffViolation = fixedDayNum !== undefined && dayOfWeek === fixedDayNum && currentShift === 'T';


       return {
           consecutiveDays: consecutiveDaysViolation,
           consecutiveSundays: consecutiveSundaysViolation,
           fixedDayOff: fixedDayOffViolation
       };
   };


  return (
    <div className="relative overflow-auto w-full h-full">
      <Table className="min-w-full border-collapse relative">
        <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-background p-2 border w-40 min-w-[160px] text-center font-semibold">
                Colaborador
              </TableHead>
               <TableHead className="sticky left-[160px] z-20 bg-background p-2 border w-24 min-w-[96px] text-center font-semibold"> {/* Adjust left offset */}
                 Ações
               </TableHead>
              {/* Use the passed dates prop */}
              {dates.map(date => (
                <TableHead key={date.toISOString()} className="p-2 border w-24 min-w-[96px] text-center font-semibold">
                  {/* Use EEE dd for short day name and date */}
                  {format(date, 'EEE dd', { locale: ptBR })}
                </TableHead>
              ))}
            </TableRow>
        </TableHeader>
         <TableBody>
          {employees.length === 0 ? (
             <TableRow>
                <TableCell colSpan={dates.length + 2} className="text-center p-8 text-muted-foreground">
                    Nenhum colaborador encontrado.
                </TableCell>
            </TableRow>
          ) : (
            employees.map(emp => (
                <TableRow key={emp.id} className="hover:bg-muted/10 group">
                  {/* Employee Name Cell */}
                  <TableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/10 p-2 border font-medium whitespace-nowrap w-40 min-w-[160px]">
                      {emp.name}
                  </TableCell>

                   {/* Actions Cell */}
                   <TableCell className="sticky left-[160px] z-10 bg-background group-hover:bg-muted/10 p-1 border w-24 min-w-[96px] text-center">
                      <div className="flex justify-center items-center space-x-1">
                           <TooltipProvider delayDuration={100}>
                               <Tooltip>
                                   <TooltipTrigger asChild>
                                       <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEditEmployee(emp)}>
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
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive/90" onClick={() => onDeleteEmployee(emp.id)}>
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

                  {/* Schedule Cells - Use the passed dates prop */}
                  {dates.map(date => {
                    const key = getScheduleKey(emp.id, date);
                    const cellData = schedule[key];
                    const violations = checkViolations(emp.id, date);
                    const hasViolation = violations.consecutiveDays || violations.consecutiveSundays || violations.fixedDayOff;

                    const currentShift = cellData?.shift || 'D';
                    let roleForCell = '';
                    let hoursForCell = '';

                    if (currentShift === 'T' || currentShift === 'H') {
                         roleForCell = cellData?.role || emp.defaultRole || ''; // Use scheduled or default
                         hoursForCell = cellData?.baseHours || (emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum' ? shiftTypeToHoursMap[emp.defaultShiftType] : ''); // Use scheduled or map default type
                     }

                     // Get specific time options for this day
                     const timeOptions = getTimeOptionsForDate(date);

                    return (
                      <TableCell key={date.toISOString()} className="p-0 border w-24 min-w-[96px] h-14 relative">
                         {hasViolation && (
                            <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="absolute top-0 right-0 p-0.5 z-10">
                                            <AlertTriangle className="h-3 w-3 text-yellow-500" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="text-xs p-1 bg-destructive text-destructive-foreground">
                                        {violations.consecutiveDays && <p>Violação: +6 dias.</p>}
                                        {violations.consecutiveSundays && <p>Violação: +3 domingos.</p>}
                                        {violations.fixedDayOff && <p>Violação: Folga fixa.</p>}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                          )}
                        <ShiftCell
                          shift={currentShift}
                          role={roleForCell}
                          baseHours={hoursForCell}
                          date={date}
                          availableRoles={defaultAvailableRoles}
                          availableTimes={timeOptions} // Pass specific time options for the day
                          onChange={(newShift) => onShiftChange(emp.id, date, newShift)}
                          onDetailChange={(field, value) => onDetailChange(emp.id, date, field, value)}
                          hasViolation={hasViolation}
                        />
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
