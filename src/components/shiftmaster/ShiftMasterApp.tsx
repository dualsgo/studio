'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ShiftTable } from './ShiftTable';
// Imports from types.ts
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry, FilterState } from './types';
import {
  shiftTypeToHoursMap,
  availableRoles,
  daysOfWeek,
  roleToEmojiMap,
  getTimeOptionsForDate,
  shiftCodeToDescription,
  availableShiftCodes,
  availableShiftTypes,
} from './types'; // Correctly import from types
// Imports from utils.ts
import {
  generateInitialData,
  getScheduleKey,
  generateWhatsAppText,
  getDatesInRange
} from './utils';
import { useToast } from "@/hooks/use-toast";
import { parseISO, addDays, format as formatDate, startOfMonth, endOfMonth, isEqual, startOfDay } from 'date-fns'; // Renamed format to formatDate
import { ptBR } from 'date-fns/locale';
import { Button, buttonVariants } from '@/components/ui/button'; // Import buttonVariants
import { UserPlus, FileText, MessageSquareText, RotateCcw, CloudUpload, CloudDownload, Save, Trash2, WifiOff } from 'lucide-react'; // Added Trash2, WifiOff
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
import 'jspdf-autotable'; // Import autoTable plugin
import { cn } from '@/lib/utils'; // Import cn
import { db } from '@/lib/firebase'; // Import Firestore instance
import { doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShiftFilters } from './ShiftFilters'; // Import ShiftFilters

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

// Define the structure for Firestore data
interface FirestoreData {
  employees: Employee[];
  schedule: ScheduleData;
  filters: {
    employee: string;
    role: string;
    selectedDate?: string; // Store as ISO string
  };
  holidays: string[]; // Store as ISO strings
  metadata?: { // Optional metadata
      name?: string;
      createdAt?: string;
      updatedAt?: string;
  }
}

const DATA_DOC_ID = "mainScheduleData"; // Document ID to store the main schedule
const SAVED_SCHEDULES_COLLECTION = "savedSchedules"; // Collection for named saves

type AppFilterState = FilterState;
type AppPartialFilterState = Partial<AppFilterState>;

// Helper to check if a date is a holiday - Memoized version
const isHolidayFn = (holidays:Date[], date: Date): boolean => {
    if (!date || isNaN(date.getTime())) return false;
    const startOfDate = startOfDay(date);
    return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDate));
   };


export function ShiftMasterApp() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [filters, setFilters] = useState<AppFilterState>({ employee: '', role: '', selectedDate: new Date() });
  const [holidays, setHolidays] = useState<Date[]>([]); // State for holidays
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(!!db); // Track Firebase connection

  // State for managing dialogs
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<number | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // State for Save/Load dialog
  const [isSaveLoadDialogOpen, setIsSaveLoadDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savedSchedules, setSavedSchedules] = useState<{ id: string; name: string; timestamp: string }[]>([]);


  const tableRef = useRef<HTMLDivElement>(null); // Ref for the scrollable table container

  // Check if date is a holiday - Memoized version
  const isHoliday = useCallback((date: Date): boolean => {
    return isHolidayFn(holidays, date);
  }, [holidays]);

   // --- Firestore Persistence ---

   const showFirebaseErrorToast = useCallback(() => {
     toast({
       title: "Erro de Conexão",
       description: "Não foi possível conectar ao Firebase. Verifique a configuração e a conexão.",
       variant: "destructive",
     });
   }, [toast]);

   // Function to prepare data for Firestore
   const prepareDataForFirestore = useCallback((): FirestoreData => {
    return {
      employees,
      schedule,
      filters: {
        ...filters,
        selectedDate: filters.selectedDate?.toISOString(), // Convert Date to ISO string
      },
      holidays: holidays.map(h => h.toISOString()), // Convert Dates to ISO strings
      metadata: {
        updatedAt: new Date().toISOString()
      }
    };
  }, [employees, schedule, filters, holidays]);

  // Function to load data from Firestore
  const loadDataFromFirestore = useCallback(async (docId: string = DATA_DOC_ID, collectionName: string = SAVED_SCHEDULES_COLLECTION) => {
      setIsLoading(true);
      if (!db) {
          console.error("Firestore not initialized. Cannot load data.");
          showFirebaseErrorToast();
          const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData();
          setEmployees(initialEmployees);
          setSchedule(initialSchedule);
          setFilters(initialFilters);
          setHolidays(initialHolidays);
          setCurrentMonth(startOfMonth(initialFilters.selectedDate));
          setIsLoading(false);
          setIsClient(true);
          setIsFirebaseConnected(false);
          return;
      }
       setIsFirebaseConnected(true);

      try {
          const docRef = doc(db, collectionName, docId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
              const data = docSnap.data() as FirestoreData;
              const loadedEmployees = data.employees || [];
              const loadedSchedule = data.schedule || {};
              const loadedFilters = data.filters || { employee: '', role: '', selectedDate: new Date().toISOString() };
              const loadedHolidays = (data.holidays || []).map(isoString => parseISO(isoString));
              const loadedSelectedDate = loadedFilters.selectedDate ? parseISO(loadedFilters.selectedDate) : new Date();

              setEmployees(loadedEmployees);
              setSchedule(loadedSchedule);
              setFilters({
                  employee: loadedFilters.employee || '',
                  role: loadedFilters.role || '',
                  selectedDate: loadedSelectedDate,
              });
              setHolidays(loadedHolidays);
              setCurrentMonth(startOfMonth(loadedSelectedDate)); // Sync currentMonth with loaded date

              toast({ title: "Sucesso", description: `Dados ${docId === DATA_DOC_ID ? 'atuais' : `da escala "${data.metadata?.name || docId}"`} carregados do Firebase.` });
          } else {
              console.log("No existing data found in Firebase for", docId, "- initializing with defaults.");
              const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData();
              setEmployees(initialEmployees);
              setSchedule(initialSchedule);
              setFilters(initialFilters);
              setHolidays(initialHolidays);
              setCurrentMonth(startOfMonth(initialFilters.selectedDate));
              // Save the initial data back to Firestore
              await saveDataToFirestore(DATA_DOC_ID, SAVED_SCHEDULES_COLLECTION, {
                  employees: initialEmployees,
                  schedule: initialSchedule,
                  filters: {
                      ...initialFilters,
                      selectedDate: initialFilters.selectedDate.toISOString(),
                  },
                  holidays: initialHolidays.map(h => h.toISOString()),
                  metadata: {
                      name: "Escala Padrão",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                  }
              });
          }
      } catch (error) {
          console.error("Error loading data from Firestore:", error);
          toast({ title: "Erro", description: "Falha ao carregar dados do Firebase.", variant: "destructive" });
          // Fallback to initial data if loading fails
           const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData();
            setEmployees(initialEmployees);
            setSchedule(initialSchedule);
            setFilters(initialFilters);
            setHolidays(initialHolidays);
            setCurrentMonth(startOfMonth(initialFilters.selectedDate));
      } finally {
          setIsLoading(false);
          setIsClient(true); // Ensure client-side rendering after initial load attempt
      }
  }, [toast, showFirebaseErrorToast]); // Added showFirebaseErrorToast


  // Function to save data to a specific Firestore document
  const saveDataToFirestore = useCallback(async (docId: string, collectionName: string, data: FirestoreData, isAutoSave: boolean = false) => {
      if (!db) {
        if (!isAutoSave) {
            console.error("Firestore not initialized. Cannot save data.");
            showFirebaseErrorToast();
        }
        return; // Prevent saving if db is not available
      }
      setIsFirebaseConnected(true); // Assume connection if we attempt to save

      try {
          const docRef = doc(db, collectionName, docId);
          // Add or update metadata before saving
          const saveData = {
              ...data,
              metadata: {
                  ...data.metadata, // Preserve existing metadata like name/createdAt
                  updatedAt: new Date().toISOString(),
              },
          };
          await setDoc(docRef, saveData, { merge: true }); // Use merge to avoid overwriting createdAt
          if (!isAutoSave) {
             toast({ title: "Sucesso", description: `Dados salvos ${docId === DATA_DOC_ID ? 'automaticamente' : `como "${data.metadata?.name || docId}"`} no Firebase.` });
          }
           console.log(`Data ${isAutoSave ? 'auto-' : ''}saved to Firestore with ID: ${docId}`);
      } catch (error) {
          console.error("Error saving data to Firestore:", error);
          setIsFirebaseConnected(false); // Update connection status on save error
          if (!isAutoSave) {
              toast({ title: "Erro", description: "Falha ao salvar dados no Firebase.", variant: "destructive" });
          }
      }
  }, [toast, showFirebaseErrorToast]);

  // Auto-save whenever employees or schedule changes
   useEffect(() => {
       if (!db) {
          // Optional: Show a persistent warning if firebase is down?
          return;
       }
       setIsFirebaseConnected(true);
      if (!isLoading && isClient) { // Only auto-save after initial load and on client
         const autoSaveData = prepareDataForFirestore();
         // Add createdAt only if it's the first save (or doesn't exist)
         const docRef = doc(db, SAVED_SCHEDULES_COLLECTION, DATA_DOC_ID);
         getDoc(docRef).then(docSnap => {
             if (!docSnap.exists() || !docSnap.data()?.metadata?.createdAt) {
                 autoSaveData.metadata = {
                     ...autoSaveData.metadata,
                     name: "Autosave", // Give autosave a default name
                     createdAt: new Date().toISOString()
                 }
             }
             saveDataToFirestore(DATA_DOC_ID, SAVED_SCHEDULES_COLLECTION, autoSaveData, true); // Pass true for isAutoSave
         }).catch(error => {
              console.error("Error checking for existing autosave doc:", error);
              // Still attempt to save, it might create the doc if it doesn't exist
              saveDataToFirestore(DATA_DOC_ID, SAVED_SCHEDULES_COLLECTION, autoSaveData, true);
         });
      }
  }, [employees, schedule, filters, holidays, isLoading, isClient, prepareDataForFirestore, saveDataToFirestore]); // Added filters and holidays


  // Load data on initial mount
  useEffect(() => {
    loadDataFromFirestore();
     // Load list of saved schedules when component mounts
    fetchSavedSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount

   // --- Save/Load Dialog Logic ---

   const fetchSavedSchedules = useCallback(async () => {
        if (!db) return; // Don't fetch if db is not available
        try {
            const collRef = collection(db, SAVED_SCHEDULES_COLLECTION);
            const querySnapshot = await getDocs(collRef);
            const loadedList = querySnapshot.docs
                .map(doc => {
                    const data = doc.data() as FirestoreData;
                    // Prioritize metadata name, fallback to doc ID
                    const name = data.metadata?.name || doc.id;
                    // Use updatedAt for timestamp, fallback to createdAt or a default
                    const timestamp = data.metadata?.updatedAt || data.metadata?.createdAt || new Date(0).toISOString();
                    return { id: doc.id, name, timestamp };
                })
                 // Filter out the autosave document if it exists and has the default name
                .filter(item => !(item.id === DATA_DOC_ID && item.name === "Autosave"))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort by timestamp descending
            setSavedSchedules(loadedList);
        } catch (error) {
            console.error("Error fetching saved schedules:", error);
             setIsFirebaseConnected(false);
            toast({ title: "Erro", description: "Falha ao carregar lista de escalas salvas.", variant: "destructive" });
        }
    }, [toast]);

    const handleSaveSchedule = useCallback(async () => {
         if (!db) {
            showFirebaseErrorToast();
            return;
         }
        if (!saveName.trim()) {
            toast({ title: "Erro", description: "Por favor, insira um nome para a escala.", variant: "destructive" });
            return;
        }
        const docId = saveName.trim().toLowerCase().replace(/\s+/g, '-'); // Use name as ID (or generate a unique one)
        const dataToSave = prepareDataForFirestore();
        // Add name and createdAt to metadata
        dataToSave.metadata = {
            ...dataToSave.metadata,
            name: saveName.trim(),
            createdAt: new Date().toISOString(), // Set creation time on explicit save
        };
        await saveDataToFirestore(docId, SAVED_SCHEDULES_COLLECTION, dataToSave);
        setSaveName(""); // Clear input
        setIsSaveLoadDialogOpen(false);
        fetchSavedSchedules(); // Refresh the list
    }, [saveName, prepareDataForFirestore, saveDataToFirestore, toast, fetchSavedSchedules, showFirebaseErrorToast]);

     const handleLoadSchedule = useCallback(async (docId: string) => {
        if (!db) {
            showFirebaseErrorToast();
            return;
        }
        await loadDataFromFirestore(docId, SAVED_SCHEDULES_COLLECTION);
        setIsSaveLoadDialogOpen(false);
    }, [loadDataFromFirestore, showFirebaseErrorToast]);

    const handleDeleteSavedSchedule = useCallback(async (docId: string) => {
         if (!db) {
            showFirebaseErrorToast();
            return;
        }
        if (!window.confirm("Tem certeza que deseja excluir esta escala salva?")) {
            return;
        }
        try {
            const docRef = doc(db, SAVED_SCHEDULES_COLLECTION, docId);
            await deleteDoc(docRef);
            toast({ title: "Sucesso", description: "Escala salva excluída." });
            fetchSavedSchedules(); // Refresh list
        } catch (error) {
            console.error("Error deleting saved schedule:", error);
            setIsFirebaseConnected(false);
            toast({ title: "Erro", description: "Falha ao excluir escala salva.", variant: "destructive" });
        }
    }, [toast, fetchSavedSchedules, showFirebaseErrorToast]);


  // --- Filter and Date Logic ---

  const handleFilterChange = useCallback((newFilters: AppPartialFilterState) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
     // When filters change, save the current state (auto-save)
     // This is handled by the auto-save useEffect now
  }, []);


  // --- Holiday Logic ---
   const toggleHoliday = useCallback((date: Date) => {
     const dateStart = startOfDay(date);
     setHolidays(currentHolidays => {
       const existingIndex = currentHolidays.findIndex(h => isEqual(startOfDay(h), dateStart));
       const newHolidays = existingIndex > -1
         ? currentHolidays.filter((_, index) => index !== existingIndex) // Remove holiday
         : [...currentHolidays, dateStart]; // Add holiday

       // Update schedule for the toggled date
        const isNowHoliday = existingIndex === -1; // True if we just added it
        setSchedule(prevSchedule => {
            const updatedSchedule = { ...prevSchedule };
            employees.forEach(emp => {
                const key = getScheduleKey(emp.id, date);
                const currentEntry = updatedSchedule[key];
                 // Ensure entry exists before proceeding
                if (currentEntry) {
                    if (isNowHoliday && currentEntry.shift === 'FOLGA') {
                        updatedSchedule[key] = { ...currentEntry, shift: 'FF', holidayReason: currentEntry.holidayReason || 'Feriado' };
                    } else if (!isNowHoliday && currentEntry.shift === 'FF') {
                        // Revert FF to F or T based on defaults/fixed day off
                        const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
                        daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
                        const dayOfWeek = date.getDay();
                         const isFixedDayOff = emp.fixedDayOff && dayOfWeek === fixedDayMapping[emp.fixedDayOff];

                         if(isFixedDayOff){
                            updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                         } else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                             const timeOptions = getTimeOptionsForDate(date, false); // Get times for non-holiday
                             let defaultHour = '';
                              const basicDefault = shiftTypeToHoursMap[emp.defaultShiftType] || ''; // Get the basic default hour string
                             if (timeOptions.includes(basicDefault)) { // Check if it's valid for the day
                                 defaultHour = basicDefault;
                             }
                             if (!defaultHour && timeOptions.length > 0) {
                                 defaultHour = timeOptions[0];
                             }
                              updatedSchedule[key] = { shift: 'TRABALHA', role: emp.defaultRole, baseHours: defaultHour, holidayReason: undefined };
                         } else {
                           updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                         }
                    }
                    // Other cases remain unchanged (e.g., T remains T when marked holiday)
                } else {
                    // If there's no entry, create one based on holiday status
                     if (isNowHoliday) {
                         updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                     } else {
                         // If unmarking and no entry existed, assume default was F
                         updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                     }
                }
            });
            return updatedSchedule;
        });


       return newHolidays.sort((a, b) => a.getTime() - b.getTime());
     });
     toast({
       title: "Feriado Atualizado",
       description: `Dia ${formatDate(date, 'dd/MM')} ${!isHoliday(date) ? 'removido como' : 'marcado como'} feriado.` // Logic inverted because state updates after toast
     });
   }, [holidays, toast, isHoliday, employees, shiftTypeToHoursMap]); // Added shiftTypeToHoursMap


  // Memoized date range for the current month
   const datesForCurrentMonth = useMemo(() => {
      return getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth));
  }, [currentMonth]);


  // Memoized filtered employees based on filters
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
       // Apply employee filter first
        if (filters.employee && emp.id !== parseInt(filters.employee)) {
            return false;
        }
        // Apply role filter if selected
        if (filters.role) {
            // Check if the employee worked with the selected role ANY DAY in the current month view
            return datesForCurrentMonth.some(date => {
                const key = getScheduleKey(emp.id, date);
                const entry = schedule[key];
                return entry?.shift === 'TRABALHA' && entry.role === filters.role;
            });
        }
        // If no role filter, include the employee (if they passed the employee filter)
        return true;

    });
  }, [employees, filters.employee, filters.role, datesForCurrentMonth, schedule]);


  // --- Employee CRUD Logic ---

  const handleAddEmployeeClick = useCallback(() => {
    setEditingEmployee(null); // No employee selected means add mode
    setIsAddEditModalOpen(true);
  }, []);

  const handleEditEmployee = useCallback((employee: Employee) => {
    setEditingEmployee(employee);
    setIsAddEditModalOpen(true);
  }, []);

  const handleDeleteEmployee = useCallback((empId: number) => {
    setEmployeeToDelete(empId);
  }, []);

  const confirmDeleteEmployee = useCallback(async () => {
      if (!db) {
        showFirebaseErrorToast();
        setEmployeeToDelete(null);
        return;
      }
      if (employeeToDelete !== null) {
        const employeeName = employees.find(e => e.id === employeeToDelete)?.name || "Colaborador";
        try {
            // Delete employee from state first for responsiveness
            const currentEmployees = employees;
            const currentSchedule = schedule;
            setEmployees(prev => prev.filter(emp => emp.id !== employeeToDelete));
            setSchedule(prev => {
                const nextSchedule = { ...prev };
                Object.keys(nextSchedule).forEach(key => {
                    if (key.startsWith(`${employeeToDelete}-`)) {
                        delete nextSchedule[key];
                    }
                });
                return nextSchedule;
            });
            setEmployeeToDelete(null); // Close confirmation dialog

            // Then, attempt to delete from Firestore
            const docRef = doc(db, SAVED_SCHEDULES_COLLECTION, DATA_DOC_ID);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data() as FirestoreData;
                const updatedEmployees = data.employees.filter(emp => emp.id !== employeeToDelete);
                const updatedSchedule = { ...data.schedule };
                Object.keys(updatedSchedule).forEach(key => {
                    if (key.startsWith(`${employeeToDelete}-`)) {
                        delete updatedSchedule[key];
                    }
                });
                 await saveDataToFirestore(DATA_DOC_ID, SAVED_SCHEDULES_COLLECTION, {
                    ...data, // Keep other data like filters, holidays
                    employees: updatedEmployees,
                    schedule: updatedSchedule,
                }, false); // Explicit save, show toast
                toast({ title: "Sucesso", description: `${employeeName} removido.` });
            }

             // Optionally delete from saved schedules too (more complex logic needed)
             // Consider if deleting an employee should cascade to saved schedules

        } catch (error) {
            console.error("Error deleting employee from Firestore:", error);
             setIsFirebaseConnected(false);
            toast({ title: "Erro", description: `Falha ao remover ${employeeName}. Por favor, tente novamente.`, variant: "destructive" });
            // Revert state if Firestore deletion fails
            // setEmployees(currentEmployees);
            // setSchedule(currentSchedule);
             // Re-open dialog if needed or handle error state
        }
    }
  }, [employeeToDelete, employees, schedule, toast, saveDataToFirestore, showFirebaseErrorToast]); // Add saveDataToFirestore and showFirebaseErrorToast


  const handleSaveEmployee = useCallback(async (employeeData: Employee) => {
      if (!db) {
        showFirebaseErrorToast();
        setIsAddEditModalOpen(false);
        setEditingEmployee(null);
        return;
      }

    let updatedScheduleRequired = false;
    let oldEmployeeData: Employee | undefined; // Store old data for comparison
    const updatedSchedule = { ...schedule }; // Copy schedule for potential updates
    const isNew = !employeeData.id || employeeData.id === 0; // Check if it's a new employee
    let finalEmployeeData: Employee; // To store the final employee data with ID

    // --- Update Employees State ---
    if (isNew) {
        const newId = employees.length > 0 ? Math.max(...employees.map(e => e.id)) + 1 : 1;
        finalEmployeeData = { ...employeeData, id: newId };
         setEmployees(prevEmployees => [...prevEmployees, finalEmployeeData]);
        updatedScheduleRequired = true;
    } else {
         finalEmployeeData = { ...employeeData, id: employeeData.id }; // Ensure ID is present
        const index = employees.findIndex(emp => emp.id === employeeData.id);
        if (index > -1) {
            oldEmployeeData = employees[index];
            if (oldEmployeeData.fixedDayOff !== employeeData.fixedDayOff ||
                oldEmployeeData.defaultRole !== employeeData.defaultRole ||
                oldEmployeeData.defaultShiftType !== employeeData.defaultShiftType) {
                updatedScheduleRequired = true;
            }
             setEmployees(prevEmployees => {
                 const newEmployees = [...prevEmployees];
                 newEmployees[index] = finalEmployeeData;
                 return newEmployees;
             });
        } else {
             console.error("Trying to update non-existent employee", employeeData);
             return; // Exit if employee not found
        }
    }

    // --- Update Schedule State IF required ---
    if (updatedScheduleRequired) {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const datesToUpdate = getDatesInRange(monthStart, monthEnd);
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
        daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);

        datesToUpdate.forEach(date => {
            const key = getScheduleKey(finalEmployeeData.id, date);
            const dayOfWeek = date.getDay();
            const isNewFixedDayOff = finalEmployeeData.fixedDayOff && dayOfWeek === fixedDayMapping[finalEmployeeData.fixedDayOff];
            const wasOldFixedDayOff = !isNew && oldEmployeeData?.fixedDayOff && dayOfWeek === fixedDayMapping[oldEmployeeData.fixedDayOff];
            const isDayHoliday = isHoliday(date);

            let entry: ScheduleEntry = updatedSchedule[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };

             // 1. If it's the NEW fixed day off, force FOLGA
             if (isNewFixedDayOff) {
                entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
             }
              // 2. If it WAS the old fixed day off but NOT the new one, or if it's a NEW employee and NOT their fixed day
             else if (isNew || (wasOldFixedDayOff && !isNewFixedDayOff)) {
                // Try to set default TRABALHA schedule first
                if (finalEmployeeData.defaultRole && finalEmployeeData.defaultShiftType && finalEmployeeData.defaultShiftType !== 'Nenhum') {
                     entry.shift = 'TRABALHA';
                     entry.role = finalEmployeeData.defaultRole;
                     const dayOptions = getTimeOptionsForDate(date, isDayHoliday);
                     let defaultHour = '';
                     const basicDefault = shiftTypeToHoursMap[finalEmployeeData.defaultShiftType] || '';
                     if (dayOptions.includes(basicDefault)) {
                         defaultHour = basicDefault;
                     }
                     if (!defaultHour && dayOptions.length > 0) {
                         defaultHour = dayOptions[0];
                     }
                     entry.baseHours = defaultHour;
                     entry.holidayReason = undefined;
                } else {
                     entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
                // 3. If it's a holiday AND the result is FOLGA, change to FF
                 if (isDayHoliday && entry.shift === 'FOLGA') {
                     entry.shift = 'FF';
                     entry.holidayReason = 'Feriado';
                     entry.role = '';
                     entry.baseHours = '';
                 }
             }
             // 4. If not fixed day off change/new emp, BUT it's a holiday, ensure F becomes FF
             else if (isDayHoliday && entry.shift === 'FOLGA') {
                 entry.shift = 'FF';
                 entry.holidayReason = entry.holidayReason || 'Feriado';
                 entry.role = '';
                 entry.baseHours = '';
             }
              // 5. If role/shift defaults changed, update T entries IF they have empty role/hours
             else if (!isNew && !isFixedDayOff && !isDayHoliday && entry.shift === 'TRABALHA' && finalEmployeeData.defaultRole && finalEmployeeData.defaultShiftType && finalEmployeeData.defaultShiftType !== 'Nenhum') {
                   if (!entry.role) entry.role = finalEmployeeData.defaultRole;
                   if (!entry.baseHours) {
                        const dayOptions = getTimeOptionsForDate(date, false);
                         let defaultHour = '';
                         const basicDefault = shiftTypeToHoursMap[finalEmployeeData.defaultShiftType] || '';
                         if (dayOptions.includes(basicDefault)) {
                             defaultHour = basicDefault;
                         }
                         if (!defaultHour && dayOptions.length > 0) {
                             defaultHour = dayOptions[0];
                         }
                         entry.baseHours = defaultHour;
                   }
              }
            // Otherwise, keep existing entry

            updatedSchedule[key] = entry;
        });
         setSchedule(updatedSchedule); // Update schedule state
    }

    // --- Firestore Update (after state updates) ---
     const finalEmployeesState = isNew ? [...employees, finalEmployeeData] : employees.map(emp => emp.id === finalEmployeeData.id ? finalEmployeeData : emp);
     const finalScheduleState = updatedScheduleRequired ? updatedSchedule : schedule;

     const dataToSave: FirestoreData = {
         employees: finalEmployeesState,
         schedule: finalScheduleState,
         filters: {
             ...filters,
             selectedDate: filters.selectedDate?.toISOString(),
         },
         holidays: holidays.map(h => h.toISOString()),
         // Preserve existing metadata if editing, otherwise set new for add
         metadata: isNew
             ? { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
             : { ...prepareDataForFirestore().metadata, updatedAt: new Date().toISOString() },
     };
     await saveDataToFirestore(DATA_DOC_ID, SAVED_SCHEDULES_COLLECTION, dataToSave, false); // Explicit save

    setIsAddEditModalOpen(false);
    setEditingEmployee(null); // Clear editing employee
    toast({ title: "Sucesso", description: `Colaborador ${isNew ? 'adicionado' : 'atualizado'}.` });
  }, [schedule, toast, currentMonth, isHoliday, employees, filters, holidays, saveDataToFirestore, showFirebaseErrorToast, prepareDataForFirestore]); // Added dependencies


  // --- Shift Change Logic ---
  const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
    const key = getScheduleKey(empId, date);
    setSchedule(prev => {
      const currentEntry = prev[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
      const updatedEntry = { ...currentEntry, shift: newShift };
      const employee = employees.find(e => e.id === empId);
      const dayIsHoliday = isHoliday(date); // Use isHoliday function

      // Reset details if moving away from T or FF
      if (newShift === 'FOLGA') {
        updatedEntry.role = '';
        updatedEntry.baseHours = '';
        updatedEntry.holidayReason = undefined;
      } else if (newShift === 'TRABALHA') {
        // If switching TO 'T', try to apply defaults if role/hours are empty
        updatedEntry.holidayReason = undefined; // Clear reason
        if ((!updatedEntry.role || !updatedEntry.baseHours) && employee) {
            if (!updatedEntry.role && employee.defaultRole) {
                updatedEntry.role = employee.defaultRole;
            }
            if (!updatedEntry.baseHours && employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum') {
                const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
                let determinedDefaultHours = '';
                const basicDefault = shiftTypeToHoursMap[employee.defaultShiftType] || '';
                if (defaultHoursOptions.includes(basicDefault)) {
                    determinedDefaultHours = basicDefault;
                } else if (defaultHoursOptions.length > 0) {
                    determinedDefaultHours = defaultHoursOptions[0];
                }
                updatedEntry.baseHours = determinedDefaultHours;
            }
             // Ensure baseHours is valid for the day if it was defaulted
             if (!getTimeOptionsForDate(date, dayIsHoliday).includes(updatedEntry.baseHours) && getTimeOptionsForDate(date, dayIsHoliday).length > 0) {
                updatedEntry.baseHours = getTimeOptionsForDate(date, dayIsHoliday)[0];
             }
        }
         // Ensure baseHours is valid for the day even if not defaulted (e.g., after holiday change)
        else if (updatedEntry.baseHours && !getTimeOptionsForDate(date, dayIsHoliday).includes(updatedEntry.baseHours) && getTimeOptionsForDate(date, dayIsHoliday).length > 0) {
            updatedEntry.baseHours = getTimeOptionsForDate(date, dayIsHoliday)[0];
        }

      } else if (newShift === 'FF') {
        // If switching TO 'FF', clear role/hours
        updatedEntry.role = '';
        updatedEntry.baseHours = '';
        // Keep or initialize holidayReason (can be empty initially)
        updatedEntry.holidayReason = updatedEntry.holidayReason ?? (dayIsHoliday ? 'Feriado' : ''); // Pre-fill if it's a marked holiday
      }

      return { ...prev, [key]: updatedEntry };
    });
  }, [employees, isHoliday, shiftTypeToHoursMap]); // Add dependencies

  const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
      const key = getScheduleKey(empId, date);
      setSchedule(prev => {
          const currentEntry = prev[key];
          // Only update if the shift type allows this detail
          if (
              (field === 'role' || field === 'baseHours') && currentEntry?.shift !== 'TRABALHA' ||
              (field === 'holidayReason') && currentEntry?.shift !== 'FF'
             ) {
              // console.warn(`Attempted to set ${field} for a non-${field === 'holidayReason' ? 'FF' : 'T'} shift.`);
              return prev; // Don't update details for inappropriate shift types
          }
          return { ...prev, [key]: { ...currentEntry, [field]: value } };
      });
  }, []);


  // --- PDF Generation ---
  const generatePDF = useCallback(() => {
    if (!isClient) return; // Ensure this runs only on the client

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const cellPadding = 2;
    const effectiveWidth = pageWidth - 2 * margin;
    const title = `ShiftMaster - Escala de Trabalho - ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}`;

    doc.setFontSize(14);
    doc.text(title, margin, margin + 5);

    // Prepare header and body data
    const header = [
      { content: 'Colaborador', styles: { halign: 'left', fontStyle: 'bold', cellWidth: 80, minCellWidth: 70 } }
    ];
    const body = [];
    const dates = getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth));
     // Reduced width for action column
    const actionColWidth = 30;
    const employeeColWidth = 80;
    const dateCellWidth = Math.max(15, (effectiveWidth - employeeColWidth - actionColWidth) / dates.length); // Adjust width

    // Add Actions header (empty for now, could add icons later if needed in PDF)
    header.push({ content: 'Ações', styles: { halign: 'center', cellWidth: actionColWidth, minCellWidth: actionColWidth } });


    dates.forEach(date => {
      const dayName = formatDate(date, 'EEE', { locale: ptBR }).toUpperCase();
      const dayNum = formatDate(date, 'dd', { locale: ptBR });
      header.push({
        content: `${dayName}\n${dayNum}`,
        styles: {
          halign: 'center',
          valign: 'middle',
          fontSize: 7,
          cellWidth: dateCellWidth,
          minCellWidth: 15,
          fontStyle: 'bold',
          fillColor: isHoliday(date) ? [200, 220, 255] : undefined, // Light blue for holiday header
        }
      });
    });

    filteredEmployees.forEach(emp => {
        // Add employee name first
        const rowData: any[] = [{ content: emp.name, styles: { halign: 'left', valign: 'middle', fontStyle: 'bold' } }];
        // Add empty cell for Actions column
        rowData.push({ content: '', styles: { cellWidth: actionColWidth } });


      dates.forEach(date => {
        const key = getScheduleKey(emp.id, date);
        const entry = schedule[key];
        let content = '';
        const styles: Record<string, any> = { halign: 'center', valign: 'middle', fontSize: 6 };
        if (entry) {
          content = shiftCodeToDescription[entry.shift] || 'Inválido';
          if (entry.shift === 'TRABALHA') {
            content += `\n${entry.role ? entry.role.substring(0, 4) + '.' : '-'}\n${entry.baseHours ? entry.baseHours.replace(/ /g, '') : '-'}`;
            styles.fillColor = [231, 76, 60]; // Red
            styles.textColor = 255;
          } else if (entry.shift === 'FOLGA') {
            styles.fillColor = [240, 240, 240]; // Gray
            styles.textColor = [100, 100, 100];
          } else if (entry.shift === 'FF') {
             content += entry.holidayReason ? `\n(${entry.holidayReason.substring(0,5)})` : '';
             styles.fillColor = [46, 204, 113]; // Green
             styles.textColor = 255;
          }
        } else {
          content = shiftCodeToDescription['FOLGA']; // Default to Folga if no entry
          styles.fillColor = [240, 240, 240]; // Gray
          styles.textColor = [100, 100, 100];
        }
         if (isHoliday(date) && entry?.shift !== 'FF') { // Highlight holiday cell if not FF
           styles.lineColor = [52, 152, 219];
           styles.lineWidth = 0.5;
           // Adjust padding slightly - simplified way
           styles.cellPadding = (styles.cellPadding || cellPadding) - 0.5;

         }

        rowData.push({ content, styles });
      });
      body.push(rowData);
    });

    doc.autoTable({
      head: [header],
      body: body,
      startY: margin + 20,
      margin: { left: margin, right: margin },
      styles: { fontSize: 6, cellPadding: cellPadding, lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7 },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: employeeColWidth, minCellWidth: 70 },
        1: { cellWidth: actionColWidth, minCellWidth: actionColWidth }, // Styles for the action column header/cells if needed
        // Date columns will use default or specific styles set in rowData
      },
       didDrawPage: (data) => {
        const legendY = pageHeight - margin - 15; // Position legend near the bottom
        doc.setFontSize(8);
        let currentX = margin;
        let currentY = legendY; // Renamed m to currentY

        // Add background color rectangles for the legend
        const rectHeight = 6;
        const rectWidth = 6;
        const textYOffset = 4; // Adjust text position relative to rectangle

        Object.entries(shiftCodeToDescription).forEach(([code, description]) => {
            let fillColor: number[] | undefined;
             if (code === 'TRABALHA') fillColor = [231, 76, 60];
             else if (code === 'FOLGA') fillColor = [240, 240, 240];
             else if (code === 'FF') fillColor = [46, 204, 113];

            if (fillColor) {
                doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
                doc.rect(currentX, currentY - rectHeight / 1.5, rectWidth, rectHeight, 'F');
            }
             doc.setTextColor(0);
             const textWidth = doc.getTextWidth(`${code}: ${description}`) + 25; // Adjust spacing
            if (currentX + textWidth > pageWidth - margin) { // Check if it fits
                currentX = margin;
                currentY += 10; // Move to next line
                 // Re-draw the rectangle for the new line
                 if (fillColor) {
                    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
                    doc.rect(currentX, currentY - rectHeight / 1.5, rectWidth, rectHeight, 'F');
                 }
            }
             doc.text(`${code}: ${description}`, currentX + rectWidth + 2, currentY);
             currentX += textWidth;


        });

         // Holiday indicator legend
         const holidayText = "= Feriado";
         const holidayTextWidth = doc.getTextWidth(holidayText) + 25;
          if (currentX + holidayTextWidth > pageWidth - margin) {
             currentX = margin;
             currentY += 10;
         }

         const holidayCellX = currentX;
         const holidayCellY = currentY - rectHeight / 1.5;
         doc.setFillColor(255, 255, 255); // White background
         doc.setDrawColor(52, 152, 219); // Blue border
         doc.setLineWidth(0.5);
         doc.rect(holidayCellX, holidayCellY, rectWidth, rectHeight, 'FD'); // Draw and fill with border
         doc.setTextColor(0);
         doc.text(holidayText, holidayCellX + rectWidth + 2, currentY);
         // currentX += holidayTextWidth; // No need to update currentX if it's the last item

         // Reset draw/fill colors if needed
         doc.setDrawColor(0);
         doc.setFillColor(0);
    },
    });

    doc.save(`escala_${formatDate(currentMonth, 'yyyy-MM', { locale: ptBR })}.pdf`);
    toast({ title: "Sucesso", description: "PDF da escala gerado." });

 }, [isClient, currentMonth, filteredEmployees, schedule, toast, isHoliday]); // Ensure isHoliday is a dependency


  const generateDailyWhatsAppText = useCallback(() => {
    if (!isClient || !filters.selectedDate) {
      toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive" });
      return;
    }
    const dayIsHoliday = isHoliday(filters.selectedDate); // Check if the selected day is a holiday
    const text = generateWhatsAppText(filters.selectedDate, employees, schedule, dayIsHoliday, roleToEmojiMap);
    navigator.clipboard.writeText(text)
      .then(() => {
        toast({ title: "Sucesso", description: `Texto da escala de ${formatDate(filters.selectedDate, 'dd/MM/yyyy', { locale: ptBR })} copiado.` });
      })
      .catch(err => {
        console.error("Failed to copy WhatsApp text: ", err);
        toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive" });
      });
  }, [isClient, filters.selectedDate, employees, schedule, toast, isHoliday, roleToEmojiMap]); // Add dependencies

 // Handler for resetting the current month's schedule
  const handleResetMonth = useCallback(() => {
     setIsResetConfirmOpen(true);
  }, []);

 const confirmResetMonth = useCallback(async () => {
      if (!db) {
          showFirebaseErrorToast();
          setIsResetConfirmOpen(false);
          return;
       }
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const datesToUpdate = getDatesInRange(monthStart, monthEnd);
    const updatedSchedule = { ...schedule };
    const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
    daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);

    employees.forEach(emp => {
        datesToUpdate.forEach(date => {
            const key = getScheduleKey(emp.id, date);
            const dayOfWeek = date.getDay();
            const isFixedDayOff = emp.fixedDayOff && dayOfWeek === fixedDayMapping[emp.fixedDayOff];
             const isDayHoliday = isHoliday(date); // Use the isHoliday function


            // Default to FOLGA, but check for fixed day off and holiday status
             let defaultShift: ShiftCode = 'FOLGA';
             let defaultReason: string | undefined = undefined;

             if (isDayHoliday) {
                 defaultShift = 'FF'; // Holidays default to Folga Feriado
                 defaultReason = 'Feriado'; // Optional: Set a default reason
             }
             // Fixed day off overrides holiday FF, sets to F
             if (isFixedDayOff) {
                defaultShift = 'FOLGA';
                defaultReason = undefined; // Clear reason if it's a fixed day off
             }

            updatedSchedule[key] = {
                shift: defaultShift,
                role: '',
                baseHours: '',
                holidayReason: defaultReason
            };
        });
    });

    setSchedule(updatedSchedule);
    // Also update Firestore
    const dataToSave = prepareDataForFirestore();
    dataToSave.schedule = updatedSchedule; // Ensure the updated schedule is included
    await saveDataToFirestore(DATA_DOC_ID, SAVED_SCHEDULES_COLLECTION, dataToSave, false); // Explicit save

    setIsResetConfirmOpen(false); // Close confirmation dialog
    toast({ title: "Sucesso", description: `Escala do mês de ${formatDate(currentMonth, "MMMM yyyy", { locale: ptBR })} zerada para 'Folga'.` });
  }, [currentMonth, schedule, employees, toast, isHoliday, saveDataToFirestore, showFirebaseErrorToast, prepareDataForFirestore]); // Add dependencies



    // --- Save/Load Dialog Trigger ---
    const handleOpenSaveLoadDialog = useCallback(() => {
       if (!db) {
           showFirebaseErrorToast();
           return;
       }
      fetchSavedSchedules(); // Refresh list before opening
      setIsSaveLoadDialogOpen(true);
  }, [fetchSavedSchedules, showFirebaseErrorToast]);


  // Memoized date range for the current month
  const datesForTable = useMemo(() => getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth)), [currentMonth]);


  if (isLoading && !isClient) {
       return (
            <div className="flex justify-center items-center h-screen">
                <p>Carregando...</p>
            </div>
        );
  }

  return (
    <div className="p-2 sm:p-4 flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-primary text-center sm:text-left">ShiftMaster</h1>
        <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap gap-1 justify-center sm:justify-end">
           {/* Firebase Status Indicator */}
             {!isFirebaseConnected && (
                <TooltipProvider delayDuration={100}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <WifiOff className="h-5 w-5 text-destructive" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Erro de conexão com o Firebase. As alterações podem não ser salvas.</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
          {/* Action Buttons */}
          <Button onClick={generatePDF} variant="outline" size="sm">
            <FileText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> PDF (Mês)
          </Button>
          <Button onClick={generateDailyWhatsAppText} variant="outline" size="sm">
            <MessageSquareText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> WhatsApp (Dia)
          </Button>
           <Button onClick={handleOpenSaveLoadDialog} variant="outline" size="sm">
                <Save className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Salvar/Carregar
            </Button>
          <Button onClick={handleAddEmployeeClick} size="sm">
            <UserPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Adicionar
          </Button>
          <Button variant="destructive" onClick={handleResetMonth} size="sm">
             <RotateCcw className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Zerar Mês
          </Button>
        </div>
      </div>

      {/* Filters */}
      <ShiftFilters
         filters={filters}
         employees={employees}
         roles={availableRoles} // Use imported availableRoles
         onFilterChange={handleFilterChange} // Updated filters
      />

      {/* Month Navigation */}
      <div className="flex justify-center items-center my-2 sm:my-4 space-x-2 sm:space-x-4">
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(startOfMonth(prev), -1))}>
          Mês Ant.
        </Button>
        <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">
          {formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(endOfMonth(prev), 1))}>
          Próx. Mês
        </Button>
      </div>

      {/* Table Container */}
      <div ref={tableRef} className="flex-grow overflow-auto border rounded-lg shadow-md bg-card">
        <ShiftTable
          employees={filteredEmployees} // Pass filtered employees
          schedule={schedule}
          dates={datesForTable}
          holidays={holidays} // Pass holidays
          onShiftChange={handleShiftChange}
          onDetailChange={handleDetailChange}
          onEditEmployee={handleEditEmployee}
          onDeleteEmployee={handleDeleteEmployee}
          onToggleHoliday={toggleHoliday} // Pass toggle holiday handler
        />
      </div>

       {/* Add/Edit Employee Dialog */}
       <EditEmployeeDialog
           isOpen={isAddEditModalOpen}
           onOpenChange={setIsAddEditModalOpen}
           employee={editingEmployee}
           onSave={handleSaveEmployee}
       />

        {/* Delete Confirmation Dialog */}
         <AlertDialog open={employeeToDelete !== null} onOpenChange={(open) => !open && setEmployeeToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                <AlertDialogDescription>
                    Tem certeza que deseja remover "{employees.find(e => e.id === employeeToDelete)?.name || 'colaborador'}"? Os dados de escala também serão removidos. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setEmployeeToDelete(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteEmployee} className={buttonVariants({ variant: "destructive" })}>Remover</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Reset Month Confirmation Dialog */}
        <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Zerar Escala</AlertDialogTitle>
                 <AlertDialogDescription>
                     Tem certeza que deseja zerar a escala para o mês de {formatDate(currentMonth, "MMMM yyyy", { locale: ptBR })}? Todos os dias para TODOS os colaboradores neste mês serão definidos como 'Folga' (F). Feriados marcados serão mantidos, mas o status do colaborador será 'F'. Esta ação não pode ser desfeita.
                 </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmResetMonth} className={buttonVariants({ variant: "destructive" })}>Zerar Escala do Mês</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

         {/* Save/Load Schedule Dialog */}
         <Dialog open={isSaveLoadDialogOpen} onOpenChange={setIsSaveLoadDialogOpen}>
                <DialogContent className="sm:max-w-[525px]">
                    <DialogHeader>
                        <DialogTitle>Salvar / Carregar Escala</DialogTitle>
                        <DialogDescription>
                           Salve a escala atual com um nome ou carregue uma escala salva anteriormente.
                           { !isFirebaseConnected && <span className="text-destructive font-semibold block mt-1"> (Firebase desconectado - Salvar/Carregar indisponível)</span>}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {/* Save Section */}
                        <div className="space-y-2 border-b pb-4">
                           <h4 className="font-medium text-sm">Salvar Escala Atual</h4>
                           <div className="flex items-center gap-2">
                            <Label htmlFor="save-name" className="sr-only">Nome da Escala</Label>
                            <Input
                                id="save-name"
                                placeholder="Nome para salvar (ex: Maio 2024)"
                                value={saveName}
                                onChange={(e) => setSaveName(e.target.value)}
                                className="flex-grow"
                                disabled={!isFirebaseConnected}
                            />
                            <Button onClick={handleSaveSchedule} size="sm" disabled={!isFirebaseConnected}>
                                <Save className="mr-1 h-4 w-4" /> Salvar
                            </Button>
                            </div>
                        </div>

                        {/* Load Section */}
                        <div className="space-y-2">
                            <h4 className="font-medium text-sm">Carregar Escala Salva</h4>
                            {!isFirebaseConnected ? (
                                <p className="text-sm text-destructive">Firebase desconectado.</p>
                            ): savedSchedules.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhuma escala salva encontrada.</p>
                            ) : (
                                <ul className="max-h-60 overflow-y-auto space-y-1 border rounded p-2">
                                    {savedSchedules.map((saved) => (
                                        <li key={saved.id} className="flex justify-between items-center p-1 rounded hover:bg-muted/50">
                                            <span className="text-sm truncate" title={saved.name}>
                                                {saved.name} <span className="text-xs text-muted-foreground">({formatDate(parseISO(saved.timestamp), 'dd/MM/yy HH:mm')})</span>
                                            </span>
                                            <div className="flex space-x-1">
                                                 <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleLoadSchedule(saved.id)} disabled={!isFirebaseConnected}>
                                                      <CloudDownload className="h-4 w-4 text-primary" />
                                                      <span className="sr-only">Carregar</span>
                                                 </Button>
                                                 <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive/90" onClick={() => handleDeleteSavedSchedule(saved.id)} disabled={!isFirebaseConnected}>
                                                      <Trash2 className="h-4 w-4" />
                                                      <span className="sr-only">Excluir</span>
                                                 </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                     <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Fechar
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


    </div>
  );
}
