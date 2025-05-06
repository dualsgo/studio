
'use client';

import React, { useMemo } from 'react';
import type { Employee, ScheduleData, ShiftCode, ShiftType, DayOfWeek } from './types'; // Import necessary types
import { ShiftCell } from './ShiftCell';
import { getScheduleKey, getDatesInRange } from './utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Edit, Trash2 } from 'lucide-react'; // Import Edit and Trash2 icons
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button'; // Import Button for actions
import { shiftTypeToHoursMap, availableRoles as defaultAvailableRoles } from './types'; // Import maps and constants

interface ShiftTableProps {
  employees: Employee[];
  schedule: ScheduleData;
  startDate: Date;
  endDate: Date;
  onShiftChange: (empId: number, date: Date, newShift: ShiftCode) => void;
  // Updated onDetailChange to handle default info potentially from Employee object
  onDetailChange: (empId: number, date: Date, field: 'role' | 'baseHours', value: string) => void;
  onEditEmployee: (employee: Employee) => void; // Handler to open edit dialog
  onDeleteEmployee: (empId: number) => void; // Handler to trigger delete confirmation
}

// Define time options based on day type
const mondayThursdayTimes = ['10h–18h', '12h–20h', '14h–22h'];
const fridaySaturdayTimes = ['10h–18h', '10h–19h', '10h–20h', '11h–21h', '12h–22h', '13h–22h'];
const sundayTimes = ['12h–20h', '13h–21h'];
const holidayTimes = ['12h–18h', '13h–19h', '14h–20h', '15h–21h'];


export function ShiftTable({
  employees,
  schedule,
  startDate,
  endDate,
  onShiftChange,
  onDetailChange,
  onEditEmployee,
  onDeleteEmployee,
}: ShiftTableProps) {
  const dates = useMemo(() => getDatesInRange(startDate, endDate), [startDate, endDate]);

   const getTimeOptions = (date: Date): string[] => {
       const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

       // TODO: Handle Feriados - requires a holiday list/API integration.
       // For now, we'll just use the weekday logic. If a date is identified as a holiday, return holidayTimes.
       // Example pseudo-code:
       // if (isHoliday(date)) {
       //   return holidayTimes;
       // }

       if (dayOfWeek === 0) { // Sunday
            return sundayTimes;
       } else if (dayOfWeek === 5 || dayOfWeek === 6) { // Friday or Saturday
           return fridaySaturdayTimes;
       } else { // Monday to Thursday (1 to 4)
            return mondayThursdayTimes;
       }
   };

   // Check for rule violations for visual feedback
   const checkViolations = (empId: number, date: Date): { consecutiveDays: boolean; consecutiveSundays: boolean; fixedDayOff: boolean } => {
       const employee = employees.find(e => e.id === empId);
       if (!employee) return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };

       const key = getScheduleKey(empId, date);
       const currentShift = schedule[key]?.shift;

       // Check only if the cell is marked as 'Work'
       if (currentShift !== 'T') {
           return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };
       }

       // 1. Consecutive Days Check (Simplified check for > 6 days ending on this date)
       let consecutiveDaysCount = 0;
       for (let i = 0; i < 7; i++) {
           const checkDate = new Date(date);
           checkDate.setDate(date.getDate() - i);
           const checkKey = getScheduleKey(empId, checkDate);
           if (schedule[checkKey]?.shift === 'T') {
               consecutiveDaysCount++;
           } else if (i > 0) { // Only break if a non-work day is found *after* the first day
               break;
           }
       }
       const consecutiveDaysViolation = consecutiveDaysCount > 6;


       // 2. Consecutive Sundays Check (Simplified check for > 3 Sundays ending on this date)
       let consecutiveSundaysViolation = false;
       if (date.getDay() === 0) { // Is it Sunday?
           let consecutiveSundaysCount = 0;
           for (let i = 0; i < 4; i++) {
               const checkSunday = new Date(date);
               checkSunday.setDate(date.getDate() - i * 7);
               const checkKey = getScheduleKey(empId, checkSunday);
               if (schedule[checkKey]?.shift === 'T') {
                   consecutiveSundaysCount++;
               } else {
                   break; // Streak broken
               }
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
              {dates.map(date => (
                <TableHead key={date.toISOString()} className="p-2 border w-24 min-w-[96px] text-center font-semibold">
                  {format(date, 'EEE dd/MM', { locale: ptBR })}
                </TableHead>
              ))}
            </TableRow>
        </TableHeader>
         <TableBody>
          {employees.length === 0 ? (
             <TableRow>
                 {/* Adjusted colSpan to account for Actions column */}
                <TableCell colSpan={dates.length + 2} className="text-center p-8 text-muted-foreground">
                    Nenhum colaborador encontrado para os filtros selecionados ou nenhum colaborador cadastrado.
                </TableCell>
            </TableRow>
          ) : (
            employees.map(emp => (
                <TableRow key={emp.id} className="hover:bg-muted/10 group">
                  {/* Employee Name Cell */}
                  <TableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/10 p-2 border font-medium whitespace-nowrap w-40 min-w-[160px]">
                      {emp.name}
                       {/* Fixed Day Off info removed, handled in edit dialog */}
                  </TableCell>

                   {/* Actions Cell */}
                   <TableCell className="sticky left-[160px] z-10 bg-background group-hover:bg-muted/10 p-1 border w-24 min-w-[96px] text-center"> {/* Adjust left offset */}
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

                  {/* Schedule Cells */}
                  {dates.map(date => {
                    const key = getScheduleKey(emp.id, date);
                    const cellData = schedule[key];
                    const violations = checkViolations(emp.id, date);
                    const hasViolation = violations.consecutiveDays || violations.consecutiveSundays || violations.fixedDayOff;

                    // Determine role and hours to pass to ShiftCell
                    const currentShift = cellData?.shift || 'D';
                    let roleForCell = '';
                    let hoursForCell = '';

                    if (currentShift === 'T' || currentShift === 'H') {
                         roleForCell = cellData?.role || ''; // Use scheduled if available
                         hoursForCell = cellData?.baseHours || ''; // Use scheduled if available

                         // If scheduled role/hours are empty for T/H, try using employee defaults
                         if (!roleForCell && emp.defaultRole) {
                             roleForCell = emp.defaultRole;
                         }
                         // If scheduled hours are empty for T/H, try mapping default shift type
                         if (!hoursForCell && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                             // Use shiftTypeToHoursMap for initial default, but allow specific day options to override later
                             hoursForCell = shiftTypeToHoursMap[emp.defaultShiftType];
                         }
                     }

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
                                        {violations.consecutiveDays && <p>Violação: +6 dias seguidos.</p>}
                                        {violations.consecutiveSundays && <p>Violação: +3 domingos seguidos.</p>}
                                        {violations.fixedDayOff && <p>Violação: Folga fixa neste dia.</p>}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                          )}
                        <ShiftCell
                          shift={currentShift}
                          role={roleForCell} // Pass determined/default role
                          baseHours={hoursForCell} // Pass determined/default hours
                          date={date}
                          availableRoles={defaultAvailableRoles} // Pass available roles
                          availableTimes={getTimeOptions(date)} // Pass dynamic time options based on date
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
