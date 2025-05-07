'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import HeadInformation from '@/components/HeadInformation'; // Default import
import { cn } from '@/lib/utils';
import { db, app } from '@/lib/firebase'; // Import Firestore instance and app
import { doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // Uncomment if you need authentication
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry, FilterState, ShiftType } from './types'; // Make sure ShiftType is imported
import { availableRoles, daysOfWeek, roleToEmojiMap, getTimeOptionsForDate, shiftTypeToHoursMap, SELECT_NONE_VALUE } from './types'; // Correctly import from types
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

const SAVED_SCHEDULES_COLLECTION = 'scheduleData'; // Use a single document for simplicity
const LOCAL_STORAGE_KEY = 'shiftMasterData'; // Define key for localStorage

const toastDuration = 3000;

export function ShiftMasterApp() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [schedule, setSchedule] = useState<ScheduleData>({});
    const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
    const [filters, setFilters] = useState<FilterState>({
        employee: '',
        role: '',
        selectedDate: new Date(),
    });
    const [editOpen, setEditOpen] = useState(false);
    const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
    const [employeeToDelete, setEmployeeToDelete] = useState<number | null>(null);
    const [isFirebaseConnected, setIsFirebaseConnected] = useState(true); // Assume connected initially

    const [holidays, setHolidays] = useState<Date[]>([]);
    const [showEasterEgg, setShowEasterEgg] = useState(false); // Just for fun

    const [isLoading, setIsLoading] = useState(true);
    const [isClearingMonth, setIsClearingMonth] = useState(false); // State for clear month confirmation

    const { toast } = useToast();
    const isClient = typeof window !== 'undefined';
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // --- Firebase/Data Handling ---

    // Function to check Firebase connection and initialize if needed
     const checkAndInitializeFirebase = useCallback(async () => {
        if (!db) { // Check if db is null or undefined
            console.warn("Firebase DB instance is not initialized. Attempting to load data locally.");
            setIsFirebaseConnected(false);
            // Optionally, show a toast here, but it might be too frequent if called often
            return false;
        }
        // Potentially add a light ping or check to Firestore if needed, but often just checking `db` is enough
        setIsFirebaseConnected(true);
        return true;
    }, [toast]);


    // Load data from Firestore
    const loadDataFromFirestore = useCallback(async (docId: string = "scheduleData") => {
        if (!(await checkAndInitializeFirebase()) || !db) { // Ensure db is not null before proceeding
             console.log("Firebase not available. Loading from local storage.");
             loadDataFromLocalStorage(); // Attempt to load from local storage if Firebase isn't available
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
                            // Attempt to parse assuming ISO string format first
                            const parsedDate = parseISO(holiday);
                            if (!isNaN(parsedDate.getTime())) {
                                return startOfDay(parsedDate);
                            }
                            // Fallback or handle other formats if necessary, though ISO is preferred
                            console.warn(`Could not parse holiday date string: ${holiday}. Using current date as fallback.`);
                            return startOfDay(new Date()); // Fallback, adjust as needed
                        } catch (parseError) {
                            console.error(`Error parsing holiday date string: ${holiday}`, parseError);
                            return startOfDay(new Date()); // Fallback on error
                        }
                    });

                    const parsedFilters = {
                      employee: data.filters?.employee ?? '',
                      role: data.filters?.role ?? '',
                      selectedDate: data.filters?.selectedDate ? parseISO(data.filters.selectedDate) : new Date()
                    }

                    setEmployees(parsedEmployees);
                    setSchedule(parsedSchedule);
                    setHolidays(parsedHolidays);
                    setFilters(parsedFilters);
                    setCurrentMonth(startOfMonth(parsedFilters.selectedDate || new Date()));

                    toast({ title: 'Sucesso', description: 'Dados carregados do Firestore!' });
                }
            } else {
                console.log("No such document! Initializing with default data.");
                const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData();
                setEmployees(initialEmployees);
                setSchedule(initialSchedule);
                setFilters(initialFilters);
                setHolidays(initialHolidays);
                setCurrentMonth(startOfMonth(initialFilters.selectedDate || new Date()));
                // Attempt to save the initial data back to Firestore
                await updateDataInFirestore(initialEmployees, initialSchedule, initialFilters, initialHolidays);

                toast({ title: 'Aviso', description: 'Nenhum dado encontrado. Iniciando com dados padrão.' });
            }
        } catch (error) {
            console.error("Error fetching document:", error);
            setIsFirebaseConnected(false); // Assume connection issue on error
            toast({
                title: "Erro ao Carregar",
                description: "Falha ao buscar dados do Firestore. Verifique a conexão e as configurações. Usando dados locais, se disponíveis.",
                variant: "destructive",
                duration: 5000,
            });
            // Fallback to local storage if Firestore fails
            loadDataFromLocalStorage();
        } finally {
            setIsLoading(false);
        }
    }, [toast, checkAndInitializeFirebase]); // Added checkAndInitializeFirebase dependency

     // Update data in Firestore
     const updateDataInFirestore = useCallback(async (newEmployees: Employee[], newSchedule: ScheduleData, newFilters: FilterState, newHolidays: Date[]) => {
        if (!(await checkAndInitializeFirebase()) || !db) { // Ensure db is not null
            console.warn("Firebase not available. Saving to local storage instead.");
            saveDataToLocalStorage(newEmployees, newSchedule, newFilters, newHolidays);
            return false;
        }


        const dataToSave = {
            employees: newEmployees,
            schedule: newSchedule,
             filters: {
              ...newFilters,
              selectedDate: newFilters.selectedDate?.toISOString() // Store date as ISO string
            },
            holidays: newHolidays.map(date => date.toISOString()),
        };

        const docRef = doc(db, SAVED_SCHEDULES_COLLECTION, "scheduleData");

        try {
            await setDoc(docRef, dataToSave, { merge: true });
            console.log("Document updated successfully in Firestore!");
            return true;
        } catch (e) {
            console.error("Error updating document in Firestore: ", e);
             setIsFirebaseConnected(false); // Assume connection issue on error
             toast({
                title: 'Erro ao Salvar no Servidor',
                description: 'Falha ao salvar dados no Firestore. Mudanças salvas localmente.',
                variant: 'destructive',
                duration: 5000
            });
            saveDataToLocalStorage(newEmployees, newSchedule, newFilters, newHolidays); // Save locally on Firestore error
            return false;
        }
    }, [toast, checkAndInitializeFirebase]); // Added checkAndInitializeFirebase

    // Save data to Local Storage (as a fallback or primary if Firebase fails)
     const saveDataToLocalStorage = useCallback((employeesData: Employee[], scheduleData: ScheduleData, filtersData: FilterState, holidaysData: Date[]) => {
       if (!isClient) return;
        try {
            const dataToStore = {
                employees: employeesData,
                schedule: scheduleData,
                filters: {
                  ...filtersData,
                  selectedDate: filtersData.selectedDate?.toISOString() // Store date as ISO string
                },
                holidays: holidaysData.map(date => date.toISOString()), // Store dates as ISO strings
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToStore));
        } catch (error) {
            console.error("Failed to save data to localStorage:", error);
            toast({ title: "Erro de Armazenamento Local", description: "Não foi possível salvar as alterações localmente.", variant: "destructive" });
        }
    }, [isClient, toast]);

    // Load data from Local Storage (as a fallback)
    const loadDataFromLocalStorage = useCallback(() => {
        if (!isClient) return false;
        const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localData) {
            try {
                const parsedData = JSON.parse(localData);
                if (parsedData.employees && parsedData.schedule) {
                    setEmployees(parsedData.employees);
                    setSchedule(parsedData.schedule);
                    setFilters({
                      employee: parsedData.filters?.employee ?? '',
                      role: parsedData.filters?.role ?? '',
                      selectedDate: parsedData.filters?.selectedDate ? parseISO(parsedData.filters.selectedDate) : new Date()
                    });
                    setHolidays((parsedData.holidays || []).map((isoString: string) => parseISO(isoString)));
                    setCurrentMonth(startOfMonth(parsedData.filters?.selectedDate ? parseISO(parsedData.filters.selectedDate) : new Date()));
                    toast({ title: 'Dados Locais Carregados', description: 'Usando dados salvos localmente.', variant: 'default' });
                    return true; // Data loaded successfully
                }
            } catch (error) {
                console.error("Failed to parse localStorage data:", error);
                toast({ title: "Erro nos Dados Locais", description: "Não foi possível ler os dados locais. Usando dados padrão.", variant: "warning" });
            }
        }
        // If no local data, or parsing failed, generate initial data
        console.log("No valid local data found, generating initial data...");
        const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData();
        setEmployees(initialEmployees);
        setSchedule(initialSchedule);
        setFilters(initialFilters);
        setHolidays(initialHolidays);
        setCurrentMonth(startOfMonth(initialFilters.selectedDate || new Date()));
        saveDataToLocalStorage(initialEmployees, initialSchedule, initialFilters, initialHolidays); // Save initial data locally
        return false; // No valid local data found, initial generated
    }, [isClient, toast, saveDataToLocalStorage]);


    // Fetch initial data (Try Firestore first, then LocalStorage, then generate)
    useEffect(() => {
        setIsLoading(true);
         if (!isClient) {
             setIsLoading(false);
             return;
         }


        loadDataFromFirestore("scheduleData"); // This will call loadDataFromLocalStorage internally if Firestore fails or isn't available
          // .catch(() => { // Catch is less necessary here as loadDataFromFirestore handles its own errors
          //     // console.log("Firestore failed, trying localStorage..."); // This logic is now inside loadDataFromFirestore
          //     // loadDataFromLocalStorage(); // Now called inside loadDataFromFirestore's catch or if !db
          // })
          // .finally(() => { // Already handled by loadDataFromFirestore
          //    setIsLoading(false);
          // });
    }, [isClient, loadDataFromFirestore, loadDataFromLocalStorage]); // Only run once on mount on client

    // Save data whenever employees, schedule, filters, or holidays change
    useEffect(() => {
        // Save to Firestore first
        updateDataInFirestore(employees, schedule, filters, holidays)
            // .then(success => { // Already handled by updateDataInFirestore
            //     if (!success) {
            //         // If Firestore fails, save to localStorage as fallback
            //         console.warn("Firestore save failed, saving to localStorage.");
            //         saveDataToLocalStorage(employees, schedule, filters, holidays);
            //     }
            // })
            // .catch(() => { // Already handled by updateDataInFirestore
            //      console.error("Error during Firestore update, saving to localStorage.");
            //      saveDataToLocalStorage(employees, schedule, filters, holidays);
            // });
    }, [employees, schedule, filters, holidays, updateDataInFirestore, saveDataToLocalStorage]);


    // --- Employee CRUD ---

    const addEmployee = async (employeeData: Employee) => {
        const maxId = employees.reduce((max, emp) => Math.max(max, emp.id), 0);
        const newEmployee = { ...employeeData, id: maxId + 1 };
        const newEmployees = [...employees, newEmployee];
        setEmployees(newEmployees); // Optimistic update
        setEditOpen(false);
        if (!await updateDataInFirestore(newEmployees, schedule, filters, holidays)) {
            // Revert if Firestore fails
            setEmployees(employees);
             toast({ title: "Erro", description: "Falha ao adicionar colaborador.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso", description: "Colaborador adicionado." });
        }
    };


   const updateEmployee = async (employeeData: Employee) => {
        const originalEmployees = [...employees]; // Keep original for revert
        const updatedEmployees = employees.map(emp =>
            emp.id === employeeData.id ? employeeData : emp
        );
        setEmployees(updatedEmployees); // Optimistic update

        // Apply fixed day off and default shift logic after update
        const updatedSchedule = applyEmployeeDefaults(employeeData, schedule, holidays);
        setSchedule(updatedSchedule); // Optimistic schedule update

        setEditOpen(false);

        if (!await updateDataInFirestore(updatedEmployees, updatedSchedule, filters, holidays)) {
            // Revert if Firestore fails
            setEmployees(originalEmployees);
            setSchedule(schedule); // Revert schedule as well
            toast({ title: "Erro", description: "Falha ao atualizar colaborador.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso", description: "Colaborador atualizado." });
        }
    };
    // Helper to check if a date is a holiday - Memoized version
    const isHolidayFn = useCallback((date: Date): boolean => {
        return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDay(date)));
    }, [holidays]);


    // Function to apply fixed day off and default shifts for ONE employee
    const applyEmployeeDefaults = (
        employee: Employee,
        currentSchedule: ScheduleData,
        currentHolidays: Date[]
    ): ScheduleData => {
        const newSchedule = { ...currentSchedule };
        const datesInMonth = getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth));
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
        daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);


        datesInMonth.forEach(date => {
            const key = getScheduleKey(employee.id, date);
            const dayOfWeek = date.getDay();
            const isFixedDayOff = employee.fixedDayOff && dayOfWeek === fixedDayMapping[employee.fixedDayOff];
            const dayIsActuallyHoliday = isHolidayFn(date);

            // Start with existing or default FOLGA
            let entry: ScheduleEntry = newSchedule[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };

            // 1. Apply Fixed Day Off (overrides everything except FF)
            if (isFixedDayOff) {
                if (entry.shift !== 'FF') { // Don't override FF with F
                    entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
            }
            // 2. Apply Default Work Schedule (if not fixed day off and not FF)
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
                 entry.holidayReason = undefined; // Clear reason if it becomes T
            }
            // 3. Apply Holiday Folga (FF) if it's a holiday and current is F
            // and not a fixed day off that was already handled as FOLGA
            if (dayIsActuallyHoliday && entry.shift === 'FOLGA' && !isFixedDayOff) {
                entry = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
            }

            newSchedule[key] = entry;
        });
        return newSchedule;
    };



    const deleteEmployee = async (employeeId: number) => {
        setEmployeeToDelete(employeeId); // Open confirmation dialog
    };

    const confirmDeleteEmployee = useCallback(async () => {
        if (employeeToDelete === null) return;

        const originalEmployees = [...employees];
        const originalSchedule = {...schedule};
        const newEmployees = employees.filter(emp => emp.id !== employeeToDelete);
        const newSchedule = { ...schedule };
        Object.keys(newSchedule).forEach(key => {
          if (key.startsWith(`${employeeToDelete}-`)) {
            delete newSchedule[key];
          }
        });

        setEmployees(newEmployees);
        setSchedule(newSchedule); // Optimistic update
        setEmployeeToDelete(null); // Close dialog

        if (!await updateDataInFirestore(newEmployees, newSchedule, filters, holidays)) {
           // Revert if Firestore fails
           setEmployees(originalEmployees);
           setSchedule(originalSchedule);
           toast({ title: "Erro", description: "Falha ao remover colaborador.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso", description: "Colaborador removido." });
        }
    }, [employeeToDelete, employees, schedule, filters, holidays, toast, updateDataInFirestore]); // Added updateDataInFirestore


   // --- Schedule Handling ---

    const handleShiftChange = useCallback(async (empId: number, date: Date, newShift: ShiftCode) => {
        const key = getScheduleKey(empId, date);
        const updatedSchedule = { ...schedule };
        const employee = employees.find(e => e.id === empId);
        const dayIsHoliday = isHolidayFn(date); // Check if the specific date is a holiday

        // Prepare the base entry, defaulting role/hours if needed
        let entry: ScheduleEntry = updatedSchedule[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
        entry = { ...entry, shift: newShift }; // Update the shift code first

        // Adjust details based on the NEW shift code
        if (newShift === 'TRABALHA') {
            // Re-apply default role if empty
            entry.role = entry.role || employee?.defaultRole || '';

            // Re-calculate appropriate default hours if empty or invalid for the day
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
                 // If no valid default found, pick the first available option
                 if (!defaultHour && dayOptions.length > 0) {
                     defaultHour = dayOptions[0];
                 }
                 entry.baseHours = defaultHour;
             }

            // Clear holiday reason if it becomes 'T'
            entry.holidayReason = undefined;
        } else if (newShift === 'FOLGA') {
            // Clear role, hours, and reason
            entry.role = '';
            entry.baseHours = '';
            entry.holidayReason = undefined;
        } else if (newShift === 'FF') {
            // Clear role and hours, keep or set default reason
            entry.role = '';
            entry.baseHours = '';
            entry.holidayReason = entry.holidayReason || 'Feriado'; // Keep existing or set default
        }

        updatedSchedule[key] = entry; // Assign the updated/created entry
        setSchedule(updatedSchedule); // Optimistic update
         if (!await updateDataInFirestore(employees, updatedSchedule, filters, holidays)) {
            // Revert if Firestore fails
            setSchedule(schedule);
            toast({ title: "Erro", description: "Falha ao salvar alteração.", variant: "destructive" });
        }

    }, [employees, schedule, holidays, filters, toast, updateDataInFirestore, isHolidayFn]); // Added isHolidayFn


    const handleDetailChange = useCallback(async (empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
        const key = getScheduleKey(empId, date);
        const updatedSchedule = { ...schedule };

        // Ensure entry exists, defaulting to 'T' if details are being added
        if (!updatedSchedule[key]) {
            updatedSchedule[key] = { shift: 'TRABALHA', role: '', baseHours: '', holidayReason: undefined };
        } else if (updatedSchedule[key].shift !== 'TRABALHA' && (field === 'role' || field === 'baseHours')) {
             toast({ title: "Aviso", description: "Função/Horário só se aplicam a dias de Trabalho (T).", variant: "default" });
             return; // Prevent changing details if not 'T'
        } else if (updatedSchedule[key].shift !== 'FF' && field === 'holidayReason') {
             toast({ title: "Aviso", description: "Motivo só se aplica a Folga Feriado (FF).", variant: "default" });
             return; // Prevent changing reason if not 'FF'
        }

        updatedSchedule[key] = { ...updatedSchedule[key], [field]: value };
        setSchedule(updatedSchedule); // Optimistic update

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, holidays)) {
            // Revert if Firestore fails
            setSchedule(schedule);
             toast({ title: "Erro", description: "Falha ao salvar detalhe.", variant: "destructive" });
         }
    }, [employees, schedule, filters, holidays, toast, updateDataInFirestore]); // Added updateDataInFirestore

    const handleToggleHoliday = useCallback(async (date: Date) => {
        const dateStart = startOfDay(date);
        const isCurrentlyHoliday = isHolidayFn(dateStart);
        const updatedHolidays = isCurrentlyHoliday
            ? holidays.filter(holiday => !isEqual(holiday, dateStart))
            : [...holidays, dateStart].sort((a, b) => a.getTime() - b.getTime());

        setHolidays(updatedHolidays); // Optimistic update

        // Update schedule for all employees for this date based on new holiday status
        const updatedSchedule = { ...schedule };
        employees.forEach(emp => {
            const key = getScheduleKey(emp.id, date);
            let entry = updatedSchedule[key]; // Get existing or default
             const isFixedDayOff = emp.fixedDayOff && date.getDay() === daysOfWeek.indexOf(emp.fixedDayOff);

            if (!isCurrentlyHoliday) { // Becoming a holiday
                // If it was a working day OR a normal folga (and not fixed day off), change to FF
                if (!isFixedDayOff && (!entry || entry.shift === 'TRABALHA' || entry.shift === 'FOLGA')) {
                     updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                }
                // If it was already FF or Fixed Folga, keep it as is
            } else { // Removing holiday
                 // If it was FF, revert based on defaults or fixed day off
                 if (entry && entry.shift === 'FF') {
                     if (isFixedDayOff) {
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     } else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                         const dayOptions = getTimeOptionsForDate(date, false); // Use non-holiday times
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
                         // No default work schedule, revert to normal FOLGA
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     }
                 }
                 // If it was already T or F (due to fixed day off during a now non-holiday), leave it
            }

        });
        setSchedule(updatedSchedule); // Optimistic schedule update

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, updatedHolidays)) {
            // Revert if Firestore fails
            setHolidays(holidays);
            setSchedule(schedule);
             toast({ title: "Erro", description: "Falha ao atualizar feriado.", variant: "destructive" });
        } else {
            toast({ title: "Feriado Atualizado", description: `Dia ${formatDate(date, 'dd/MM')} ${isCurrentlyHoliday ? 'não é mais' : 'agora é'} feriado.` });
        }

    }, [holidays, employees, schedule, filters, toast, updateDataInFirestore, isHolidayFn]);


    // --- UI Handlers ---

    const handleFilterChange = (newFilters: Partial<FilterState>) => {
        const updatedFilters = { ...filters, ...newFilters };
        setFilters(updatedFilters);
        // Also update currentMonth if selectedDate changes
        if (newFilters.selectedDate) {
          setCurrentMonth(startOfMonth(newFilters.selectedDate));
        }
    };

    const datesForTable = useMemo(() => getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth)), [currentMonth]);

    const filteredEmployees = useMemo(() => {
        if (!employees) return []; // Handle case where employees might be loading
        return employees.filter(emp => {
        if (filters.employee && emp.id !== parseInt(filters.employee)) return false;
        if (filters.role) {
            // Check if the employee works in the selected role on *any* day of the *current month*
            const worksInRole = datesForTable.some(date => {
                const key = getScheduleKey(emp.id, date);
                return schedule[key]?.role === filters.role;
            });
            if (!worksInRole) return false;
        }
        return true;
        });
    }, [employees, filters, datesForTable, schedule]); // Add schedule and datesForTable as dependencies


    const handleClearMonth = useCallback(() => {
        setIsClearingMonth(true); // Open confirmation dialog
    }, []);

    const confirmClearMonth = useCallback(async () => {
         if (!(await checkAndInitializeFirebase()) || !db) {
            toast({ title: "Aviso", description: "Firebase não disponível. Limpeza de mês não pôde ser salva no servidor.", variant: "warning" });
            // Proceed with local changes if Firebase is not available
         }


        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const datesInMonth = getDatesInRange(monthStart, monthEnd);
        const updatedSchedule = { ...schedule };
        const currentHolidays = holidays; // Use current holidays state


        employees.forEach(emp => {
            datesInMonth.forEach(date => {
                const key = getScheduleKey(emp.id, date);
                // Reset to FOLGA, unless it's a holiday, then set to FF
                if (isHolidayFn(date)) {
                     updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                } else {
                    updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
            });
        });

        setSchedule(updatedSchedule); // Optimistic update
        setIsClearingMonth(false); // Close dialog

         if (!await updateDataInFirestore(employees, updatedSchedule, filters, currentHolidays) && db) { // Only toast Firestore error if db was supposed to be available
            // Revert (though less critical for a clear operation)
            setSchedule(schedule); // Revert to original schedule
            toast({ title: "Erro", description: "Falha ao zerar escala no servidor. Mudanças salvas localmente.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso", description: `Escala de ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada.` });
        }
    }, [currentMonth, schedule, employees, holidays, toast, updateDataInFirestore, isHolidayFn, checkAndInitializeFirebase, db, filters]); // Added dependencies


    // --- PDF and WhatsApp ---

    const generatePdf = async () => {
        if (!isClient) return;
        const jsPDF = (await import('jspdf')).default;
        (await import('jspdf-autotable'));

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4',
            compress: true, // Enable compression
        });

        const header = [['Colaborador', ...datesForTable.map(date => formatDate(date, 'E\ndd', { locale: ptBR }))]];
        const body = filteredEmployees.map(emp => {
            return [
                { content: emp.name, styles: { fontStyle: 'bold', fontSize: 6, cellPadding: 0.5 } }, // Employee name style
                ...datesForTable.map(date => {
                    const key = getScheduleKey(emp.id, date);
                    const entry = schedule[key];
                    const holiday = isHolidayFn(date);
                    let content = '';
                    let fillColor: string | number[] = [255, 255, 255]; // Default white
                    let textColor: string | number[] = [0, 0, 0]; // Default black
                    let fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal';

                    if (entry) {
                        if (entry.shift === 'TRABALHA') {
                            content = `${entry.role ? entry.role.substring(0, 3).toUpperCase() : 'S/R'}\n${entry.baseHours ? entry.baseHours.replace(/\s*às\s*/, '-') : 'S/H'}`;
                            fillColor = '#e74c3c'; // Red
                            textColor = [255, 255, 255];
                            fontStyle = 'bold';
                        } else if (entry.shift === 'FOLGA') {
                            content = 'F';
                             fillColor = '#f0f0f0'; // Light gray
                            textColor = [100, 100, 100];
                        } else if (entry.shift === 'FF') {
                            content = `FF${entry.holidayReason ? `\n(${entry.holidayReason.substring(0,5)})` : ''}`;
                            fillColor = '#2ecc71'; // Green
                            textColor = [255, 255, 255];
                            fontStyle = 'bold';
                        }
                    } else {
                        content = 'F'; // Default to Folga if no entry
                        fillColor = '#f0f0f0';
                        textColor = [100, 100, 100];
                    }

                    // Apply holiday background override if necessary
                     if (holiday && entry?.shift !== 'FF') {
                         fillColor = '#e9d5ff'; // Light purple for holiday columns (if not FF)
                         textColor = [50,50,50]; // Darker text on light purple
                     }

                    return { content, styles: { fillColor, textColor, fontStyle, fontSize: 5, cellPadding: 0.5, halign: 'center', valign: 'middle', minCellHeight: 6 } };
                })
            ];
        });

        // Calculate column widths dynamically
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageMargin = 10; // Adjust margin as needed
        const availableWidth = pageWidth - (pageMargin * 2);
        const firstColWidth = 25; // Fixed width for employee names
        const actionsColWidth = 15; // Fixed width for actions (adjust if needed)
        const dateColCount = datesForTable.length;
        const remainingWidth = availableWidth - firstColWidth - actionsColWidth;
        const dateColWidth = Math.max(8, remainingWidth / dateColCount); // Minimum width of 8mm

        const columnStyles: { [key: number]: any } = {
            0: { cellWidth: firstColWidth, halign: 'left', fontStyle: 'bold', fontSize: 6, valign: 'middle' },
             // 1: { cellWidth: actionsColWidth, halign: 'center', valign: 'middle' }, // Style for the actions column
        };
        for (let i = 0; i < dateColCount; i++) {
            columnStyles[i + 1] = { cellWidth: dateColWidth, halign: 'center', valign: 'middle', fontSize: 5 };
             // Highlight holiday columns in the header as well
            if (isHolidayFn(datesForTable[i])) {
                 // This applies to body cells, need to adjust for headStyles below
            }
        }

        // Custom function to draw header with holiday background
        const drawHeader = (data: any) => {
            const headerRow = data.table.head[0];
            let xPos = data.cursor.x;
            headerRow.cells.forEach((cell: any, index: number) => {
                let isColHoliday = index > 0 && isHolidayFn(datesForTable[index - 1]); // Check if the *date column* is a holiday
                doc.setFillColor(isColHoliday ? '#3498db' : '#2980b9'); // Blue for holiday, darker blue otherwise
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
            // startY: 28,
            head: header,
            body: body,
            theme: 'grid',
             headStyles: {
                 fillColor: '#2980b9', // Darker Blue - Default header color
                 textColor: 255,
                 fontStyle: 'bold',
                 halign: 'center',
                 valign: 'middle',
                 fontSize: 6,
                 cellPadding: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
                 lineColor: [200, 200, 200],
                 lineWidth: 0.1,
                 didDrawCell: (data: any) => { // Highlight holiday headers
                    if (data.section === 'head' && data.column.index > 0) {
                         const dateIndex = data.column.index -1; // Adjust for employee name column
                         if (dateIndex < datesForTable.length && isHolidayFn(datesForTable[dateIndex])) {
                             doc.setFillColor('#3498db'); // Lighter blue for holiday headers
                             doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
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
            margin: { top: 28, left: pageMargin, right: pageMargin, bottom: 15 }, // Add bottom margin for legend
            // Use didDrawPage to add headers and footers to each page
            didDrawPage: (data: any) => {
                // Header
                doc.setFontSize(14);
                 doc.setTextColor(40);
                doc.text('ShiftMaster - Escala de Trabalho', pageMargin, 15);
                 doc.setFontSize(10);
                doc.text(`Mês: ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, pageMargin, 22);

                // Footer (Legend)
                const pageHeight = doc.internal.pageSize.getHeight();
                const startY = pageHeight - 12; // Position legend at the bottom
                 doc.setFontSize(8);
                 doc.setTextColor(100);
                 doc.text("Legenda:", pageMargin, startY);
                 let currentX = pageMargin;
                 const legendY = startY + 4;
                 const rectSize = 3;
                 const textOffset = 4;
                 const spacing = 15; // Spacing between legend items

                 Object.entries(shiftCodeToDescription).forEach(([code, desc]) => {
                     let fillColor: string | number[] = [255, 255, 255];
                     if (code === 'TRABALHA') fillColor = '#e74c3c';
                     else if (code === 'FOLGA') fillColor = '#f0f0f0';
                     else if (code === 'FF') fillColor = '#2ecc71';

                     doc.setFillColor(...(Array.isArray(fillColor) ? fillColor : [255,0,0])); // Default red if not array
                     doc.rect(currentX, legendY - rectSize / 2, rectSize, rectSize, 'F');
                     doc.setTextColor(100);
                     doc.text(`${code}: ${desc}`, currentX + textOffset, legendY);
                     currentX += spacing + (doc.getTextWidth(`${code}: ${desc}`) / doc.internal.scaleFactor) + 2 ;
                 });

                 // Add Holiday column indicator
                 doc.setFillColor('#e9d5ff'); // Light purple for holiday column legend
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
        const holidayStatus = isHolidayFn(filters.selectedDate); // Check if the selected day is a holiday
        const text = generateWhatsAppText(filters.selectedDate, filteredEmployees, schedule, holidayStatus, roleToEmojiMap); // Pass holiday status and emoji map
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Sucesso", description: `Texto da escala de ${formatDate(filters.selectedDate, 'dd/MM/yyyy', { locale: ptBR })} copiado.` });
        }).catch(e => {
            console.error("Failed to copy WhatsApp text: ", e);
            toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive" });
        });
    }, [filteredEmployees, schedule, filters.selectedDate, isHolidayFn, toast, roleToEmojiMap]);


    // Effect to close dialogs on unmount or if state changes elsewhere (e.g., navigation)
    useEffect(() => {
        if (!isClient) return; // Only run on client

        const unsubscribe = () => {
            // You might want to add logic here if dialogs need explicit closing
            // on route changes or other events. For now, just ensuring state
            // is handled by the components themselves.
        };

        return unsubscribe;
    }, [isClient]); // Dependency ensures it runs only once on the client


    // Loading State
    if (isLoading && isClient) {
         return (
           <div className="flex justify-center items-center h-screen">
             <p>Carregando dados...</p> {/* More descriptive loading message */}
           </div>
         );
    }

  return (
    <div className="p-2 sm:p-4 flex flex-col h-screen bg-background">
        <HeadInformation/>
        <EditEmployeeDialog
          isOpen={editOpen}
          onOpenChange={setEditOpen}
          employee={employeeToEdit} // Pass employeeToEdit directly
          onSave={(employeeData) => {
            if (!employeeData.id || employeeData.id === 0) { // Check if ID is 0 or null/undefined
              addEmployee(employeeData);
            } else {
              updateEmployee(employeeData);
            }
          }}
        />

       {/* AlertDialog for Confirmation of Deletion */}
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

         {/* AlertDialog for Clearing Month */}
       <AlertDialog open={isClearingMonth} onOpenChange={setIsClearingMonth}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Zerar Escala</AlertDialogTitle>
                     <AlertDialogDescription>
                         Tem certeza que deseja zerar a escala para o mês de {formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}? Todos os dias para TODOS os colaboradores neste mês serão definidos como 'Folga' (F). Feriados marcados terão o status dos colaboradores alterados para 'Folga Feriado' (FF). Esta ação não pode ser desfeita.
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
              {/* Firebase Status Indicator */}
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

       {/* Month Navigation */}
       <div className="flex justify-center items-center my-2 sm:my-4 space-x-2 sm:space-x-4">
         <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addDays(startOfMonth(currentMonth), -1))}>Mês Ant.</Button>
         <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
         <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addDays(startOfMonth(currentMonth), 31))}>Próx. Mês</Button>
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
            isHolidayFn={isHolidayFn} // Pass the memoized isHolidayFn
          />
        </div>


      {/* Easter Egg - Keep it simple */}
      {showEasterEgg && (
        <div className="absolute bottom-4 right-4 opacity-50 pointer-events-none" data-ai-hint="animal cute">
           <img src="https://picsum.photos/50/50" alt="Egg" width={50} height={50} className="rounded-full"/>
        </div>
      )}
      <Toaster /> {/* Add toaster component */}
    </div>
  );
}
