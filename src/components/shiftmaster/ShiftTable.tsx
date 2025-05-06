'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Employee, ScheduleData, ShiftCode } from './types';
import { ShiftCell } from './ShiftCell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getScheduleKey, getDatesInRange } from './utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle } from 'lucide-react'; // Icon for violations

interface ShiftTableProps {
  employees: Employee[];
  schedule: ScheduleData;
  startDate: Date;
  endDate: Date;
  onShiftChange: (empId: number, date: Date, newShift: ShiftCode) => void;
  onDetailChange: (empId: number, date: Date | null, field: 'role' | 'baseHours', value: string) => void;
}

export function ShiftTable({
  employees,
  schedule,
  startDate,
  endDate,
  onShiftChange,
  onDetailChange,
}: ShiftTableProps) {
  const dates = getDatesInRange(startDate, endDate);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const nameColRef = useRef<HTMLDivElement>(null);

  // --- Sticky Header & Column Logic ---
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (headerRef.current) {
        headerRef.current.style.transform = `translateY(${container.scrollTop}px)`;
      }
      if (nameColRef.current) {
         // Adjust name column positioning based on scroll
         // This requires more complex logic, potentially cloning the column or using CSS position sticky
         // For simplicity, we'll use CSS sticky directly on the TableCell below
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);
  // --- End Sticky Logic ---

  const handleRoleChange = (empId: number, date: Date | null) => (value: string) => {
    onDetailChange(empId, date, 'role', value);
  };

  const handleHoursChange = (empId: number, date: Date | null) => (value: string) => {
    onDetailChange(empId, date, 'baseHours', value);
  };

   const getRoleOptions = () => ['Caixa', 'Vendas', 'Estoque', 'Fiscal', 'Pacote', 'Organização'];

   const getTimeOptions = (date: Date) => {
       const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
       const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Simplified weekend check
       const isFriday = dayOfWeek === 5;

       if (dayOfWeek === 0) { // Sunday
           return ['12h–20h', '13h–21h', '14h–20h', '15h–21h'];
       } else if (isFriday || isWeekend) { // Friday or Saturday (allowing extension) - assuming standard hours are base
           return ['10h–18h', '12h–20h', '14h–22h', '10h-20h', '12h-22h', '14h-00h' ]; // Base + examples of extended
       } else { // Monday to Thursday
           return ['10h–18h', '12h–20h', '14h–22h'];
       }
       // TODO: Handle Feriados - requires a holiday list/API
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
           } else {
               break; // Streak broken
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
        const fixedDayMapping: { [key: string]: number } = {
             "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6
         };
        const fixedDayNum = fixedDayMapping[employee.fixedDayOff || ""];
        const fixedDayOffViolation = fixedDayNum !== undefined && date.getDay() === fixedDayNum;


       return {
           consecutiveDays: consecutiveDaysViolation,
           consecutiveSundays: consecutiveSundaysViolation,
           fixedDayOff: fixedDayOffViolation
       };
   };


  return (
    <div ref={tableContainerRef} className="relative overflow-auto w-full h-full">
      <Table className="min-w-full border-collapse relative">
        <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
            {/* This div helps with positioning the sticky header correctly within the scroll container */}
            {/* <div ref={headerRef} className="absolute top-0 left-0 w-full h-full bg-inherit z-[-1]"></div> */}
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-background p-2 border w-40 min-w-[160px] text-center font-semibold">
                Colaborador
              </TableHead>
              <TableHead className="p-2 border w-32 min-w-[128px] text-center font-semibold">Função Base</TableHead>
              <TableHead className="p-2 border w-32 min-w-[128px] text-center font-semibold">Horário Base</TableHead>
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
                <TableCell colSpan={dates.length + 3} className="text-center p-8 text-muted-foreground">
                    Nenhum colaborador encontrado para os filtros selecionados.
                </TableCell>
            </TableRow>
          ) : (
            employees.map(emp => (
                <TableRow key={emp.id} className="hover:bg-muted/10">
                  <TableCell className="sticky left-0 z-10 bg-background p-2 border font-medium whitespace-nowrap w-40 min-w-[160px]">
                      {emp.name}
                       {/* Display Fixed Day Off */}
                       {emp.fixedDayOff && (
                         <span className="block text-xs text-muted-foreground">Folga Fixa: {emp.fixedDayOff}</span>
                       )}
                  </TableCell>
                  <TableCell className="p-1 border w-32 min-w-[128px]">
                    <Select value={emp.baseRole} onValueChange={handleRoleChange(emp.id, null)}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue placeholder="Função" />
                      </SelectTrigger>
                      <SelectContent>
                        {getRoleOptions().map(role => (
                          <SelectItem key={role} value={role} className="text-xs">{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1 border w-32 min-w-[128px]">
                     {/* Base hours are less likely to change daily, so maybe just display? Or allow edit like role */}
                     {/* For now, let's make it editable similar to Role */}
                    <Select value={emp.baseHours} onValueChange={handleHoursChange(emp.id, null)}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue placeholder="Horário" />
                      </SelectTrigger>
                      <SelectContent>
                         {/* Provide a common set of hours, specific options are per day */}
                        {['10h–18h', '12h–20h', '14h–22h', '12h–20h (Dom)', '13h–21h (Dom)'].map(time => (
                             <SelectItem key={time} value={time} className="text-xs">{time}</SelectItem>
                         ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {dates.map(date => {
                    const key = getScheduleKey(emp.id, date);
                    const cellData = schedule[key];
                    const violations = checkViolations(emp.id, date);
                    const hasViolation = violations.consecutiveDays || violations.consecutiveSundays || violations.fixedDayOff;

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
                          shift={cellData?.shift || 'D'} // Default to 'Available'
                          role={cellData?.role || emp.baseRole}
                          baseHours={cellData?.baseHours || emp.baseHours}
                          date={date}
                          availableRoles={getRoleOptions()}
                          availableTimes={getTimeOptions(date)}
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


// Need Tooltip components
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
