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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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


    const { toast } = useToast();
    const isClient = typeof window !== 'undefined';
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // Effect to set initial dates and mark as mounted (Client-side only)
    useEffect(() => {
      const now = new Date();
      let initialSelectedDate = now;
      let initialCurrentMonth = startOfMonth(now);

      if (isClient) { // localStorage is only available on the client
        const localDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localDataString) {
          try {
            const parsedLocalData = JSON.parse(localDataString);
            if (parsedLocalData.filters?.selectedDate) {
              const storedDate = parseISO(parsedLocalData.filters.selectedDate);
              if (!isNaN(storedDate.getTime())) {
                initialSelectedDate = storedDate;
                initialCurrentMonth = startOfMonth(storedDate);
              }
            }
          } catch (error) {
            console.warn("Failed to parse dates from localStorage:", error);
          }
        }
      }

      setCurrentMonth(initialCurrentMonth);
      setFilters(prevFilters => ({
        ...prevFilters,
        selectedDate: initialSelectedDate,
      }));
      setHasMounted(true);
    }, [isClient]); // Runs once on client mount, re-runs if isClient changes (though it shouldn't post-mount)


    // --- Firebase/Data Handling ---

     const checkAndInitializeFirebase = useCallback(async () => {
        if (!db) {
            console.warn("Firebase DB instance is not initialized. Attempting to load data locally.");
            setIsFirebaseConnected(false);
            return false;
        }
        setIsFirebaseConnected(true);
        return true;
    }, [setIsFirebaseConnected]);

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
            toast({ title: "Erro de Armazenamento Local", description: "Não foi possível salvar as alterações localmente.", variant: "destructive" });
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
                    const loadedSelectedDate = parsedData.filters?.selectedDate ? parseISO(parsedData.filters.selectedDate) : new Date();
                    setFilters({
                      employee: parsedData.filters?.employee ?? '',
                      role: parsedData.filters?.role ?? '',
                      selectedDate: loadedSelectedDate
                    });
                    setHolidays((parsedData.holidays || []).map((isoString: string) => parseISO(isoString)));
                    // setCurrentMonth is handled by the main date initialization useEffect or when filters.selectedDate changes
                    if (filters.selectedDate && !currentMonth) { // Ensure currentMonth is set if filters.selectedDate was loaded
                         setCurrentMonth(startOfMonth(loadedSelectedDate));
                    }
                    toast({ title: 'Dados Locais Carregados', description: 'Usando dados salvos localmente.', variant: 'default' });
                    return true;
                }
            } catch (error) {
                console.error("Failed to parse localStorage data:", error);
                toast({ title: "Erro nos Dados Locais", description: "Não foi possível ler os dados locais. Usando dados padrão.", variant: "warning" });
            }
        }
        console.log("No valid local data found, generating initial data...");
        // generateInitialData might rely on currentMonth being set, ensure it's available or passed
        if(currentMonth) { // Only generate if currentMonth is set
            const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData(currentMonth);
            setEmployees(initialEmployees);
            setSchedule(initialSchedule);
            // Ensure filters.selectedDate is also set, respecting generateInitialData's output
            const genSelectedDate = initialFilters.selectedDate || new Date();
            setFilters({
                employee: initialFilters.employee,
                role: initialFilters.role,
                selectedDate: genSelectedDate
            });
            setHolidays(initialHolidays);
            saveDataToLocalStorage(initialEmployees, initialSchedule, {...initialFilters, selectedDate: genSelectedDate}, initialHolidays);
        }
        return false;
    }, [isClient, toast, saveDataToLocalStorage, currentMonth, filters.selectedDate]); // Added currentMonth dependency


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
            setIsFirebaseConnected(true); // Explicitly set connected on success
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


    // Load data from Firestore
    const loadDataFromFirestore = useCallback(async (docId: string = "scheduleData") => {
        setIsLoading(true);
        if (!(await checkAndInitializeFirebase()) || !db) {
             console.log("Firebase not available. Loading from local storage.");
             loadDataFromLocalStorage(); // This will set states
             setIsLoading(false);
             return;
        }

        const docRef = doc(db, SAVED_SCHEDULES_COLLECTION, docId);
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

                    const parsedSchedule: ScheduleData = {};
                    if (data.schedule) {
                        for (const key in data.schedule) {
                            parsedSchedule[key] = data.schedule[key];
                        }
                    }

                    const parsedHolidays = (data.holidays || []).map((holiday: string) => {
                        try {
                            const parsedDate = parseISO(holiday);
                            if (!isNaN(parsedDate.getTime())) {
                                return startOfDay(parsedDate);
                            }
                            console.warn(`Could not parse holiday date string: ${holiday}. Using current date as fallback.`);
                            return startOfDay(new Date());
                        } catch (parseError) {
                            console.error(`Error parsing holiday date string: ${holiday}`, parseError);
                            return startOfDay(new Date());
                        }
                    });
                    
                    const loadedSelectedDate = data.filters?.selectedDate ? parseISO(data.filters.selectedDate) : new Date();
                    const parsedFilters = {
                      employee: data.filters?.employee ?? '',
                      role: data.filters?.role ?? '',
                      selectedDate: loadedSelectedDate
                    }

                    setEmployees(parsedEmployees);
                    setSchedule(parsedSchedule);
                    setHolidays(parsedHolidays);
                    setFilters(parsedFilters);
                    // setCurrentMonth is handled by the main date initialization useEffect or when filters.selectedDate changes
                    if (parsedFilters.selectedDate && !currentMonth) {
                        setCurrentMonth(startOfMonth(parsedFilters.selectedDate));
                    }
                    toast({ title: 'Sucesso', description: 'Dados carregados do Firestore!' });
                }
            } else {
                console.log("No such document! Initializing with default data.");
                 // Ensure currentMonth is available for generateInitialData
                const baseDateForInitialData = currentMonth || new Date();
                const { initialEmployees, initialSchedule, initialFilters: genFilters, initialHolidays } = generateInitialData(baseDateForInitialData);
                setEmployees(initialEmployees);
                setSchedule(initialSchedule);
                const initialSelectedDate = genFilters.selectedDate || new Date();
                setFilters({
                    employee: genFilters.employee,
                    role: genFilters.role,
                    selectedDate: initialSelectedDate,
                });
                setHolidays(initialHolidays);
                if (!currentMonth) { // Set currentMonth if it wasn't already (e.g., from initial load)
                    setCurrentMonth(startOfMonth(initialSelectedDate));
                }
                await updateDataInFirestore(initialEmployees, initialSchedule, {...genFilters, selectedDate: initialSelectedDate}, initialHolidays);
                toast({ title: 'Aviso', description: 'Nenhum dado encontrado. Iniciando com dados padrão.' });
            }
        } catch (error) {
            console.error("Error fetching document:", error);
            setIsFirebaseConnected(false);
            toast({
                title: "Erro ao Carregar",
                description: "Falha ao buscar dados do Firestore. Verifique a conexão e as configurações. Usando dados locais, se disponíveis.",
                variant: "destructive",
                duration: 5000,
            });
            loadDataFromLocalStorage();
        } finally {
            setIsLoading(false);
        }
    }, [toast, checkAndInitializeFirebase, setIsFirebaseConnected, setIsLoading, loadDataFromLocalStorage, updateDataInFirestore, currentMonth]);


    useEffect(() => {
         if (!isClient || !hasMounted || !currentMonth) { // Wait for client, mount, and currentMonth
             if (!hasMounted) setIsLoading(true); // Keep loading if not mounted
             else if (hasMounted && !currentMonth) setIsLoading(true); // Or if currentMonth isn't set yet
             else setIsLoading(false);
             return;
         }
        loadDataFromFirestore("scheduleData");
    }, [isClient, hasMounted, currentMonth, loadDataFromFirestore]); // Depend on currentMonth for initial load

    useEffect(() => {
        if (isLoading || !hasMounted || !currentMonth) return; // Don't save while initial load is happening or not mounted/dates not set
        updateDataInFirestore(employees, schedule, filters, holidays);
    }, [employees, schedule, filters, holidays, updateDataInFirestore, isLoading, hasMounted, currentMonth]);


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
            setEmployees(originalEmployees);
            if (!isFirebaseConnected) {
                 toast({
                    title: "Erro de Conexão",
                    description: "Falha ao adicionar colaborador: Firebase não conectado. Salvo localmente.",
                    variant: "destructive"
                });
            } else {
                 toast({
                    title: "Erro no Servidor",
                    description: "Falha ao adicionar colaborador ao servidor. Salvo localmente.",
                    variant: "destructive"
                });
            }
        } else {
            toast({ title: "Sucesso", description: "Colaborador adicionado e salvo no servidor." });
        }
    };

    const isHolidayFn = useCallback((date: Date): boolean => {
        return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDay(date)));
    }, [holidays]);

   const updateEmployee = async (employeeData: Employee) => {
        if (!currentMonth) return; // Guard against null currentMonth
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
            setEmployees(originalEmployees);
            setSchedule(originalSchedule);
            if (!isFirebaseConnected) {
                toast({
                   title: "Erro de Conexão",
                   description: "Falha ao atualizar colaborador: Firebase não conectado. Salvo localmente.",
                   variant: "destructive"
               });
           } else {
                toast({
                   title: "Erro no Servidor",
                   description: "Falha ao atualizar colaborador no servidor. Salvo localmente.",
                   variant: "destructive"
               });
           }
        } else {
            toast({ title: "Sucesso", description: "Colaborador atualizado e salvo no servidor." });
        }
    };

    const applyEmployeeDefaults = (
        employee: Employee,
        currentSchedule: ScheduleData,
        currentHolidays: Date[],
        holidayCheckFn: (date: Date) => boolean,
        monthForContext: Date // Pass currentMonth explicitly
    ): ScheduleData => {
        const newSchedule = { ...currentSchedule };
        const datesInMonth = getDatesInRange(startOfMonth(monthForContext), endOfMonth(monthForContext));
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
        daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);

        datesInMonth.forEach(date => {
            const key = getScheduleKey(employee.id, date);
            const dayOfWeek = date.getDay();
            const isFixedDayOff = employee.fixedDayOff && dayOfWeek === fixedDayMapping[employee.fixedDayOff];
            const dayIsActuallyHoliday = holidayCheckFn(date); // Use the passed holiday check function

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
           setEmployees(originalEmployees);
           setSchedule(originalSchedule);
            if (!isFirebaseConnected) {
                toast({
                    title: "Erro de Conexão",
                    description: "Falha ao remover colaborador: Firebase não conectado. Salvo localmente.",
                    variant: "destructive"
                });
            } else {
                toast({
                    title: "Erro no Servidor",
                    description: "Falha ao remover colaborador no servidor. Salvo localmente.",
                    variant: "destructive"
                });
            }
        } else {
            toast({ title: "Sucesso", description: "Colaborador removido e salvo no servidor." });
        }
    }, [employeeToDelete, employees, schedule, filters, holidays, toast, updateDataInFirestore, isFirebaseConnected]);


   // --- Schedule Handling ---

    const handleShiftChange = useCallback(async (empId: number, date: Date, newShift: ShiftCode) => {
        const key = getScheduleKey(empId, date);
        const currentScheduleState = {...schedule}; // Capture current state for revert
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
            setSchedule(currentScheduleState);
            toast({ title: "Erro", description: "Falha ao salvar alteração.", variant: "destructive" });
        }

    }, [employees, schedule, holidays, filters, toast, updateDataInFirestore, isHolidayFn]);


    const handleDetailChange = useCallback(async (empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
        const key = getScheduleKey(empId, date);
        const currentScheduleState = {...schedule}; // Capture current state
        const updatedSchedule = { ...currentScheduleState };

        if (!updatedSchedule[key]) {
            updatedSchedule[key] = { shift: 'TRABALHA', role: '', baseHours: '', holidayReason: undefined };
        } else if (updatedSchedule[key].shift !== 'TRABALHA' && (field === 'role' || field === 'baseHours')) {
             toast({ title: "Aviso", description: "Função/Horário só se aplicam a dias de Trabalho (T).", variant: "default" });
             return;
        } else if (updatedSchedule[key].shift !== 'FF' && field === 'holidayReason') {
             toast({ title: "Aviso", description: "Motivo só se aplica a Folga Feriado (FF).", variant: "default" });
             return;
        }

        updatedSchedule[key] = { ...updatedSchedule[key], [field]: value };
        setSchedule(updatedSchedule);

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, holidays)) {
            setSchedule(currentScheduleState);
             toast({ title: "Erro", description: "Falha ao salvar detalhe.", variant: "destructive" });
         }
    }, [employees, schedule, filters, holidays, toast, updateDataInFirestore]);

    const handleToggleHoliday = useCallback(async (date: Date) => {
        if (!currentMonth) return; // Guard against null currentMonth
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
                     // Revert to default or fixed day off
                     if (isFixedDayOff) {
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     } else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                         const dayOptions = getTimeOptionsForDate(date, false); // false because it's no longer a holiday
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
                     } else { // Default to FOLGA if no other defaults apply
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     }
                 }
            }

        });
        setSchedule(updatedSchedule);

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, updatedHolidays)) {
            setHolidays(currentHolidays);
            setSchedule(currentScheduleState);
             toast({ title: "Erro", description: "Falha ao atualizar feriado.", variant: "destructive" });
        } else {
            toast({ title: "Feriado Atualizado", description: `Dia ${formatDate(date, 'dd/MM')} ${isCurrentlyHoliday ? 'não é mais' : 'agora é'} feriado.` });
        }

    }, [holidays, employees, schedule, filters, toast, updateDataInFirestore, isHolidayFn, currentMonth]);


    // --- UI Handlers ---

    const handleFilterChange = (newFilters: Partial<FilterState>) => {
        const updatedFilters = { ...filters, ...newFilters };
        setFilters(updatedFilters);
        if (newFilters.selectedDate) {
          setCurrentMonth(startOfMonth(newFilters.selectedDate));
        }
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
            toast({ title: "Erro", description: "Mês atual não definido.", variant: "destructive" });
            setIsClearingMonth(false);
            return;
         }
         if (!(await checkAndInitializeFirebase()) || !db) {
            toast({ title: "Aviso", description: "Firebase não disponível. Limpeza de mês não pôde ser salva no servidor.", variant: "warning" });
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

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, currentHolidays) && db) {
            setSchedule(currentScheduleState);
            toast({ title: "Erro", description: "Falha ao zerar escala no servidor. Mudanças salvas localmente.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso", description: `Escala de ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada.` });
        }
    }, [currentMonth, schedule, employees, holidays, toast, updateDataInFirestore, isHolidayFn, checkAndInitializeFirebase, db, filters]);


    // --- PDF and WhatsApp ---

    const generatePdf = async () => {
        if (!isClient || !currentMonth) return;
        const jsPDF = (await import('jspdf')).default;
        (await import('jspdf-autotable'));

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
                    } else { // Should ideally not happen if schedule is initialized
                        content = 'F';
                        fillColor = '#f0f0f0'; // Muted (gray)
                        textColor = [100, 100, 100];
                    }

                     // Override cell background for holidays if not FF itself
                     if (holiday && entry?.shift !== 'FF') {
                         fillColor = '#e9d5ff'; // A light purple, adjust as needed
                         textColor = [50,50,50]; // Darker text for contrast
                     }

                    return { content, styles: { fillColor, textColor, fontStyle, fontSize: 5, cellPadding: 0.5, halign: 'center', valign: 'middle', minCellHeight: 6 } };
                })
            ];
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageMargin = 10;
        const availableWidth = pageWidth - (pageMargin * 2);
        const firstColWidth = 25; // For employee names
        const actionsColWidth = 0; // Actions column not included in PDF
        const dateColCount = datesForTable.length;
        const remainingWidth = availableWidth - firstColWidth - actionsColWidth;
        const dateColWidth = Math.max(6, remainingWidth / dateColCount); // Ensure a minimum width

        const columnStyles: { [key: number]: any } = {
            0: { cellWidth: firstColWidth, halign: 'left', fontStyle: 'bold', fontSize: 6, valign: 'middle' },
        };
        for (let i = 0; i < dateColCount; i++) {
            columnStyles[i + 1] = { cellWidth: dateColWidth, halign: 'center', valign: 'middle', fontSize: 5 };
        }

        // Custom drawing for header to handle holiday column highlighting
        const drawHeader = (data: any) => {
            const headerRow = data.table.head[0];
            let xPos = data.cursor.x;
            headerRow.cells.forEach((cell: any, index: number) => {
                let isColHoliday = index > 0 && isHolidayFn(datesForTable[index - 1]);
                doc.setFillColor(isColHoliday ? '#3498db' : '#2980b9'); // Primary for holiday, darker blue for others
                doc.setTextColor(255);
                doc.setFont(undefined, 'bold');
                doc.rect(xPos, data.cursor.y, cell.width, cell.height, 'F');
                doc.autoTableText(cell.text, xPos + cell.padding('left'), data.cursor.y + cell.height / 2, {
                    halign: cell.styles.halign,
                    valign: cell.styles.valign
                });
                xPos += cell.width;
            });
        };


        (doc as any).autoTable({
            head: header,
            body: body,
            theme: 'grid',
             headStyles: {
                 fillColor: '#2980b9', // Default header color (darker blue)
                 textColor: 255,
                 fontStyle: 'bold',
                 halign: 'center',
                 valign: 'middle',
                 fontSize: 6,
                 cellPadding: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
                 lineColor: [200, 200, 200],
                 lineWidth: 0.1,
                 // Use didDrawCell to customize individual header cells for holidays
                 didDrawCell: (data: any) => {
                    if (data.section === 'head' && data.column.index > 0) { // Skip employee name column
                         const dateIndex = data.column.index -1; // Adjust index for datesForTable array
                         if (dateIndex < datesForTable.length && isHolidayFn(datesForTable[dateIndex])) {
                             doc.setFillColor('#3498db'); // Holiday header color (primary blue)
                             doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                             // Redraw text to ensure it's on top of the new fill
                             doc.setTextColor(255);
                             doc.setFont(undefined, 'bold');
                             doc.autoTableText(data.cell.text, data.cell.x + data.cell.padding('left'), data.cell.y + data.cell.height / 2, {
                                 halign: data.cell.styles.halign,
                                 valign: data.cell.styles.valign
                             });
                         }
                    }
                 }
             },
            styles: { // Default styles for body cells
                 cellPadding: { top: 0.5, right: 0.2, bottom: 0.5, left: 0.2 },
                 fontSize: 5,
                 valign: 'middle',
                 halign: 'center',
                 lineWidth: 0.1,
                 lineColor: [200, 200, 200],
                 minCellHeight: 6, // Minimum height for each cell
             },
            columnStyles: columnStyles,
            margin: { top: 28, left: pageMargin, right: pageMargin, bottom: 15 }, // Margins for the page
            didDrawPage: (data: any) => {
                // Page Title
                doc.setFontSize(14);
                 doc.setTextColor(40); // Dark gray for title
                doc.text('ShiftMaster - Escala de Trabalho', pageMargin, 15);
                // Month/Year Subtitle
                 doc.setFontSize(10);
                doc.text(`Mês: ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, pageMargin, 22);

                // Legend at the bottom
                const pageHeight = doc.internal.pageSize.getHeight();
                const startY = pageHeight - 12; // Start legend a bit higher
                 doc.setFontSize(8);
                 doc.setTextColor(100); // Muted text color for legend
                 doc.text("Legenda:", pageMargin, startY);
                 let currentX = pageMargin;
                 const legendY = startY + 4;
                 const rectSize = 3;
                 const textOffset = 4;
                 const spacing = 15; // Base spacing, will adjust based on text width

                 // Legend items
                 Object.entries(typeShiftCodeToDescription).forEach(([code, desc]) => {
                     let fillColor: string | number[] = [255, 255, 255]; // Default white
                     if (code === 'TRABALHA') fillColor = '#e74c3c'; // Destructive
                     else if (code === 'FOLGA') fillColor = '#f0f0f0';   // Muted
                     else if (code === 'FF') fillColor = '#2ecc71';    // Accent

                     doc.setFillColor(...(Array.isArray(fillColor) ? fillColor : [255,0,0])); // Ensure RGB array
                     doc.rect(currentX, legendY - rectSize / 2, rectSize, rectSize, 'F');
                     doc.setTextColor(100);
                     doc.text(`${code}: ${desc}`, currentX + textOffset, legendY);
                     // Adjust currentX for next item based on text width
                     currentX += spacing + (doc.getTextWidth(`${code}: ${desc}`) / doc.internal.scaleFactor) + 2 ;
                 });

                 // Legend for Holiday Column Highlight
                 doc.setFillColor('#e9d5ff'); // Light purple for holiday column cell
                 doc.rect(currentX, legendY - rectSize / 2, rectSize, rectSize, 'F');
                 doc.setTextColor(100);
                 doc.text("Dia Feriado (Coluna)", currentX + textOffset, legendY);

            },

        });


        doc.save(`escala_${formatDate(currentMonth, 'yyyy-MM')}.pdf`);
        toast({ title: "Sucesso", description: "PDF da escala gerado." });
    };


    const generateDailyWhatsAppText = useCallback(() => {
        if (!filters.selectedDate) {
            toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive" });
            return;
        }
        const holidayStatus = isHolidayFn(filters.selectedDate);
        const text = generateWhatsAppText(filters.selectedDate, filteredEmployees, schedule, holidayStatus, roleToEmojiMap);
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Sucesso", description: `Texto da escala de ${formatDate(filters.selectedDate as Date, 'dd/MM/yyyy', { locale: ptBR })} copiado.` });
        }).catch(e => {
            console.error("Failed to copy WhatsApp text: ", e);
            toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive" });
        });
    }, [filteredEmployees, schedule, filters.selectedDate, isHolidayFn, toast, roleToEmojiMap]);


    useEffect(() => {
        if (!isClient) return;

        const unsubscribe = () => {
        };

        return unsubscribe;
    }, [isClient]);


    if (!hasMounted || isLoading || !currentMonth || !filters.selectedDate) { // Check all critical states
         return (
           <div className="flex justify-center items-center h-screen">
             <p>Inicializando e carregando dados...</p>
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
            if (!employeeData.id || employeeData.id === 0) { // Logic for new vs existing
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
              <Button variant="outline" size="sm" onClick={() => loadDataFromFirestore("scheduleData")}><Icons.reload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Recarregar</Button>
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
         <Button variant="outline" size="sm" onClick={() => currentMonth && setCurrentMonth(addDays(startOfMonth(currentMonth), -1))}>Mês Ant.</Button>
         <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{currentMonth ? formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR }) : 'Carregando mês...'}</span>
         <Button variant="outline" size="sm" onClick={() => currentMonth && setCurrentMonth(addDays(startOfMonth(currentMonth), 31))}>Próx. Mês</Button>
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
