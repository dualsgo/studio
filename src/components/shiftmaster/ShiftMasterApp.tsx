'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftFilters } from './ShiftFilters';
import { ShiftTable } from './ShiftTable';
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry } from './types';
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

import { cn } from '@/lib/utils'; // Import cn
import { db, app } from '@/lib/firebase'; // Import Firestore instance
import { doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore'; // Import Firestore functions
import { Input } from '../ui/input'; // Import Input for save name
import { Label } from '../ui/label'; // Import Label
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Role } from 'next/dist/server/app-render';
import { A, B, T$ } from '@radix-ui/react-dialog';


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

const SELECT_NONE_VALUE = "--none--";
// Helper to check if a date is a holiday
const isHoliday = (holidays:Date[], date: Date): boolean => {
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

  // // Helper to check if a date is a holiday
  // const isHoliday = useCallback((date: Date): boolean => {
  //   if (!date || isNaN(date.getTime())) return false;
  //   const startOfDate = startOfDay(date);
  //   return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDate));
  // }, [holidays]);

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
       const wasHoliday = isHoliday(holidays,date); // Check status *before* changing
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
                        const defaultShiftType = emp.defaultShiftType;
                        let newDefaultHour = availableTimes[0] || '';
                        if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                             const basicDefault = shiftTypeToHoursMap[defaultShiftType];
                             if(availableTimes.includes(basicDefault)) {
                                 newDefaultHour = basicDefault;
                             } else {
                                 newDefaultHour = availableTimes[0] || '';
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
   }, [employees, checkFixedDayOff, isHoliday, currentMonth, saveToFirestore, toast,schedule]); // Added isHoliday

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
       // Prepare schedule updates in a batch
      const batch = writeBatch(db);
      const datesForCurrentMonth = getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth)); // Adjust range as needed

      datesForCurrentMonth.forEach(date => {
          const key = getScheduleKey(deletingEmployeeId, date);
          const docRef = doc(db, "scheduleState", key); // Assuming schedule entries are stored separately
          batch.delete(docRef);
      });

       // Update employees array in the main doc
      const mainDocRef = doc(db, "scheduleState", DATA_DOC_ID);
      batch.update(mainDocRef, { employees: employees.filter(emp => emp.id !== deletingEmployeeId) });

      try {
          await batch.commit();
          setEmployees(employees.filter(emp => emp.id !== deletingEmployeeId));
          toast({ title: "Sucesso", description: `Colaborador "${employeeToDelete?.name || ''}" removido.` });
      } catch (error) {
           console.error("Error deleting employee and schedule entries:", error);
           toast({ title: "Erro", description: "Falha ao remover colaborador e suas escalas.", variant: "destructive" });
      } finally {
           setDeletingEmployeeId(null);
      }
  }, [employees, schedule, currentMonth, saveToFirestore, toast]);

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
                       const dayOfWeek = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
                       const dayIsHoliday = isHoliday(holidays,date);

                       // Apply new fixed day off
                       if (newFixedDayNum !== undefined && dayOfWeek === newFixedDayNum) {
                           if (!currentEntry || currentEntry.shift !== 'FOLGA') {
                               newSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                           }
                       }
                       // Revert old fixed day off (if not the new fixed day OR a holiday FF)
                       else if (oldFixedDayNum !== undefined && dayOfWeek === oldFixedDayNum && newFixedDayNum !== dayOfWeek && currentEntry?.shift === 'FOLGA') {
                            let resetShift: ShiftCode = 'FOLGA';
                           let resetRole = '';
                           let resetHours = '';
                           if (employeeData.defaultRole && employeeData.defaultShiftType && employeeData.defaultShiftType !== 'Nenhum') {
                               resetShift = 'TRABALHA';
                               resetRole = employeeData.defaultRole;
                               const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
                               const basicDefault = shiftTypeToHoursMap[employeeData.defaultShiftType] || '';
                               resetHours = defaultHoursOptions.includes(basicDefault) ? basicDefault : (defaultHoursOptions[0] || '');
                           }
                            newSchedule[key] = { ...currentEntry, shift: resetShift, role: resetRole, baseHours: resetHours, holidayReason: undefined };
                       }
                       // Set defaults for new employee on non-fixed-off days
                       else if (isNewEmployee && !currentEntry && newFixedDayNum !== dayOfWeek) {
                             let initialShift: ShiftCode = 'FOLGA';
                             let initialRole = '';
                             let initialHours = '';
                             if (employeeData.defaultRole && employeeData.defaultShiftType && employeeData.defaultShiftType !== 'Nenhum') {
                                 initialShift = 'TRABALHA';
                                 initialRole = employeeData.defaultRole;
                                 const defaultHoursOptions = getTimeOptionsForDate(date, dayIsHoliday);
                                 const basicDefault = shiftTypeToHoursMap[employeeData.defaultShiftType] || '';
                                 initialHours = defaultHoursOptions.includes(basicDefault) ? basicDefault : (defaultHoursOptions[0] || '');
                             }
                             newSchedule[key] = { shift: initialShift, role: initialRole, baseHours: initialHours, holidayReason: undefined };
                       }
                       // Update existing working days if default role/shift changed
                        else if (!isNewEmployee && currentEntry?.shift === 'TRABALHA' && (oldEmployeeData?.defaultRole !== employeeData.defaultRole || oldEmployeeData?.defaultShiftType !== employeeData.defaultShiftType)) {
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
   }, [employees, schedule, currentMonth, saveToFirestore, toast]);

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
