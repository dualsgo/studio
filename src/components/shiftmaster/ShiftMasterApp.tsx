'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import HeadInformation from '@/components/HeadInformation'; // Default import
import { cn } from '@/lib/utils';
import { db, app } from '@/lib/firebase'; // Import Firestore instance and app
import { doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // Uncomment if you need authentication
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry, FilterState, ShiftType } from './types'; // Make sure ShiftType is imported
import { availableRoles, daysOfWeek, roleToEmojiMap, getTimeOptionsForDate, shiftTypeToHoursMap, SELECT_NONE_VALUE, availableShiftCodes, shiftCodeToDescription as typeShiftCodeToDescription } from './types'; // Correctly import from types
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange } from './utils'; // Import utils
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format as formatDate, startOfMonth, endOfMonth, isEqual, startOfDay, parse } from 'date-fns'; // Renamed format to formatDate
import { ptBR } from 'date-fns/locale';
import { ShiftTable } from './ShiftTable';
import { Button } from '@/components/ui/button';
import { WifiOff } from 'lucide-react';
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

const SAVED_SCHEDULES_COLLECTION = 'scheduleData';
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
    const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);

    const [holidays, setHolidays] = useState<Date[]>([]);
    const [showEasterEgg, setShowEasterEgg] = useState(false);

    const [isLoading, setIsLoading] = useState(true); // For data fetching status
    const [isClearingMonth, setIsClearingMonth] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [initialLoadCompleted, setInitialLoadCompleted] = useState(false);


    const { toast } = useToast();
    const isClient = typeof window !== 'undefined';
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // Effect to derive currentMonth from filters.selectedDate
    useEffect(() => {
      if (filters.selectedDate) {
        const newCurrentMonth = startOfMonth(filters.selectedDate);
        if (!currentMonth || !isEqual(newCurrentMonth, currentMonth)) {
          setCurrentMonth(newCurrentMonth);
        }
      }
    }, [filters.selectedDate, currentMonth]);

    // Effect for initial date setup and marking as mounted
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
      newSelectedDate = startOfDay(newSelectedDate); // Normalize

      setFilters(prevFilters => {
        if (!prevFilters.selectedDate || !isEqual(newSelectedDate, prevFilters.selectedDate)) {
          return { ...prevFilters, selectedDate: newSelectedDate };
        }
        return prevFilters;
      });
      setHasMounted(true);
    }, [isClient]);


    // --- Firebase/Data Handling ---

     const checkAndInitializeFirebase = useCallback(async () => {
        if (!db) {
            console.warn("Firebase DB instance is not initialized. Attempting to load data locally.");
            setIsFirebaseConnected(false);
            return false;
        }
        // Basic connectivity check (optional, can be more robust)
        try {
            await getDoc(doc(db, "__connectivity_test__", "doc")); // Attempt a dummy read
            setIsFirebaseConnected(true);
            return true;
        } catch (error) {
             // Check if the error is due to the document not existing (which is fine for a test)
            // or a more serious connectivity issue.
            // This example assumes any error means not connected, simplify as needed.
            console.warn("Firebase connectivity check failed:", error);
            setIsFirebaseConnected(false);
            return false;
        }
    }, [setIsFirebaseConnected]); // Removed db from dependencies as it should be stable

    // Save data to Local Storage
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

    // Load data from Local Storage
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
        const baseDateForInitialData = filters.selectedDate || new Date(); // Use current filters.selectedDate or fallback
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
        saveDataToLocalStorage(initialEmployees, initialSchedule, genFilters, initialHolidays);
        return false;
    }, [isClient, toast, saveDataToLocalStorage, filters.selectedDate]);


     // Update data in Firestore
     const updateDataInFirestore = useCallback(async (newEmployees: Employee[], newSchedule: ScheduleData, newFilters: FilterState, newHolidays: Date[]) => {
        if (!(await checkAndInitializeFirebase()) || !db) {
            console.warn("Firebase not available. Saving to local storage instead.");
            saveDataToLocalStorage(newEmployees, newSchedule, newFilters, newHolidays);
            return false;
        }

        const dataToSave = {
            employees: newEmployees,
            schedule: newSchedule,
             filters: {
              ...newFilters,
              selectedDate: newFilters.selectedDate?.toISOString()
            },
            holidays: newHolidays.map(date => date.toISOString()),
        };

        const docRef = doc(db, SAVED_SCHEDULES_COLLECTION, "scheduleData");

        try {
            await setDoc(docRef, dataToSave, { merge: true });
            console.log("Document updated successfully in Firestore!");
            setIsFirebaseConnected(true);
            return true;
        } catch (e) {
            console.error("Error updating document in Firestore: ", e);
             setIsFirebaseConnected(false);
             toast({
                title: 'Erro ao Salvar no Servidor',
                description: 'Falha ao salvar dados no Firestore. Mudanças salvas localmente.',
                variant: 'destructive',
                duration: 5000
            });
            saveDataToLocalStorage(newEmployees, newSchedule, newFilters, newHolidays);
            return false;
        }
    }, [toast, checkAndInitializeFirebase, saveDataToLocalStorage, setIsFirebaseConnected]);


    // Load data from Firestore or LocalStorage (Main data loading effect)
    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        let firebaseAvailable = await checkAndInitializeFirebase();

        if (!firebaseAvailable || !db) {
            console.log("Firebase not available. Loading from local storage.");
            loadDataFromLocalStorage();
            setIsLoading(false);
            setInitialLoadCompleted(true);
            return;
        }

        const docRef = doc(db, SAVED_SCHEDULES_COLLECTION, "scheduleData");
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("Data loaded from Firestore:", data);
                if (data) {
                    const parsedEmployees = (data.employees || []).map((empData: any) => ({
                        id: empData.id,
                        name: empData.name,
                        fixedDayOff: empData.fixedDayOff || undefined,
                        defaultRole: empData.defaultRole || undefined,
                        defaultShiftType: empData.defaultShiftType || undefined,
                    }));
                    setEmployees(parsedEmployees);

                    const parsedSchedule: ScheduleData = {};
                    if (data.schedule) {
                        for (const key in data.schedule) {
                            parsedSchedule[key] = data.schedule[key];
                        }
                    }
                    setSchedule(parsedSchedule);

                    const loadedSelectedDate = data.filters?.selectedDate ? startOfDay(parseISO(data.filters.selectedDate)) : startOfDay(new Date());
                    const parsedFilters = {
                      employee: data.filters?.employee ?? '',
                      role: data.filters?.role ?? '',
                      selectedDate: loadedSelectedDate
                    };
                    setFilters(prevFilters =>
                      JSON.stringify(prevFilters) !== JSON.stringify(parsedFilters) ? parsedFilters : prevFilters
                    );

                    const parsedHolidays = (data.holidays || []).map((holiday: string) => {
                        try {
                            const parsedDate = parseISO(holiday);
                            return !isNaN(parsedDate.getTime()) ? startOfDay(parsedDate) : startOfDay(new Date());
                        } catch (parseError) {
                            console.error(`Error parsing holiday date string: ${holiday}`, parseError);
                            return startOfDay(new Date());
                        }
                    });
                    setHolidays(prevHolidays =>
                        JSON.stringify(prevHolidays.map(d => d.toISOString())) !== JSON.stringify(parsedHolidays.map(d => d.toISOString())) ? parsedHolidays : prevHolidays
                      );

                    toast({ title: 'Sucesso', description: 'Dados carregados do Firestore!', duration: toastDuration });
                }
            } else {
                console.log("No such document! Initializing with default data from local or generating new.");
                if(!loadDataFromLocalStorage()){ // Try local first, if fails, generate new
                    const baseDateForInitialData = filters.selectedDate || new Date();
                    const { initialEmployees, initialSchedule, initialFilters: genFilters, initialHolidays } = generateInitialData(baseDateForInitialData);
                    setEmployees(initialEmployees);
                    setSchedule(initialSchedule);
                    const initialSelectedDate = startOfDay(genFilters.selectedDate || new Date());
                    const finalGenFilters = {
                        employee: genFilters.employee,
                        role: genFilters.role,
                        selectedDate: initialSelectedDate,
                    };
                    setFilters(prevFilters =>
                      JSON.stringify(prevFilters) !== JSON.stringify(finalGenFilters) ? finalGenFilters : prevFilters
                    );
                    setHolidays(initialHolidays);
                    await updateDataInFirestore(initialEmployees, initialSchedule, finalGenFilters, initialHolidays); // Save newly generated to Firestore
                    toast({ title: 'Aviso', description: 'Nenhum dado encontrado. Iniciando com dados padrão.', duration: toastDuration });
                }
            }
        } catch (error) {
            console.error("Error fetching document:", error);
            setIsFirebaseConnected(false);
            toast({
                title: "Erro ao Carregar",
                description: "Falha ao buscar dados do Firestore. Usando dados locais.",
                variant: "destructive",
                duration: 5000,
            });
            loadDataFromLocalStorage(); // Fallback to local if Firestore fails
        } finally {
            setIsLoading(false);
            setInitialLoadCompleted(true);
        }
    }, [checkAndInitializeFirebase, loadDataFromLocalStorage, updateDataInFirestore, toast, filters.selectedDate]); // Minimal dependencies for stability

    // Main data loading trigger effect
    useEffect(() => {
         if (!isClient || !hasMounted || !filters.selectedDate || initialLoadCompleted) {
             if (hasMounted && filters.selectedDate && !initialLoadCompleted) {
                 // If mounted and dates are set, but initial load not done, proceed.
             } else {
                 setIsLoading(false); // Ensure loading is false if we don't proceed
                 return;
             }
         }
        loadInitialData();
    }, [isClient, hasMounted, filters.selectedDate, initialLoadCompleted, loadInitialData]);


    // Data persistence effect (save to Firestore/localStorage)
    useEffect(() => {
        if (isLoading || !initialLoadCompleted || !hasMounted || !currentMonth || !filters.selectedDate) {
            return; // Don't save while initial load is happening or critical states are not set
        }
        updateDataInFirestore(employees, schedule, filters, holidays);
    }, [employees, schedule, filters, holidays, updateDataInFirestore, isLoading, initialLoadCompleted, hasMounted, currentMonth]);


    // --- Employee CRUD ---

    const addEmployee = async (employeeData: Employee) => {
        const originalEmployees = employees;
        const maxId = originalEmployees.reduce((max, emp) => Math.max(max, emp.id), 0);
        const newEmployee = { ...employeeData, id: maxId + 1 };
        const newEmployeesArray = [...originalEmployees, newEmployee];

        setEmployees(newEmployeesArray);
        setEditOpen(false);

        const success = await updateDataInFirestore(newEmployeesArray, schedule, filters, holidays);
        if (!success) {
            setEmployees(originalEmployees); // Revert on failure
            toast({
                title: "Erro",
                description: `Falha ao adicionar colaborador. ${!isFirebaseConnected ? "Firebase não conectado." : "Erro no servidor."} Mudanças salvas localmente.`,
                variant: "destructive",
                duration: toastDuration
            });
        } else {
            toast({ title: "Sucesso", description: "Colaborador adicionado.", duration: toastDuration });
        }
    };

    const isHolidayFn = useCallback((date: Date): boolean => {
        return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDay(date)));
    }, [holidays]);

   const updateEmployee = async (employeeData: Employee) => {
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

        const success = await updateDataInFirestore(updatedEmployees, updatedSchedule, filters, holidays);
        if (!success) {
            setEmployees(originalEmployees); // Revert
            setSchedule(originalSchedule); // Revert
            toast({
                   title: "Erro",
                   description: `Falha ao atualizar colaborador. ${!isFirebaseConnected ? "Firebase não conectado." : "Erro no servidor."} Mudanças salvas localmente.`,
                   variant: "destructive",
                   duration: toastDuration
               });
        } else {
            toast({ title: "Sucesso", description: "Colaborador atualizado.", duration: toastDuration });
        }
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
                if (entry.shift !== 'FF') { // Don't override FF if it's a fixed day off AND a holiday
                    entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
            }
            // Apply default role/shift only if not a fixed day off and not already FF
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
                 if (!defaultHour && dayOptions.length > 0) { // Fallback if specific default not found/applicable
                     defaultHour = dayOptions[0];
                 }
                 entry.baseHours = defaultHour;
                 entry.holidayReason = undefined; // Clear reason if now T
            }

            // If it's a holiday and current status is FOLGA (and not a fixed day off that's already FOLGA), set to FF
            if (dayIsActuallyHoliday && entry.shift === 'FOLGA' && !isFixedDayOff) {
                entry = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
            }

            newSchedule[key] = entry;
        });
        return newSchedule;
    };



    const deleteEmployee = async (employeeId: number) => {
        setEmployeeToDelete(employeeId);
    };

    const confirmDeleteEmployee = useCallback(async () => {
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

        const success = await updateDataInFirestore(newEmployees, newSchedule, filters, holidays);
        if (!success) {
           setEmployees(originalEmployees); // Revert
           setSchedule(originalSchedule); // Revert
            toast({
                title: "Erro",
                description: `Falha ao remover colaborador. ${!isFirebaseConnected ? "Firebase não conectado." : "Erro no servidor."} Mudanças salvas localmente.`,
                variant: "destructive",
                duration: toastDuration
            });
        } else {
            toast({ title: "Sucesso", description: "Colaborador removido.", duration: toastDuration });
        }
    }, [employeeToDelete, employees, schedule, filters, holidays, toast, updateDataInFirestore, isFirebaseConnected]);


   // --- Schedule Handling ---

    const handleShiftChange = useCallback(async (empId: number, date: Date, newShift: ShiftCode) => {
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
         if (!await updateDataInFirestore(employees, updatedSchedule, filters, holidays)) {
            setSchedule(currentScheduleState); // Revert
            toast({ title: "Erro", description: "Falha ao salvar alteração de turno.", variant: "destructive", duration: toastDuration });
        }

    }, [employees, schedule, holidays, filters, toast, updateDataInFirestore, isHolidayFn]);


    const handleDetailChange = useCallback(async (empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
        const key = getScheduleKey(empId, date);
        const currentScheduleState = {...schedule};
        const updatedSchedule = { ...currentScheduleState };

        if (!updatedSchedule[key]) { // Should not happen if initialized properly
            updatedSchedule[key] = { shift: 'TRABALHA', role: '', baseHours: '', holidayReason: undefined };
        } else if (updatedSchedule[key].shift !== 'TRABALHA' && (field === 'role' || field === 'baseHours')) {
             toast({ title: "Aviso", description: "Função/Horário só se aplicam a dias de Trabalho (T).", variant: "default", duration: toastDuration });
             return;
        } else if (updatedSchedule[key].shift !== 'FF' && field === 'holidayReason') {
             toast({ title: "Aviso", description: "Motivo só se aplica a Folga Feriado (FF).", variant: "default", duration: toastDuration });
             return;
        }

        updatedSchedule[key] = { ...updatedSchedule[key], [field]: value };
        setSchedule(updatedSchedule);

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, holidays)) {
            setSchedule(currentScheduleState); // Revert
             toast({ title: "Erro", description: "Falha ao salvar detalhe do turno.", variant: "destructive", duration: toastDuration });
         }
    }, [employees, schedule, filters, holidays, toast, updateDataInFirestore]);

    const handleToggleHoliday = useCallback(async (date: Date) => {
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
             const isFixedDayOff = emp.fixedDayOff && date.getDay() === daysOfWeek.indexOf(emp.fixedDayOff);

            if (!isCurrentlyHoliday) { // Day is becoming a holiday
                if (!isFixedDayOff && (!entry || entry.shift === 'TRABALHA' || entry.shift === 'FOLGA')) {
                     updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                }
            } else { // Day is no longer a holiday
                 if (entry && entry.shift === 'FF') {
                     if (isFixedDayOff) {
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     } else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                         const dayOptions = getTimeOptionsForDate(date, false);
                         let defaultHour = '';
                          if (emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                              const basicDefaultHour = shiftTypeToHoursMap[emp.defaultShiftType] || '';
                              if (dayOptions.includes(basicDefaultHour)) {
                                  defaultHour = basicDefaultHour;
                              }
                          }
                          if (!defaultHour && dayOptions.length > 0) {
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

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, updatedHolidays)) {
            setHolidays(currentHolidays); // Revert
            setSchedule(currentScheduleState); // Revert
             toast({ title: "Erro", description: "Falha ao atualizar feriado.", variant: "destructive", duration: toastDuration });
        } else {
            toast({ title: "Feriado Atualizado", description: `Dia ${formatDate(date, 'dd/MM')} ${isCurrentlyHoliday ? 'não é mais' : 'agora é'} feriado.`, duration: toastDuration });
        }

    }, [holidays, employees, schedule, filters, toast, updateDataInFirestore, isHolidayFn, currentMonth]);


    // --- UI Handlers ---

    const handleFilterChange = (newFilters: Partial<FilterState>) => {
        const updatedFilters = { ...filters, ...newFilters };
        if (newFilters.selectedDate && !isEqual(startOfDay(newFilters.selectedDate), startOfDay(filters.selectedDate || new Date()))) {
            updatedFilters.selectedDate = startOfDay(newFilters.selectedDate); // Normalize
        }
        setFilters(updatedFilters);
        // currentMonth update is handled by its own useEffect based on filters.selectedDate
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
                return schedule[key]?.role === filters.role;
            });
            if (!worksInRole) return false;
        }
        return true;
        });
    }, [employees, filters, datesForTable, schedule]);


    const handleClearMonth = useCallback(() => {
        setIsClearingMonth(true);
    }, []);

    const confirmClearMonth = useCallback(async () => {
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
                if (isHolidayFn(date)) {
                     updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                } else {
                    updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
            });
        });

        setSchedule(updatedSchedule);
        setIsClearingMonth(false);

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, currentHolidays)) {
            setSchedule(currentScheduleState); // Revert
            toast({ title: "Erro", description: "Falha ao zerar escala no servidor. Mudanças salvas localmente.", variant: "destructive", duration: toastDuration });
        } else {
            toast({ title: "Sucesso", description: `Escala de ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada.`, duration: toastDuration });
        }
    }, [currentMonth, schedule, employees, holidays, toast, updateDataInFirestore, isHolidayFn, filters]);


    // --- PDF and WhatsApp ---

    const generatePdf = async () => {
        if (!isClient || !currentMonth) return;
        const jsPDFModule = await import('jspdf');
        const jsPDF = jsPDFModule.default; // Access the default export
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
                            content = `${entry.role ? entry.role.substring(0, 3).toUpperCase() : 'S/R'}\n${entry.baseHours ? entry.baseHours.replace(/\s*às\s*/, '-') : 'S/H'}`;
                            fillColor = '#e74c3c'; // Destructive (red)
                            textColor = [255, 255, 255];
                            fontStyle = 'bold';
                        } else if (entry.shift === 'FOLGA') {
                            content = 'F';
                             fillColor = '#f0f0f0'; // Muted (gray)
                            textColor = [100, 100, 100];
                        } else if (entry.shift === 'FF') {
                            content = `FF${entry.holidayReason ? `\n(${entry.holidayReason.substring(0,5)})` : ''}`;
                            fillColor = '#2ecc71'; // Accent (green)
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

                    return { content, styles: { fillColor, textColor, fontStyle, fontSize: 5, cellPadding: 0.5, halign: 'center', valign: 'middle', minCellHeight: 6 } };
                })
            ];
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageMargin = 10;
        const availableWidth = pageWidth - (pageMargin * 2);
        const firstColWidth = 25;
        const dateColCount = datesForTable.length;
        const remainingWidth = availableWidth - firstColWidth;
        const dateColWidth = Math.max(6, remainingWidth / dateColCount);

        const columnStyles: { [key: number]: any } = {
            0: { cellWidth: firstColWidth, halign: 'left', fontStyle: 'bold', fontSize: 6, valign: 'middle' },
        };
        for (let i = 0; i < dateColCount; i++) {
            columnStyles[i + 1] = { cellWidth: dateColWidth, halign: 'center', valign: 'middle', fontSize: 5 };
        }

        doc.autoTable({ // Use jsPDF instance directly
            head: header,
            body: body,
            theme: 'grid',
             headStyles: {
                 fillColor: '#2980b9',
                 textColor: 255,
                 fontStyle: 'bold',
                 halign: 'center',
                 valign: 'middle',
                 fontSize: 6,
                 cellPadding: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
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
                             doc.text(data.cell.text, data.cell.x + data.cell.padding('left'), data.cell.y + data.cell.height / 2, {
                                 halign: data.cell.styles.halign as any, // Cast needed for jspdf type
                                 valign: data.cell.styles.valign
                             });
                         }
                    }
                 }
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
            columnStyles: columnStyles,
            margin: { top: 28, left: pageMargin, right: pageMargin, bottom: 15 },
            didDrawPage: (data: any) => {
                doc.setFontSize(14);
                 doc.setTextColor(40);
                doc.text('ShiftMaster - Escala de Trabalho', pageMargin, 15);
                 doc.setFontSize(10);
                doc.text(`Mês: ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, pageMargin, 22);

                const pageHeight = doc.internal.pageSize.getHeight();
                const startY = pageHeight - 12;
                 doc.setFontSize(8);
                 doc.setTextColor(100);
                 doc.text("Legenda:", pageMargin, startY);
                 let currentX = pageMargin;
                 const legendY = startY + 4;
                 const rectSize = 3;
                 const textOffset = 4;
                 const spacing = 15;

                 Object.entries(typeShiftCodeToDescription).forEach(([code, desc]) => {
                     let fillColorArray: number[] = [255, 255, 255];
                     if (code === 'TRABALHA') fillColorArray = [231, 76, 60]; // Red
                     else if (code === 'FOLGA') fillColorArray = [240, 240, 240]; // Gray
                     else if (code === 'FF') fillColorArray = [46, 204, 113]; // Green

                     doc.setFillColor(fillColorArray[0], fillColorArray[1], fillColorArray[2]);
                     doc.rect(currentX, legendY - rectSize / 2, rectSize, rectSize, 'F');
                     doc.setTextColor(100);
                     doc.text(`${code}: ${desc}`, currentX + textOffset, legendY);
                     currentX += spacing + (doc.getTextWidth(`${code}: ${desc}`) / doc.internal.scaleFactor) + 2 ;
                 });

                 doc.setFillColor(233, 213, 255); // Light purple
                 doc.rect(currentX, legendY - rectSize / 2, rectSize, rectSize, 'F');
                 doc.setTextColor(100);
                 doc.text("Dia Feriado (Coluna)", currentX + textOffset, legendY);
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


    useEffect(() => {
        if (!isClient) return;

        const unsubscribe = () => {
        };

        return unsubscribe;
    }, [isClient]);


    if (!hasMounted || isLoading || !currentMonth || !filters.selectedDate || !initialLoadCompleted) {
         return (
           <div className="flex justify-center items-center h-screen">
             <p>Carregando dados...</p>
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
                         Tem certeza que deseja zerar a escala para o mês de {currentMonth ? formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR }) : 'Mês Corrente'}? Todos os dias para TODOS os colaboradores neste mês serão definidos como 'Folga' (F). Feriados marcados terão o status dos colaboradores alterados para 'Folga Feriado' (FF). Esta ação não pode ser desfeita.
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
              <Button variant="outline" size="sm" onClick={loadInitialData}><Icons.reload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Recarregar</Button>
              <Button variant="outline" size="sm" onClick={generatePdf}><Icons.document className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Gerar PDF (Mês)</Button>
              <Button variant="outline" size="sm" onClick={generateDailyWhatsAppText}><Icons.whatsapp className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> WhatsApp (Dia)</Button>
              <Button size="sm" onClick={() => {setEmployeeToEdit(null); setEditOpen(true)}}><Icons.userPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Adicionar</Button>
              <Button variant="destructive" size="sm" onClick={handleClearMonth}><Icons.reload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4"/> Zerar Mês</Button>
               {!isFirebaseConnected && (
                  <TooltipProvider delayDuration={100}>
                      <Tooltip>
                          <TooltipTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-destructive hover:bg-transparent disabled:opacity-100 cursor-default">
                                  <WifiOff className="h-5 w-5"/>
                                  <span className="sr-only">Firebase Desconectado</span>
                               </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs p-1 bg-destructive text-destructive-foreground">
                              Verifique a configuração/conexão do Firebase. Dados salvos localmente.
                          </TooltipContent>
                      </Tooltip>
                  </TooltipProvider>
               )}
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

