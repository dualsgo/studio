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

export function ShiftMasterApp() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [filters, setFilters] = useState<FilterState>({
    store: '',
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
            setFilters({
              ...parsedData.filters,
              startDate: parseISO(parsedData.filters.startDate),
              endDate: parseISO(parsedData.filters.endDate),
            });
          } else {
             // Set default dates if not found in storage
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

  const saveToLocalStorage = (emps: Employee[], sched: ScheduleData, filt: FilterState) => {
    if (!isClient) return;
    try {
      const dataToStore = JSON.stringify({ employees: emps, schedule: sched, filters: filt });
      localStorage.setItem(STORAGE_KEY, dataToStore);
    } catch (error) {
      console.error("Failed to save schedule data:", error);
      toast({ title: "Erro", description: "Não foi possível salvar as alterações no armazenamento local.", variant: "destructive" });
    }
  };


  const handleFilterChange = useCallback((newFilters: Partial<FilterState>) => {
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
      store: '',
      employee: '',
      role: '',
      startDate: today,
      endDate: addDays(today, 6),
    });
  }, []);

  const checkConsecutiveWorkDays = (empId: number, date: Date): boolean => {
    let consecutiveDays = 0;
    for (let i = 0; i <= 6; i++) {
        const checkDate = addDays(date, -i);
        const key = getScheduleKey(empId, checkDate);
        if (schedule[key]?.shift === 'T') {
            consecutiveDays++;
        } else if (i > 0) { // Stop counting if there's a non-work day before the current streak
            break;
        }
    }
     // Check forward as well to prevent starting a 7+ day streak
    for (let i = 1; i <= (6 - consecutiveDays + 1); i++) {
        const checkDate = addDays(date, i);
        const key = getScheduleKey(empId, checkDate);
        if (schedule[key]?.shift === 'T') {
            consecutiveDays++;
        } else {
            break;
        }
    }
    return consecutiveDays > 6;
  };

  const checkConsecutiveSundays = (empId: number, date: Date): boolean => {
      if (date.getDay() !== 0) return false; // Only check if the target date is a Sunday

      let consecutiveSundays = 0;
      // Check the target Sunday and the previous 3 Sundays
      for (let i = 0; i <= 3; i++) {
          const sundayDate = addDays(date, -i * 7);
          const key = getScheduleKey(empId, sundayDate);
          if (schedule[key]?.shift === 'T') {
              consecutiveSundays++;
          } else if (i > 0) { // If a previous Sunday wasn't worked, the streak is broken
             // If the current change ISN'T to 'T', we don't need to check further back
             // because changing TO 'F'/'H'/'D' won't violate the rule.
             // But if changing TO 'T', we need to ensure previous Sundays allow it.
             // The logic here implicitly handles this - if we find a non-'T' Sunday
             // before hitting 3 consecutive 'T's, the check passes.
             // Let's refine this: only count *consecutive* Sundays worked leading up to the potential 4th.
             let currentStreak = 0;
             for (let j = 0; j <= 3; j++) {
                 const checkSun = addDays(date, -j * 7);
                 const checkKey = getScheduleKey(empId, checkSun);
                 if (schedule[checkKey]?.shift === 'T') {
                     currentStreak++;
                 } else {
                     // Found a non-working Sunday, break the *current* streak check
                     break;
                 }
             }
             // If the current streak *including* the potential new 'T' day is <= 3, it's okay.
             // The check `consecutiveSundays > 3` below handles this.
             // Let's simplify: Count consecutive Sundays worked *ending* on the Sunday *before* the target date.
             let previousConsecutiveSundays = 0;
             for (let k = 1; k <= 3; k++) { // Check up to 3 Sundays before
                 const prevSunday = addDays(date, -k * 7);
                 const prevKey = getScheduleKey(empId, prevSunday);
                 if (schedule[prevKey]?.shift === 'T') {
                     previousConsecutiveSundays++;
                 } else {
                     break; // Streak broken
                 }
             }
             // If already worked 3 consecutive Sundays before this one, cannot work this one.
             return previousConsecutiveSundays >= 3;

          }
      }
      // If we checked 3 previous Sundays and they were all 'T', plus the current one makes 4.
      return consecutiveSundays > 3;
  };


  const checkFixedDayOff = (employee: Employee, date: Date): boolean => {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Convert stored fixedDayOff (e.g., "Segunda") to the corresponding day number
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
        tempSchedule[key] = { ...tempSchedule[key], shift: newShift }; // Assume the change is made

        // 2. Check Consecutive Work Days (using temp schedule)
        let consecutiveDays = 0;
        for (let i = 0; i <= 6; i++) { // Check up to 6 days back + current day
            const checkDate = addDays(date, -i);
            const checkKey = getScheduleKey(empId, checkDate);
             if (tempSchedule[checkKey]?.shift === 'T') {
                consecutiveDays++;
            } else if (i > 0) { // Stop if a non-work day breaks the streak
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


        // 3. Check Consecutive Sundays (using temp schedule)
         if (date.getDay() === 0) { // Only check if the changed day is a Sunday
             let previousConsecutiveSundays = 0;
             for (let k = 1; k <= 3; k++) { // Check up to 3 Sundays *before* the current one
                 const prevSunday = addDays(date, -k * 7);
                 const prevKey = getScheduleKey(empId, prevSunday);
                 // Use the original schedule for previous days, as the temp change only affects the current date
                 if (schedule[prevKey]?.shift === 'T') {
                     previousConsecutiveSundays++;
                 } else {
                     break; // Streak broken
                 }
             }
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
      return {
        ...prev,
        [key]: {
          ...(prev[key] || { role: employee.baseRole, baseHours: employee.baseHours }), // Keep existing role/hours or use base
          shift: newShift,
        },
      };
    });
  }, [employees, schedule, toast]);


  const handleDetailChange = useCallback((empId: number, date: Date | null, field: 'role' | 'baseHours', value: string) => {
    if (date === null) { // Apply to employee's base details
      setEmployees(prev =>
        prev.map(emp =>
          emp.id === empId ? { ...emp, [field === 'role' ? 'baseRole' : 'baseHours']: value } : emp
        )
      );
      // Optionally update all future schedule entries for this employee that don't have specific overrides
      // setSchedule(prev => updateFutureBaseSchedule(prev, empId, field, value));

    } else { // Apply to specific date cell
      setSchedule(prev => {
        const key = getScheduleKey(empId, date);
        const currentShift = prev[key]?.shift || 'D'; // Default to 'D' if no entry exists
        const currentRole = prev[key]?.role || employees.find(e => e.id === empId)?.baseRole || '';
        const currentHours = prev[key]?.baseHours || employees.find(e => e.id === empId)?.baseHours || '';
        return {
          ...prev,
          [key]: {
            shift: currentShift,
            role: field === 'role' ? value : currentRole,
            baseHours: field === 'baseHours' ? value : currentHours,
          },
        };
      });
    }
  }, [employees]); // Add employees dependency

  // Filter employees based on current filters
 const filteredEmployees = React.useMemo(() => {
   if (!isClient) return []; // Return empty array during SSR or before client mount

   const { store, employee: employeeFilter, role: roleFilter, startDate, endDate } = filters;

   return employees.filter(emp => {
     // Basic filters (if applied)
     if (store && emp.store !== store) return false;
     if (employeeFilter && emp.id !== parseInt(employeeFilter)) return false; // Assuming employee filter uses ID
     // Role filter needs to check baseRole OR if they have that role scheduled in the period
     // Base role check:
     let roleMatch = !roleFilter || emp.baseRole === roleFilter;

     // Check if scheduled within the period (if basic filters pass or aren't set)
     let isScheduledInPeriod = false;
     if (startDate && endDate) {
       let currentDate = new Date(startDate);
       while (currentDate <= endDate) {
         const key = getScheduleKey(emp.id, currentDate);
         const daySchedule = schedule[key];
         if (daySchedule && daySchedule.shift === 'T') {
           isScheduledInPeriod = true;
           // If role filter is active, check if the role matches for *any* scheduled day
           if (roleFilter && daySchedule.role === roleFilter) {
             roleMatch = true; // Found a match within the schedule
           }
         }
         if (isScheduledInPeriod && (!roleFilter || roleMatch)) {
            break; // Found a scheduled day, and role matches (if filter active), no need to check further
         }
         currentDate = addDays(currentDate, 1);
       }
     } else {
        // If no date range, assume we show all employees matching other filters
        isScheduledInPeriod = true;
     }


     // Final decision: must match store/employee if filtered, must match role (base or scheduled), AND must be scheduled in the period
     return (!store || emp.store === store) &&
            (!employeeFilter || emp.id === parseInt(employeeFilter)) &&
            (!roleFilter || roleMatch) &&
            isScheduledInPeriod;
   });
 }, [employees, schedule, filters, isClient]);


  if (!isClient) {
    // Render a loading state or null during SSR/hydration mismatch phase
    return <div className="flex justify-center items-center h-screen"><p>Carregando gerenciador de escalas...</p></div>;
  }


  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col h-screen">
       <h1 className="text-2xl font-bold mb-4 text-primary">ShiftMaster – Gerenciador de Escalas</h1>
       <ShiftFilters
         filters={filters}
         employees={employees}
         roles={['Caixa', 'Vendas', 'Estoque', 'Fiscal', 'Pacote', 'Organização']} // Define available roles
         stores={['Loja A', 'Loja B', 'Loja C']} // Example stores
         onFilterChange={handleFilterChange}
         onClearFilters={handleClearFilters}
      />
      <div className="flex-grow overflow-auto mt-4 border rounded-lg shadow-md">
           <ShiftTable
             employees={filteredEmployees}
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
