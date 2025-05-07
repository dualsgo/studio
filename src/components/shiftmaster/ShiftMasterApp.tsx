'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import HeadInformation from '@/components/HeadInformation'; // Default import
import { cn } from '@/lib/utils';
// Firebase imports removed
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry, FilterState, ShiftType } from './types'; // Make sure ShiftType is imported
import { availableRoles, daysOfWeek, roleToEmojiMap, getTimeOptionsForDate, shiftTypeToHoursMap, SELECT_NONE_VALUE, availableShiftCodes, shiftCodeToDescription as typeShiftCodeToDescription } from './types'; // Correctly import from types
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange } from './utils'; // Import utils
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format as formatDate, startOfMonth, endOfMonth, isEqual, startOfDay, parse } from 'date-fns'; // Renamed format to formatDate
import { ptBR } from 'date-fns/locale';
import { ShiftTable } from './ShiftTable';
import { Button } from '@/components/ui/button';
// WifiOff import removed
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

const LOCAL_STORAGE_KEY = 'shiftMasterData';
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
    const [editOpen, setEditOpen] = useState(false);
    const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
    const [employeeToDelete, setEmployeeToDelete] = useState<number | null>(null);
    // isFirebaseConnected state removed

    const [holidays, setHolidays] = useState<Date[]>([]);
    const [showEasterEgg, setShowEasterEgg] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isClearingMonth, setIsClearingMonth] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [initialLoadCompleted, setInitialLoadCompleted] = useState(false);


    const { toast } = useToast();
    const isClient = typeof window !== 'undefined';
    const tableContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (filters.selectedDate) {
        const newCurrentMonth = startOfMonth(filters.selectedDate);
        if (!currentMonth || !isEqual(newCurrentMonth, currentMonth)) {
          setCurrentMonth(newCurrentMonth);
        }
      } else if (!isLoading && initialLoadCompleted) {
        const now = new Date();
        const month = startOfMonth(now);
        setCurrentMonth(month);
        setFilters(prev => ({ ...prev, selectedDate: startOfDay(now) }));
      }
    }, [filters.selectedDate, currentMonth, isLoading, initialLoadCompleted]);

    useEffect(() => {
      const now = new Date();
      let newSelectedDate = now;

      if (isClient) {
        const localDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localDataString) {
          try {
            const parsedLocalData = JSON.parse(localDataString);
            if (parsedLocalData.filters?.selectedDate) {
              const storedDate = parseISO(parsedLocalData.filters.selectedDate);
              if (!isNaN(storedDate.getTime())) {
                newSelectedDate = storedDate;
              }
            }
          } catch (error) {
            console.warn("Failed to parse selectedDate from localStorage:", error);
          }
        }
      }
      newSelectedDate = startOfDay(newSelectedDate);

      setFilters(prevFilters => {
        if (!prevFilters.selectedDate || !isEqual(newSelectedDate, prevFilters.selectedDate)) {
          return { ...prevFilters, selectedDate: newSelectedDate };
        }
        return prevFilters;
      });
      setHasMounted(true);
    }, [isClient]);

     const saveDataToLocalStorage = useCallback((employeesData: Employee[], scheduleData: ScheduleData, filtersData: FilterState, holidaysData: Date[]) => {
       if (!isClient) return;
        try {
            const dataToStore = {
                employees: employeesData,
                schedule: scheduleData,
                filters: {
                  ...filtersData,
                  selectedDate: filtersData.selectedDate?.toISOString()
                },
                holidays: holidaysData.map(date => date.toISOString()),
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
        if (localData) {
            try {
                const parsedData = JSON.parse(localData);
                if (parsedData.employees && parsedData.schedule) {
                    setEmployees(parsedData.employees);
                    setSchedule(parsedData.schedule);

                    const loadedSelectedDate = parsedData.filters?.selectedDate ? startOfDay(parseISO(parsedData.filters.selectedDate)) : startOfDay(new Date());
                    const loadedFilters = {
                      employee: parsedData.filters?.employee ?? '',
                      role: parsedData.filters?.role ?? '',
                      selectedDate: loadedSelectedDate
                    };
                    setFilters(prevFilters =>
                      JSON.stringify(prevFilters) !== JSON.stringify(loadedFilters) ? loadedFilters : prevFilters
                    );

                    const loadedHolidays = (parsedData.holidays || []).map((isoString: string) => startOfDay(parseISO(isoString)));
                     setHolidays(prevHolidays =>
                       JSON.stringify(prevHolidays.map(d => d.toISOString())) !== JSON.stringify(loadedHolidays.map(d => d.toISOString())) ? loadedHolidays : prevHolidays
                     );

                    toast({ title: 'Dados Locais Carregados', description: 'Usando dados salvos localmente.', variant: 'default', duration: toastDuration });
                    return true;
                }
            } catch (error) {
                console.error("Failed to parse localStorage data:", error);
                toast({ title: "Erro nos Dados Locais", description: "Não foi possível ler os dados locais. Usando dados padrão.", variant: "warning", duration: toastDuration });
            }
        }
        console.log("No valid local data found, generating initial data...");
        const baseDateForInitialData = filters.selectedDate || new Date();
        const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData(baseDateForInitialData);

        setEmployees(initialEmployees);
        setSchedule(initialSchedule);

        const genSelectedDate = startOfDay(initialFilters.selectedDate || new Date());
        const genFilters = {
            employee: initialFilters.employee,
            role: initialFilters.role,
            selectedDate: genSelectedDate
        };
         setFilters(prevFilters =>
           JSON.stringify(prevFilters) !== JSON.stringify(genFilters) ? genFilters : prevFilters
         );
        setHolidays(initialHolidays);
        return false;
    }, [isClient, toast, filters.selectedDate]);


    // Main data loading effect
    useEffect(() => {
         if (!isClient || !hasMounted || initialLoadCompleted) {
             if (!initialLoadCompleted) setIsLoading(false);
             return;
         }
        if (filters.selectedDate) {
           loadDataFromLocalStorage();
           setIsLoading(false);
           setInitialLoadCompleted(true);
        } else {
             setIsLoading(false);
        }
    }, [isClient, hasMounted, filters.selectedDate, initialLoadCompleted, loadDataFromLocalStorage]);


    // Data persistence effect (save to localStorage)
    useEffect(() => {
        const handler = setTimeout(() => {
            if (isLoading || !initialLoadCompleted || !hasMounted || !currentMonth || !filters.selectedDate) {
                return;
            }
            saveDataToLocalStorage(employees, schedule, filters, holidays);
        }, 500);

        return () => {
            clearTimeout(handler);
        };
    }, [employees, schedule, filters, holidays, saveDataToLocalStorage, isLoading, initialLoadCompleted, hasMounted, currentMonth]);


    const addEmployee = (employeeData: Employee) => {
        const originalEmployees = employees;
        const maxId = originalEmployees.reduce((max, emp) => Math.max(max, emp.id), 0);
        const newEmployee = { ...employeeData, id: maxId + 1 };
        const newEmployeesArray = [...originalEmployees, newEmployee];

        setEmployees(newEmployeesArray);
        setEditOpen(false);
        saveDataToLocalStorage(newEmployeesArray, schedule, filters, holidays);
        toast({ title: "Sucesso", description: "Colaborador adicionado.", duration: toastDuration });
    };

    const isHolidayFn = useCallback((date: Date): boolean => {
        const dateStart = startOfDay(date);
        return holidays.some(holiday => {
            if (!(holiday instanceof Date) || isNaN(holiday.getTime())) {
                console.warn("Invalid date found in holidays array:", holiday);
                return false;
            }
            return isEqual(startOfDay(holiday), dateStart);
        });
    }, [holidays]);

   const updateEmployee = (employeeData: Employee) => {
        if (!currentMonth) return;
        const originalEmployees = [...employees];
        const originalSchedule = {...schedule};

        const updatedEmployees = originalEmployees.map(emp =>
            emp.id === employeeData.id ? employeeData : emp
        );
        setEmployees(updatedEmployees);

        const updatedSchedule = applyEmployeeDefaults(employeeData, originalSchedule, holidays, isHolidayFn, currentMonth);
        setSchedule(updatedSchedule);

        setEditOpen(false);
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

            if (isFixedDayOff) {
                if (entry.shift !== 'FF') {
                    entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
            }
            else if (employee.defaultRole && employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum' && entry.shift !== 'FF') {
                 entry.shift = 'TRABALHA';
                 entry.role = employee.defaultRole;
                 const dayOptions = getTimeOptionsForDate(date, dayIsActuallyHoliday);
                 let defaultHour = '';
                 if (employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum') {
                     const basicDefaultHour = shiftTypeToHoursMap[employee.defaultShiftType] || '';
                     if (dayOptions.includes(basicDefaultHour)) {
                         defaultHour = basicDefaultHour;
                     }
                 }
                 if (!defaultHour && dayOptions.length > 0) {
                     defaultHour = dayOptions[0];
                 }
                 entry.baseHours = defaultHour;
                 entry.holidayReason = undefined;
            }

             if (dayIsActuallyHoliday && !isFixedDayOff && (entry.shift === 'FOLGA' || entry.shift === 'TRABALHA')) {
                entry = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
            }

            newSchedule[key] = entry;
        });
        return newSchedule;
    };

    const deleteEmployee = (employeeId: number) => {
        setEmployeeToDelete(employeeId);
    };

    const confirmDeleteEmployee = useCallback(() => {
        if (employeeToDelete === null) return;

        const originalEmployees = [...employees];
        const originalSchedule = {...schedule};
        const newEmployees = originalEmployees.filter(emp => emp.id !== employeeToDelete);
        const newSchedule = { ...schedule };
        Object.keys(newSchedule).forEach(key => {
          if (key.startsWith(`${employeeToDelete}-`)) {
            delete newSchedule[key];
          }
        });

        setEmployees(newEmployees);
        setSchedule(newSchedule);
        setEmployeeToDelete(null);
        saveDataToLocalStorage(newEmployees, newSchedule, filters, holidays);
        toast({ title: "Sucesso", description: "Colaborador removido.", duration: toastDuration });
    }, [employeeToDelete, employees, schedule, filters, holidays, toast, saveDataToLocalStorage]);

    const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
        const key = getScheduleKey(empId, date);
        const currentScheduleState = {...schedule};
        const updatedSchedule = { ...currentScheduleState };
        const employee = employees.find(e => e.id === empId);
        const dayIsHoliday = isHolidayFn(date);

        let entry: ScheduleEntry = updatedSchedule[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
        entry = { ...entry, shift: newShift };

        if (newShift === 'TRABALHA') {
            entry.role = entry.role || employee?.defaultRole || '';
            const dayOptions = getTimeOptionsForDate(date, dayIsHoliday);
             if (!entry.baseHours || !dayOptions.includes(entry.baseHours)) {
                let defaultHour = '';
                const defaultShiftType = employee?.defaultShiftType;
                 if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                   const basicDefault = shiftTypeToHoursMap[defaultShiftType || 'Nenhum'];
                     if (dayOptions.includes(basicDefault)) {
                         defaultHour = basicDefault;
                     }
                 }
                 if (!defaultHour && dayOptions.length > 0) {
                     defaultHour = dayOptions[0];
                 }
                 entry.baseHours = defaultHour;
             }
            entry.holidayReason = undefined;
        } else if (newShift === 'FOLGA') {
            entry.role = '';
            entry.baseHours = '';
            entry.holidayReason = undefined;
        } else if (newShift === 'FF') {
            entry.role = '';
            entry.baseHours = '';
            entry.holidayReason = entry.holidayReason || 'Feriado';
        }

        updatedSchedule[key] = entry;
        setSchedule(updatedSchedule);
        saveDataToLocalStorage(employees, updatedSchedule, filters, holidays);
    }, [employees, schedule, holidays, filters, saveDataToLocalStorage, isHolidayFn]);


    const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
        const key = getScheduleKey(empId, date);
        const currentScheduleState = {...schedule};
        const updatedSchedule = { ...currentScheduleState };

        if (!updatedSchedule[key]) {
            console.warn(`Schedule entry not found for key: ${key}. Initializing.`);
            const isDayHoliday = isHolidayFn(date);
            updatedSchedule[key] = isDayHoliday
                ? { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' }
                : { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
        }

        const currentEntry = updatedSchedule[key];

        if (currentEntry.shift !== 'TRABALHA' && (field === 'role' || field === 'baseHours')) {
             toast({ title: "Aviso", description: "Função/Horário só se aplicam a dias de Trabalho (T).", variant: "default", duration: toastDuration });
             return;
        }
        if (currentEntry.shift !== 'FF' && field === 'holidayReason') {
             toast({ title: "Aviso", description: "Motivo só se aplica a Folga Feriado (FF).", variant: "default", duration: toastDuration });
             return;
        }

        updatedSchedule[key] = { ...currentEntry, [field]: value };
        setSchedule(updatedSchedule);
        saveDataToLocalStorage(employees, updatedSchedule, filters, holidays);
    }, [employees, schedule, filters, holidays, toast, saveDataToLocalStorage, isHolidayFn]);

    const handleToggleHoliday = useCallback((date: Date) => {
        if (!currentMonth) return;
        const dateStart = startOfDay(date);
        const currentHolidays = [...holidays];
        const currentScheduleState = {...schedule};

        const isCurrentlyHoliday = isHolidayFn(dateStart);
        const updatedHolidays = isCurrentlyHoliday
            ? currentHolidays.filter(holiday => !isEqual(holiday, dateStart))
            : [...currentHolidays, dateStart].sort((a, b) => a.getTime() - b.getTime());

        setHolidays(updatedHolidays);

        const updatedSchedule = { ...currentScheduleState };
        employees.forEach(emp => {
            const key = getScheduleKey(emp.id, date);
            let entry = updatedSchedule[key];
            const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
             daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
             const isFixedDayOff = emp.fixedDayOff && date.getDay() === fixedDayMapping[emp.fixedDayOff];

            if (!isCurrentlyHoliday) {
                 if (!isFixedDayOff && entry && (entry.shift === 'TRABALHA' || entry.shift === 'FOLGA')) {
                     updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                 } else if (!entry && !isFixedDayOff) {
                     updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                 }
            } else {
                 if (entry && entry.shift === 'FF') {
                     if (isFixedDayOff) {
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     } else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                         const dayOptions = getTimeOptionsForDate(date, false);
                         let defaultHour = '';
                          const basicDefaultHour = shiftTypeToHoursMap[emp.defaultShiftType] || '';
                          if (dayOptions.includes(basicDefaultHour)) {
                              defaultHour = basicDefaultHour;
                          } else if (dayOptions.length > 0) {
                             defaultHour = dayOptions[0];
                          }
                         updatedSchedule[key] = { shift: 'TRABALHA', role: emp.defaultRole, baseHours: defaultHour, holidayReason: undefined };
                     } else {
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     }
                 }
            }
        });
        setSchedule(updatedSchedule);
        saveDataToLocalStorage(employees, updatedSchedule, filters, updatedHolidays);
        toast({ title: "Feriado Atualizado", description: `Dia ${formatDate(date, 'dd/MM')} ${isCurrentlyHoliday ? 'não é mais' : 'agora é'} feriado.`, duration: toastDuration });

    }, [holidays, employees, schedule, filters, toast, saveDataToLocalStorage, isHolidayFn, currentMonth]);


    const handleFilterChange = (newFilters: Partial<FilterState>) => {
        const updatedFilters = { ...filters, ...newFilters };
        if (newFilters.selectedDate) {
           const normalizedDate = startOfDay(newFilters.selectedDate);
            if (!filters.selectedDate || !isEqual(normalizedDate, filters.selectedDate)) {
                 updatedFilters.selectedDate = normalizedDate;
            }
        }
        setFilters(updatedFilters);
    };

    const datesForTable = useMemo(() => {
        if (!currentMonth) return [];
        return getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth));
    }, [currentMonth]);

    const filteredEmployees = useMemo(() => {
        if (!employees) return [];
        return employees.filter(emp => {
        if (filters.employee && emp.id !== parseInt(filters.employee)) return false;
        if (filters.role) {
            const worksInRole = datesForTable.some(date => {
                const key = getScheduleKey(emp.id, date);
                return schedule[key]?.role === filters.role && schedule[key]?.shift === 'TRABALHA';
            });
            if (!worksInRole) return false;
        }
        return true;
        });
    }, [employees, filters, datesForTable, schedule]);


    const handleClearMonth = useCallback(() => {
        setIsClearingMonth(true);
    }, []);

    const confirmClearMonth = useCallback(() => {
         if (!currentMonth) {
            toast({ title: "Erro", description: "Mês atual não definido.", variant: "destructive", duration: toastDuration });
            setIsClearingMonth(false);
            return;
         }

        const currentScheduleState = {...schedule};
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const datesInMonth = getDatesInRange(monthStart, monthEnd);
        const updatedSchedule = { ...schedule };
        const currentHolidays = holidays;


        employees.forEach(emp => {
            datesInMonth.forEach(date => {
                const key = getScheduleKey(emp.id, date);
                 const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
                 daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
                 const isFixedDayOff = emp.fixedDayOff && date.getDay() === fixedDayMapping[emp.fixedDayOff];

                 if (isFixedDayOff) {
                     updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                 } else if (isHolidayFn(date)) {
                      updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                 } else {
                     updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                 }
            });
        });

        setSchedule(updatedSchedule);
        setIsClearingMonth(false);
        saveDataToLocalStorage(employees, updatedSchedule, filters, currentHolidays);
        toast({ title: "Sucesso", description: `Escala de ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada.`, duration: toastDuration });
    }, [currentMonth, schedule, employees, holidays, toast, saveDataToLocalStorage, isHolidayFn, filters]);


    const generatePdf = async () => {
        if (!isClient || !currentMonth) return;
        const jsPDFModule = await import('jspdf');
        const jsPDF = jsPDFModule.default;
        await import('jspdf-autotable');

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        const header = [['Colaborador', ...datesForTable.map(date => formatDate(date, 'E\ndd', { locale: ptBR }))]];
        const body = filteredEmployees.map(emp => {
            return [
                { content: emp.name, styles: { fontStyle: 'bold', fontSize: 6, cellPadding: 0.5 } },
                ...datesForTable.map(date => {
                    const key = getScheduleKey(emp.id, date);
                    const entry = schedule[key];
                    const holiday = isHolidayFn(date);
                    let content = '';
                    let fillColor: string | number[] = [255, 255, 255];
                    let textColor: string | number[] = [0, 0, 0];
                    let fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal';

                    if (entry) {
                        if (entry.shift === 'TRABALHA') {
                            const roleDisplay = entry.role.length > 3 ? entry.role.substring(0, 3).toUpperCase() : entry.role;
                            const hoursDisplay = entry.baseHours ? entry.baseHours.replace(/\s*às\s*/, '-') : 'S/H';
                            content = `${roleDisplay}\n${hoursDisplay}`;
                            fillColor = '#e74c3c';
                            textColor = [255, 255, 255];
                            fontStyle = 'bold';
                        } else if (entry.shift === 'FOLGA') {
                            content = 'F';
                             fillColor = '#f0f0f0';
                            textColor = [100, 100, 100];
                        } else if (entry.shift === 'FF') {
                             const reasonDisplay = entry.holidayReason ? `\n(${entry.holidayReason.substring(0,5)})` : '';
                             content = `FF${reasonDisplay}`;
                            fillColor = '#2ecc71';
                            textColor = [255, 255, 255];
                            fontStyle = 'bold';
                        }
                    } else {
                         content = 'F';
                         fillColor = '#f0f0f0';
                         textColor = [100, 100, 100];
                    }

                     if (holiday && entry?.shift !== 'FF') {
                         fillColor = '#e9d5ff';
                         textColor = [50,50,50];
                     }

                    return { content, styles: { fillColor, textColor, fontStyle, fontSize: 5, cellPadding: {top: 0.5, right: 0.1, bottom: 0.5, left: 0.1}, halign: 'center', valign: 'middle', minCellHeight: 8 } };
                })
            ];
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageMargin = 8;
        const availableWidth = pageWidth - (pageMargin * 2);
        const firstColWidth = 20;
        const dateColCount = datesForTable.length;
        const remainingWidth = availableWidth - firstColWidth;
         const minDateColWidth = 4;
        const calculatedDateColWidth = remainingWidth / dateColCount;
        const dateColWidth = Math.max(minDateColWidth, calculatedDateColWidth);


        const columnStyles: { [key: number]: any } = {
            0: { cellWidth: firstColWidth, halign: 'left', fontStyle: 'bold', fontSize: 6, valign: 'middle' },
        };
        for (let i = 0; i < dateColCount; i++) {
            columnStyles[i + 1] = { cellWidth: dateColWidth, halign: 'center', valign: 'middle', fontSize: 5 };
        }

        doc.autoTable({
            head: header,
            body: body,
            theme: 'grid',
             headStyles: {
                 fillColor: '#2980b9',
                 textColor: 255,
                 fontStyle: 'bold',
                 halign: 'center',
                 valign: 'middle',
                 fontSize: 5,
                 cellPadding: { top: 0.5, right: 0.2, bottom: 0.5, left: 0.2 },
                 lineColor: [200, 200, 200],
                 lineWidth: 0.1,
                 didDrawCell: (data: any) => {
                    if (data.section === 'head' && data.column.index > 0) {
                         const dateIndex = data.column.index -1;
                         if (dateIndex < datesForTable.length && isHolidayFn(datesForTable[dateIndex])) {
                             doc.setFillColor('#3498db');
                             doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                             doc.setTextColor(255);
                             doc.setFont(undefined, 'bold');
                             doc.text(data.cell.text, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2, {
                                 halign: 'center',
                                 valign: 'middle'
                             });
                         }
                    }
                 }
             },
            styles: {
                 cellPadding: { top: 0.5, right: 0.1, bottom: 0.5, left: 0.1 },
                 fontSize: 5,
                 valign: 'middle',
                 halign: 'center',
                 lineWidth: 0.1,
                 lineColor: [200, 200, 200],
                 minCellHeight: 8,
             },
            columnStyles: columnStyles,
            margin: { top: 25, left: pageMargin, right: pageMargin, bottom: 15 },
            didDrawPage: (data: any) => {
                 doc.setFontSize(12);
                 doc.setTextColor(40);
                doc.text('ShiftMaster - Escala de Trabalho', pageMargin, 12);
                 doc.setFontSize(9);
                doc.text(`Mês: ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, pageMargin, 18);

                const pageHeight = doc.internal.pageSize.getHeight();
                const startY = pageHeight - 12;
                 doc.setFontSize(6);
                 doc.setTextColor(100);
                 doc.text("Legenda:", pageMargin, startY);
                 let currentX = pageMargin;
                 const legendY = startY + 3;
                 const rectSize = 2.5;
                 const textOffset = 3;
                 const spacing = 12;

                 Object.entries(typeShiftCodeToDescription).forEach(([code, desc]) => {
                     let fillColorArray: number[] = [255, 255, 255];
                     if (code === 'TRABALHA') fillColorArray = [231, 76, 60];
                     else if (code === 'FOLGA') fillColorArray = [240, 240, 240];
                     else if (code === 'FF') fillColorArray = [46, 204, 113];

                     doc.setFillColor(fillColorArray[0], fillColorArray[1], fillColorArray[2]);
                     doc.rect(currentX, legendY - rectSize / 2, rectSize, rectSize, 'F');
                     doc.setTextColor(100);
                     const legendText = `${code}: ${desc}`;
                     doc.text(legendText, currentX + textOffset, legendY, { baseline: 'middle' });
                     currentX += textOffset + doc.getTextWidth(legendText) + spacing;
                 });

                 doc.setFillColor(233, 213, 255);
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
        if (!filters.selectedDate) {
            toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive", duration: toastDuration });
            return;
        }
        const holidayStatus = isHolidayFn(filters.selectedDate);
        const text = generateWhatsAppText(filters.selectedDate, filteredEmployees, schedule, holidayStatus, roleToEmojiMap);
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Sucesso", description: `Texto da escala de ${formatDate(filters.selectedDate as Date, 'dd/MM/yyyy', { locale: ptBR })} copiado.`, duration: toastDuration });
        }).catch(e => {
            console.error("Failed to copy WhatsApp text: ", e);
            toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive", duration: toastDuration });
        });
    }, [filteredEmployees, schedule, filters.selectedDate, isHolidayFn, toast, roleToEmojiMap]);


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
                        Tem certeza que deseja remover "{employees.find(e => e.id === employeeToDelete)?.name || 'este colaborador'}"? A escala associada também será removida. Esta ação não pode ser desfeita.
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
                         Tem certeza que deseja zerar a escala para o mês de {currentMonth ? formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR }) : 'Mês Corrente'}? Todos os dias para TODOS os colaboradores neste mês serão definidos como 'Folga' (F) ou 'Folga Feriado' (FF) conforme o dia. Esta ação não pode ser desfeita.
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


      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-primary text-center sm:text-left">
              ShiftMaster
          </h1>
          <div className="flex items-center space-x-1 sm:space-x-4 flex-wrap gap-1 justify-center sm:justify-end">
              <Button variant="outline" size="sm" onClick={loadDataFromLocalStorage}><Icons.reload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Recarregar</Button>
              <Button variant="outline" size="sm" onClick={generatePdf}><Icons.document className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Gerar PDF (Mês)</Button>
              <Button variant="outline" size="sm" onClick={generateDailyWhatsAppText}><Icons.whatsapp className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> WhatsApp (Dia)</Button>
              <Button size="sm" onClick={() => {setEmployeeToEdit(null); setEditOpen(true)}}><Icons.userPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Adicionar</Button>
              <Button variant="destructive" size="sm" onClick={handleClearMonth}><Icons.reload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4"/> Zerar Mês</Button>
           </div>
         </div>

         <ShiftFilters
          filters={filters}
          employees={employees}
          roles={availableRoles}
          onFilterChange={handleFilterChange}
        />

       <div className="flex justify-center items-center my-2 sm:my-4 space-x-2 sm:space-x-4">
         <Button variant="outline" size="sm" onClick={() => filters.selectedDate && handleFilterChange({ selectedDate: addDays(startOfMonth(filters.selectedDate), -1) })}>Mês Ant.</Button>
         <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{currentMonth ? formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR }) : 'Carregando mês...'}</span>
         <Button variant="outline" size="sm" onClick={() => filters.selectedDate && handleFilterChange({ selectedDate: addDays(startOfMonth(filters.selectedDate), 31) })}>Próx. Mês</Button>
       </div>

        <div ref={tableContainerRef} className="flex-grow overflow-auto border rounded-lg shadow-md bg-card">
          <ShiftTable
            employees={filteredEmployees}
            schedule={schedule}
            dates={datesForTable}
            holidays={holidays}
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
