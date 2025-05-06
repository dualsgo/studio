
'use client';

import type { ChangeEvent, MouseEvent } from 'react';
import React, { useState, useEffect, useCallback } from 'react';
import { ShiftFilters } from './ShiftFilters';
import { ShiftTable } from './ShiftTable';
import type { Employee, ScheduleData, FilterState, ShiftCode } from './types';
import { generateInitialData, getScheduleKey } from './utils';
import { useToast } from "@/hooks/use-toast";
import { isAfter, isBefore, parseISO, differenceInDays, addDays } from 'date-fns';

const STORAGE_KEY = 'shiftMasterSchedule';

// Define types without the 'store' property for filters
type AppFilterState = Omit<FilterState, 'store'>;
type AppPartialFilterState = Partial<AppFilterState>;


export function ShiftMasterApp() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [filters, setFilters] = useState<AppFilterState>({
    employee: '',
    role: '',
    startDate: new Date(),
    endDate: addDays(new Date(), 6), // Default to 1 week view
  });
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();

  // Load data from localStorage on mount
  useEffect(() => {
    setIsClient(true);
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        if (parsedData.employees && parsedData.schedule) {
          setEmployees(parsedData.employees);
          // Convert date strings back to Date objects for filters
          if (parsedData.filters && parsedData.filters.startDate && parsedData.filters.endDate) {
             const { store, ...loadedFilters } = parsedData.filters;
            setFilters({
              ...loadedFilters,
              startDate: parseISO(loadedFilters.startDate),
              endDate: parseISO(loadedFilters.endDate),
            });
          } else {
             const today = new Date();
             setFilters(prev => ({ ...prev, startDate: today, endDate: addDays(today, 6) }));
          }
          setSchedule(parsedData.schedule);
        } else {
          initializeDefaultData();
        }
      } catch (error) {
        console.error("Failed to parse stored schedule data:", error);
        toast({ title: "Erro", description: "Falha ao carregar dados salvos. Redefinindo para o padrão.", variant: "destructive" });
        initializeDefaultData();
      }
    } else {
      initializeDefaultData();
    }
  }, [toast]); // Add toast dependency

  const initializeDefaultData = () => {
    const { initialEmployees, initialSchedule, initialFilters } = generateInitialData();
    setEmployees(initialEmployees);
    setSchedule(initialSchedule);
    setFilters(initialFilters);
    saveToLocalStorage(initialEmployees, initialSchedule, initialFilters);
  };

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (isClient && employees.length > 0) { // Only save if data is loaded/initialized
      saveToLocalStorage(employees, schedule, filters);
    }
  }, [employees, schedule, filters, isClient]);

  const saveToLocalStorage = (emps: Employee[], sched: ScheduleData, filt: AppFilterState) => {
    if (!isClient) return;
    try {
      const dataToStore = JSON.stringify({ employees: emps, schedule: sched, filters: filt });
      localStorage.setItem(STORAGE_KEY, dataToStore);
    } catch (error) {
      console.error("Failed to save schedule data:", error);
      toast({ title: "Erro", description: "Não foi possível salvar as alterações no armazenamento local.", variant: "destructive" });
    }
  };


  const handleFilterChange = useCallback((newFilters: AppPartialFilterState) => {
    setFilters(prev => {
      const updatedFilters = { ...prev, ...newFilters };
      // Ensure endDate is not before startDate
      if (updatedFilters.endDate && updatedFilters.startDate && isBefore(updatedFilters.endDate, updatedFilters.startDate)) {
        updatedFilters.endDate = updatedFilters.startDate;
        toast({ title: "Aviso", description: "A data final não pode ser anterior à data inicial.", variant: "default" });
      }
      return updatedFilters;
    });
  }, [toast]);

  const handleClearFilters = useCallback(() => {
    const today = new Date();
    setFilters({
      employee: '',
      role: '',
      startDate: today,
      endDate: addDays(today, 6),
    });
  }, []);


  const checkFixedDayOff = (employee: Employee, date: Date): boolean => {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const fixedDayMapping: { [key: string]: number } = {
        "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6
    };
    const fixedDayNum = fixedDayMapping[employee.fixedDayOff || ""];
    return fixedDayNum !== undefined && dayOfWeek === fixedDayNum;
  };


  const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
    const employee = employees.find(e => e.id === empId);
    if (!employee) return;

    // --- Validation Rules ---
    if (newShift === 'T') {
        // 1. Check Fixed Day Off
        if (checkFixedDayOff(employee, date)) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} tem folga fixa neste dia (${employee.fixedDayOff}).`,
                variant: "destructive",
            });
            return; // Prevent update
        }

         // Create a temporary schedule state for validation checks
        const tempSchedule = { ...schedule };
        const key = getScheduleKey(empId, date);
         // Ensure the temporary schedule has the potential new shift and associated details
         tempSchedule[key] = {
             shift: newShift,
             // Use existing details if available, otherwise empty strings as placeholders
             role: schedule[key]?.role || '',
             baseHours: schedule[key]?.baseHours || '',
         };

        // 2. Check Consecutive Work Days (using temp schedule)
        let consecutiveDays = 0;
        for (let i = 0; i < 7; i++) { // Check up to 6 days back + current day
            const checkDate = addDays(date, -i);
            const checkKey = getScheduleKey(empId, checkDate);
             // Check the temporary schedule for the current date, original schedule for past dates
            const dayShift = (i === 0) ? tempSchedule[checkKey]?.shift : schedule[checkKey]?.shift;
             if (dayShift === 'T') {
                consecutiveDays++;
             } else if (i > 0) { // Stop if a non-work day breaks the streak *before* the current day
                 break;
             }
        }
         if (consecutiveDays > 6) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} não pode trabalhar mais de 6 dias consecutivos.`,
                variant: "destructive",
            });
            return; // Prevent update
        }


        // 3. Check Consecutive Sundays (using original schedule for past Sundays)
         if (date.getDay() === 0) { // Only check if the changed day is a Sunday
             let previousConsecutiveSundays = 0;
             for (let k = 1; k <= 3; k++) { // Check up to 3 Sundays *before* the current one
                 const prevSunday = addDays(date, -k * 7);
                 const prevKey = getScheduleKey(empId, prevSunday);
                 // Use the original schedule for previous days
                 if (schedule[prevKey]?.shift === 'T') {
                     previousConsecutiveSundays++;
                 } else {
                     break; // Streak broken
                 }
             }
             // If already worked 3 consecutive Sundays before this one, cannot work this one.
             if (previousConsecutiveSundays >= 3) {
                 toast({
                     title: "Regra Violada",
                     description: `${employee.name} não pode trabalhar mais de 3 domingos consecutivos.`,
                     variant: "destructive",
                 });
                 return; // Prevent update
             }
         }
    }

    // --- Update Schedule ---
    setSchedule(prev => {
      const key = getScheduleKey(empId, date);
      const existingEntry = prev[key] || {}; // Get existing entry or empty object
      return {
        ...prev,
        [key]: {
          ...existingEntry, // Keep existing details like role/hours if present
          shift: newShift,
          // If changing *away* from 'T' or 'H', we might clear role/hours, but ShiftCell handles display
          // So, just update the shift code here. Role/Hours are updated via handleDetailChange.
        },
      };
    });
  }, [employees, schedule, toast]);


  // Updated handleDetailChange: Only modifies schedule for a specific date.
  const handleDetailChange = useCallback((empId: number, date: Date | null, field: 'role' | 'baseHours', value: string) => {
      // We only allow changing details for a specific date now.
      if (date === null) {
          console.warn("Attempted to change base employee details, which is no longer supported here.");
          return;
      }

      setSchedule(prev => {
          const key = getScheduleKey(empId, date);
          const currentEntry = prev[key] || { shift: 'D', role: '', baseHours: '' }; // Ensure an entry exists

           // Only allow setting role/hours if the shift is 'T' or 'H'
           if (currentEntry.shift !== 'T' && currentEntry.shift !== 'H') {
               toast({
                   title: "Ação Inválida",
                   description: "Só é possível definir Função/Horário para dias de Trabalho (T) ou Horário Especial (H).",
                   variant: "default"
               });
               return prev; // Return previous state without changes
           }

          return {
              ...prev,
              [key]: {
                  ...currentEntry,
                  [field]: value, // Update the specific field (role or baseHours)
              },
          };
      });
  }, [toast]); // Removed employees dependency as we no longer access it here


 // Filter employees based on current filters
 const filteredEmployees = React.useMemo(() => {
   if (!isClient) return [];

   const { employee: employeeFilter, role: roleFilter, startDate, endDate } = filters;

   return employees.filter(emp => {
     // Employee ID filter
     if (employeeFilter && emp.id !== parseInt(employeeFilter)) return false;

     // Check if the employee is scheduled within the date range and matches the role filter (if active)
     let isScheduledInPeriod = false;
     let roleMatchInPeriod = !roleFilter; // Assume role matches if no role filter is set

     if (startDate && endDate) {
       let currentDate = new Date(startDate);
       while (currentDate <= endDate) {
         const key = getScheduleKey(emp.id, currentDate);
         const daySchedule = schedule[key];

         if (daySchedule && (daySchedule.shift === 'T' || daySchedule.shift === 'H')) {
           isScheduledInPeriod = true; // Employee is scheduled on this day
           // If role filter is active, check if this day's role matches
           if (roleFilter && daySchedule.role === roleFilter) {
             roleMatchInPeriod = true; // Found a matching role within the period
           }
         }

         // Optimization: if already found scheduled and role matches (if filter active), exit loop
         if (isScheduledInPeriod && roleMatchInPeriod) {
            break;
         }

         currentDate = addDays(currentDate, 1);
         // Safety break for potential infinite loops with date logic
         if (differenceInDays(currentDate, startDate) > 366) break;
       }
     } else {
        // If no date range, consider everyone scheduled (or adjust based on requirements)
        isScheduledInPeriod = true;
     }

     // Final check: Employee must match ID filter (if set) AND
     // be scheduled in the period AND match role filter (if set and a match was found)
     return isScheduledInPeriod && roleMatchInPeriod;
   });
 }, [employees, schedule, filters, isClient]);


  if (!isClient) {
    return <div className="flex justify-center items-center h-screen"><p>Carregando gerenciador de escalas...</p></div>;
  }


  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col h-screen">
       <h1 className="text-2xl font-bold mb-4 text-primary">ShiftMaster – Gerenciador de Escalas</h1>
       <ShiftFilters
         filters={filters}
         employees={employees} // Pass all employees to filters for selection
         roles={['Caixa', 'Vendas', 'Estoque', 'Fiscal', 'Pacote', 'Organização']}
         onFilterChange={handleFilterChange}
         onClearFilters={handleClearFilters}
      />
      <div className="flex-grow overflow-auto mt-4 border rounded-lg shadow-md">
           <ShiftTable
             employees={filteredEmployees} // Pass filtered employees to table
             schedule={schedule}
             startDate={filters.startDate}
             endDate={filters.endDate}
             onShiftChange={handleShiftChange}
             onDetailChange={handleDetailChange}
          />
      </div>
    </div>
  );
}
