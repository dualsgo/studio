// src/components/shiftmaster/ShiftMasterApp.tsx
'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import HeadInformation from '@/components/HeadInformation'; // Default import
import { cn } from '@/lib/utils'; // Import cn
// Firebase integration removed - using local storage only
// import { db, app } from '@/lib/firebase'; // Import Firestore instance and app
// import { doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc, Timestamp, query, where } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // Uncomment if you need authentication
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry, FilterState, ShiftType, SortOrder } from './types'; // Make sure ShiftType and SortOrder are imported
import { availableRoles, daysOfWeek, roleToEmojiMap, getTimeOptionsForDate, shiftTypeToHoursMap, SELECT_NONE_VALUE, availableShiftCodes, shiftCodeToDescription, getRoleStyles } from './types'; // Import helpers
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange } from './utils'; // Import utils
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format as formatDate, startOfMonth, endOfMonth, isEqual, startOfDay, parse } from 'date-fns'; // Renamed format to formatDate
import { ptBR } from 'date-fns/locale';
import { ShiftTable } from './ShiftTable';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFormField, Form, FormItem, FormControl, FormLabel, FormMessage, FormField } from "@/components/ui/form";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Menubar,
  MenubarContent,
  MenubarMenu,
  MenubarTrigger,
  MenubarShortcut,
} from "@/components/ui/menubar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { ShiftFilters } from './ShiftFilters'; // Import ShiftFilters
import { EditEmployeeDialog } from './EditEmployeeDialog'; // Import EditEmployeeDialog
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // Import autoTable plugin
import { Toaster } from '@/components/ui/toaster'; // Import Toaster
import { Icons } from "@/components/icons"; // Correct import path
import { Save, Upload, RotateCcw, FileText, UserPlus, WifiOff } from 'lucide-react'; // Added Save and Upload


// Extend jsPDF interface for autoTable
declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}

export interface SearchResult {
    media: { url: string };
    description: string;
    id: string;
}

// Define the structure of the backup data
interface BackupData {
  employees: Employee[];
  schedule: ScheduleData;
  filters: Omit<FilterState, 'selectedDate'> & { selectedDateISO?: string }; // Store date as ISO string
  holidays: string[]; // Store dates as ISO strings
  version: number; // Versioning for future compatibility
}

const BACKUP_VERSION = 1;
const LOCAL_STORAGE_KEY = 'escalaMensalData'; // Updated key
const toastDuration = 3000;

export function ShiftMasterApp() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [schedule, setSchedule] = useState<ScheduleData>({});
    const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
    const [filters, setFilters] = useState<FilterState>({
        employee: '',
        role: '',
        selectedDate: null,
    });
    const [sortOrder, setSortOrder] = useState<SortOrder>('default'); // Add sort order state
    const [editOpen, setEditOpen] = useState(false);
    const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
    const [employeeToDelete, setEmployeeToDelete] = useState<number | null>(null);

    const [holidays, setHolidays] = useState<Date[]>([]);
    const [showEasterEgg, setShowEasterEgg] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isClearingMonth, setIsClearingMonth] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [initialLoadCompleted, setInitialLoadCompleted] = useState(false);
    // Firebase state removed
    // const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);

    const { toast } = useToast();
    const isClient = typeof window !== 'undefined';
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null); // Ref for the hidden file input

    // Initialize currentMonth and selectedDate on mount or when they change
    useEffect(() => {
      // If selectedDate exists, derive currentMonth from it
      if (filters.selectedDate) {
        const newCurrentMonth = startOfMonth(filters.selectedDate);
        if (!currentMonth || !isEqual(newCurrentMonth, currentMonth)) {
          setCurrentMonth(newCurrentMonth);
        }
      }
      // If selectedDate is null AND initial load is done, set defaults
      else if (!isLoading && initialLoadCompleted && !currentMonth) {
        const now = new Date();
        const month = startOfMonth(now);
        setCurrentMonth(month);
        setFilters(prev => ({ ...prev, selectedDate: startOfDay(now) }));
      }
    }, [filters.selectedDate, currentMonth, isLoading, initialLoadCompleted]);

    // Determine initial selectedDate on mount
    useEffect(() => {
      if (!isClient) return; // Only run on client

      let initialSelectedDate = startOfDay(new Date());

      const localDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localDataString) {
        try {
          const parsedLocalData = JSON.parse(localDataString);
          if (parsedLocalData.filters?.selectedDateISO) {
            const storedDate = startOfDay(parseISO(parsedLocalData.filters.selectedDateISO));
            if (!isNaN(storedDate.getTime())) {
              initialSelectedDate = storedDate;
            }
          }
        } catch (error) {
          console.warn("Failed to parse selectedDate from localStorage on mount:", error);
        }
      }

      // Set initial filters only if selectedDate is not already set or different
      setFilters(prevFilters => {
        if (!prevFilters.selectedDate || !isEqual(initialSelectedDate, prevFilters.selectedDate)) {
          return { ...prevFilters, selectedDate: initialSelectedDate };
        }
        return prevFilters; // Keep existing filters if date is the same
      });

      setHasMounted(true); // Indicate client-side mount is complete

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isClient]); // Run only once on client mount

     const saveDataToLocalStorage = useCallback((employeesData: Employee[], scheduleData: ScheduleData, filtersData: FilterState, holidaysData: Date[]) => {
       if (!isClient) return;
        try {
            const dataToStore: BackupData = {
                employees: employeesData,
                schedule: scheduleData,
                filters: { // Store date as ISO string
                  employee: filtersData.employee,
                  role: filtersData.role,
                  selectedDateISO: filtersData.selectedDate?.toISOString()
                },
                holidays: holidaysData.map(date => date.toISOString()),
                version: BACKUP_VERSION,
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToStore));
        } catch (error) {
            console.error("Failed to save data to localStorage:", error);
            toast({ title: "Erro de Armazenamento Local", description: "Não foi possível salvar as alterações localmente.", variant: "destructive", duration: toastDuration });
        }
    }, [isClient, toast]);

    const loadDataFromLocalStorage = useCallback(() => {
        if (!isClient) return false;
        const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
        let loadedDataSuccessfully = false;
        if (localData) {
            try {
                const parsedData: BackupData = JSON.parse(localData);
                if (parsedData.employees && parsedData.schedule && parsedData.filters && parsedData.holidays) {
                    // Basic version check (can be expanded)
                    if (parsedData.version !== BACKUP_VERSION) {
                       console.warn(`Backup version mismatch. Expected ${BACKUP_VERSION}, found ${parsedData.version}. Loading anyway.`);
                       // Add migration logic here if needed in the future
                    }

                    setEmployees(parsedData.employees);
                    setSchedule(parsedData.schedule);

                    // Load filters, parsing the ISO date string
                    const loadedSelectedDate = parsedData.filters.selectedDateISO
                       ? startOfDay(parseISO(parsedData.filters.selectedDateISO))
                       : startOfDay(new Date()); // Fallback to today if no date stored

                    const loadedFilters: FilterState = {
                       employee: parsedData.filters.employee ?? '',
                       role: parsedData.filters.role ?? '',
                       selectedDate: loadedSelectedDate
                    };
                    setFilters(loadedFilters); // Directly set the loaded filters

                    // Load holidays, parsing ISO strings
                    const loadedHolidays = (parsedData.holidays || []).map((isoString: string) => startOfDay(parseISO(isoString)));
                    setHolidays(loadedHolidays); // Directly set the loaded holidays

                    toast({ title: 'Dados Locais Carregados', description: 'Usando dados salvos localmente.', variant: 'default', duration: toastDuration });
                    loadedDataSuccessfully = true;
                } else {
                     console.warn("Local storage data structure is invalid.");
                }
            } catch (error) {
                console.error("Failed to parse localStorage data:", error);
                toast({ title: "Erro nos Dados Locais", description: "Não foi possível ler os dados locais. Usando dados padrão.", variant: "warning", duration: toastDuration });
                 localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear corrupted data
            }
        }

        if (!loadedDataSuccessfully) {
             console.log("No valid local data found, generating initial data...");
             const baseDateForInitialData = new Date(); // Use current date for initial data generation
             const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData(baseDateForInitialData);

             setEmployees(initialEmployees);
             setSchedule(initialSchedule);
             setFilters(initialFilters); // Use filters from generateInitialData
             setHolidays(initialHolidays);
        }
        return loadedDataSuccessfully;
    }, [isClient, toast]);


    // Main data loading effect
    useEffect(() => {
         if (!isClient || !hasMounted) return; // Ensure client-side and mounted

        if (!initialLoadCompleted) { // Load data only once
            setIsLoading(true);
            loadDataFromLocalStorage();
            setInitialLoadCompleted(true); // Mark initial load as complete
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isClient, hasMounted]); // Dependencies ensure this runs only when needed after mount

    // Data persistence effect (save to localStorage)
    useEffect(() => {
        // Only save if not loading and initial load is done
        if (!isLoading && initialLoadCompleted && isClient && currentMonth && filters.selectedDate) {
            const handler = setTimeout(() => {
                saveDataToLocalStorage(employees, schedule, filters, holidays);
            }, 500); // Debounce saving

            return () => clearTimeout(handler); // Cleanup timeout on unmount or change
        }
    }, [employees, schedule, filters, holidays, saveDataToLocalStorage, isLoading, initialLoadCompleted, isClient, currentMonth]);


     const isHolidayFn = useCallback((date: Date): boolean => {
         if (!date || isNaN(date.getTime())) return false; // Guard against invalid dates
         const dateStart = startOfDay(date);
         return holidays.some(holiday => {
             if (!holiday || !(holiday instanceof Date) || isNaN(holiday.getTime())) {
                 console.warn("Invalid date found in holidays array:", holiday);
                 return false;
             }
             return isEqual(startOfDay(holiday), dateStart);
         });
     }, [holidays]);

    const addEmployee = (employeeData: Employee) => {
        if (!isClient) return; // Ensure client-side
        const maxId = employees.reduce((max, emp) => Math.max(max, emp.id), 0);
        const newEmployee = { ...employeeData, id: maxId + 1 };
        const newEmployeesArray = [...employees, newEmployee];
        setEmployees(newEmployeesArray);

        // Optionally apply defaults for the new employee to the current schedule
        const updatedSchedule = applyEmployeeDefaults(newEmployee, schedule, holidays, isHolidayFn, currentMonth || new Date());
        setSchedule(updatedSchedule);


        setEditOpen(false);
        // Save immediately after adding
        saveDataToLocalStorage(newEmployeesArray, updatedSchedule, filters, holidays);
        toast({ title: "Sucesso", description: "Colaborador adicionado.", duration: toastDuration });
    };



   const updateEmployee = (employeeData: Employee) => {
        if (!isClient || !currentMonth) return; // Ensure client-side and current month is set
        const updatedEmployees = employees.map(emp =>
            emp.id === employeeData.id ? employeeData : emp
        );
        setEmployees(updatedEmployees);

        const updatedSchedule = applyEmployeeDefaults(employeeData, schedule, holidays, isHolidayFn, currentMonth);
        setSchedule(updatedSchedule);

        setEditOpen(false);
        // Save immediately after updating
        saveDataToLocalStorage(updatedEmployees, updatedSchedule, filters, holidays);
        toast({ title: "Sucesso", description: "Colaborador atualizado.", duration: toastDuration });
    };

    const applyEmployeeDefaults = (
        employee: Employee,
        currentSchedule: ScheduleData,
        currentHolidays: Date[],
        holidayCheckFn: (date: Date) => boolean,
        monthForContext: Date
    ): ScheduleData => {
        if (!monthForContext || isNaN(monthForContext.getTime())) {
          console.error("Invalid monthForContext in applyEmployeeDefaults");
          return currentSchedule; // Return original schedule if month is invalid
        }

        const newSchedule = { ...currentSchedule };
        const datesInMonth = getDatesInRange(startOfMonth(monthForContext), endOfMonth(monthForContext));
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
        daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);

        datesInMonth.forEach(date => {
            const key = getScheduleKey(employee.id, date);
            const dayOfWeek = date.getDay();
            const isFixedDayOff = employee.fixedDayOff && dayOfWeek === fixedDayMapping[employee.fixedDayOff];
            const dayIsActuallyHoliday = holidayCheckFn(date);

            let entry: ScheduleEntry = newSchedule[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };

            // Apply fixed day off rule FIRST
            if (isFixedDayOff) {
                // If it's a fixed day off, it's FOLGA, unless it was manually set to FF before
                if (entry.shift !== 'FF') {
                     entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
            }
            // If not a fixed day off, apply holiday rule
            else if (dayIsActuallyHoliday) {
                 // If the day is a holiday AND NOT a fixed day off, it becomes FF
                 // unless it was already manually set to something else *after* becoming FF
                 if (entry.shift === 'FOLGA' || entry.shift === 'TRABALHA' || !newSchedule[key]) { // Check if it was default Folga/Trabalha or unset
                     entry = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                 }
            }
            // If not fixed day off AND not holiday, apply defaults if applicable
            else if (employee.defaultRole && employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum') {
                 // Only apply defaults if the current state is FOLGA (likely unset or default)
                 if (entry.shift === 'FOLGA') {
                     entry.shift = 'TRABALHA';
                     entry.role = employee.defaultRole;
                     const dayOptions = getTimeOptionsForDate(date, false); // false because it's not a holiday here
                     let defaultHour = '';
                     if (employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum') {
                         const basicDefaultHour = shiftTypeToHoursMap[employee.defaultShiftType] || '';
                         if (dayOptions.includes(basicDefaultHour)) {
                             defaultHour = basicDefaultHour;
                         }
                     }
                     // Fallback if specific default hour not valid or not set
                     if (!defaultHour && dayOptions.length > 0) {
                         defaultHour = dayOptions[0];
                     }
                     entry.baseHours = defaultHour;
                     entry.holidayReason = undefined; // Clear reason if setting to TRABALHA
                 }
            }
            // If none of the above apply, and it's not FF/TRABALHA, ensure it's FOLGA
            else if (entry.shift !== 'FF' && entry.shift !== 'TRABALHA') {
                entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
            }


            newSchedule[key] = entry;
        });
        return newSchedule;
    };

    const deleteEmployee = (employeeId: number) => {
        setEmployeeToDelete(employeeId);
    };

    const confirmDeleteEmployee = useCallback(() => {
        if (employeeToDelete === null || !isClient) return;

        const newEmployees = employees.filter(emp => emp.id !== employeeToDelete);
        const newSchedule = { ...schedule };
        Object.keys(newSchedule).forEach(key => {
          if (key.startsWith(`${employeeToDelete}-`)) {
            delete newSchedule[key];
          }
        });

        setEmployees(newEmployees);
        setSchedule(newSchedule);
        setEmployeeToDelete(null);
        // Save immediately after deleting
        saveDataToLocalStorage(newEmployees, newSchedule, filters, holidays);
        toast({ title: "Sucesso", description: "Colaborador removido.", duration: toastDuration });
    }, [employeeToDelete, employees, schedule, filters, holidays, toast, saveDataToLocalStorage, isClient]);

    const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
         if (!isClient) return;
        const key = getScheduleKey(empId, date);
        const updatedSchedule = { ...schedule };
        const employee = employees.find(e => e.id === empId);
        const dayIsHoliday = isHolidayFn(date);

        let entry: ScheduleEntry = updatedSchedule[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
        entry = { ...entry, shift: newShift };

        // Reset/apply details based on the new shift type
        if (newShift === 'TRABALHA') {
            entry.role = entry.role || employee?.defaultRole || ''; // Keep existing role or apply default
            const dayOptions = getTimeOptionsForDate(date, dayIsHoliday);
            // Only change hours if current hours are invalid for the day or empty
             if (!entry.baseHours || !dayOptions.includes(entry.baseHours)) {
                let defaultHour = '';
                const defaultShiftType = employee?.defaultShiftType;
                 if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                   const basicDefault = shiftTypeToHoursMap[defaultShiftType || 'Nenhum'];
                     if (dayOptions.includes(basicDefault)) {
                         defaultHour = basicDefault; // Prefer default shift type hour if valid
                     }
                 }
                 // If no valid default hour, take the first option for the day
                 if (!defaultHour && dayOptions.length > 0) {
                     defaultHour = dayOptions[0];
                 }
                 entry.baseHours = defaultHour; // Set the determined default/fallback hour
             }
            entry.holidayReason = undefined; // Clear holiday reason
        } else if (newShift === 'FOLGA') {
            // Clear details for FOLGA
            entry.role = '';
            entry.baseHours = '';
            entry.holidayReason = undefined;
        } else if (newShift === 'FF') {
            // Clear work details, keep or set default reason for FF
            entry.role = '';
            entry.baseHours = '';
            entry.holidayReason = entry.holidayReason || 'Feriado'; // Keep existing reason or set default
        }

        updatedSchedule[key] = entry;
        setSchedule(updatedSchedule);
        // Save changes immediately
         saveDataToLocalStorage(employees, updatedSchedule, filters, holidays);
    }, [employees, schedule, holidays, filters, saveDataToLocalStorage, isHolidayFn, isClient]);


    const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
         if (!isClient) return;
        const key = getScheduleKey(empId, date);
        const updatedSchedule = { ...schedule };

        if (!updatedSchedule[key]) {
            console.warn(`Schedule entry not found for key: ${key}. Initializing.`);
            const isDayHoliday = isHolidayFn(date);
            // Initialize based on whether the day is a holiday
            updatedSchedule[key] = isDayHoliday
                ? { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' }
                : { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
        }

        const currentEntry = updatedSchedule[key];

        // Prevent setting work details on non-work days, or holiday reason on non-FF days
        if (currentEntry.shift !== 'TRABALHA' && (field === 'role' || field === 'baseHours')) {
             toast({ title: "Aviso", description: "Função/Horário só se aplicam a dias de Trabalho (T).", variant: "default", duration: toastDuration });
             return; // Don't update state if invalid
        }
        if (currentEntry.shift !== 'FF' && field === 'holidayReason') {
             toast({ title: "Aviso", description: "Motivo só se aplica a Folga Feriado (FF).", variant: "default", duration: toastDuration });
             return; // Don't update state if invalid
        }

        updatedSchedule[key] = { ...currentEntry, [field]: value };
        setSchedule(updatedSchedule);
        // Save changes immediately
        saveDataToLocalStorage(employees, updatedSchedule, filters, holidays);
    }, [schedule, filters, holidays, toast, saveDataToLocalStorage, isHolidayFn, employees, isClient]); // Added employees dependency


    const handleToggleHoliday = useCallback((date: Date) => {
        if (!isClient || !currentMonth) return; // Ensure client-side and current month is set
        const dateStart = startOfDay(date);
        const currentHolidays = [...holidays];
        const currentScheduleState = {...schedule};

        const isCurrentlyHoliday = isHolidayFn(dateStart);
        const updatedHolidays = isCurrentlyHoliday
            ? currentHolidays.filter(holiday => !isEqual(holiday, dateStart))
            : [...currentHolidays, dateStart].sort((a, b) => a.getTime() - b.getTime());

        setHolidays(updatedHolidays); // Update holiday state first

        // Now update the schedule based on the *new* holiday status
        const updatedSchedule = { ...currentScheduleState };
        employees.forEach(emp => {
            const key = getScheduleKey(emp.id, date);
            let entry = updatedSchedule[key]; // Get the current entry for the employee/date
            const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
             daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
             const isFixedDayOff = emp.fixedDayOff && date.getDay() === fixedDayMapping[emp.fixedDayOff];

            // Scenario 1: Day is NOW a holiday (was not before)
            if (!isCurrentlyHoliday) {
                 // If it's NOT a fixed day off AND the current entry is T or F (or unset), change to FF
                 if (!isFixedDayOff && (!entry || entry.shift === 'TRABALHA' || entry.shift === 'FOLGA')) {
                     updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                 }
                 // If it IS a fixed day off, it remains FOLGA even if marked as holiday globally
                 // If it was already manually set to FF, it stays FF
            }
            // Scenario 2: Day is NO LONGER a holiday (was before)
            else {
                 // Only revert if the current shift IS FF (meaning it was likely set due to being a holiday)
                 if (entry && entry.shift === 'FF') {
                     // If it's a fixed day off, revert to FOLGA
                     if (isFixedDayOff) {
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     }
                     // If employee has defaults, try reverting to TRABALHA with defaults
                     else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                         const dayOptions = getTimeOptionsForDate(date, false); // Get options for a non-holiday
                         let defaultHour = '';
                          const basicDefaultHour = shiftTypeToHoursMap[emp.defaultShiftType] || '';
                          if (dayOptions.includes(basicDefaultHour)) {
                              defaultHour = basicDefaultHour;
                          } else if (dayOptions.length > 0) {
                             defaultHour = dayOptions[0]; // Fallback
                          }
                         updatedSchedule[key] = { shift: 'TRABALHA', role: emp.defaultRole, baseHours: defaultHour, holidayReason: undefined };
                     }
                     // Otherwise, revert to FOLGA
                     else {
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     }
                 }
                 // If the shift was already T or F, don't change it just because holiday was removed
            }
        });
        setSchedule(updatedSchedule); // Update schedule state
        // Save changes immediately
        saveDataToLocalStorage(employees, updatedSchedule, filters, updatedHolidays);
        toast({ title: "Feriado Atualizado", description: `Dia ${formatDate(date, 'dd/MM')} ${isCurrentlyHoliday ? 'não é mais' : 'agora é'} feriado.`, duration: toastDuration });

    }, [holidays, employees, schedule, filters, toast, saveDataToLocalStorage, isHolidayFn, currentMonth, isClient]);


    const handleFilterChange = (newFilters: Partial<FilterState>) => {
         if (!isClient) return;
        const updatedFilters = { ...filters, ...newFilters };
        // Normalize selectedDate if it's being updated
        if (newFilters.selectedDate) {
           const normalizedDate = startOfDay(newFilters.selectedDate);
            // Only update if the date actually changed (avoids unnecessary re-renders)
            if (!filters.selectedDate || !isEqual(normalizedDate, filters.selectedDate)) {
                 updatedFilters.selectedDate = normalizedDate;
                 // Also update currentMonth if the month changes
                 const newMonth = startOfMonth(normalizedDate);
                 if (!currentMonth || !isEqual(newMonth, currentMonth)) {
                     setCurrentMonth(newMonth);
                 }
            }
        } else if (newFilters.selectedDate === null) {
             // Handle clearing the date filter if needed
             updatedFilters.selectedDate = null;
             // Optionally reset currentMonth or handle as needed
             // setCurrentMonth(startOfMonth(new Date())); // Example: reset to current real month
        }
        setFilters(updatedFilters);
        // Filters are saved automatically by the persistence useEffect
    };

    const handleSortChange = useCallback(() => {
        setSortOrder(prevOrder => {
            if (prevOrder === 'default') return 'asc';
            if (prevOrder === 'asc') return 'desc';
            return 'default';
        });
    }, []);


    const datesForTable = useMemo(() => {
        if (!currentMonth || isNaN(currentMonth.getTime())) return []; // Guard against invalid currentMonth
        return getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth));
    }, [currentMonth]);

    const filteredAndSortedEmployees = useMemo(() => {
        if (!employees) return []; // Guard against null/undefined employees

        const filtered = employees.filter(emp => {
            // Filter by selected employee ID
            if (filters.employee && emp.id !== parseInt(filters.employee)) return false;

            // Filter by role (check if employee works *any* day with this role in the current view)
            if (filters.role) {
                // Ensure datesForTable is valid before trying to use it
                if (!datesForTable || datesForTable.length === 0) return false; // Or handle appropriately

                const worksInRole = datesForTable.some(date => {
                    const key = getScheduleKey(emp.id, date);
                    // Check schedule entry exists, shift is TRABALHA, and role matches
                    return schedule[key]?.shift === 'TRABALHA' && schedule[key]?.role === filters.role;
                });
                if (!worksInRole) return false; // Exclude if they don't work in the filtered role this month
            }
            return true; // Include if no filters applied or if filters match
        });

        // Apply sorting
        if (sortOrder === 'asc') {
            return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortOrder === 'desc') {
            return [...filtered].sort((a, b) => b.name.localeCompare(a.name));
        } else {
            // 'default' order - maintain original order from state (usually by ID)
            return filtered;
        }

    }, [employees, filters, datesForTable, schedule, sortOrder]);


    const handleClearMonth = useCallback(() => {
        setIsClearingMonth(true);
    }, []);

    const confirmClearMonth = useCallback(() => {
         if (!currentMonth || !isClient) {
            toast({ title: "Erro", description: "Mês atual não definido ou erro do cliente.", variant: "destructive", duration: toastDuration });
            setIsClearingMonth(false);
            return;
         }

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const datesInMonth = getDatesInRange(monthStart, monthEnd);
        const updatedSchedule = { ...schedule }; // Start with current schedule
        const currentHolidays = holidays; // Use current holidays

        // Iterate over all employees and dates in the current month
        employees.forEach(emp => {
            datesInMonth.forEach(date => {
                const key = getScheduleKey(emp.id, date);
                const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
                 daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
                 const isFixedDayOff = emp.fixedDayOff && date.getDay() === fixedDayMapping[emp.fixedDayOff];

                 // If it's a fixed day off, set to FOLGA
                 if (isFixedDayOff) {
                     updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                 }
                 // If it's a holiday (and not a fixed day off), set to FF
                 else if (isHolidayFn(date)) {
                      updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                 }
                 // Otherwise, set to FOLGA (default clear state)
                 else {
                     updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                 }
            });
        });

        setSchedule(updatedSchedule); // Update the schedule state
        setIsClearingMonth(false); // Close the confirmation dialog
        // Save the cleared schedule
        saveDataToLocalStorage(employees, updatedSchedule, filters, currentHolidays);
        toast({ title: "Sucesso", description: `Escala de ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada.`, duration: toastDuration });
    }, [currentMonth, schedule, employees, holidays, toast, saveDataToLocalStorage, isHolidayFn, filters, isClient]);


    const generatePdf = async () => {
        if (!isClient || !currentMonth || !datesForTable || datesForTable.length === 0) {
            toast({ title: "Erro", description: "Não é possível gerar PDF sem dados do mês.", variant: "destructive" });
            return;
        }
        // Dynamically import jspdf and autotable only when needed
        const { default: jsPDF } = await import('jspdf');
        await import('jspdf-autotable');

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        // PDF Header Row
        const header = [['Colaborador', ...datesForTable.map(date => formatDate(date, 'E\ndd', { locale: ptBR }))]];

        // PDF Body Rows
        const body = filteredAndSortedEmployees.map(emp => {
            return [
                // Employee Name Cell
                { content: emp.name, styles: { fontStyle: 'bold', fontSize: 6, cellPadding: 0.5 } },
                // Daily Schedule Cells
                ...datesForTable.map(date => {
                    const key = getScheduleKey(emp.id, date);
                    const entry = schedule[key];
                    const holiday = isHolidayFn(date);
                    let content = '';
                    let fillColor: string | number[] | false = false; // Default: no explicit fill
                    let textColor: string | number[] = [0, 0, 0]; // Default black text
                    let fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal';

                     const shiftDisplayText = entry ? shiftCodeToDescription[entry.shift] : shiftCodeToDescription['FOLGA'];

                    if (entry) {
                        const roleStyles = getRoleStyles(entry.role); // Get role styles
                        switch (entry.shift) {
                            case 'TRABALHA':
                                const roleDisplay = entry.role?.substring(0, 3).toUpperCase() || 'ERR';
                                const hoursDisplay = entry.baseHours?.replace(/\s*às\s*/, '-') || 'S/H';
                                content = `${shiftDisplayText}\n${roleDisplay}\n${hoursDisplay}`;
                                // Use role-specific colors
                                fillColor = roleStyles.pdfFill;
                                textColor = roleStyles.pdfText;
                                fontStyle = 'bold';
                                break;
                            case 'FOLGA':
                                content = shiftDisplayText; // 'F'
                                fillColor = '#f0f0f0'; // Light gray background for FOLGA (muted)
                                textColor = [100, 100, 100]; // Dark gray text
                                break;
                            case 'FF':
                                const reasonDisplay = entry.holidayReason ? `\n(${entry.holidayReason.substring(0, 5)})` : '';
                                content = `${shiftDisplayText}${reasonDisplay}`; // 'FF' + reason
                                fillColor = '#2ecc71'; // Green background for FF (accent)
                                textColor = [255, 255, 255]; // White text
                                fontStyle = 'bold';
                                break;
                            default:
                                content = '?'; // Fallback for unexpected shift codes
                        }
                    } else {
                        // Default to FOLGA style if no entry exists
                        content = shiftDisplayText; // 'F'
                        fillColor = '#f0f0f0';
                        textColor = [100, 100, 100];
                    }

                    // Override fill color for holiday cells that aren't explicitly FF
                    // This highlights the day as a holiday even if someone is working
                    if (holiday && entry?.shift !== 'FF') {
                         // Only set fill if it's not already set by TRABALHA's role color
                         if (fillColor === false) {
                            fillColor = '#e9d5ff'; // Light purple for holiday column highlight
                            textColor = [50, 50, 50]; // Darker text for readability on purple
                         }
                    }

                    return {
                        content,
                        styles: {
                            fillColor: fillColor === false ? undefined : fillColor, // Don't pass false to jspdf
                            textColor,
                            fontStyle,
                            fontSize: 5,
                            cellPadding: { top: 0.5, right: 0.1, bottom: 0.5, left: 0.1 },
                            halign: 'center',
                            valign: 'middle',
                            minCellHeight: 8
                        }
                    };
                })
            ];
        });

        // Calculate column widths
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageMargin = 8;
        const availableWidth = pageWidth - (pageMargin * 2);
        const firstColWidth = 20; // Reduced Width for employee names to give more space
        const actionColWidth = 15; // Width for actions column (if included in PDF)
        const dateColCount = datesForTable.length;
        const remainingWidth = availableWidth - firstColWidth - actionColWidth; // Adjust if actions are included
        const minDateColWidth = 7; // Wider minimum width for date columns
        const calculatedDateColWidth = remainingWidth / dateColCount;
        const dateColWidth = Math.max(minDateColWidth, calculatedDateColWidth);


        // Define Column Styles
        const columnStyles: { [key: number]: any } = {
            0: { cellWidth: firstColWidth, halign: 'left', fontStyle: 'bold', fontSize: 6, valign: 'middle' }, // Employee name column
            // Actions column (if needed, add here)
            // Example: 1: { cellWidth: actionColWidth, ... }
        };
        // Adjust index if actions column is added
        const dateColStartIndex = 1; // Start date columns from index 1
        for (let i = 0; i < dateColCount; i++) {
            columnStyles[i + dateColStartIndex] = { cellWidth: dateColWidth, halign: 'center', valign: 'middle', fontSize: 5 }; // Date columns
        }

        // Draw the table - Use user-provided code here
        doc.autoTable({
            head: header,
            body: body,
            theme: 'grid',
            headStyles: {
                fillColor: '#3498db',
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle',
                fontSize: 7, // Aumentado de 5 para 7
                cellPadding: { top: 1, right: 1, bottom: 1, left: 1 }, // Aumentado o padding
                lineColor: [200, 200, 200],
                lineWidth: 0.2, // Linha ligeiramente mais espessa
                didDrawCell: (data: any) => {
                    if (data.section === 'head' && data.column.index >= dateColStartIndex) {
                        const dateIndex = data.column.index - dateColStartIndex;
                        if (dateIndex < datesForTable.length && isHolidayFn(datesForTable[dateIndex])) {
                            doc.setFillColor('#a855f7');
                            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                            doc.setTextColor(255);
                            doc.setFont(undefined, 'bold');
                            doc.text(String(data.cell.text), data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2, {
                                halign: 'center',
                                valign: 'middle'
                            });
                        }
                    }
                }
            },
            styles: {
                cellPadding: { top: 1, right: 1, bottom: 1, left: 1 }, // Padding aumentado
                fontSize: 7, // Aumentado de 5 para 7
                valign: 'middle',
                halign: 'center',
                lineWidth: 0.2, // Linha ligeiramente mais espessa
                lineColor: [200, 200, 200],
                minCellHeight: 10, // Aumentado de 8 para 10
            },
            columnStyles: {
                0: {
                    cellWidth: 25, // Aumentado de 20 para 25
                    halign: 'left',
                    fontStyle: 'bold',
                    fontSize: 6,
                    valign: 'middle'
                },
                // Colunas de datas terão largura automática ajustada
                ...Object.fromEntries(
                    Array.from({ length: dateColCount }, (_, i) => [
                        i + dateColStartIndex,
                        {
                            cellWidth: 'auto', // Largura automática
                            halign: 'center',
                            valign: 'middle',
                            fontSize: 6
                        }
                    ])
                )
            },
            margin: { top: 15, left: 5, right: 5, bottom: 10 }, // Margens reduzidas
            didDrawPage: (data: any) => {
                // Cabeçalho da página
                doc.setFontSize(12);
                doc.setTextColor(40);
                doc.text('Escala Mensal', 5, 10); // Posição ajustada
                doc.setFontSize(9);
                doc.text(`Mês: ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, 5, 16);

                // Rodapé com legenda
                const pageHeight = doc.internal.pageSize.getHeight();
                const startY = pageHeight - 10; // Posição ajustada
                doc.setFontSize(7); // Aumentado de 6 para 7
                doc.setTextColor(100);
                doc.text("Legenda:", 5, startY);

                let currentX = 5;
                const legendY = startY + 3;
                const rectSize = 3; // Aumentado de 2.5 para 3
                const textOffset = 3.5; // Aumentado de 3 para 3.5
                const spacing = 14; // Aumentado de 12 para 14

                const shiftCodesForLegend: ShiftCode[] = ['TRABALHA', 'FOLGA', 'FF'];
                shiftCodesForLegend.forEach(code => {
                    let fillColorArray: number[] = [255, 255, 255];
                    let textColorArray: number[] = [0, 0, 0];
                    let description = '';

                    if (code === 'TRABALHA') {
                        fillColorArray = [200, 200, 200];
                        textColorArray = [0, 0, 0];
                        description = 'Trabalha (Cor varia por Função)';
                    } else if (code === 'FOLGA') {
                        fillColorArray = [240, 240, 240];
                        textColorArray = [100, 100, 100];
                        description = 'Folga';
                    } else if (code === 'FF') {
                        fillColorArray = [46, 204, 113];
                        textColorArray = [255, 255, 255];
                        description = 'Folga Feriado';
                    }

                    doc.setFillColor(fillColorArray[0], fillColorArray[1], fillColorArray[2]);
                    doc.rect(currentX, legendY - rectSize / 2, rectSize, rectSize, 'F');
                    doc.setTextColor(100);
                    const legendText = `${shiftCodeToDescription[code]}: ${description}`;
                    doc.text(legendText, currentX + textOffset, legendY, { baseline: 'middle' });
                    currentX += textOffset + doc.getTextWidth(legendText) + spacing;
                });

                // Item de legenda para feriados
                doc.setFillColor(168, 85, 247);
                doc.rect(currentX, legendY - rectSize / 2, rectSize, rectSize, 'F');
                doc.setTextColor(100);
                const holidayLegendText = "Dia Feriado (Coluna)";
                doc.text(holidayLegendText, currentX + textOffset, legendY, { baseline: 'middle' });
            },
        });

        doc.save(`escala_${formatDate(currentMonth, 'yyyy-MM')}.pdf`);
        toast({ title: "Sucesso", description: "PDF da escala gerado.", duration: toastDuration });
    };


    const generateDailyWhatsAppText = useCallback(() => {
        if (!isClient) return;
        if (!filters.selectedDate) {
            toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive", duration: toastDuration });
            return;
        }
        const holidayStatus = isHolidayFn(filters.selectedDate);
        const text = generateWhatsAppText(filters.selectedDate, filteredAndSortedEmployees, schedule, holidayStatus, roleToEmojiMap);

        // Use Clipboard API for better compatibility and user experience
        if (navigator.clipboard && navigator.clipboard.writeText) {
             navigator.clipboard.writeText(text).then(() => {
                 toast({ title: "Sucesso", description: `Texto da escala de ${formatDate(filters.selectedDate as Date, 'dd/MM/yyyy', { locale: ptBR })} copiado.`, duration: toastDuration });
             }).catch(e => {
                 console.error("Failed to copy WhatsApp text using Clipboard API: ", e);
                 toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive", duration: toastDuration });
             });
        } else {
             // Fallback for older browsers (less reliable)
             try {
                 const textArea = document.createElement("textarea");
                 textArea.value = text;
                 document.body.appendChild(textArea);
                 textArea.focus();
                 textArea.select();
                 document.execCommand('copy');
                 document.body.removeChild(textArea);
                 toast({ title: "Sucesso", description: `Texto da escala de ${formatDate(filters.selectedDate as Date, 'dd/MM/yyyy', { locale: ptBR })} copiado (fallback).`, duration: toastDuration });
             } catch (e) {
                 console.error("Failed to copy WhatsApp text using fallback: ", e);
                 toast({ title: "Erro", description: "Falha ao copiar texto (navegador incompatível?).", variant: "destructive", duration: toastDuration });
             }
        }
    }, [filteredAndSortedEmployees, schedule, filters.selectedDate, isHolidayFn, toast, roleToEmojiMap, isClient]);

    // ----- Backup and Restore Functions -----
    const handleSaveBackup = useCallback(() => {
        if (!isClient) return;
        try {
            const backupData: BackupData = {
                employees,
                schedule,
                filters: {
                    employee: filters.employee,
                    role: filters.role,
                    selectedDateISO: filters.selectedDate?.toISOString(),
                },
                holidays: holidays.map(d => d.toISOString()),
                version: BACKUP_VERSION,
            };
            const jsonString = JSON.stringify(backupData, null, 2); // Pretty print JSON
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = formatDate(new Date(), 'yyyyMMdd_HHmmss');
            link.download = `escala_mensal_backup_${timestamp}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: "Backup Salvo", description: "Arquivo de backup baixado com sucesso.", duration: toastDuration });
        } catch (error) {
            console.error("Error saving backup:", error);
            toast({ title: "Erro no Backup", description: "Não foi possível gerar o arquivo de backup.", variant: "destructive", duration: toastDuration });
        }
    }, [employees, schedule, filters, holidays, isClient, toast]);


    const handleRestoreBackup = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (!isClient || !event.target.files || event.target.files.length === 0) return;

        const file = event.target.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const jsonString = e.target?.result as string;
                if (!jsonString) {
                    throw new Error("File content is empty or invalid.");
                }
                const parsedData: BackupData = JSON.parse(jsonString);

                // Validate basic structure
                if (!parsedData.employees || !parsedData.schedule || !parsedData.filters || !parsedData.holidays || typeof parsedData.version !== 'number') {
                    throw new Error("Formato de backup inválido.");
                }

                // Version check (optional, can add migration logic)
                 if (parsedData.version !== BACKUP_VERSION) {
                     console.warn(`Restoring backup with version ${parsedData.version}, current version is ${BACKUP_VERSION}.`);
                     // Add migration logic if needed
                 }

                // Restore data
                setEmployees(parsedData.employees);
                setSchedule(parsedData.schedule);

                 // Restore filters, parsing ISO date
                const restoredSelectedDate = parsedData.filters.selectedDateISO
                    ? startOfDay(parseISO(parsedData.filters.selectedDateISO))
                    : startOfDay(new Date()); // Fallback if date is missing

                 const restoredFilters: FilterState = {
                     employee: parsedData.filters.employee ?? '',
                     role: parsedData.filters.role ?? '',
                     selectedDate: restoredSelectedDate,
                 };
                 setFilters(restoredFilters); // Directly set restored filters

                 // Restore holidays, parsing ISO dates
                 const restoredHolidays = parsedData.holidays.map(iso => startOfDay(parseISO(iso)));
                 setHolidays(restoredHolidays); // Directly set restored holidays


                // Force save to local storage immediately after restore
                saveDataToLocalStorage(parsedData.employees, parsedData.schedule, restoredFilters, restoredHolidays);

                toast({ title: "Backup Restaurado", description: "Dados carregados do arquivo.", duration: toastDuration });

            } catch (error) {
                console.error("Error restoring backup:", error);
                const errorMessage = error instanceof Error ? error.message : "Erro desconhecido.";
                toast({ title: "Erro ao Restaurar", description: `Não foi possível carregar o backup: ${errorMessage}`, variant: "destructive", duration: 5000 });
            } finally {
                // Reset file input value to allow uploading the same file again if needed
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };

        reader.onerror = (e) => {
            console.error("Error reading backup file:", e);
            toast({ title: "Erro de Leitura", description: "Não foi possível ler o arquivo de backup.", variant: "destructive", duration: toastDuration });
             if (fileInputRef.current) {
                 fileInputRef.current.value = '';
             }
        };

        reader.readAsText(file);
    }, [isClient, toast, saveDataToLocalStorage]); // Added saveDataToLocalStorage

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };
    // ----- End Backup and Restore Functions -----


    if (!hasMounted || isLoading) {
         return (
           <div className="flex justify-center items-center h-screen bg-background">
             <p className="text-foreground">Carregando dados...</p>
           </div>
         );
    }

  return (
    <div className="p-2 sm:p-4 flex flex-col h-screen bg-background">
        <HeadInformation/>
        <EditEmployeeDialog
          isOpen={editOpen}
          onOpenChange={setEditOpen}
          employee={employeeToEdit}
          onSave={(employeeData) => {
            // Handle the case where a new employee might be added with id 0 or null
            if (!employeeData.id || employeeData.id === 0) {
              addEmployee(employeeData);
            } else {
              updateEmployee(employeeData);
            }
          }}
        />

       <AlertDialog open={employeeToDelete !== null} onOpenChange={(open) => !open && setEmployeeToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja remover "{employees.find(e => e.id === employeeToDelete)?.name || 'este colaborador'}"? A escala associada também será removida. Esta ação não pode ser desfeita (exceto restaurando um backup).
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setEmployeeToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteEmployee} variant="destructive">
                        Remover
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

       <AlertDialog open={isClearingMonth} onOpenChange={setIsClearingMonth}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Zerar Escala</AlertDialogTitle>
                     <AlertDialogDescription>
                         Tem certeza que deseja zerar a escala para o mês de {currentMonth ? formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR }) : 'Mês Corrente'}? Todos os dias para TODOS os colaboradores neste mês serão definidos como 'Folga' (F) ou 'Folga Feriado' (FF) conforme o dia. Esta ação não pode ser desfeita (exceto restaurando um backup).
                     </AlertDialogDescription>
                 </AlertDialogHeader>
                 <AlertDialogFooter>
                     <AlertDialogCancel>Cancelar</AlertDialogCancel>
                     <AlertDialogAction onClick={confirmClearMonth} variant="destructive">
                         Zerar Escala do Mês
                     </AlertDialogAction>
                 </AlertDialogFooter>
             </AlertDialogContent>
         </AlertDialog>

      {/* Hidden file input for backup restore */}
        <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleRestoreBackup}
            style={{ display: 'none' }}
        />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-primary text-center sm:text-left">
              Escala Mensal {/* Updated App Name */}
          </h1>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap gap-1 justify-center sm:justify-end">
              {/* Backup/Restore Buttons */}
              <Button variant="outline" size="sm" onClick={handleSaveBackup}><Save className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Salvar Backup</Button>
              <Button variant="outline" size="sm" onClick={triggerFileInput}><Upload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Carregar Backup</Button>

              {/* Existing Action Buttons */}
              <Button variant="outline" size="sm" onClick={loadDataFromLocalStorage}><RotateCcw className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Recarregar Local</Button>
              <Button variant="outline" size="sm" onClick={generatePdf}><FileText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Gerar PDF (Mês)</Button>
              <Button variant="outline" size="sm" onClick={generateDailyWhatsAppText}><Icons.whatsapp className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> WhatsApp (Dia)</Button>
              <Button size="sm" onClick={() => {setEmployeeToEdit(null); setEditOpen(true)}}><UserPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Adicionar</Button>
              <Button variant="destructive" size="sm" onClick={handleClearMonth}><RotateCcw className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4"/> Zerar Mês</Button>

              {/* Firebase Status Indicator - Kept for reference, but functionality removed */}
             {/* {!isFirebaseConnected && (
                 <TooltipProvider delayDuration={100}>
                     <Tooltip>
                         <TooltipTrigger asChild>
                             <WifiOff className="h-5 w-5 text-destructive" />
                         </TooltipTrigger>
                         <TooltipContent>
                             <p>Erro: Não foi possível conectar ao Firebase. Os dados não serão salvos online.</p>
                         </TooltipContent>
                     </Tooltip>
                 </TooltipProvider>
             )} */}
           </div>
         </div>

         <ShiftFilters
          filters={filters}
          employees={employees}
          roles={availableRoles} // Use imported availableRoles
          onFilterChange={handleFilterChange}
        />

       <div className="flex justify-center items-center my-2 sm:my-4 space-x-2 sm:space-x-4">
         <Button variant="outline" size="sm" onClick={() => filters.selectedDate && handleFilterChange({ selectedDate: addDays(startOfMonth(filters.selectedDate), -1) })} disabled={!filters.selectedDate}>Mês Ant.</Button>
         <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{currentMonth ? formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR }) : 'Carregando mês...'}</span>
         <Button variant="outline" size="sm" onClick={() => filters.selectedDate && handleFilterChange({ selectedDate: addDays(startOfMonth(filters.selectedDate), 31) })} disabled={!filters.selectedDate}>Próx. Mês</Button>
       </div>

       {/* Container div for the table with overflow */}
        <div ref={tableContainerRef} className="flex-grow overflow-auto border rounded-lg shadow-md bg-card">
          <ShiftTable
            employees={filteredAndSortedEmployees} // Use sorted employees
            schedule={schedule}
            dates={datesForTable}
            holidays={holidays}
            sortOrder={sortOrder} // Pass sort order
            onSortChange={handleSortChange} // Pass sort handler
            onShiftChange={handleShiftChange}
            onDetailChange={handleDetailChange}
             onEditEmployee={emp => {
                setEmployeeToEdit(emp);
                setEditOpen(true);
             }}
            onDeleteEmployee={deleteEmployee}
            onToggleHoliday={handleToggleHoliday}
            isHolidayFn={isHolidayFn}
          />
        </div>


      {showEasterEgg && (
        <div className="absolute bottom-4 right-4 opacity-50 pointer-events-none" data-ai-hint="animal cute">
           <img src="https://picsum.photos/50/50" alt="Egg" width={50} height={50} className="rounded-full"/>
        </div>
      )}
      <Toaster />
    </div>
  );
}
