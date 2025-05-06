

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftFilters } from './ShiftFilters';
import { ShiftTable } from './ShiftTable';
import type { Employee, ScheduleData, FilterState, ShiftCode, DayOfWeek, ShiftType, ScheduleEntry } from './types'; // Added ScheduleEntry
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange } from './utils';
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format, startOfMonth, endOfMonth, parse } from 'date-fns'; // Added parse, month functions
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { UserPlus, FileText, MessageSquareText, Eraser, RotateCcw } from 'lucide-react'; // Added Eraser and RotateCcw icons
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { roleToEmojiMap, daysOfWeek } from './types'; // Import roleToEmojiMap and daysOfWeek

// Extend jsPDF interface for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const STORAGE_KEY = 'shiftMasterSchedule';

// Use the updated FilterState directly
type AppFilterState = FilterState;
type AppPartialFilterState = Partial<AppFilterState>;


export function ShiftMasterApp() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date())); // State to track the displayed month
  const [filters, setFilters] = useState<AppFilterState>({
    employee: '',
    role: '',
    selectedDate: new Date(), // Default selected date is today
  });
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false); // State for reset confirmation

  const tableContainerRef = useRef<HTMLDivElement>(null);

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
            // Ensure selectedDate is a Date object
            selectedDate: loadedFilters.selectedDate ? parseISO(loadedFilters.selectedDate) : new Date(),
          });
           // Set the current month based on the loaded selectedDate
           setCurrentMonth(startOfMonth(loadedFilters.selectedDate ? parseISO(loadedFilters.selectedDate) : new Date()));
          setSchedule(parsedData.schedule);
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
  }, [toast]); // Removed isClient from dependency array as it only needs to run once

  const initializeDefaultData = useCallback(() => {
    const { initialEmployees, initialSchedule, initialFilters } = generateInitialData();
    setEmployees(initialEmployees);
    setSchedule(initialSchedule);
    setFilters(initialFilters);
    setCurrentMonth(startOfMonth(initialFilters.selectedDate)); // Set month based on initial filters
    // No need to save here, the effect below will handle it
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (isClient && employees.length > 0) { // Check employees.length > 0 to avoid saving empty initial state
      saveToLocalStorage(employees, schedule, filters);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, schedule, filters]); // Removed isClient dependency here, save should trigger on data change after mount

   const saveToLocalStorage = (emps: Employee[], sched: ScheduleData, filt: AppFilterState) => {
    // No need for isClient check here as the calling effect handles it
    try {
      // Ensure selectedDate is stringified correctly
      const filtersToStore = {
        ...filt,
        selectedDate: filt.selectedDate?.toISOString(),
      };
      const dataToStore = JSON.stringify({ employees: emps, schedule: sched, filters: filtersToStore });
      localStorage.setItem(STORAGE_KEY, dataToStore);
    } catch (error) {
      console.error("Failed to save schedule data:", error);
      toast({ title: "Erro", description: "Não foi possível salvar as alterações no armazenamento local.", variant: "destructive" });
    }
  };


  // --- Filter Handlers ---

  const handleFilterChange = useCallback((newFilters: AppPartialFilterState) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    // If the selectedDate changes, update the displayed month
    if (newFilters.selectedDate) {
      setCurrentMonth(startOfMonth(newFilters.selectedDate));
    }
  }, []);

  // No separate clear filters button needed for the current setup

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
        // Remove schedule entries for the deleted employee
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
      let oldEmployeeData: Employee | undefined; // Store old data for comparison

      setEmployees(prev => {
          const existingIndex = prev.findIndex(e => e.id === employeeData.id);
          if (existingIndex > -1) {
              // Update existing employee
              oldEmployeeData = prev[existingIndex]; // Store old data before update
              updatedEmployees = [...prev];
              updatedEmployees[existingIndex] = employeeData;
              return updatedEmployees;
          } else {
              // Add new employee
              const newId = prev.length > 0 ? Math.max(...prev.map(e => e.id)) + 1 : 1;
              const newEmployee = { ...employeeData, id: newId };
              updatedEmployees = [...prev, newEmployee];
              isNewEmployee = true;
              return updatedEmployees;
          }
      });

      // --- Update Schedule based on Fixed Day Off change ---
      if (!isNewEmployee && oldEmployeeData && oldEmployeeData.fixedDayOff !== employeeData.fixedDayOff) {
          const employeeId = employeeData.id;
          const newFixedDayOff = employeeData.fixedDayOff;
          const oldFixedDayOff = oldEmployeeData.fixedDayOff; // Get old day off
          const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
          daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index); // Populate mapping
          const newFixedDayNum = newFixedDayOff ? fixedDayMapping[newFixedDayOff] : undefined;
          const oldFixedDayNum = oldFixedDayOff ? fixedDayMapping[oldFixedDayOff] : undefined;

          setSchedule(prevSchedule => {
              const newSchedule = { ...prevSchedule };
              // Determine range to update (e.g., current month, visible range, or all data)
              // For simplicity, let's update the current month only, but a wider range might be needed
              const monthStart = startOfMonth(currentMonth);
              const monthEnd = endOfMonth(currentMonth);
              const datesForMonth = getDatesInRange(monthStart, monthEnd);

              datesForMonth.forEach(date => {
                  const key = getScheduleKey(employeeId, date);
                  try {
                     if (isNaN(date.getTime())) {
                           console.warn(`Skipping invalid date format in schedule key: ${key}`);
                           return; // Skip if date is invalid
                       }
                     const dayOfWeek = date.getDay();
                     const currentEntry = newSchedule[key] || { shift: 'D', role: '', baseHours: '' };

                     // If the day matches the new fixed day off, set to Folga (F)
                     if (newFixedDayNum !== undefined && dayOfWeek === newFixedDayNum) {
                         newSchedule[key] = { ...currentEntry, shift: 'F', role: '', baseHours: '' };
                     }
                     // If the day *was* the old fixed day off but is no longer, reset it
                     else if (oldFixedDayNum !== undefined && dayOfWeek === oldFixedDayNum && newFixedDayNum !== dayOfWeek) {
                          // Reset to Disponible (D) or apply defaults if they exist
                         let resetShift: ShiftCode = 'D';
                         let resetRole = '';
                         let resetHours = '';
                          if (employeeData.defaultRole && employeeData.defaultShiftType && employeeData.defaultShiftType !== 'Nenhum') {
                              const { shiftTypeToHoursMap } = require('./types');
                              resetShift = 'T'; // Assume 'T' when applying defaults
                              resetRole = employeeData.defaultRole;
                              resetHours = shiftTypeToHoursMap[employeeData.defaultShiftType] || '';
                          }
                         newSchedule[key] = { ...currentEntry, shift: resetShift, role: resetRole, baseHours: resetHours };
                     }
                  } catch (e) {
                      console.error(`Error processing schedule key for fixed day update: ${key}`, e);
                  }
              });
              return newSchedule;
          });
      }
      // --- End Schedule Update ---

      setIsEditDialogOpen(false);
      setEditingEmployee(null);
      toast({ title: "Sucesso", description: `Colaborador ${isNewEmployee ? 'adicionado' : 'atualizado'}.` });
  }, [toast, currentMonth]); // Added currentMonth dependency


  // --- Schedule Management Handlers ---

   const checkFixedDayOff = (employee: Employee, date: Date): boolean => {
    if (!employee.fixedDayOff) return false;
    const dayOfWeek = date.getDay(); // 0..6
    const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
    daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index); // Populate mapping
    const fixedDayNum = fixedDayMapping[employee.fixedDayOff];
    return fixedDayNum !== undefined && dayOfWeek === fixedDayNum;
  };


  const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
    const employee = employees.find(e => e.id === empId);
    if (!employee) return;

    // --- Validation Rules ---
    if (newShift === 'T') {
        if (checkFixedDayOff(employee, date)) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} tem folga fixa neste dia (${employee.fixedDayOff}).`,
                variant: "destructive",
            });
            return; // Prevent changing to 'T' on fixed day off
        }

        // Create a temporary schedule to check rules *before* applying the change
        const tempSchedule = { ...schedule };
        const key = getScheduleKey(empId, date);
        const existingEntry = schedule[key];

        // Determine role and hours for the potential new 'T' shift
        const role = existingEntry?.role || employee.defaultRole || '';
        const defaultHours = employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum'
                           ? require('./types').shiftTypeToHoursMap[employee.defaultShiftType] // Use base map for default
                           : '';
        const baseHours = existingEntry?.baseHours || defaultHours;

        // Update temporary schedule for rule checking
        tempSchedule[key] = { shift: newShift, role: role, baseHours: baseHours };


        // Check consecutive days (using the temporary schedule for the current day)
        let consecutiveDays = 0;
        for (let i = 0; i < 7; i++) { // Check up to 7 days back including the current one
            const checkDate = addDays(date, -i);
            const checkKey = getScheduleKey(empId, checkDate);
            const dayShift = (i === 0) ? tempSchedule[checkKey]?.shift : schedule[checkKey]?.shift; // Use temp for day 0
             if (dayShift === 'T') {
                 consecutiveDays++;
             } else if (i > 0 && dayShift !== 'T') { // If a non-'T' day is found (except the current one), stop counting back
                  break;
             }
             // If the current day is not T, reset count (shouldn't happen if newShift is T, but defensive)
             // if (i === 0 && dayShift !== 'T') consecutiveDays = 0;
        }

         if (consecutiveDays > 6) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} não pode trabalhar mais de 6 dias consecutivos.`,
                variant: "destructive",
            });
            return; // Prevent the change
        }

        // Check consecutive Sundays (only if the current date is a Sunday)
         if (date.getDay() === 0) {
             let previousConsecutiveSundays = 0;
             // Check the 3 Sundays *before* the current one
             for (let k = 1; k <= 3; k++) {
                 const prevSunday = addDays(date, -k * 7);
                 const prevKey = getScheduleKey(empId, prevSunday);
                 if (schedule[prevKey]?.shift === 'T') {
                     previousConsecutiveSundays++;
                 } else {
                      break; // Stop if a non-working Sunday is found
                 }
             }
             // If the previous 3 were 'T', this one cannot be 'T'
             if (previousConsecutiveSundays >= 3) {
                 toast({
                     title: "Regra Violada",
                     description: `${employee.name} não pode trabalhar mais de 3 domingos consecutivos.`,
                     variant: "destructive",
                 });
                 return; // Prevent the change
             }
         }
    }

    // --- Update Schedule (if validation passed or not applicable) ---
    setSchedule(prev => {
      const key = getScheduleKey(empId, date);
      const existingEntry = prev[key];
      let role = '';
      let baseHours = '';

      // Only keep role/hours if the new shift is T or H
      if (newShift === 'T' || newShift === 'H') {
        role = existingEntry?.role || employee.defaultRole || '';
        const defaultShiftType = employee.defaultShiftType;
        // Use existing hours if they exist, otherwise use default based on shift type mapping
        baseHours = existingEntry?.baseHours || (defaultShiftType && defaultShiftType !== 'Nenhum' ? require('./types').shiftTypeToHoursMap[defaultShiftType] : '');
         // If setting to T or H and role/hours are still empty, try setting defaults
         if (!role && employee.defaultRole) role = employee.defaultRole;
         if (!baseHours && employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum') {
             baseHours = require('./types').shiftTypeToHoursMap[employee.defaultShiftType];
         }

      }


      return {
        ...prev,
        [key]: {
          // Keep existing entry structure but update shift and potentially role/hours
          ...(existingEntry || {}), // Start with existing or empty object
          shift: newShift,
          role: role, // Will be empty if shift is not T/H
          baseHours: baseHours, // Will be empty if shift is not T/H
        } as ScheduleEntry, // Assert the type
      };
    });
  }, [employees, schedule, toast]); // Added checkFixedDayOff as it's used


  const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours', value: string) => {
      setSchedule(prev => {
          const key = getScheduleKey(empId, date);
           const currentEntry = prev[key] || { shift: 'D', role: '', baseHours: '' };
           // Allow editing details only if the current shift is 'T' or 'H'
           if (currentEntry.shift !== 'T' && currentEntry.shift !== 'H') {
               toast({
                   title: "Ação Inválida",
                   description: "Só é possível definir Função/Horário para dias de Trabalho (T) ou Horário Especial (H). Altere o estado do dia primeiro.",
                   variant: "default"
               });
               return prev; // Return previous state without changes
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
     // Filter by selected employee if one is chosen
     if (employeeFilter && emp.id !== parseInt(employeeFilter)) return false;

     // Filter by role if one is chosen
     if (roleFilter) {
       let hasMatchingRoleInMonth = false;
       let currentDate = new Date(monthStart); // Ensure we start with a fresh date object
       while (isBefore(currentDate, addDays(monthEnd, 1))) { // Iterate through each day of the *current* month
         const key = getScheduleKey(emp.id, currentDate);
         const daySchedule = schedule[key];
         // Check if the employee has the selected role on this day (only for T or H shifts)
         if (daySchedule && (daySchedule.shift === 'T' || daySchedule.shift === 'H') && daySchedule.role === roleFilter) {
           hasMatchingRoleInMonth = true;
           break; // Found a match for this employee in the current month, no need to check further dates
         }
         currentDate = addDays(currentDate, 1);
         // Safety break shouldn't be strictly necessary with isBefore, but kept just in case
         if (differenceInDays(currentDate, monthStart) > 40) {
            console.warn("Employee role filter loop exceeded 40 days.");
            break;
         }
       }
       // If no matching role was found for the entire month, filter out the employee
       if (!hasMatchingRoleInMonth) return false;
     }

     // If no filters active or filters passed, include the employee
     return true;
   });
 }, [employees, schedule, filters, currentMonth, isClient]); // Added currentMonth

  // --- Reset Scale Handler ---
  const handleResetScale = useCallback(() => {
    setIsResetConfirmOpen(true);
  }, []);

  const confirmResetScale = useCallback(() => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const datesForMonth = getDatesInRange(monthStart, monthEnd);
      const newSchedule = { ...schedule }; // Start with existing schedule

      // Iterate through all employees (not just filtered ones)
      employees.forEach(emp => {
          datesForMonth.forEach(date => {
              const key = getScheduleKey(emp.id, date);
              // Always set to Folga (F) when resetting
              newSchedule[key] = { shift: 'F', role: '', baseHours: '' };
          });
      });

      setSchedule(newSchedule);
      setIsResetConfirmOpen(false);
      toast({ title: "Sucesso", description: `Escala do mês de ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada para 'Folga'.` });
  }, [currentMonth, employees, schedule, toast]); // Depends on all employees


  // --- PDF & WhatsApp Generation ---

 // Abbreviated day names for PDF header
 const dayAbbreviations: Record<number, string> = {
     0: 'DOM', 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SAB'
 };


 const generatePdf = useCallback(() => {
     if (!isClient) return;

     const doc = new jsPDF({ orientation: 'landscape' });
     const tableStartDate = startOfMonth(currentMonth);
     const tableEndDate = endOfMonth(currentMonth);
     const datesInRange = getDatesInRange(tableStartDate, tableEndDate);

     doc.setFontSize(16); // Slightly smaller title
     doc.text('ShiftMaster - Escala de Trabalho', 14, 15);
     doc.setFontSize(10); // Smaller subtitle
     doc.setTextColor(100);
     const dateRangeText = `Mês: ${format(tableStartDate, 'MMMM yyyy', { locale: ptBR })}`;
     doc.text(dateRangeText, 14, 22);

     // Use abbreviated day names and only the day number for header
     const head = [['Colaborador', ...datesInRange.map(d => `${dayAbbreviations[d.getDay()]}\n${format(d, 'dd')}`)]];

     // Use filteredEmployees for PDF content to match the screen
     const body = filteredEmployees.map(emp => {
         const row = [emp.name];
         datesInRange.forEach(date => {
             const key = getScheduleKey(emp.id, date);
             const entry = schedule[key];
             let cellText = '-'; // Default for D or missing entries
             if (entry) {
                 if (entry.shift === 'T') {
                    // Combine role and hours compactly, handle missing info
                    const roleInitial = entry.role ? entry.role.substring(0, 3).toUpperCase() : '?'; // e.g., CAI, VEN
                    const hoursCompact = entry.baseHours ? entry.baseHours.replace('h às ', '-').replace('h','').replace(' ', '') : '?'; // e.g., 10-18
                    cellText = `${roleInitial}\n${hoursCompact}`;
                 } else if (entry.shift === 'H') {
                    const roleInitial = entry.role ? entry.role.substring(0, 3).toUpperCase() : '?';
                    const hoursCompact = entry.baseHours ? entry.baseHours.replace('h às ', '-').replace('h','').replace(' ', '') : '?';
                    cellText = `${roleInitial}\n${hoursCompact}\n(H)`; // Indicate Special Hour
                 } else if (entry.shift === 'F') {
                    cellText = 'F'; // Folga
                 }
             }
             row.push(cellText);
         });
         return row;
     });

     // Calculate available width and dynamic column width
     const pageWidth = doc.internal.pageSize.getWidth();
     const margins = 14 * 2; // Left and right margins
     const employeeColWidth = 25; // Keep employee column fixed but maybe smaller
     const availableWidthForDates = pageWidth - margins - employeeColWidth;
     const dateColWidth = Math.max(5, availableWidthForDates / datesInRange.length); // Ensure a minimum width


     doc.autoTable({
         startY: 28, // Adjust start position
         head: head,
         body: body,
         theme: 'grid',
         headStyles: {
             fillColor: [41, 128, 185], // Blue header
             textColor: 255,
             fontStyle: 'bold',
             halign: 'center',
             valign: 'middle', // Vertically align header text
             fontSize: 6, // Smaller font for header
             cellPadding: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 }, // Minimal padding
             lineColor: [200, 200, 200], // Light gray lines for header too
             lineWidth: 0.1,
         },
         styles: {
             cellPadding: { top: 0.5, right: 0.2, bottom: 0.5, left: 0.2 }, // Minimal horizontal padding
             fontSize: 5, // Even smaller font size for cell content
             valign: 'middle',
             halign: 'center',
             lineWidth: 0.1,
             lineColor: [200, 200, 200],
             minCellHeight: 6, // Reduced min cell height
         },
         columnStyles: {
             0: { // Employee name column
                 halign: 'left',
                 fontStyle: 'bold',
                 fontSize: 6, // Slightly larger font for names
                 cellWidth: employeeColWidth,
                 minCellWidth: employeeColWidth, // Fixed width
                 overflow: 'linebreak', // Allow name to wrap if needed
             },
              // Apply calculated width to date columns (index 1 onwards)
             ...datesInRange.reduce((acc, _, index) => {
                  acc[index + 1] = { cellWidth: dateColWidth, minCellWidth: 5 };
                  return acc;
             }, {} as any),
         },
         didParseCell: function (data) {
             // Apply cell styling based on content
             if (data.cell.section === 'body' && data.column.index > 0) {
                 const empIndex = data.row.index;
                 const dateIndex = data.column.index - 1;
                  if (empIndex >= 0 && empIndex < filteredEmployees.length && dateIndex >= 0 && dateIndex < datesInRange.length) {
                      const entry = schedule[getScheduleKey(filteredEmployees[empIndex].id, datesInRange[dateIndex])];

                      if (entry?.shift === 'F') { // Folga
                         data.cell.styles.fillColor = [240, 240, 240]; // Light gray
                         data.cell.styles.textColor = [120, 120, 120];
                     } else if (entry?.shift === 'H') { // Horário Especial
                         data.cell.styles.fillColor = [52, 152, 219]; // Blue
                         data.cell.styles.textColor = 255;
                         data.cell.styles.fontStyle = 'bold';
                     } else if (entry?.shift === 'T') { // Trabalha
                         data.cell.styles.fillColor = [231, 76, 60]; // Red
                         data.cell.styles.textColor = 255;
                         data.cell.styles.fontStyle = 'bold';
                     } else { // Disponible ('D') or '-'
                         data.cell.styles.fillColor = [255, 255, 255]; // White
                         data.cell.styles.textColor = [180, 180, 180]; // Light gray for '-'
                         data.cell.styles.fontStyle = 'normal'; // Ensure normal style for '-'
                     }
                  }
             }
             // Adjust font style for multi-line headers (day abbreviation + number)
              if (data.cell.section === 'head' && data.column.index > 0) {
                   data.cell.styles.fontStyle = 'bold';
                   data.cell.styles.halign = 'center';
                   data.cell.styles.valign = 'middle';
              }
              // Ensure employee name column font style remains correct
              if (data.cell.section === 'body' && data.column.index === 0) {
                   data.cell.styles.fontStyle = 'bold';
                   data.cell.styles.halign = 'left';
              }
         }
     });


     doc.save(`escala_${format(tableStartDate, 'yyyy-MM')}.pdf`);
     toast({ title: "Sucesso", description: "PDF da escala gerado." });

 }, [isClient, currentMonth, filteredEmployees, schedule, toast]); // Depend on currentMonth


  const generateDailyWhatsAppText = useCallback(() => {
      if (!isClient || !filters.selectedDate) {
           toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive" });
          return;
      }

      // Pass roleToEmojiMap to the utility function
      const text = generateWhatsAppText(filters.selectedDate, employees, schedule, roleToEmojiMap);

      navigator.clipboard.writeText(text).then(() => {
          toast({ title: "Sucesso", description: `Texto da escala de ${format(filters.selectedDate, 'dd/MM/yyyy', {locale: ptBR})} copiado.` });
      }).catch(err => {
          console.error('Failed to copy WhatsApp text: ', err);
          toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive" });
      });

  }, [isClient, filters.selectedDate, employees, schedule, toast]); // Depend on selectedDate


  // --- Render Logic ---

  if (!isClient) {
    return <div className="flex justify-center items-center h-screen"><p>Carregando gerenciador de escalas...</p></div>;
  }

  // Calculate dates for the current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const datesForTable = getDatesInRange(monthStart, monthEnd);


  return (
    <div className="p-2 sm:p-4 md:p-6 lg:p-8 flex flex-col h-screen bg-background"> {/* Adjusted padding for smaller screens */}
      {/* Header */}
       <div className="flex flex-col sm:flex-row justify-between items-center mb-4 flex-wrap gap-2">
         <h1 className="text-xl sm:text-2xl font-bold text-primary text-center sm:text-left">ShiftMaster – Gerenciador de Escalas</h1>
         {/* Action Buttons */}
          <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap gap-1 justify-center sm:justify-end"> {/* Adjusted spacing and gap */}
             <Button onClick={generatePdf} variant="outline" size="sm"> {/* Smaller button size */}
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

       {/* Filters */}
       <ShiftFilters
         filters={filters}
         employees={employees} // Pass all employees for the filter dropdown
         roles={require('./types').availableRoles} // Pass available roles
         onFilterChange={handleFilterChange}
      />

      {/* Month Navigation */}
       <div className="flex justify-center items-center my-2 sm:my-4 space-x-2 sm:space-x-4"> {/* Adjusted margin and spacing */}
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(startOfMonth(prev), -1))}>Mês Ant.</Button> {/* Shorter text */}
          <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(endOfMonth(prev), 1))}>Próx. Mês</Button> {/* Shorter text */}
       </div>

      {/* Table Area */}
      <div ref={tableContainerRef} className="flex-grow overflow-auto border rounded-lg shadow-md bg-card"> {/* Table BG */}
           <ShiftTable
             employees={filteredEmployees} // Pass filtered employees to the table
             schedule={schedule}
             dates={datesForTable} // Pass the calculated dates for the current month
             onShiftChange={handleShiftChange}
             onDetailChange={handleDetailChange}
             onEditEmployee={handleEditEmployee}
             onDeleteEmployee={handleDeleteEmployee}
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
                    Tem certeza que deseja remover "{employees.find(e => e.id === deletingEmployeeId)?.name || 'colaborador'}"? Os dados de escala deste colaborador também serão removidos. Esta ação não pode ser desfeita.
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
                    Todos os dias para TODOS os colaboradores neste mês serão definidos como 'Folga' (F). Esta ação não pode ser desfeita.
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

