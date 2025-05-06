'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftFilters } from './ShiftFilters';
import { ShiftTable } from './ShiftTable';
import type { Employee, ScheduleData, FilterState, ShiftCode, DayOfWeek, ScheduleEntry } from './types';
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange } from './utils';
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format, startOfMonth, endOfMonth, isEqual, startOfDay, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { UserPlus, FileText, MessageSquareText, RotateCcw, CloudUpload, CloudDownload, Save } from 'lucide-react'; // Added Cloud icons & Save
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
import 'jspdf-autotable';
import { roleToEmojiMap, daysOfWeek, shiftCodeToDescription, availableShiftCodes, shiftTypeToHoursMap, getTimeOptionsForDate, availableRoles } from './types';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase'; // Import Firestore instance
import { doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore'; // Import Firestore functions
import { Input } from '../ui/input'; // Import Input for save name
import { Label } from '../ui/label'; // Import Label
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';


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

  // --- Holiday Management ---
  const isHoliday = useCallback((date: Date): boolean => {
    if (!date || isNaN(date.getTime())) return false;
    const startOfDate = startOfDay(date);
    return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDate));
  }, [holidays]);

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
        setIsSaveAsDialogOpen(false); // Close dialog after save
        setSaveAsName(""); // Clear name input
    }
  }, [isClient, employees, schedule, filters, holidays, toast, lastSaveTime]);


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
                 initializeDefaultData(); // Initialize if data structure is wrong
                 toast({ title: "Aviso", description: "Dados na nuvem incompletos. Iniciando com dados padrão.", variant: "default" });
            }
        } else {
            console.log("No schedule data found in Firestore. Initializing default data.");
            initializeDefaultData(); // Initialize if no document exists
            toast({ title: "Informação", description: "Nenhum dado salvo encontrado. Iniciando com dados padrão.", variant: "default" });
        }
    } catch (error) {
        console.error("Failed to load data from Firestore:", error);
        toast({ title: "Erro", description: "Falha ao carregar dados da nuvem. Verifique a conexão.", variant: "destructive" });
        initializeDefaultData(); // Fallback to default on error
    } finally {
        setIsLoading(false); // End loading state
        setIsLoadDialogOpen(false); // Close dialog after load attempt
    }
}, [isClient, initializeDefaultData, toast]); // Removed saveToFirestore from dependencies

  // --- Data Initialization ---
  useEffect(() => {
    setIsClient(true);
    // Load initial data from Firestore only if it hasn't been loaded yet
    if (isClient && !hasLoadedInitialData.current) {
        loadFromFirestore();
    }
  }, [isClient, loadFromFirestore]); // Only depends on isClient and loadFromFirestore

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
  }, []);

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
                        timestamp: format(parseISO(timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    };
                })
                .sort((a, b) => parse(b.timestamp, "dd/MM/yyyy HH:mm", new Date()).getTime() - parse(a.timestamp, "dd/MM/yyyy HH:mm", new Date()).getTime()); // Sort by timestamp descending
            setAvailableSaves(saves);
        } catch (error) {
            console.error("Error fetching saved schedules:", error);
            toast({ title: "Erro", description: "Falha ao buscar escalas salvas.", variant: "destructive" });
        }
    }, [isClient, toast]);

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
       const wasHoliday = isHoliday(date); // Check status *before* changing
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
                if(entry && entry.shift === 'T') {
                    const availableTimes = getTimeOptionsForDate(date, newIsHolidayStatus);
                    if (!availableTimes.includes(entry.baseHours)) {
                        const defaultShiftType = emp.defaultShiftType;
                        let newDefaultHour = availableTimes[0] || '';
                        if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                             const basicDefault = shiftTypeToHoursMap[defaultShiftType];
                             if(availableTimes.includes(basicDefault)) {
                                 newDefaultHour = basicDefault;
                             }
                        }
                        newSchedule[key] = { ...entry, baseHours: newDefaultHour };
                    }
                }
            });
            return newSchedule;
        });
       toast({ title: "Feriado Atualizado", description: `Dia ${format(date, 'dd/MM')} ${wasHoliday ? 'não é mais' : 'agora é'} feriado.` });
       saveToFirestore(); // Auto-save after holiday toggle
   }, [toast, isHoliday, employees, saveToFirestore]);


  // --- Filter Handlers ---
  const handleFilterChange = useCallback((newFilters: AppPartialFilterState) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    if (newFilters.selectedDate) {
      setCurrentMonth(startOfMonth(newFilters.selectedDate));
    }
    // No need to save filters explicitly to Firestore on every change,
    // they get saved with the rest of the state.
  }, []);

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

  const confirmDeleteEmployee = useCallback(async () => {
      if (deletingEmployeeId === null) return;
      const employeeToDelete = employees.find(e => e.id === deletingEmployeeId);
      const updatedEmployees = employees.filter(emp => emp.id !== deletingEmployeeId);

      // Prepare schedule updates in a batch
      const batch = writeBatch(db);
      const datesForCurrentMonth = getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth)); // Adjust range as needed

      datesForCurrentMonth.forEach(date => {
          const key = getScheduleKey(deletingEmployeeId, date);
          const docRef = doc(db, "schedule", key); // Assuming schedule entries are stored separately
          batch.delete(docRef);
      });

       // Update employees array in the main doc
      const mainDocRef = doc(db, "scheduleState", DATA_DOC_ID);
      batch.update(mainDocRef, { employees: updatedEmployees });

      try {
          await batch.commit();
          setEmployees(updatedEmployees);
          // Update local schedule state to reflect deletion immediately
          setSchedule(prev => {
            const newSchedule = { ...prev };
            Object.keys(newSchedule).forEach(key => {
                const [empIdStr] = key.split('-');
                if (parseInt(empIdStr) === deletingEmployeeId) {
                    delete newSchedule[key];
                }
            });
            return newSchedule;
          });
          toast({ title: "Sucesso", description: `Colaborador "${employeeToDelete?.name || ''}" removido.` });
      } catch (error) {
           console.error("Error deleting employee and schedule entries:", error);
           toast({ title: "Erro", description: "Falha ao remover colaborador e suas escalas.", variant: "destructive" });
      } finally {
           setDeletingEmployeeId(null);
      }
  }, [deletingEmployeeId, employees, schedule, toast, currentMonth]); // Added schedule and currentMonth

   const handleSaveEmployee = useCallback(async (employeeData: Employee) => {
       let updatedEmployees: Employee[] = [];
       let isNewEmployee = false;
       let oldEmployeeData: Employee | undefined;

       setEmployees(prev => {
           const existingIndex = prev.findIndex(e => e.id === employeeData.id);
           if (existingIndex > -1) {
               oldEmployeeData = prev[existingIndex];
               updatedEmployees = [...prev];
               updatedEmployees[existingIndex] = employeeData;
               return updatedEmployees;
           } else {
               const newId = prev.length > 0 ? Math.max(...prev.map(e => e.id)) + 1 : 1;
               const newEmployee = { ...employeeData, id: newId };
               updatedEmployees = [...prev, newEmployee];
               isNewEmployee = true;
               return updatedEmployees;
           }
       });

       // If employee details changed that affect the schedule (fixed day off, defaults)
       // Re-calculate and update affected schedule entries
       if ((!isNewEmployee && oldEmployeeData && (oldEmployeeData.fixedDayOff !== employeeData.fixedDayOff || oldEmployeeData.defaultRole !== employeeData.defaultRole || oldEmployeeData.defaultShiftType !== employeeData.defaultShiftType)) || isNewEmployee) {
           const employeeId = employeeData.id;
           const newFixedDayOff = employeeData.fixedDayOff;
           const oldFixedDayOff = oldEmployeeData?.fixedDayOff;
           const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
           daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
           const newFixedDayNum = newFixedDayOff ? fixedDayMapping[newFixedDayOff] : undefined;
           const oldFixedDayNum = oldFixedDayOff ? fixedDayMapping[oldFixedDayOff] : undefined;

           setSchedule(prevSchedule => {
               const newSchedule = { ...prevSchedule };
               const monthStart = startOfMonth(currentMonth); // Adjust range if needed
               const monthEnd = endOfMonth(currentMonth);
               const datesForMonth = getDatesInRange(monthStart, monthEnd);

               datesForMonth.forEach(date => {
                   const key = getScheduleKey(employeeId, date);
                   try {
                       if (isNaN(date.getTime())) return;
                       const dayOfWeek = date.getDay();
                       const currentEntry = newSchedule[key];
                       const dayIsHoliday = isHoliday(date);

                       // Apply new fixed day off
                       if (newFixedDayNum !== undefined && dayOfWeek === newFixedDayNum) {
                           if (!currentEntry || currentEntry.shift !== 'FF') {
                               newSchedule[key] = { shift: 'F', role: '', baseHours: '', holidayReason: undefined };
                           }
                       }
                       // Revert old fixed day off (if not the new fixed day OR a holiday FF)
                       else if (oldFixedDayNum !== undefined && dayOfWeek === oldFixedDayNum && newFixedDayNum !== dayOfWeek && currentEntry?.shift === 'F') {
                            let resetShift: ShiftCode = 'F';
                           let resetRole = '';
                           let resetHours = '';
                           if (employeeData.defaultRole && employeeData.defaultShiftType && employeeData.defaultShiftType !== 'Nenhum') {
                               resetShift = 'T';
                               resetRole = employeeData.defaultRole;
                               const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
                               const basicDefault = shiftTypeToHoursMap[employeeData.defaultShiftType] || '';
                               resetHours = defaultHoursOptions.includes(basicDefault) ? basicDefault : (defaultHoursOptions[0] || '');
                           }
                            newSchedule[key] = { ...currentEntry, shift: resetShift, role: resetRole, baseHours: resetHours, holidayReason: undefined };
                       }
                       // Set defaults for new employee on non-fixed-off days
                       else if (isNewEmployee && !currentEntry && newFixedDayNum !== dayOfWeek) {
                             let initialShift: ShiftCode = 'F';
                             let initialRole = '';
                             let initialHours = '';
                             if (employeeData.defaultRole && employeeData.defaultShiftType && employeeData.defaultShiftType !== 'Nenhum') {
                                 initialShift = 'T';
                                 initialRole = employeeData.defaultRole;
                                 const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
                                 const basicDefault = shiftTypeToHoursMap[employeeData.defaultShiftType] || '';
                                 initialHours = defaultHoursOptions.includes(basicDefault) ? basicDefault : (defaultHoursOptions[0] || '');
                             }
                             newSchedule[key] = { shift: initialShift, role: initialRole, baseHours: initialHours, holidayReason: undefined };
                       }
                       // Update existing working days if default role/shift changed
                        else if (!isNewEmployee && currentEntry?.shift === 'T' && (oldEmployeeData?.defaultRole !== employeeData.defaultRole || oldEmployeeData?.defaultShiftType !== employeeData.defaultShiftType)) {
                            let updatedRole = currentEntry.role;
                            let updatedHours = currentEntry.baseHours;
                             // Only update role if it was using the old default
                            if (currentEntry.role === oldEmployeeData?.defaultRole) {
                                updatedRole = employeeData.defaultRole || '';
                            }
                             // Only update hours if it was using the old default's hours
                             const oldDefaultHoursOptions = getTimeOptionsForDate(date, isHoliday(date)); // Use current holiday status
                             const oldBasicDefault = oldEmployeeData?.defaultShiftType && oldEmployeeData.defaultShiftType !== 'Nenhum' ? shiftTypeToHoursMap[oldEmployeeData.defaultShiftType] : undefined;
                             const newDefaultShiftType = employeeData.defaultShiftType;

                             if (currentEntry.baseHours === oldBasicDefault || !oldDefaultHoursOptions.includes(currentEntry.baseHours) ) { // Update if using old default OR if current hours are invalid
                                const newDefaultHoursOptions = getTimeOptionsForDate(date, isHoliday(date));
                                if (newDefaultShiftType && newDefaultShiftType !== 'Nenhum') {
                                    const newBasicDefault = shiftTypeToHoursMap[newDefaultShiftType];
                                    updatedHours = newDefaultHoursOptions.includes(newBasicDefault) ? newBasicDefault : (newDefaultHoursOptions[0] || '');
                                } else {
                                    updatedHours = newDefaultHoursOptions[0] || ''; // Fallback if no new default
                                }
                            }

                           newSchedule[key] = { ...currentEntry, role: updatedRole, baseHours: updatedHours };
                       }


                   } catch (e) {
                       console.error(`Error processing schedule key for employee update: ${key}`, e);
                   }
               });
               return newSchedule;
           });
       }
       await saveToFirestore(); // Save after employee and potentially schedule update
       setIsEditDialogOpen(false);
       setEditingEmployee(null);
       toast({ title: "Sucesso", description: `Colaborador ${isNewEmployee ? 'adicionado' : 'atualizado'}.` });
   }, [toast, currentMonth, isHoliday, saveToFirestore]); // Added saveToFirestore



  // --- Schedule Management Handlers ---

  const checkFixedDayOff = useCallback((employee: Employee, date: Date): boolean => {
    if (!employee.fixedDayOff) return false;
    const dayOfWeek = date.getDay();
    const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
    daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
    const fixedDayNum = fixedDayMapping[employee.fixedDayOff];
    return fixedDayNum !== undefined && dayOfWeek === fixedDayNum;
  }, []);


  const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
    const employee = employees.find(e => e.id === empId);
    if (!employee) return;

     // --- Rule Checks ---
     if (newShift === 'T') {
         if (checkFixedDayOff(employee, date)) {
             toast({
                 title: "Regra Violada",
                 description: `${employee.name} tem folga fixa neste dia (${employee.fixedDayOff}). Use 'FF' para Folga Feriado.`,
                 variant: "destructive",
             });
             return;
         }
        let consecutiveDays = 1;
        for (let i = 1; i <= 6; i++) {
            const checkDate = addDays(date, -i);
            if (schedule[getScheduleKey(empId, checkDate)]?.shift === 'T') consecutiveDays++;
            else break;
        }
        if (consecutiveDays > 6) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} não pode trabalhar mais de 6 dias consecutivos.`,
                variant: "destructive",
            });
            return;
        }
         if (date.getDay() === 0) {
             let consecutiveSundays = 1;
             for (let k = 1; k <= 3; k++) {
                 const prevSunday = addDays(date, -k * 7);
                 if (schedule[getScheduleKey(empId, prevSunday)]?.shift === 'T') consecutiveSundays++;
                 else break;
             }
             if (consecutiveSundays > 3) {
                 toast({
                     title: "Regra Violada",
                     description: `${employee.name} não pode trabalhar mais de 3 domingos consecutivos.`,
                     variant: "destructive",
                 });
                 return;
             }
         }
     }

    // --- Update Schedule ---
    setSchedule(prev => {
      const key = getScheduleKey(empId, date);
      const existingEntry = prev[key] || { shift: 'F', role: '', baseHours: '', holidayReason: undefined };
      let role = existingEntry.role;
      let baseHours = existingEntry.baseHours;
      let holidayReason = existingEntry.holidayReason;

      if (newShift === 'T') {
        role = existingEntry.role || employee.defaultRole || '';
        const dayIsHoliday = isHoliday(date);
        const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
        let determinedDefaultHours = existingEntry.baseHours || '';

        if (!determinedDefaultHours || !defaultHoursOptions.includes(determinedDefaultHours)) {
             const defaultShiftType = employee.defaultShiftType;
             if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                 const basicDefault = shiftTypeToHoursMap[defaultShiftType] || '';
                 if (defaultHoursOptions.includes(basicDefault)) {
                    determinedDefaultHours = basicDefault;
                 } else if (defaultHoursOptions.length > 0) {
                    determinedDefaultHours = defaultHoursOptions[0];
                 } else {
                    determinedDefaultHours = '';
                 }
             } else if (defaultHoursOptions.length > 0) {
                 determinedDefaultHours = defaultHoursOptions[0];
             } else {
                 determinedDefaultHours = '';
             }
        }
        baseHours = determinedDefaultHours;
        if (!role && employee.defaultRole) role = employee.defaultRole;
        holidayReason = undefined;
      } else if (newShift === 'F') {
         role = '';
         baseHours = '';
         holidayReason = undefined;
      } else if (newShift === 'FF') {
         role = '';
         baseHours = '';
         holidayReason = existingEntry.holidayReason ?? '';
      }

      return {
        ...prev,
        [key]: {
          shift: newShift,
          role: role,
          baseHours: baseHours,
          holidayReason: holidayReason,
        } as ScheduleEntry,
      };
    });
    // No explicit save here, relies on useEffect for batch saving or manual save button
  }, [employees, schedule, toast, checkFixedDayOff, isHoliday]); // Removed saveToFirestore dependency


  const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
      setSchedule(prev => {
          const key = getScheduleKey(empId, date);
          const currentEntry = prev[key] || { shift: 'F', role: '', baseHours: '', holidayReason: undefined };
          if (field === 'role' || field === 'baseHours') {
              if (currentEntry.shift !== 'T') {
                   toast({ title: "Ação Inválida", description: "Só é possível definir Função/Horário para dias de Trabalho (T).", variant: "default" });
                   return prev;
              }
          } else if (field === 'holidayReason') {
               if (currentEntry.shift !== 'FF') {
                    toast({ title: "Ação Inválida", description: "Só é possível definir Motivo do Feriado para dias de Folga Feriado (FF).", variant: "default" });
                    return prev;
               }
          }
          return { ...prev, [key]: { ...currentEntry, [field]: value } };
      });
      // No explicit save here
  }, [toast]);


  // --- Data Filtering for Display ---
 const filteredEmployees = React.useMemo(() => {
   if (!isClient) return [];
   const { employee: employeeFilter, role: roleFilter } = filters;
   const monthStart = startOfMonth(currentMonth);
   const monthEnd = endOfMonth(currentMonth);

   return employees.filter(emp => {
     if (employeeFilter && emp.id !== parseInt(employeeFilter)) return false;
     if (roleFilter) {
       let hasMatchingRoleInMonth = false;
       let currentDate = new Date(monthStart);
       while (currentDate <= monthEnd) { // Use <= to include end date
         const key = getScheduleKey(emp.id, currentDate);
         const daySchedule = schedule[key];
         if (daySchedule && daySchedule.shift === 'T' && daySchedule.role === roleFilter) {
           hasMatchingRoleInMonth = true;
           break;
         }
         currentDate = addDays(currentDate, 1);
         if (differenceInDays(currentDate, monthStart) > 40) break; // Safety break
       }
       if (!hasMatchingRoleInMonth) return false;
     }
     return true;
   });
 }, [employees, schedule, filters, currentMonth, isClient]);

  // --- Reset Scale Handler ---
  const handleResetScale = useCallback(() => {
    setIsResetConfirmOpen(true);
  }, []);

  const confirmResetScale = useCallback(async () => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const datesForMonth = getDatesInRange(monthStart, monthEnd);
      const newSchedule = { ...schedule };

      employees.forEach(emp => {
          datesForMonth.forEach(date => {
              const key = getScheduleKey(emp.id, date);
               newSchedule[key] = { shift: 'F', role: '', baseHours: '', holidayReason: undefined };
          });
      });

      setSchedule(newSchedule);
      await saveToFirestore(); // Save the reset state
      setIsResetConfirmOpen(false);
      toast({ title: "Sucesso", description: `Escala do mês de ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada para 'Folga'.` });
  }, [currentMonth, employees, schedule, toast, saveToFirestore]);


  // --- PDF & WhatsApp Generation ---

 const dayAbbreviations: Record<number, string> = {
     0: 'DOM', 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SAB'
 };

 const generatePdf = useCallback(() => {
     if (!isClient) return;
     const doc = new jsPDF({ orientation: 'landscape' });
     const tableStartDate = startOfMonth(currentMonth);
     const tableEndDate = endOfMonth(currentMonth);
     const datesInRange = getDatesInRange(tableStartDate, tableEndDate);
     doc.setFontSize(14);
     doc.text('ShiftMaster - Escala de Trabalho', 14, 15);
     doc.setFontSize(10);
     doc.setTextColor(100);
     const dateRangeText = `Mês: ${format(tableStartDate, 'MMMM yyyy', { locale: ptBR })}`;
     doc.text(dateRangeText, 14, 22);
     const head = [['Colaborador', ...datesInRange.map(d => `${dayAbbreviations[d.getDay()]}\n${format(d, 'dd')}`)]];
     const body = filteredEmployees.map(emp => {
         const row = [emp.name];
         datesInRange.forEach(date => {
             const key = getScheduleKey(emp.id, date);
             const entry = schedule[key];
             let cellText = '-';
             if (entry) {
                 if (entry.shift === 'T') {
                    const roleInitial = entry.role ? entry.role.substring(0, 3).toUpperCase() : '?';
                    const hoursCompact = entry.baseHours ? entry.baseHours.replace(' às ', '-').replace('h', '') : '?';
                    cellText = `${roleInitial}\n${hoursCompact}`;
                 } else if (entry.shift === 'F') {
                    cellText = 'F';
                 } else if (entry.shift === 'FF') {
                    cellText = entry.holidayReason ? `FF\n(${entry.holidayReason.substring(0,5)})` : 'FF';
                 }
             }
             row.push(cellText);
         });
         return row;
     });
     const pageWidth = doc.internal.pageSize.getWidth();
     const margins = 14 * 2;
     const employeeColWidth = 25;
     const availableWidthForDates = pageWidth - margins - employeeColWidth;
     const dateColWidth = Math.max(8, availableWidthForDates / datesInRange.length);
     const holidayIndexes = datesInRange.map((date, index) => isHoliday(date) ? index + 1 : -1).filter(index => index !== -1);

     doc.autoTable({
         startY: 28, head: head, body: body, theme: 'grid',
         headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 6, cellPadding: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 }, lineColor: [200, 200, 200], lineWidth: 0.1 },
         styles: { cellPadding: { top: 0.5, right: 0.2, bottom: 0.5, left: 0.2 }, fontSize: 5, valign: 'middle', halign: 'center', lineWidth: 0.1, lineColor: [200, 200, 200], minCellHeight: 6 },
         columnStyles: {
             0: { halign: 'left', fontStyle: 'bold', fontSize: 6, cellWidth: employeeColWidth, minCellWidth: employeeColWidth, overflow: 'linebreak' },
             ...datesInRange.reduce((acc, _, index) => { acc[index + 1] = { cellWidth: dateColWidth, minCellWidth: 8 }; return acc; }, {} as any),
         },
         didParseCell: function (data) {
             if (data.cell.section === 'body' && data.column.index > 0) {
                 const empIndex = data.row.index;
                 const dateIndex = data.column.index - 1;
                  if (empIndex >= 0 && empIndex < filteredEmployees.length && dateIndex >= 0 && dateIndex < datesInRange.length) {
                      const entry = schedule[getScheduleKey(filteredEmployees[empIndex].id, datesInRange[dateIndex])];
                      const code = entry?.shift || 'F';
                      if (code === 'F') { data.cell.styles.fillColor = [240, 240, 240]; data.cell.styles.textColor = [120, 120, 120]; }
                      else if (code === 'FF') { data.cell.styles.fillColor = [46, 204, 113]; data.cell.styles.textColor = 255; data.cell.styles.fontStyle = 'bold'; }
                      else if (code === 'T') { data.cell.styles.fillColor = [231, 76, 60]; data.cell.styles.textColor = 255; data.cell.styles.fontStyle = 'bold'; }
                      else { data.cell.styles.fillColor = [255, 255, 255]; data.cell.styles.textColor = [180, 180, 180]; }
                  }
             }
             if (data.cell.section === 'body' && holidayIndexes.includes(data.column.index)) {
                  const existingFill = data.cell.styles.fillColor || [255, 255, 255];
                  data.cell.styles.fillColor = Array.isArray(existingFill) ? [Math.min(255, existingFill[0] + 10), Math.min(255, existingFill[1] + 10), Math.max(0, existingFill[2] - 5)] : '#e0e7ff';
                 data.cell.styles.lineColor = [52, 152, 219];
                 data.cell.styles.lineWidth = 0.15;
             }
              if (data.cell.section === 'head' && data.column.index > 0) {
                   data.cell.styles.fontStyle = 'bold'; data.cell.styles.halign = 'center'; data.cell.styles.valign = 'middle';
                    if (holidayIndexes.includes(data.column.index)) { data.cell.styles.fillColor = [52, 152, 219]; data.cell.styles.textColor = 255; }
              }
              if (data.cell.section === 'body' && data.column.index === 0) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.halign = 'left'; }
         }
     });
      const finalY = (doc as any).lastAutoTable.finalY || 30;
      doc.setFontSize(8);
      doc.text('Legenda:', 14, finalY + 8);
      let legendX = 14;
      let legendY = finalY + 12;
      Object.entries(shiftCodeToDescription).forEach(([code, description]) => {
          let fillColor: number[] | string = [255, 255, 255];
          if (code === 'T') fillColor = [231, 76, 60];
          if (code === 'F') fillColor = [240, 240, 240];
          if (code === 'FF') fillColor = [46, 204, 113];
          doc.setFillColor.apply(doc, Array.isArray(fillColor) ? fillColor : [255, 255, 255]);
          doc.rect(legendX, legendY - 2.5, 3, 3, 'F');
          doc.setTextColor(0);
          doc.text(`${code}: ${description}`, legendX + 5, legendY);
          legendX += 35;
           if (legendX > pageWidth - 40) { legendX = 14; legendY += 5; }
      });
       doc.setFillColor(52, 152, 219);
       doc.rect(legendX, legendY - 2.5, 3, 3, 'F');
       doc.setTextColor(0);
       doc.text('Coluna/Dia Feriado', legendX + 5, legendY);
     doc.save(`escala_${format(tableStartDate, 'yyyy-MM')}.pdf`);
     toast({ title: "Sucesso", description: "PDF da escala gerado." });

 }, [isClient, currentMonth, filteredEmployees, schedule, toast, holidays, isHoliday]); // Added holidays, isHoliday


  const generateDailyWhatsAppText = useCallback(() => {
      if (!isClient || !filters.selectedDate) {
           toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive" });
          return;
      }
       const holidayStatus = isHoliday(filters.selectedDate);
       const text = generateWhatsAppText(filters.selectedDate, employees, schedule, holidayStatus, roleToEmojiMap);
      navigator.clipboard.writeText(text).then(() => {
          toast({ title: "Sucesso", description: `Texto da escala de ${format(filters.selectedDate, 'dd/MM/yyyy', {locale: ptBR})} copiado.` });
      }).catch(err => {
          console.error('Failed to copy WhatsApp text: ', err);
          toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive" });
      });
  }, [isClient, filters.selectedDate, employees, schedule, toast, isHoliday, roleToEmojiMap]);


  // --- Render Logic ---
  if (!isClient || isLoading) { // Show loading indicator
    return <div className="flex justify-center items-center h-screen"><p>Carregando dados...</p></div>;
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const datesForTable = getDatesInRange(monthStart, monthEnd);

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
             <Button onClick={handleAddEmployee} size="sm">
                 <UserPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Adicionar
             </Button>
             <Button variant="destructive" onClick={handleResetScale} size="sm">
                 <RotateCcw className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Zerar Mês
             </Button>
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
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(startOfMonth(prev), -1))}>Mês Ant.</Button>
          <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addDays(endOfMonth(prev), 1))}>Próx. Mês</Button>
       </div>

      {/* Table Area */}
      <div ref={tableContainerRef} className="flex-grow overflow-auto border rounded-lg shadow-md bg-card">
           <ShiftTable
             employees={filteredEmployees}
             schedule={schedule}
             dates={datesForTable}
             holidays={holidays}
             onShiftChange={handleShiftChange}
             onDetailChange={handleDetailChange}
             onEditEmployee={handleEditEmployee}
             onDeleteEmployee={handleDeleteEmployee}
             onToggleHoliday={handleToggleHoliday}
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
                    Tem certeza que deseja zerar a escala para o mês de {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}?
                    Todos os dias para TODOS os colaboradores neste mês ser\xe3o definidos como 'Folga' (F). Feriados marcados ser\xe3o mantidos, mas o status do colaborador ser\xe1 'F'. Esta a\xe7\xe3o n\xe3o pode ser desfeita.
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
                   placeholder={`Escala ${format(new Date(), 'MMM yyyy')}`}
                 />
               </div>
             </div>
             <DialogFooter>
               <DialogClose asChild>
                  <Button type="button" variant="outline">Cancelar</Button>
               </DialogClose>
               <Button type="button" disabled={!saveAsName.trim() || isSaving} onClick={() => saveToFirestore(saveAsName.trim().replace(/ /g, '_'), saveAsName.trim())}>
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