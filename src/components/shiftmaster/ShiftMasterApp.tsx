
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftFilters } from './ShiftFilters';
import { ShiftTable } from './ShiftTable';
import type { Employee, ScheduleData, FilterState, ShiftCode, DayOfWeek, ScheduleEntry } from './types'; // Import ShiftCode
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange } from './utils';
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format, startOfMonth, endOfMonth, isEqual, startOfDay, parse } from 'date-fns'; // Added isEqual, startOfDay
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { UserPlus, FileText, MessageSquareText, RotateCcw } from 'lucide-react';
import { EditEmployeeDialog } from './EditEmployeeDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { roleToEmojiMap, daysOfWeek, shiftCodeToDescription, availableShiftCodes, shiftTypeToHoursMap, getTimeOptionsForDate, availableRoles } from './types'; // Import descriptions and available codes // Added shiftTypeToHoursMap // Added getTimeOptionsForDate // Import availableRoles
import { cn } from '@/lib/utils'; // Import cn

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const STORAGE_KEY = 'shiftMasterSchedule_v3'; // Increment version for FF changes

type AppFilterState = FilterState;
type AppPartialFilterState = Partial<AppFilterState>;


export function ShiftMasterApp() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [filters, setFilters] = useState<AppFilterState>({
    employee: '',
    role: '',
    selectedDate: new Date(),
  });
  const [holidays, setHolidays] = useState<Date[]>([]); // State for holidays (actual calendar holidays)
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // --- Holiday Management ---
   const isHoliday = useCallback((date: Date): boolean => {
       if (!date || isNaN(date.getTime())) return false;
       const startOfDate = startOfDay(date);
       return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDate));
   }, [holidays]);


  // --- Data Initialization and Persistence ---
  useEffect(() => {
    setIsClient(true);
    const storedData = localStorage.getItem(STORAGE_KEY);
    let loadedSuccessfully = false;
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        if (parsedData.employees && parsedData.schedule) {
          setEmployees(parsedData.employees);
          const loadedFilters = parsedData.filters || {};
          setFilters({
            employee: loadedFilters.employee || '',
            role: loadedFilters.role || '',
            selectedDate: loadedFilters.selectedDate ? parseISO(loadedFilters.selectedDate) : new Date(),
          });
          setHolidays((parsedData.holidays || []).map((d: string) => parseISO(d)));
          setCurrentMonth(startOfMonth(loadedFilters.selectedDate ? parseISO(loadedFilters.selectedDate) : new Date()));
          // Ensure schedule entries have the new holidayReason field (default to undefined)
          const validatedSchedule: ScheduleData = {};
          for (const key in parsedData.schedule) {
              if (Object.prototype.hasOwnProperty.call(parsedData.schedule, key)) {
                  const entry = parsedData.schedule[key] as ScheduleEntry;
                  validatedSchedule[key] = {
                      shift: entry.shift,
                      role: entry.role ?? '', // Ensure exists
                      baseHours: entry.baseHours ?? '', // Ensure exists
                      holidayReason: entry.holidayReason // Will be undefined if loaded from older version
                  };
              }
          }
          setSchedule(validatedSchedule);
          loadedSuccessfully = true;
        }
      } catch (error) {
        console.error("Failed to parse stored schedule data:", error);
        toast({ title: "Erro", description: "Falha ao carregar dados salvos. Redefinindo para o padrão.", variant: "destructive" });
      }
    }

    if (!loadedSuccessfully) {
      initializeDefaultData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // initializeDefaultData is intentionally omitted as it should only run once

  const initializeDefaultData = useCallback(() => {
    const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData();
    setEmployees(initialEmployees);
    setSchedule(initialSchedule);
    setFilters(initialFilters);
    setHolidays(initialHolidays);
    setCurrentMonth(startOfMonth(initialFilters.selectedDate));
  }, []); // Empty dependency array ensures it runs only once

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (isClient && employees.length > 0) {
      saveToLocalStorage(employees, schedule, filters, holidays);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, schedule, filters, holidays, isClient]);

   const saveToLocalStorage = (emps: Employee[], sched: ScheduleData, filt: AppFilterState, hols: Date[]) => {
    try {
      const filtersToStore = {
        ...filt,
        selectedDate: filt.selectedDate?.toISOString(),
      };
      const holidaysToStore = hols.map(d => d.toISOString());
      const dataToStore = JSON.stringify({ employees: emps, schedule: sched, filters: filtersToStore, holidays: holidaysToStore });
      localStorage.setItem(STORAGE_KEY, dataToStore);
    } catch (error) {
      console.error("Failed to save schedule data:", error);
      toast({ title: "Erro", description: "Não foi possível salvar as alterações no armazenamento local.", variant: "destructive" });
    }
  };

  // --- Holiday Management ---

   const handleToggleHoliday = useCallback((date: Date) => {
       const dateStart = startOfDay(date);
       const wasHoliday = isHoliday(date); // Check status *before* changing
       setHolidays(prev => {
           const existingIndex = prev.findIndex(d => isEqual(startOfDay(d), dateStart));
           if (existingIndex > -1) {
               // Remove holiday
               return prev.filter((_, index) => index !== existingIndex);
           } else {
               // Add holiday
               return [...prev, dateStart].sort((a, b) => a.getTime() - b.getTime()); // Keep sorted
           }
       });

        // Update schedule entries for all employees on this date if holiday status changes
        // Specifically, update available time options if they were defaulted based on holiday status
        const newIsHolidayStatus = !wasHoliday;
        setSchedule(prevSched => {
            const newSchedule = {...prevSched};
            employees.forEach(emp => {
                const key = getScheduleKey(emp.id, date);
                const entry = newSchedule[key];
                // If the employee is working ('T') and might need time adjustment
                if(entry && entry.shift === 'T') {
                    const availableTimes = getTimeOptionsForDate(date, newIsHolidayStatus);
                    // If the current time is no longer valid, reset it (e.g., pick first valid)
                    if (!availableTimes.includes(entry.baseHours)) {
                        // Attempt to get default for the *new* day status
                        const defaultShiftType = emp.defaultShiftType;
                        let newDefaultHour = availableTimes[0] || ''; // Fallback to first available
                        if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                             const basicDefault = shiftTypeToHoursMap[defaultShiftType];
                             if(availableTimes.includes(basicDefault)) {
                                 newDefaultHour = basicDefault;
                             }
                        }
                        newSchedule[key] = { ...entry, baseHours: newDefaultHour };
                    }
                }
            });
            return newSchedule;
        });


       toast({ title: "Feriado Atualizado", description: `Dia ${format(date, 'dd/MM')} ${wasHoliday ? 'não é mais' : 'agora é'} feriado.` });
   }, [holidays, toast, isHoliday, employees]);


  // --- Filter Handlers ---
  const handleFilterChange = useCallback((newFilters: AppPartialFilterState) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    if (newFilters.selectedDate) {
      setCurrentMonth(startOfMonth(newFilters.selectedDate));
    }
  }, []);

  // --- Employee Management Handlers ---
  const handleAddEmployee = useCallback(() => {
    setEditingEmployee(null);
    setIsEditDialogOpen(true);
  }, []);

  const handleEditEmployee = useCallback((employee: Employee) => {
    setEditingEmployee(employee);
    setIsEditDialogOpen(true);
  }, []);

  const handleDeleteEmployee = useCallback((empId: number) => {
    setDeletingEmployeeId(empId);
  }, []);

  const confirmDeleteEmployee = useCallback(() => {
    if (deletingEmployeeId === null) return;
    setEmployees(prev => prev.filter(emp => emp.id !== deletingEmployeeId));
    setSchedule(prev => {
        const newSchedule = { ...prev };
        Object.keys(newSchedule).forEach(key => {
            const [empIdStr] = key.split('-');
            if (parseInt(empIdStr) === deletingEmployeeId) {
                delete newSchedule[key];
            }
        });
        return newSchedule;
    });
    toast({ title: "Sucesso", description: "Colaborador removido." });
    setDeletingEmployeeId(null);
}, [deletingEmployeeId, toast]);

  const handleSaveEmployee = useCallback((employeeData: Employee) => {
      let updatedEmployees: Employee[] = [];
      let isNewEmployee = false;
      let oldEmployeeData: Employee | undefined;

      setEmployees(prev => {
          const existingIndex = prev.findIndex(e => e.id === employeeData.id);
          if (existingIndex > -1) {
              oldEmployeeData = prev[existingIndex];
              updatedEmployees = [...prev];
              updatedEmployees[existingIndex] = employeeData;
              return updatedEmployees;
          } else {
              const newId = prev.length > 0 ? Math.max(...prev.map(e => e.id)) + 1 : 1;
              const newEmployee = { ...employeeData, id: newId };
              updatedEmployees = [...prev, newEmployee];
              isNewEmployee = true;
              return updatedEmployees;
          }
      });

      // Update Schedule based on Fixed Day Off change
      if ((!isNewEmployee && oldEmployeeData && oldEmployeeData.fixedDayOff !== employeeData.fixedDayOff) || isNewEmployee) {
          const employeeId = employeeData.id;
          const newFixedDayOff = employeeData.fixedDayOff;
          const oldFixedDayOff = oldEmployeeData?.fixedDayOff;
          const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
          daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
          const newFixedDayNum = newFixedDayOff ? fixedDayMapping[newFixedDayOff] : undefined;
          const oldFixedDayNum = oldFixedDayOff ? fixedDayMapping[oldFixedDayOff] : undefined;

          setSchedule(prevSchedule => {
              const newSchedule = { ...prevSchedule };
              // Consider a wider range or multiple months if needed, but start with current view
              const monthStart = startOfMonth(currentMonth);
              const monthEnd = endOfMonth(currentMonth);
              const datesForMonth = getDatesInRange(monthStart, monthEnd);

              datesForMonth.forEach(date => {
                  const key = getScheduleKey(employeeId, date);
                   try {
                     if (isNaN(date.getTime())) return;
                     const dayOfWeek = date.getDay();
                     const currentEntry = newSchedule[key]; // Could be undefined if new employee
                     const dayIsHoliday = isHoliday(date); // Use isHoliday here

                     // Apply new fixed day off (sets to 'F', clears details)
                     if (newFixedDayNum !== undefined && dayOfWeek === newFixedDayNum) {
                         // Only change if it wasn't already a Folga Feriado (FF)
                         // And only if the current shift is not FF (don't override FF with regular F)
                         if (!currentEntry || currentEntry.shift !== 'FF') {
                           newSchedule[key] = { shift: 'F', role: '', baseHours: '', holidayReason: undefined };
                         }
                     }
                     // If it *was* the old fixed day off, reset it (unless it's the *new* fixed day off or a FF)
                     else if (oldFixedDayNum !== undefined && dayOfWeek === oldFixedDayNum && newFixedDayNum !== dayOfWeek && currentEntry?.shift === 'F') {
                         // Reset based on defaults if available, otherwise F
                         let resetShift: ShiftCode = 'F';
                         let resetRole = '';
                         let resetHours = '';
                          if (employeeData.defaultRole && employeeData.defaultShiftType && employeeData.defaultShiftType !== 'Nenhum') {
                              resetShift = 'T';
                              resetRole = employeeData.defaultRole;
                              // Get default hours, considering if the day is a holiday
                              const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
                              const basicDefault = shiftTypeToHoursMap[employeeData.defaultShiftType];
                              resetHours = defaultHoursOptions.includes(basicDefault) ? basicDefault : (defaultHoursOptions[0] || '');
                          }
                         newSchedule[key] = { ...currentEntry, shift: resetShift, role: resetRole, baseHours: resetHours, holidayReason: undefined };
                     } else if (isNewEmployee && !currentEntry) {
                         // If it's a new employee and not a fixed day off, set defaults
                          let initialShift: ShiftCode = 'F';
                          let initialRole = '';
                          let initialHours = '';
                          if (employeeData.defaultRole && employeeData.defaultShiftType && employeeData.defaultShiftType !== 'Nenhum') {
                                initialShift = 'T';
                                initialRole = employeeData.defaultRole;
                                const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
                                const basicDefault = shiftTypeToHoursMap[employeeData.defaultShiftType] || '';
                                initialHours = defaultHoursOptions.includes(basicDefault) ? basicDefault : (defaultHoursOptions[0] || '');
                          }
                          newSchedule[key] = { shift: initialShift, role: initialRole, baseHours: initialHours, holidayReason: undefined };
                     }
                  } catch (e) {
                      console.error(`Error processing schedule key for fixed day update: ${key}`, e);
                  }
              });
              return newSchedule;
          });
      }


      setIsEditDialogOpen(false);
      setEditingEmployee(null);
      toast({ title: "Sucesso", description: `Colaborador ${isNewEmployee ? 'adicionado' : 'atualizado'}.` });
  }, [toast, currentMonth, isHoliday]);


  // --- Schedule Management Handlers ---

   const checkFixedDayOff = useCallback((employee: Employee, date: Date): boolean => {
    if (!employee.fixedDayOff) return false;
    const dayOfWeek = date.getDay();
    const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
    daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
    const fixedDayNum = fixedDayMapping[employee.fixedDayOff];
    return fixedDayNum !== undefined && dayOfWeek === fixedDayNum;
  }, []);


  const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
    const employee = employees.find(e => e.id === empId);
    if (!employee) return;

     // --- Rule Checks ---
     if (newShift === 'T') {
         // Check if trying to set 'T' on a fixed day off
         if (checkFixedDayOff(employee, date)) {
             toast({
                 title: "Regra Violada",
                 description: `${employee.name} tem folga fixa neste dia (${employee.fixedDayOff}). Use 'FF' para Folga Feriado.`,
                 variant: "destructive",
             });
             return; // Prevent change
         }

         // Check consecutive work days rule
        let consecutiveDays = 1; // Start with 1 for the current day being set to 'T'
        for (let i = 1; i <= 6; i++) { // Check previous 6 days
            const checkDate = addDays(date, -i);
            const checkKey = getScheduleKey(empId, checkDate);
            if (schedule[checkKey]?.shift === 'T') {
                consecutiveDays++;
            } else {
                 break; // Stop counting if a non-T day is found
            }
        }
        if (consecutiveDays > 6) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} não pode trabalhar mais de 6 dias consecutivos.`,
                variant: "destructive",
            });
            return; // Prevent change
        }

         // Check consecutive Sundays rule
         if (date.getDay() === 0) { // If the day being set to 'T' is a Sunday
             let consecutiveSundays = 1; // Start with 1 for the current Sunday
             for (let k = 1; k <= 3; k++) { // Check previous 3 Sundays
                 const prevSunday = addDays(date, -k * 7);
                 const prevKey = getScheduleKey(empId, prevSunday);
                 if (schedule[prevKey]?.shift === 'T') {
                     consecutiveSundays++;
                 } else {
                      break; // Stop if a previous Sunday wasn't 'T'
                 }
             }
             if (consecutiveSundays > 3) {
                 toast({
                     title: "Regra Violada",
                     description: `${employee.name} não pode trabalhar mais de 3 domingos consecutivos.`,
                     variant: "destructive",
                 });
                 return; // Prevent change
             }
         }
     }

    // --- Update Schedule ---
    setSchedule(prev => {
      const key = getScheduleKey(empId, date);
      const existingEntry = prev[key] || { shift: 'F', role: '', baseHours: '', holidayReason: undefined };
      let role = existingEntry.role;
      let baseHours = existingEntry.baseHours;
      let holidayReason = existingEntry.holidayReason;

      // Logic based on the NEW shift code
      if (newShift === 'T') {
        role = existingEntry.role || employee.defaultRole || '';
        const dayIsHoliday = isHoliday(date);
        const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
        let determinedDefaultHours = existingEntry.baseHours || '';

        // If baseHours are empty or invalid for the day, try setting defaults
        if (!determinedDefaultHours || !defaultHoursOptions.includes(determinedDefaultHours)) {
             const defaultShiftType = employee.defaultShiftType;
             if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                 const basicDefault = shiftTypeToHoursMap[defaultShiftType];
                 if (defaultHoursOptions.includes(basicDefault)) {
                    determinedDefaultHours = basicDefault;
                 } else if (defaultHoursOptions.length > 0) {
                    determinedDefaultHours = defaultHoursOptions[0]; // Fallback to first option
                 } else {
                    determinedDefaultHours = ''; // No valid options
                 }
             } else if (defaultHoursOptions.length > 0) {
                 determinedDefaultHours = defaultHoursOptions[0]; // Fallback if no default type
             } else {
                 determinedDefaultHours = ''; // No valid options
             }
        }

        baseHours = determinedDefaultHours;
        // If setting to T and role is still empty, try setting default role again
        if (!role && employee.defaultRole) role = employee.defaultRole;
        holidayReason = undefined; // Clear holiday reason when setting to T

      } else if (newShift === 'F') {
         // Clear details when setting to F
         role = '';
         baseHours = '';
         holidayReason = undefined;
      } else if (newShift === 'FF') {
         // Clear T details, keep existing holidayReason (or set to empty string if undefined)
         role = '';
         baseHours = '';
         holidayReason = existingEntry.holidayReason ?? ''; // Keep existing reason or initialize if needed
      }

      return {
        ...prev,
        [key]: {
          shift: newShift,
          role: role,
          baseHours: baseHours,
          holidayReason: holidayReason,
        } as ScheduleEntry,
      };
    });
  }, [employees, schedule, toast, checkFixedDayOff, isHoliday]);


  const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
      setSchedule(prev => {
          const key = getScheduleKey(empId, date);
          const currentEntry = prev[key] || { shift: 'F', role: '', baseHours: '', holidayReason: undefined };

          // Validation: Role/BaseHours only for 'T', HolidayReason only for 'FF'
          if (field === 'role' || field === 'baseHours') {
              if (currentEntry.shift !== 'T') {
                   toast({
                       title: "Ação Inválida",
                       description: "Só é possível definir Função/Horário para dias de Trabalho (T).",
                       variant: "default"
                   });
                   return prev; // Don't update state
              }
          } else if (field === 'holidayReason') {
               if (currentEntry.shift !== 'FF') {
                    toast({
                       title: "Ação Inválida",
                       description: "Só é possível definir Motivo do Feriado para dias de Folga Feriado (FF).",
                       variant: "default"
                    });
                    return prev; // Don't update state
               }
          }

          return { ...prev, [key]: { ...currentEntry, [field]: value } };
      });
  }, [toast]);


  // --- Data Filtering for Display ---
 const filteredEmployees = React.useMemo(() => {
   if (!isClient) return [];

   const { employee: employeeFilter, role: roleFilter } = filters;
   const monthStart = startOfMonth(currentMonth);
   const monthEnd = endOfMonth(currentMonth);

   return employees.filter(emp => {
     if (employeeFilter && emp.id !== parseInt(employeeFilter)) return false;

     if (roleFilter) {
       let hasMatchingRoleInMonth = false;
       let currentDate = new Date(monthStart);
       while (isBefore(currentDate, addDays(monthEnd, 1))) {
         const key = getScheduleKey(emp.id, currentDate);
         const daySchedule = schedule[key];
         // Check role only for 'T' shifts
         if (daySchedule && daySchedule.shift === 'T' && daySchedule.role === roleFilter) {
           hasMatchingRoleInMonth = true;
           break;
         }
         currentDate = addDays(currentDate, 1);
         if (differenceInDays(currentDate, monthStart) > 40) break;
       }
       if (!hasMatchingRoleInMonth) return false;
     }
     return true;
   });
 }, [employees, schedule, filters, currentMonth, isClient]);

  // --- Reset Scale Handler ---
  const handleResetScale = useCallback(() => {
    setIsResetConfirmOpen(true);
  }, []);

  const confirmResetScale = useCallback(() => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const datesForMonth = getDatesInRange(monthStart, monthEnd);
      const newSchedule = { ...schedule };

      employees.forEach(emp => {
          datesForMonth.forEach(date => {
              const key = getScheduleKey(emp.id, date);
               // Reset to 'F' (Folga), clearing role/hours/reason
               newSchedule[key] = { shift: 'F', role: '', baseHours: '', holidayReason: undefined };
          });
      });

      setSchedule(newSchedule);
      setIsResetConfirmOpen(false);
      toast({ title: "Sucesso", description: `Escala do mês de ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada para 'Folga'.` });
  }, [currentMonth, employees, schedule, toast]);


  // --- PDF & WhatsApp Generation ---

 const dayAbbreviations: Record<number, string> = {
     0: 'DOM', 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SAB'
 };


 const generatePdf = useCallback(() => {
     if (!isClient) return;

     const doc = new jsPDF({ orientation: 'landscape' });
     const tableStartDate = startOfMonth(currentMonth);
     const tableEndDate = endOfMonth(currentMonth);
     const datesInRange = getDatesInRange(tableStartDate, tableEndDate);

     doc.setFontSize(14); // Slightly smaller title
     doc.text('ShiftMaster - Escala de Trabalho', 14, 15);
     doc.setFontSize(10); // Smaller subtitle
     doc.setTextColor(100);
     const dateRangeText = `Mês: ${format(tableStartDate, 'MMMM yyyy', { locale: ptBR })}`;
     doc.text(dateRangeText, 14, 22);

     // PDF Header: Colaborador | Ações | DOM 01 | SEG 02 | ...
     const head = [['Colaborador', ...datesInRange.map(d => `${dayAbbreviations[d.getDay()]}\n${format(d, 'dd')}`)]];

     // PDF Body
     const body = filteredEmployees.map(emp => {
         const row = [emp.name];
         datesInRange.forEach(date => {
             const key = getScheduleKey(emp.id, date);
             const entry = schedule[key];
             let cellText = '-'; // Default for missing entries (should be rare now)
             if (entry) {
                 if (entry.shift === 'T') {
                    const roleInitial = entry.role ? entry.role.substring(0, 3).toUpperCase() : '?';
                    const hoursCompact = entry.baseHours ? entry.baseHours.replace(' às ', '-').replace(' ', '') : '?'; // e.g., 10h-18h
                    cellText = `${roleInitial}\n${hoursCompact}`;
                 } else if (entry.shift === 'F') {
                    cellText = 'F';
                 } else if (entry.shift === 'FF') {
                    cellText = entry.holidayReason ? `FF\n(${entry.holidayReason.substring(0,5)})` : 'FF'; // Show reason initial if exists
                 }
             }
             row.push(cellText);
         });
         return row;
     });

     const pageWidth = doc.internal.pageSize.getWidth();
     const margins = 14 * 2;
     const employeeColWidth = 25; // Keep consistent
     const availableWidthForDates = pageWidth - margins - employeeColWidth;
     const dateColWidth = Math.max(8, availableWidthForDates / datesInRange.length); // Adjust min width if needed

     const holidayIndexes = datesInRange.map((date, index) => isHoliday(date) ? index + 1 : -1).filter(index => index !== -1);

     doc.autoTable({
         startY: 28,
         head: head,
         body: body,
         theme: 'grid',
         headStyles: {
             fillColor: [41, 128, 185], // Blue header
             textColor: 255,
             fontStyle: 'bold',
             halign: 'center',
             valign: 'middle',
             fontSize: 6,
             cellPadding: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
             lineColor: [200, 200, 200],
             lineWidth: 0.1,
         },
         styles: {
             cellPadding: { top: 0.5, right: 0.2, bottom: 0.5, left: 0.2 },
             fontSize: 5,
             valign: 'middle',
             halign: 'center',
             lineWidth: 0.1,
             lineColor: [200, 200, 200],
             minCellHeight: 6,
         },
         columnStyles: {
             0: { // Employee name
                 halign: 'left',
                 fontStyle: 'bold',
                 fontSize: 6,
                 cellWidth: employeeColWidth,
                 minCellWidth: employeeColWidth,
                 overflow: 'linebreak',
             },
             ...datesInRange.reduce((acc, _, index) => {
                  acc[index + 1] = { cellWidth: dateColWidth, minCellWidth: 8 }; // Apply date column width
                  return acc;
             }, {} as any),
         },
         didParseCell: function (data) {
             // Style body cells based on shift code
             if (data.cell.section === 'body' && data.column.index > 0) {
                 const empIndex = data.row.index;
                 const dateIndex = data.column.index - 1;
                  if (empIndex >= 0 && empIndex < filteredEmployees.length && dateIndex >= 0 && dateIndex < datesInRange.length) {
                      const entry = schedule[getScheduleKey(filteredEmployees[empIndex].id, datesInRange[dateIndex])];
                      const code = entry?.shift || 'F'; // Default to F if no entry

                      if (code === 'F') {
                         data.cell.styles.fillColor = [240, 240, 240]; // Light gray
                         data.cell.styles.textColor = [120, 120, 120];
                     } else if (code === 'FF') {
                         data.cell.styles.fillColor = [46, 204, 113]; // Green (accent)
                         data.cell.styles.textColor = 255;
                         data.cell.styles.fontStyle = 'bold';
                     } else if (code === 'T') {
                         data.cell.styles.fillColor = [231, 76, 60]; // Red (destructive)
                         data.cell.styles.textColor = 255;
                         data.cell.styles.fontStyle = 'bold';
                     } else { // Should not happen with F default
                         data.cell.styles.fillColor = [255, 255, 255];
                         data.cell.styles.textColor = [180, 180, 180];
                     }
                  }
             }
             // Highlight Holiday Columns in Body
             if (data.cell.section === 'body' && holidayIndexes.includes(data.column.index)) {
                  // Mix the holiday highlight with the shift color
                  const existingFill = data.cell.styles.fillColor || [255, 255, 255];
                  // Example: Make slightly lighter/different hue for holidays
                  data.cell.styles.fillColor = Array.isArray(existingFill)
                      ? [Math.min(255, existingFill[0] + 10), Math.min(255, existingFill[1] + 10), Math.max(0, existingFill[2] - 5)]
                      : '#e0e7ff'; // Fallback blueish tint
                 // Add a subtle border to holiday cells
                 data.cell.styles.lineColor = [52, 152, 219]; // Blue border
                 data.cell.styles.lineWidth = 0.15;
             }

             // Header styles remain the same
              if (data.cell.section === 'head' && data.column.index > 0) {
                   data.cell.styles.fontStyle = 'bold';
                   data.cell.styles.halign = 'center';
                   data.cell.styles.valign = 'middle';
                   // Highlight holiday header columns
                    if (holidayIndexes.includes(data.column.index)) {
                        data.cell.styles.fillColor = [52, 152, 219]; // Darker blue for holiday header
                        data.cell.styles.textColor = 255;
                    }
              }
              if (data.cell.section === 'body' && data.column.index === 0) {
                   data.cell.styles.fontStyle = 'bold';
                   data.cell.styles.halign = 'left';
              }
         }
     });

      // Add Legend to PDF
      const finalY = (doc as any).lastAutoTable.finalY || 30; // Get Y position after table
      doc.setFontSize(8);
      doc.text('Legenda:', 14, finalY + 8);
      let legendX = 14;
      let legendY = finalY + 12;
      Object.entries(shiftCodeToDescription).forEach(([code, description]) => {
          let fillColor: number[] | string = [255, 255, 255]; // Default white
          if (code === 'T') fillColor = [231, 76, 60]; // Red
          if (code === 'F') fillColor = [240, 240, 240]; // Gray
          if (code === 'FF') fillColor = [46, 204, 113]; // Green

          doc.setFillColor.apply(doc, Array.isArray(fillColor) ? fillColor : [255, 255, 255]); // Use apply for array
          doc.rect(legendX, legendY - 2.5, 3, 3, 'F'); // Draw colored square
          doc.setTextColor(0);
          doc.text(`${code}: ${description}`, legendX + 5, legendY);
          legendX += 35; // Adjust spacing as needed
           if (legendX > pageWidth - 40) { // Wrap legend items
               legendX = 14;
               legendY += 5;
           }
      });
      // Add holiday legend item
       doc.setFillColor(52, 152, 219); // Blueish tint for holiday marker
       doc.rect(legendX, legendY - 2.5, 3, 3, 'F');
       doc.setTextColor(0);
       doc.text('Coluna/Dia Feriado', legendX + 5, legendY);


     doc.save(`escala_${format(tableStartDate, 'yyyy-MM')}.pdf`);
     toast({ title: "Sucesso", description: "PDF da escala gerado." });

 }, [isClient, currentMonth, filteredEmployees, schedule, toast, holidays, isHoliday]);


  const generateDailyWhatsAppText = useCallback(() => {
      if (!isClient || !filters.selectedDate) {
           toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive" });
          return;
      }
       const holidayStatus = isHoliday(filters.selectedDate);
       const text = generateWhatsAppText(filters.selectedDate, employees, schedule, holidayStatus, roleToEmojiMap);

      navigator.clipboard.writeText(text).then(() => {
          toast({ title: "Sucesso", description: `Texto da escala de ${format(filters.selectedDate, 'dd/MM/yyyy', {locale: ptBR})} copiado.` });
      }).catch(err => {
          console.error('Failed to copy WhatsApp text: ', err);
          toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive" });
      });

  }, [isClient, filters.selectedDate, employees, schedule, toast, isHoliday, roleToEmojiMap]); // Add roleToEmojiMap here


  // --- Render Logic ---

  if (!isClient) {
    return <div className="flex justify-center items-center h-screen"><p>Carregando...</p></div>;
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const datesForTable = getDatesInRange(monthStart, monthEnd);


  return (
    <div className="p-2 sm:p-4 flex flex-col h-screen bg-background">
      {/* Header */}
       <div className="flex flex-col sm:flex-row justify-between items-center mb-4 flex-wrap gap-2">
         <h1 className="text-xl sm:text-2xl font-bold text-primary text-center sm:text-left">ShiftMaster</h1>
         <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap gap-1 justify-center sm:justify-end">
             <Button onClick={generatePdf} variant="outline" size="sm">
                 <FileText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> PDF (Mês)
             </Button>
             <Button onClick={generateDailyWhatsAppText} variant="outline" size="sm">
                 <MessageSquareText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> WhatsApp (Dia)
             </Button>
             <Button onClick={handleAddEmployee} size="sm">
                 <UserPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Adicionar
             </Button>
             <Button variant="destructive" onClick={handleResetScale} size="sm">
                 <RotateCcw className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Zerar Mês
             </Button>
         </div>
      </div>

       <ShiftFilters
         filters={filters}
         employees={employees}
         roles={availableRoles} // Use imported availableRoles
         onFilterChange={handleFilterChange}
      />

      {/* Month Navigation */}
       <div className="flex justify-center items-center my-2 sm:my-4 space-x-2 sm:space-x-4">
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(startOfMonth(prev), -1))}>Mês Ant.</Button>
          <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(endOfMonth(prev), 1))}>Próx. Mês</Button>
       </div>

      {/* Table Area */}
      <div ref={tableContainerRef} className="flex-grow overflow-auto border rounded-lg shadow-md bg-card">
           <ShiftTable
             employees={filteredEmployees}
             schedule={schedule}
             dates={datesForTable}
             holidays={holidays} // Pass holidays
             onShiftChange={handleShiftChange}
             onDetailChange={handleDetailChange}
             onEditEmployee={handleEditEmployee}
             onDeleteEmployee={handleDeleteEmployee}
             onToggleHoliday={handleToggleHoliday} // Pass toggle function
          />
      </div>

       {/* Dialogs */}
       <EditEmployeeDialog
           isOpen={isEditDialogOpen}
           onOpenChange={setIsEditDialogOpen}
           employee={editingEmployee}
           onSave={handleSaveEmployee}
       />

        <AlertDialog open={deletingEmployeeId !== null} onOpenChange={(open) => !open && setDeletingEmployeeId(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                <AlertDialogDescription>
                    Tem certeza que deseja remover "{employees.find(e => e.id === deletingEmployeeId)?.name || 'colaborador'}"? Os dados de escala também serão removidos. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeletingEmployeeId(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteEmployee} variant="destructive">
                    Remover
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Zerar Escala</AlertDialogTitle>
                <AlertDialogDescription>
                    Tem certeza que deseja zerar a escala para o mês de {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}?
                    Todos os dias para TODOS os colaboradores neste mês serão definidos como 'Folga' (F). Feriados marcados serão mantidos, mas o status do colaborador será 'F'. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmResetScale} variant="destructive">
                    Zerar Escala do Mês
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
