'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ShiftFilters } from './ShiftFilters';
import { ShiftTable } from './ShiftTable';
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry, FilterState } from './types';
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange, shiftTypeToHoursMap, availableRoles, daysOfWeek, roleToEmojiMap, getTimeOptionsForDate } from './types'; // Correctly import from types
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format as formatDate, startOfMonth, endOfMonth, isEqual, startOfDay, parse } from 'date-fns'; // Renamed format to formatDate
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { UserPlus, FileText, MessageSquareText, RotateCcw, CloudUpload, CloudDownload, Save } from 'lucide-react';
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
import 'jspdf-autotable'; // Import autoTable plugin
import { cn } from '@/lib/utils';
import { db, app } from '@/lib/firebase'; // Import Firestore instance
import { doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

// Helper to check if a date is a holiday
const isHolidayFn = (holidays:Date[], date: Date): boolean => {
    if (!date || isNaN(date.getTime())) return false;
    const startOfDate = startOfDay(date);
    return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDate));
};

export function ShiftMasterApp() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [filters, setFilters] = useState<AppFilterState>({
    employee: '',
    role: '',
    selectedDate: new Date(),
  });
  const [holidays, setHolidays] = useState<Date[]>([]);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Loading state
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaveAsDialogOpen, setIsSaveAsDialogOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [availableSaves, setAvailableSaves] = useState<{ id: string; name: string; timestamp: string }[]>([]);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const hasLoadedInitialData = useRef(false); // Prevent re-initializing after load/save


  // --- Saved Schedules Management ---
  const fetchAvailableSaves = useCallback(async () => {
       if (!isClient) return;
       try {
           const querySnapshot = await getDocs(collection(db, SAVED_SCHEDULES_COLLECTION));
           const saves = querySnapshot.docs
               .map(doc => {
                   const data = doc.data() as FirestoreData;
                   const timestamp = data.metadata?.updatedAt || data.metadata?.createdAt || new Date(0).toISOString(); // Fallback timestamp
                   return {
                       id: doc.id,
                       name: data.metadata?.name || 'Sem Nome',
                       timestamp: formatDate(parseISO(timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })
                   };
               })
               .sort((a, b) => parse(b.timestamp, "dd/MM/yyyy HH:mm", new Date()).getTime() - parse(a.timestamp, "dd/MM/yyyy HH:mm", new Date()).getTime()); // Sort by timestamp descending
           setAvailableSaves(saves);
       } catch (error) {
           console.error("Error fetching saved schedules:", error);
           toast({ title: "Erro", description: "Falha ao buscar escalas salvas.", variant: "destructive" });
       }
   }, [isClient, toast]);

  // --- Firestore Data Handling ---
  const saveToFirestore = useCallback(async (docId: string = DATA_DOC_ID, name?: string) => {
    if (!isClient) return;
    setIsSaving(true);
    try {
      const filtersToStore = {
        ...filters,
        selectedDate: filters.selectedDate?.toISOString(),
      };
      const holidaysToStore = holidays.map(d => d.toISOString());
      const dataToStore: FirestoreData = {
        employees,
        schedule,
        filters: filtersToStore,
        holidays: holidaysToStore,
        metadata: {
            ...(name && { name }), // Include name if provided
            createdAt: name ? new Date().toISOString() : lastSaveTime?.toISOString() || new Date().toISOString(), // Keep original create time unless it's a new named save
            updatedAt: new Date().toISOString(),
        }
      };

      const docRef = doc(db, docId === DATA_DOC_ID ? "scheduleState" : SAVED_SCHEDULES_COLLECTION, docId);
      await setDoc(docRef, dataToStore, { merge: docId !== DATA_DOC_ID }); // Use merge for named saves to update timestamp etc.

      if (docId === DATA_DOC_ID) {
          setLastSaveTime(new Date());
          toast({ title: "Sucesso", description: "Alterações salvas na nuvem." });
      } else {
         toast({ title: "Sucesso", description: `Escala salva como "${name}".` });
         await fetchAvailableSaves(); // Refresh save list
      }

    } catch (error) {
      console.error("Failed to save data to Firestore:", error);
      toast({ title: "Erro", description: "Falha ao salvar dados na nuvem.", variant: "destructive" });
    } finally {
        setIsSaving(false);
        if (docId !== DATA_DOC_ID) {
            setIsSaveAsDialogOpen(false); // Close dialog after save
            setSaveAsName(""); // Clear name input
        }
    }
  }, [isClient, employees, schedule, filters, holidays, toast, lastSaveTime, fetchAvailableSaves]); // Added fetchAvailableSaves


  const loadFromFirestore = useCallback(async (docId: string = DATA_DOC_ID) => {
    if (!isClient) return;
    setIsLoading(true); // Start loading state
    hasLoadedInitialData.current = true; // Mark as loaded to prevent re-init
    try {
        const docRef = doc(db, docId === DATA_DOC_ID ? "scheduleState" : SAVED_SCHEDULES_COLLECTION, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data() as FirestoreData;

            if (data.employees && data.schedule) {
                setEmployees(data.employees);
                const loadedFilters = data.filters || {};
                const selectedDate = loadedFilters.selectedDate ? parseISO(loadedFilters.selectedDate) : new Date();
                setFilters({
                    employee: loadedFilters.employee || '',
                    role: loadedFilters.role || '',
                    selectedDate: selectedDate,
                });
                 setHolidays((data.holidays || []).map(d => parseISO(d)).filter(d => !isNaN(d.getTime())));
                 setCurrentMonth(startOfMonth(selectedDate));

                 // Ensure schedule entries have the new holidayReason field (default to undefined)
                 const validatedSchedule: ScheduleData = {};
                  for (const key in data.schedule) {
                     if (Object.prototype.hasOwnProperty.call(data.schedule, key)) {
                         const entry = data.schedule[key] as ScheduleEntry;
                         if (entry && typeof entry.shift === 'string') { // Basic validation
                            validatedSchedule[key] = {
                                shift: entry.shift,
                                role: entry.role ?? '', // Ensure exists
                                baseHours: entry.baseHours ?? '', // Ensure exists
                                holidayReason: entry.holidayReason // Will be undefined if loaded from older version
                            };
                         }
                     }
                 }
                 setSchedule(validatedSchedule);

                setLastSaveTime(data.metadata?.updatedAt ? parseISO(data.metadata.updatedAt) : null);
                toast({ title: "Sucesso", description: `Dados ${docId === DATA_DOC_ID ? 'da nuvem' : `da escala "${data.metadata?.name || docId}"`} carregados.` });
            } else {
                 console.warn("Firestore data is missing employees or schedule. Initializing default data.");
                 // initializeDefaultData(); // Initialize if data structure is wrong - Handled below
                 toast({ title: "Aviso", description: "Dados na nuvem incompletos. Iniciando com dados padrão.", variant: "default" });
                 throw new Error("Incomplete data structure"); // Throw to trigger fallback
            }
        } else {
            console.log("No schedule data found in Firestore. Initializing default data.");
            // initializeDefaultData(); // Initialize if no document exists - Handled below
            toast({ title: "Informação", description: "Nenhum dado salvo encontrado. Iniciando com dados padrão.", variant: "default" });
             throw new Error("No document found"); // Throw to trigger fallback
        }
    } catch (error) {
        console.error("Failed to load data from Firestore:", error);
        toast({ title: "Erro", description: "Falha ao carregar dados da nuvem. Verifique a conexão ou os dados padrão serão carregados.", variant: "destructive" });
        initializeDefaultData(); // Fallback to default on error
    } finally {
        setIsLoading(false); // End loading state
        setIsLoadDialogOpen(false); // Close dialog after load attempt
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, toast]); // Removed initializeDefaultData and saveToFirestore from dependencies

  // --- Data Initialization ---
  const initializeDefaultData = useCallback(() => {
    const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData();
    setEmployees(initialEmployees);
    setSchedule(initialSchedule);
    setFilters(initialFilters);
    setHolidays(initialHolidays);
    setCurrentMonth(startOfMonth(initialFilters.selectedDate));
    setLastSaveTime(null); // Reset last save time on init
    setIsLoading(false); // Ensure loading is false after init
    hasLoadedInitialData.current = true; // Mark as initialized
    // Optionally save the default data immediately to Firestore if no data exists
    // saveToFirestore(); // Uncomment this if you want to auto-save the default state
  }, []);


  useEffect(() => {
    setIsClient(true);
    // Load initial data from Firestore only if it hasn't been loaded yet
    if (isClient && !hasLoadedInitialData.current) {
        loadFromFirestore().catch(() => {
            // If loading fails, initializeDefaultData will be called within loadFromFirestore's catch block
            console.log("Initializing default data after failed load attempt.");
        });
    }
  }, [isClient, loadFromFirestore, initializeDefaultData]);


   // --- Saved Schedules Management ---

    const handleOpenLoadDialog = useCallback(() => {
        fetchAvailableSaves(); // Fetch latest saves when opening the dialog
        setIsLoadDialogOpen(true);
    }, [fetchAvailableSaves]);

    const handleDeleteSavedSchedule = useCallback(async (saveId: string, saveName: string) => {
         if (!isClient) return;
         if (!confirm(`Tem certeza que deseja excluir a escala salva "${saveName}"? Esta ação não pode ser desfeita.`)) {
             return;
         }
         try {
             await deleteDoc(doc(db, SAVED_SCHEDULES_COLLECTION, saveId));
             toast({ title: "Sucesso", description: `Escala "${saveName}" excluída.` });
             await fetchAvailableSaves(); // Refresh the list
         } catch (error) {
             console.error("Error deleting saved schedule:", error);
             toast({ title: "Erro", description: "Falha ao excluir escala salva.", variant: "destructive" });
         }
     }, [isClient, toast, fetchAvailableSaves]);

    // --- Holiday Management ---
   const handleToggleHoliday = useCallback((date: Date) => {
       const dateStart = startOfDay(date);
       const wasHoliday = isHolidayFn(holidays,date); // Check status *before* changing
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
       const newIsHolidayStatus = !wasHoliday;
       setSchedule(prevSched => {
            const newSchedule = {...prevSched};
            employees.forEach(emp => {
                const key = getScheduleKey(emp.id, date);
                const entry = newSchedule[key];
                if(entry && entry.shift === 'TRABALHA') {
                    const availableTimes = getTimeOptionsForDate(date, newIsHolidayStatus);
                    if (!availableTimes.includes(entry.baseHours)) {
                        // If current hours are no longer valid, try to set a default or fallback
                        const defaultShiftType = emp.defaultShiftType;
                        let newDefaultHour = ''; // Fallback is empty
                         if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                           const basicDefault = shiftTypeToHoursMap[defaultShiftType || 'Nenhum'];
                           if (availableTimes.includes(basicDefault)) {
                             newDefaultHour = basicDefault;
                           }
                         }
                         // If default wasn't applicable or set, try the first available option
                         if (!newDefaultHour && availableTimes.length > 0) {
                             newDefaultHour = availableTimes[0];
                         }
                        newSchedule[key] = { ...entry, baseHours: newDefaultHour };
                    }
                } else if (entry && entry.shift === 'FF') {
                    // If it was FF and now NOT a holiday, maybe switch to default T or F?
                    // For now, let's just clear the reason if it's no longer a holiday
                    if (!newIsHolidayStatus) {
                        newSchedule[key] = { ...entry, holidayReason: undefined };
                        // Optionally, change shift back to F or default T here
                        // newSchedule[key].shift = 'F'; // Or logic based on defaults
                    }
                } else if (entry && entry.shift === 'FOLGA' && newIsHolidayStatus) {
                    // If it was F and now IS a holiday, maybe switch to FF?
                     newSchedule[key] = { ...entry, shift: 'FF', holidayReason: 'Feriado' };
                }
            });
            return newSchedule;
        });
       saveToFirestore(); // Auto-save after holiday toggle
       toast({ title: "Feriado Atualizado", description: `Dia ${formatDate(date, 'dd/MM')} ${wasHoliday ? 'não é mais' : 'agora é'} feriado.` });
  // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [employees, holidays, saveToFirestore, toast]);

  const checkFixedDayOff = useCallback((employee: Employee, date: Date): boolean => {
    if (!employee.fixedDayOff) return false;
    const dayOfWeek = date.getDay();
    const fixedDayMapping: { [key in DayOfWeek]?: number } = {
        "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6
    };
    return dayOfWeek === fixedDayMapping[employee.fixedDayOff];
  }, []);


  const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
      const employee = employees.find(e => e.id === empId);
      if (!employee) return; // Should not happen

      const isFixedDayOff = checkFixedDayOff(employee, date);
      const dayIsHoliday = isHolidayFn(holidays, date);

       // Prevent changing TO 'T' if it's a fixed day off (unless it's also a holiday allowing work)
       if (newShift === 'TRABALHA' && isFixedDayOff && !(dayIsHoliday && getTimeOptionsForDate(date, true).length > 0)) {
           toast({
               title: "Regra Violada",
               description: `${employee.name} tem folga fixa neste dia (${employee.fixedDayOff}). Não é possível marcar como Trabalho.`,
               variant: "destructive"
           });
           return; // Don't update the schedule
       }

      setSchedule(prev => {
          const newSchedule: ScheduleData = { ...prev };
          const key = getScheduleKey(empId, date);

          // Get current entry or default to FOLGA if non-existent
          const currentEntry = prev[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };

          // Initialize updated entry with the new shift code
          let updatedEntry: ScheduleEntry = {
              ...currentEntry, // Keep existing details initially
              shift: newShift
          };

          // Logic based on the NEW shift code
          if (newShift === 'TRABALHA') {
              // Restore or set default role/hours if switching to TRABALHA
              updatedEntry.role = currentEntry.role || employee.defaultRole || ''; // Restore or default role
              updatedEntry.holidayReason = undefined; // Clear holiday reason

              const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
              let determinedDefaultHours = currentEntry.baseHours || ''; // Restore or start empty

              // If current hours are invalid for the day type, find a new default
              if (!defaultHoursOptions.includes(determinedDefaultHours)) {
                   determinedDefaultHours = ''; // Reset if invalid
                   const defaultShiftType = employee.defaultShiftType;
                   if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                       const basicDefault = shiftTypeToHoursMap[defaultShiftType || 'Nenhum'];
                       if (defaultHoursOptions.includes(basicDefault)) {
                           determinedDefaultHours = basicDefault;
                       }
                   }
                   // If still no hours, take the first available option
                   if (!determinedDefaultHours && defaultHoursOptions.length > 0) {
                       determinedDefaultHours = defaultHoursOptions[0];
                   }
              }
               updatedEntry.baseHours = determinedDefaultHours;

          } else if (newShift === 'FOLGA') {
              // Clear role, hours, and reason when switching to FOLGA
              updatedEntry.role = '';
              updatedEntry.baseHours = '';
              updatedEntry.holidayReason = undefined;
          } else if (newShift === 'FF') {
               // Clear role and hours, keep/allow setting reason
               updatedEntry.role = '';
               updatedEntry.baseHours = '';
               // Keep existing reason if switching from another FF, otherwise undefined or allow setting
               updatedEntry.holidayReason = currentEntry.shift === 'FF' ? currentEntry.holidayReason : ''; // Or keep currentEntry.holidayReason
          }

          newSchedule[key] = updatedEntry;
          return newSchedule;
      });
      saveToFirestore(); // Autosave after making a change
  }, [employees, checkFixedDayOff, holidays, saveToFirestore, toast]);

  // --- Detail Change Handler ---
  const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
    setSchedule(prev => {
      const key = getScheduleKey(empId, date);
      const currentEntry = prev[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined }; // Default

        // Prevent setting details if shift is not appropriate
        if (field !== 'holidayReason' && currentEntry.shift !== 'TRABALHA') {
            toast({ title: "Ação Inválida", description: `Não é possível definir ${field === 'role' ? 'Função' : 'Horário'} para dias de Folga.`, variant: "default" });
            return prev;
        }
         if (field === 'holidayReason' && currentEntry.shift !== 'FF') {
            toast({ title: "Ação Inválida", description: "Só é possível definir Motivo para dias de Folga Feriado (FF).", variant: "default" });
            return prev;
        }

      return {
        ...prev,
        [key]: { ...currentEntry, [field]: value },
      };
    });
    saveToFirestore(); // Auto-save after making a change
  }, [saveToFirestore, toast]);

  // --- Employee Management Handlers ---
  const handleAddEmployeeClick = useCallback(() => {
    setEditingEmployee(null); // Set to null for 'add' mode
    setIsEditDialogOpen(true);
  }, []);

  const handleEditEmployeeClick = useCallback((employee: Employee) => {
    setEditingEmployee(employee);
    setIsEditDialogOpen(true);
  }, []);

  const handleDeleteEmployeeClick = useCallback((empId: number) => {
    setDeletingEmployeeId(empId); // Set ID to trigger confirmation dialog
  }, []);

  const confirmDeleteEmployee = useCallback(() => {
    if (deletingEmployeeId !== null) {
      setEmployees(prev => prev.filter(emp => emp.id !== deletingEmployeeId));
      setSchedule(prev => {
        const newSchedule = { ...prev };
        Object.keys(newSchedule)
          .filter(key => key.startsWith(`${deletingEmployeeId}-`))
          .forEach(key => delete newSchedule[key]);
        return newSchedule;
      });
      saveToFirestore(); // Auto-save after delete
      toast({ title: "Sucesso", description: "Colaborador removido." });
      setDeletingEmployeeId(null); // Close dialog
    }
  }, [deletingEmployeeId, toast, saveToFirestore]);

  const handleSaveEmployee = useCallback((employeeData: Employee) => {
    const isNew = employeeData.id === 0; // Check if it's a new employee
    let employeeToSave: Employee;
    let oldEmployee: Employee | undefined = undefined; // Store the old employee data if editing

    setEmployees(prev => {
      if (isNew) {
        const newId = prev.length > 0 ? Math.max(...prev.map(e => e.id)) + 1 : 1;
        employeeToSave = { ...employeeData, id: newId };
        return [...prev, employeeToSave];
      } else {
        oldEmployee = prev.find(emp => emp.id === employeeData.id); // Find old employee data before update
        employeeToSave = { ...employeeData }; // Use the provided data including ID
        return prev.map(emp => (emp.id === employeeData.id ? employeeToSave : emp));
      }
    });

    // Update schedule based on fixed day off change or new employee defaults
    setSchedule(prevSched => {
        const newSchedule = { ...prevSched };
        const dates = getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth));
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
        daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
        const dayIsHoliday = (date: Date) => isHolidayFn(holidays, date); // Use the state `holidays`

        dates.forEach(date => {
            const key = getScheduleKey(employeeToSave.id, date);
            const currentEntry = prevSched[key];
            const dayOfWeek = date.getDay();
            const isFixedDayOff = employeeToSave.fixedDayOff && dayOfWeek === fixedDayMapping[employeeToSave.fixedDayOff];
            const isHoliday = dayIsHoliday(date);

            if (isNew) {
                 // Apply defaults for the new employee
                 let shift: ShiftCode = 'FOLGA';
                 let role = '';
                 let baseHours = '';
                  if (isFixedDayOff) {
                     shift = 'FOLGA';
                 } else if (employeeToSave.defaultRole && employeeToSave.defaultShiftType && employeeToSave.defaultShiftType !== 'Nenhum') {
                     shift = 'TRABALHA';
                     role = employeeToSave.defaultRole;
                     const dayOptions = getTimeOptionsForDate(date, isHoliday);
                     const defaultBase = shiftTypeToHoursMap[employeeToSave.defaultShiftType];
                     baseHours = dayOptions.includes(defaultBase) ? defaultBase : (dayOptions[0] || '');
                 }
                 // Override to FF if it's a holiday and the calculated shift is FOLGA
                 if (isHoliday && shift === 'FOLGA') {
                      shift = 'FF';
                 }
                 newSchedule[key] = { shift, role, baseHours, holidayReason: shift === 'FF' ? 'Feriado' : undefined };

            } else if (currentEntry && oldEmployee) { // Existing employee, update based on fixed day off change OR default changes
                const oldFixedDayNum = oldEmployee?.fixedDayOff ? fixedDayMapping[oldEmployee.fixedDayOff] : undefined;
                const newFixedDayNum = employeeToSave.fixedDayOff ? fixedDayMapping[employeeToSave.fixedDayOff] : undefined;
                const defaultsChanged = oldEmployee.defaultRole !== employeeToSave.defaultRole || oldEmployee.defaultShiftType !== employeeToSave.defaultShiftType;

                // Update if it's the NEW fixed day off
                if (dayOfWeek === newFixedDayNum) {
                    newSchedule[key] = { ...currentEntry, shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
                // Update if it WAS the fixed day, but isn't anymore OR if defaults changed and current shift is 'F'
                else if ((dayOfWeek === oldFixedDayNum && newFixedDayNum !== oldFixedDayNum) || (defaultsChanged && currentEntry.shift === 'FOLGA' && !isFixedDayOff)) {
                    // Revert to default 'T' or 'F' based on employee defaults
                    let shift: ShiftCode = 'FOLGA';
                    let role = '';
                    let baseHours = '';
                    if (employeeToSave.defaultRole && employeeToSave.defaultShiftType && employeeToSave.defaultShiftType !== 'Nenhum') {
                        shift = 'TRABALHA';
                        role = employeeToSave.defaultRole;
                        const dayOptions = getTimeOptionsForDate(date, isHoliday);
                        const defaultBase = shiftTypeToHoursMap[employeeToSave.defaultShiftType];
                        baseHours = dayOptions.includes(defaultBase) ? defaultBase : (dayOptions[0] || '');
                    }
                     // Check holiday status again after determining default shift
                     if (isHoliday && shift === 'FOLGA') {
                          shift = 'FF';
                          role = '';
                          baseHours = '';
                     }
                    newSchedule[key] = { ...currentEntry, shift, role, baseHours, holidayReason: shift === 'FF' ? (currentEntry.holidayReason || 'Feriado') : undefined };
                }
                 // Update if currently working ('T') and either defaults changed or holiday status might affect hours
                else if (currentEntry.shift === 'TRABALHA') {
                     let updatedEntry = {...currentEntry};
                     // Update role if default changed
                     if (defaultsChanged && employeeToSave.defaultRole && currentEntry.role !== employeeToSave.defaultRole) {
                         updatedEntry.role = employeeToSave.defaultRole;
                     }
                     // Update hours if default shift type changed OR if current hours are invalid for the day
                     const availableTimes = getTimeOptionsForDate(date, isHoliday);
                     let determinedHours = currentEntry.baseHours;

                      // Check if current hours are valid, OR if default shift type changed
                      if (!availableTimes.includes(determinedHours) || (defaultsChanged && employeeToSave.defaultShiftType !== oldEmployee?.defaultShiftType)) {
                          determinedHours = ''; // Reset if invalid or default type changed
                          const defaultShiftType = employeeToSave.defaultShiftType;
                          if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                              const basicDefault = shiftTypeToHoursMap[defaultShiftType] || '';
                              if (availableTimes.includes(basicDefault)) {
                                  determinedHours = basicDefault;
                              }
                          }
                          // If still no hours, take the first available option
                          if (!determinedHours && availableTimes.length > 0) {
                              determinedHours = availableTimes[0];
                          }
                      }
                     updatedEntry.baseHours = determinedHours;
                     newSchedule[key] = updatedEntry;
                }
                // If shift is 'FF' and defaults changed, no action needed unless you want specific FF logic based on defaults
                // If shift is 'F' and defaults changed, it's handled above
            } else if (isNew && !currentEntry) { // Handle case where new employee has no current entry yet
                 let shift: ShiftCode = 'FOLGA';
                 let role = '';
                 let baseHours = '';
                  if (isFixedDayOff) {
                     shift = 'FOLGA';
                 } else if (employeeToSave.defaultRole && employeeToSave.defaultShiftType && employeeToSave.defaultShiftType !== 'Nenhum') {
                     shift = 'TRABALHA';
                     role = employeeToSave.defaultRole;
                     const dayOptions = getTimeOptionsForDate(date, isHoliday);
                     const defaultBase = shiftTypeToHoursMap[employeeToSave.defaultShiftType];
                     baseHours = dayOptions.includes(defaultBase) ? defaultBase : (dayOptions[0] || '');
                 }
                 if (isHoliday && shift === 'FOLGA') {
                      shift = 'FF';
                 }
                 newSchedule[key] = { shift, role, baseHours, holidayReason: shift === 'FF' ? 'Feriado' : undefined };
            }
        });
        return newSchedule;
    });

    setIsEditDialogOpen(false);
    setEditingEmployee(null);
    saveToFirestore(); // Auto-save after add/edit
    toast({ title: "Sucesso", description: `Colaborador ${isNew ? 'adicionado' : 'atualizado'}.` });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, toast, currentMonth, holidays, checkFixedDayOff, saveToFirestore]); // Added holidays, checkFixedDayOff


  // --- Filter and Date Logic ---
  const handleFilterChange = useCallback((newFilters: AppPartialFilterState) => {
    setFilters(prev => {
        const updatedFilters = { ...prev, ...newFilters };
        // When date changes via filters, also update the current month
        if (newFilters.selectedDate && prev.selectedDate?.getMonth() !== newFilters.selectedDate.getMonth()) {
            setCurrentMonth(startOfMonth(newFilters.selectedDate));
        }
        return updatedFilters;
    });
     // Save filters to Firestore (debounced or immediate)
     saveToFirestore(); // Example: Immediate save on filter change
  }, [saveToFirestore]);


  // --- UI State Handlers ---

  const handleResetMonthClick = () => setIsResetConfirmOpen(true);

  const confirmResetMonth = useCallback(() => {
    setIsResetConfirmOpen(false);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const datesToReset = getDatesInRange(monthStart, monthEnd);
    const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
    daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
    const dayIsHoliday = (date: Date) => isHolidayFn(holidays, date);


    setSchedule(prevSchedule => {
      const updatedSchedule: ScheduleData = { ...prevSchedule };
      employees.forEach(emp => {
        datesToReset.forEach(date => {
          const key = getScheduleKey(emp.id, date);
          const dayOfWeek = date.getDay();
           const isFixed = emp.fixedDayOff && dayOfWeek === fixedDayMapping[emp.fixedDayOff];
           const isHoliday = dayIsHoliday(date);
           let resetShift: ShiftCode = 'FOLGA';
           if (isHoliday && !isFixed) { // Set to FF if it's a holiday and not a fixed day off
              resetShift = 'FF';
           } else if (isFixed) { // Set to FOLGA if it's a fixed day off (overrides holiday)
               resetShift = 'FOLGA';
           }
          // Reset to FOLGA or FF, clearing other details
          updatedSchedule[key] = {
              shift: resetShift,
              role: '',
              baseHours: '',
              holidayReason: resetShift === 'FF' ? 'Feriado' : undefined
            };
        });
      });
      return updatedSchedule;
    });
    saveToFirestore(); // Auto-save after reset
    toast({ title: "Sucesso", description: `Escala do mês de ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada.` });
  }, [employees, currentMonth, toast, saveToFirestore, holidays]); // Add saveToFirestore and holidays

  // --- PDF Generation ---
  const generatePdf = () => {
    if (!tableContainerRef.current) return;
    if (isLoading) {
        toast({ title: "Aguarde", description: "Carregando dados antes de gerar PDF.", variant: "default"});
        return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });
    const monthName = formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR });
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const dates = getDatesInRange(monthStart, monthEnd);

    doc.setFontSize(18);
    doc.text(`ShiftMaster - Escala de Trabalho - ${monthName}`, 14, 15);
    doc.setFontSize(8);
    doc.setTextColor(100);
     doc.text(`Última atualização: ${lastSaveTime ? formatDate(lastSaveTime, 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Não salvo na nuvem'}`, 14, 22);

    const head = [
      ['Colaborador', ...dates.map(date => {
          const dayAbbr = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][date.getDay()];
          return `${dayAbbr}\n${formatDate(date, 'dd')}`;
      })],
    ];

     const body = employees.map(emp => {
       const row = [emp.name];
       dates.forEach(date => {
         const key = getScheduleKey(emp.id, date);
         const entry = schedule[key];
         let cellText = '-'; // Default for empty
         if (entry) {
           if (entry.shift === 'TRABALHA') {
             cellText = `${entry.role ? entry.role.substring(0, 3).toUpperCase() : '???'}\n${entry.baseHours ? entry.baseHours.replace(' às ', '-') : '???'}`;
           } else if (entry.shift === 'FOLGA') {
             cellText = 'F';
           } else if (entry.shift === 'FF') {
             cellText = entry.holidayReason ? `FF\n(${entry.holidayReason.substring(0, 5)})` : 'FF';
           }
         }
         row.push(cellText);
       });
       return row;
     });


    const availableWidth = doc.internal.pageSize.getWidth() - 28; // Subtract margins
    const nameColWidth = 40; // Fixed width for employee name
    const dateColWidth = Math.max(8, (availableWidth - nameColWidth) / dates.length); // Calculate remaining width

    const columnStyles: { [key: number]: any } = {
      0: { cellWidth: nameColWidth, fontStyle: 'bold', halign: 'left' },
    };
    dates.forEach((_, index) => {
      columnStyles[index + 1] = { cellWidth: dateColWidth, minCellWidth: 8 }; // Ensure minimum width
    });

     const holidayCols = dates.map((date, index) => isHolidayFn(holidays, date) ? index + 1 : -1).filter(index => index !== -1);

    doc.autoTable({
      startY: 28,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185], // Blue
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
        minCellHeight: 6, // Adjust min height if needed
      },
      columnStyles: columnStyles,
       didParseCell: (data) => {
           if (data.section === 'body' && data.column.index > 0) {
              const empId = employees[data.row.index].id;
              const date = dates[data.column.index - 1];
              const key = getScheduleKey(empId, date);
              const entry = schedule[key];
              const shiftCode = entry?.shift || 'FOLGA';

               // Apply specific background colors based on shift code
              if (shiftCode === 'FOLGA') {
                   data.cell.styles.fillColor = [240, 240, 240]; // Light Gray (Muted)
                   data.cell.styles.textColor = [120, 120, 120]; // Dark Gray Text
              } else if (shiftCode === 'FF') {
                   data.cell.styles.fillColor = [46, 204, 113]; // Green (Accent)
                   data.cell.styles.textColor = 255; // White text
                   data.cell.styles.fontStyle = 'bold';
              } else if (shiftCode === 'TRABALHA') {
                   data.cell.styles.fillColor = [231, 76, 60]; // Red (Destructive)
                   data.cell.styles.textColor = 255; // White text
                   data.cell.styles.fontStyle = 'bold';
              } else {
                    // Default/unknown case
                   data.cell.styles.fillColor = [255, 255, 255]; // White background
                   data.cell.styles.textColor = [180, 180, 180]; // Light Gray Text (for empty/non-assigned)
              }
           }
            // Highlight holiday columns
             if (holidayCols.includes(data.column.index)) {
                let baseColor = data.cell.styles.fillColor || [255, 255, 255]; // Default to white if no color
                 // Ensure baseColor is an array for manipulation
                 if (!Array.isArray(baseColor)) {
                     // If it's a number (grayscale) or string, convert to RGB array
                     // This part might need a more robust color conversion library if handling hex, etc.
                     // For simplicity, assume grayscale number or default to a light blueish tint base
                     baseColor = typeof baseColor === 'number' ? [baseColor, baseColor, baseColor] : [220, 235, 255];
                 }
                // Apply a subtle tint - adjust the blue value, ensure it stays within 0-255
                data.cell.styles.fillColor = [
                    Math.max(0, baseColor[0] - 5),
                    Math.max(0, baseColor[1] - 5),
                    Math.min(255, baseColor[2] + 15)
                 ];
                // Make holiday header text primary color
                if (data.section === 'head') {
                    data.cell.styles.textColor = [52, 152, 219]; // Use primary color for header text
                }
             }
           // Employee name cell styling
            if (data.section === 'body' && data.column.index === 0) {
               data.cell.styles.fontStyle = 'bold';
               data.cell.styles.halign = 'left';
            }
             // Header date styling
             if (data.section === 'head' && data.column.index > 0) {
                data.cell.styles.fontStyle = 'bold';
                 data.cell.styles.halign = 'center';
                 data.cell.styles.valign = 'middle';
             }
       },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 30; // Default Y position after table

    // Add Legend
     doc.setFontSize(8);
     doc.text('Legenda:', 14, finalY + 8);
     let legendX = 14;
     let legendY = finalY + 12;

     Object.entries(shiftCodeToDescription).forEach(([code, description]) => {
         let fillColor = [255, 255, 255]; // Default white
         if (code === 'TRABALHA') fillColor = [231, 76, 60]; // Red
         else if (code === 'FOLGA') fillColor = [240, 240, 240]; // Gray
         else if (code === 'FF') fillColor = [46, 204, 113]; // Green

         doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
         doc.rect(legendX, legendY - 2.5, 3, 3, 'F');
         doc.setTextColor(0);
         doc.text(`${code}: ${description}`, legendX + 5, legendY);

         legendX += 35; // Adjust spacing as needed
         if (legendX > doc.internal.pageSize.getWidth() - 40) { // Simple line break logic
             legendX = 14;
             legendY += 5;
         }
     });

     // Add Holiday Legend Item
      doc.setFillColor(52, 152, 219); // Holiday column header color
      doc.rect(legendX, legendY - 2.5, 3, 3, 'F');
      doc.setTextColor(0);
      doc.text('Coluna/Dia Feriado', legendX + 5, legendY);

    doc.save(`escala_${formatDate(currentMonth, 'yyyy-MM')}.pdf`);
    toast({ title: "Sucesso", description: "PDF da escala gerado." });
  };

  const generateDailyWhatsAppText = useCallback(() => {
    if (!isClient || !filters.selectedDate) {
      toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive" });
      return;
    }
    const text = generateWhatsAppText(
        filters.selectedDate,
        employees, // Pass all employees to potentially include everyone
        schedule,
        isHolidayFn(holidays, filters.selectedDate), // Use shared holiday checker
        roleToEmojiMap // Pass the emoji map
    );

    navigator.clipboard.writeText(text)
      .then(() => {
        toast({ title: "Sucesso", description: `Texto da escala de ${formatDate(filters.selectedDate, 'dd/MM/yyyy', { locale: ptBR })} copiado.` });
      })
      .catch(error => {
        console.error("Failed to copy WhatsApp text: ", error);
        toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive" });
      });
  }, [isClient, filters.selectedDate, employees, schedule, holidays, toast]); // Added holidays

  // Filter employees based on selected filter values
  const filteredEmployees = employees.filter(emp =>
    (!filters.employee || emp.id.toString() === filters.employee) &&
    (!filters.role || // Check if the role filter exists
      // Find any schedule entry for this employee within the *current month*
      // that matches the filtered role
      getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth)).some(date => {
        const key = getScheduleKey(emp.id, date);
        return schedule[key]?.role === filters.role;
      })
    )
  );


  const datesForTable = useMemo(() => getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth)), [currentMonth]);

  if (isLoading && isClient) {
       return (
           <div className="flex justify-center items-center h-screen">
               <p>Carregando dados da nuvem...</p>
           </div>
       );
   }


  return (
    <div className="p-2 sm:p-4 flex flex-col h-screen bg-background">
      {/* Header */}
       <div className="flex flex-col sm:flex-row justify-between items-center mb-4 flex-wrap gap-2">
         <h1 className="text-xl sm:text-2xl font-bold text-primary text-center sm:text-left">ShiftMaster</h1>
         <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap gap-1 justify-center sm:justify-end">
            {/* Save Buttons */}
             <Button onClick={() => saveToFirestore()} variant="outline" size="sm" disabled={isSaving}>
                 <Save className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> {isSaving ? 'Salvando...' : 'Salvar'}
             </Button>
              <Button onClick={() => setIsSaveAsDialogOpen(true)} variant="outline" size="sm" disabled={isSaving}>
                 <CloudUpload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Salvar Como...
             </Button>
             <Button onClick={handleOpenLoadDialog} variant="outline" size="sm" disabled={isSaving}>
                 <CloudDownload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Carregar
             </Button>
             {/* Action Buttons */}
             <Button onClick={generatePdf} variant="outline" size="sm">
                 <FileText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> PDF (Mês)
             </Button>
             <Button onClick={generateDailyWhatsAppText} variant="outline" size="sm">
                 <MessageSquareText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> WhatsApp (Dia)
             </Button>
             <Button onClick={handleAddEmployeeClick} size="sm">
                 <UserPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Adicionar
             </Button>
             <Button variant="destructive" onClick={handleResetMonthClick} size="sm">
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
          <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(endOfMonth(prev), 1))}>Próx. Mês</Button>
       </div>

      {/* Table Area */}
      <div ref={tableContainerRef} className="flex-grow overflow-auto border rounded-lg shadow-md bg-card">
           <ShiftTable
             employees={filteredEmployees}
             schedule={schedule}
             dates={datesForTable}
             holidays={holidays} // Pass holidays down
             onShiftChange={handleShiftChange}
             onDetailChange={handleDetailChange}
             onEditEmployee={handleEditEmployeeClick} // Corrected handler
             onDeleteEmployee={handleDeleteEmployeeClick} // Corrected handler
             onToggleHoliday={handleToggleHoliday} // Pass down toggle handler
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
                    Tem certeza que deseja zerar a escala para o mês de {formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })}?
                    Todos os dias para TODOS os colaboradores neste mês ser\xe3o definidos como 'Folga' (F) ou 'Folga Feriado' (FF) se for feriado. Esta a\xe7\xe3o n\xe3o pode ser desfeita.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmResetMonth} variant="destructive">
                    Zerar Escala do Mês
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

         {/* Save As Dialog */}
         <Dialog open={isSaveAsDialogOpen} onOpenChange={setIsSaveAsDialogOpen}>
           <DialogContent className="sm:max-w-[425px]">
             <DialogHeader>
               <DialogTitle>Salvar Escala Como...</DialogTitle>
               <DialogDescription>
                 Dê um nome para esta versão da escala.
               </DialogDescription>
             </DialogHeader>
             <div className="grid gap-4 py-4">
               <div className="grid grid-cols-4 items-center gap-4">
                 <Label htmlFor="save-as-name" className="text-right">
                   Nome
                 </Label>
                 <Input
                   id="save-as-name"
                   value={saveAsName}
                   onChange={(e) => setSaveAsName(e.target.value)}
                   className="col-span-3"
                   placeholder={`Escala ${formatDate(new Date(), 'MMM yyyy')}`}
                 />
               </div>
             </div>
             <DialogFooter>
               <DialogClose asChild>
                  <Button type="button" variant="outline">Cancelar</Button>
               </DialogClose>
               <Button type="button" disabled={!saveAsName.trim() || isSaving} onClick={() => saveToFirestore(saveAsName.trim().replace(/ /g, '_') + '-' + Date.now(), saveAsName.trim())}>
                 {isSaving ? 'Salvando...' : 'Salvar'}
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>

         {/* Load Dialog */}
         <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
             <DialogContent className="sm:max-w-md">
                 <DialogHeader>
                     <DialogTitle>Carregar Escala Salva</DialogTitle>
                     <DialogDescription>
                         Selecione uma escala salva para carregar. As alterações não salvas na escala atual serão perdidas.
                     </DialogDescription>
                 </DialogHeader>
                 <div className="max-h-[60vh] overflow-y-auto p-1">
                     {availableSaves.length === 0 ? (
                         <p className="text-center text-muted-foreground py-4">Nenhuma escala salva encontrada.</p>
                     ) : (
                         <ul className="space-y-2">
                             {availableSaves.map(save => (
                                 <li key={save.id} className="flex justify-between items-center p-2 border rounded hover:bg-muted/50">
                                     <div>
                                         <p className="font-medium">{save.name}</p>
                                         <p className="text-xs text-muted-foreground">Salvo em: {save.timestamp}</p>
                                     </div>
                                     <div className="flex gap-1">
                                         <Button size="sm" className="h-7 text-xs" onClick={() => loadFromFirestore(save.id)}>Carregar</Button>
                                         <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => handleDeleteSavedSchedule(save.id, save.name)}>Excluir</Button>
                                     </div>
                                 </li>
                             ))}
                         </ul>
                     )}
                 </div>
                  <DialogFooter className="mt-4">
                       <DialogClose asChild>
                           <Button type="button" variant="outline">Fechar</Button>
                       </DialogClose>
                   </DialogFooter>
             </DialogContent>
         </Dialog>

    </div>
  );
}
