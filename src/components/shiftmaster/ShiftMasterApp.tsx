'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import HeadInformation from '@/components/HeadInformation';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase'; // Import Firestore instance
import { doc, setDoc, getDoc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import type { Employee, ScheduleData, ShiftCode, DayOfWeek, ScheduleEntry, FilterState } from './types';
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange, shiftTypeToHoursMap, availableRoles, daysOfWeek, roleToEmojiMap, getTimeOptionsForDate, SELECT_NONE_VALUE } from './types'; // Correctly import from types
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format as formatDate, startOfMonth, endOfMonth, isEqual, startOfDay, parse } from 'date-fns'; // Renamed format to formatDate
import { ptBR } from 'date-fns/locale';
import { ShiftTable } from './ShiftTable';
import { Button } from '@/components/ui/button';
import { Clock, Briefcase, Edit, Trash2, CalendarHeart } from 'lucide-react'; // Added CalendarHeart for FF
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from '@/components/ui/calendar';
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

import { DataGridView } from "@/components/data-grid-view"
import { Separator } from "@/components/ui/separator"
import { CalendarHeart, WifiOff } from 'lucide-react';
import { Unsplash } from "@/components/unsplash"
import { Icons } from "@/components/icons"

export interface SearchResult {
    media: { url: string };
    description: string;
    id: string;
}

const SAVED_SCHEDULES_COLLECTION = 'savedSchedules'; // Define collection name

const toastDuration = 3000;

export default function Home() {
  return <ShiftMasterApp />;
}

interface HeadInformationProps {
}

function HeadInformation(props: HeadInformationProps) {
    return (
        <>
            <title>ShiftMaster – Gerenciador de Escalas</title>
            <meta name="description" content="Gerenciamento de escalas de trabalho fácil e intuitivo."/>
            <link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="16x16"/>
        </>
    );
}

interface ShiftMasterAppProps {
}

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
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(db !== null);

  const [holidays, setHolidays] = useState<Date[]>([]);
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  const { toast } = useToast();
  const isClient = typeof window !== 'undefined'; // Simple client-side check


  // Load data from Firestore
  const loadDataFromFirestore = useCallback(async (docId: string, collectionName: string) => {
    if (!db) {
      console.error("Firestore not initialized.");
      setIsFirebaseConnected(false); // Update connection status
      toast({
        title: "Erro de conexao",
        description: "Conexão com Firebase falhou, verifique as configurações.",
        variant: "destructive",
      });
      return;
    }

    const docRef = doc(db, collectionName, docId);
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data) {
            const parsedEmployees = (data.employees || [])
                .map((empData: any) => ({
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

            const parsedHolidays = (data.holidays || []).map((holiday: string) => parseISO(holiday));
             // Correctly map the dates
            setEmployees(parsedEmployees);
            setSchedule(parsedSchedule);
            setHolidays(parsedHolidays);
            toast({title: 'Sucesso', description: 'Dados carregados do Firestore!'});
          }
        } else {
          console.log("No such document!");
          toast({title: 'Aviso', description: 'Nenhum dado encontrado para esta escala.'});
        }
      } catch (error) {
        console.error("Error fetching document:", error);
        toast({
          title: "Erro ao carregar dados",
          description: "Ocorreu um erro ao buscar os dados do Firestore.",
          variant: "destructive",
        });
      }
  }, [toast]);

  const addEmployee = async (employeeData: Employee) => {
    if (!db) {
      console.error("Firestore not initialized.");
      setIsFirebaseConnected(false);
      return;
    }
        // Find the highest existing ID to generate a new one
        const maxId = employees.reduce((max, emp) => Math.max(max, emp.id), 0);
        const newEmployee = { ...employeeData, id: maxId + 1 };
        const newEmployees = [...employees, newEmployee];
        await updateDataInFirestore(newEmployees, schedule, SAVED_SCHEDULES_COLLECTION);
        setEmployees(newEmployees);
        setEditOpen(false);
        toast({ title: "Sucesso", description: "Colaborador adicionado." });
  };

  const updateEmployee = async (employeeData: Employee) => {
    if (!db) {
      console.error("Firestore not initialized.");
      setIsFirebaseConnected(false);
      return;
    }
    const updatedEmployees = employees.map(emp =>
      emp.id === employeeData.id ? employeeData : emp
    );
    await updateDataInFirestore(updatedEmployees, schedule, SAVED_SCHEDULES_COLLECTION);
    setEmployees(updatedEmployees);
    setEditOpen(false);
    toast({ title: "Sucesso", description: "Colaborador atualizado." });
  };

  const deleteEmployee = async (employeeId: number) => {
    if (!db) {
      console.error("Firestore not initialized.");
      setIsFirebaseConnected(false);
      return;
    }
    setEmployeeToDelete(employeeId); // Set employee ID to delete

  };

    const updateDataInFirestore = async (newEmployees: Employee[], newSchedule: ScheduleData, collectionName: string) => {
      if (!db) {
        console.error("Firestore not initialized.");
        setIsFirebaseConnected(false);
        return;
      }

      // Prepare data to be updated
      const data = {
        employees: newEmployees,
        schedule: newSchedule,
        holidays: holidays.map(date => date.toISOString()),
      };

      // Get the document reference (you might want to use a more specific document ID)
      const docRef = doc(db, collectionName, "scheduleData");

      try {
        // Update the document
        await setDoc(docRef, data, { merge: true });
        console.log("Document updated successfully!");
        return true;
      } catch (e) {
        console.error("Error updating document: ", e);
        toast({title: 'Erro', description: 'Houve um problema ao salvar a escala. Verifique sua conexão e tente novamente', variant: 'destructive'});
        return false;
      }
    };


   const handleShiftChange = useCallback(async (empId: number, date: Date, newShift: ShiftCode) => {
    if (!db) {
        console.error("Firestore not initialized.");
        setIsFirebaseConnected(false);
        return;
    }
       const key = getScheduleKey(empId, date);
       // Directly update the schedule
       const updatedSchedule = { ...schedule };
       if (updatedSchedule[key]) {
            updatedSchedule[key] = { ...updatedSchedule[key], shift: newShift };
       } else {
           updatedSchedule[key] = { shift: newShift, role: '', baseHours: '', holidayReason: undefined };
       }
       await updateDataInFirestore(employees, updatedSchedule, SAVED_SCHEDULES_COLLECTION);
       setSchedule(updatedSchedule);
   }, [employees, schedule, toast]);

    const handleDetailChange = useCallback(async (empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
        if (!db) {
            console.error("Firestore not initialized.");
            setIsFirebaseConnected(false);
            return;
        }
       const key = getScheduleKey(empId, date);
       const updatedSchedule = { ...schedule };
        // Handle create and update in one go
       if (!updatedSchedule[key]) {
           updatedSchedule[key] = { shift: 'TRABALHA', role: '', baseHours: '', holidayReason: undefined };
       }
       // Then perform the specific update
       updatedSchedule[key] = { ...updatedSchedule[key], [field]: value };
         await updateDataInFirestore(employees, updatedSchedule, SAVED_SCHEDULES_COLLECTION);
        setSchedule(updatedSchedule);
    }, [employees, schedule, toast]);

  const handleToggleHoliday = useCallback(async (date: Date) => {
    if (!db) {
        console.error("Firestore not initialized.");
        setIsFirebaseConnected(false);
        return;
    }
      const dateString = date.toISOString(); // Get string representation

      const isCurrentlyHoliday = holidays.some(holiday => isEqual(holiday, date));

      let updatedHolidays: Date[];
      if (isCurrentlyHoliday) {
          updatedHolidays = holidays.filter(holiday => !isEqual(holiday, date));
      } else {
          updatedHolidays = [...holidays, date];
      }
      await updateDataInFirestore(employees, schedule, SAVED_SCHEDULES_COLLECTION);
      setHolidays(updatedHolidays);

    }, [holidays, employees, schedule, toast]);


  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const datesForTable = useMemo(() => getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth)), [currentMonth]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (filters.employee && emp.id !== parseInt(filters.employee)) return false;
      if (filters.role && emp.defaultRole !== filters.role) return false;
      return true;
    });
  }, [employees, filters]);


  const defaultAvailableRoles = useMemo(() => availableRoles, [])
  const isHolidayFn = useCallback((holidays: Date[], date: Date): boolean => {
    return holidays.some(holiday => isEqual(startOfDay(holiday), startOfDay(date)));
  }, []);


  return (
    <>
      <HeadInformation/>

      <EditEmployeeDialog
        isOpen={editOpen}
        onOpenChange={setEditOpen}
        employee={employeeToDelete ? employees.find(e => e.id === employeeToDelete) ?? null : employeeToEdit}
        onSave={(employeeData) => {
          if (!employeeData.id) {
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
                        Tem certeza que deseja remover este colaborador? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setEmployeeToDelete(null)} asChild>
                      <Button variant="outline">Cancelar</Button>
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                         if (employeeToDelete) {
                           const updatedEmployees = employees.filter(emp => emp.id !== employeeToDelete);
                           await updateDataInFirestore(updatedEmployees, schedule, SAVED_SCHEDULES_COLLECTION);
                           setEmployees(updatedEmployees);
                            setSchedule(prevSchedule => {
                               const newSchedule = { ...prevSchedule };
                               Object.keys(newSchedule).forEach(key => {
                                  if (key.startsWith(`${employeeToDelete}-`)) {
                                      delete newSchedule[key];
                                  }
                               });
                               return newSchedule;
                           });
                            setEmployeeToDelete(null);
                           toast({ title: "Sucesso", description: "Colaborador removido." });
                         }
                    }} asChild>
                       <Button variant="destructive">Remover</Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>


      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-primary text-center sm:text-left">
              ShiftMaster
          </h1>
          <div className="flex items-center space-x-2 sm:space-x-4 flex-wrap gap-1 justify-center sm:justify-end">
             <Button variant="outline" size="sm" onClick={() => { if (isClient) window.location.reload(); }}><Icons.reload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Reset Escala</Button>
              <Button variant="outline" size="sm" onClick={generatePdf}><Icons.document className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Gerar PDF (Mês)</Button>
              <Button variant="outline" size="sm" onClick={generateDailyWhatsAppText}><Icons.whatsapp className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> WhatsApp (Dia)</Button>
              <Button size="sm" onClick={() => setEditOpen(true)}><Icons.userPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Adicionar</Button>
              {isFirebaseConnected === false && (
                 <TooltipProvider delayDuration={100}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive">
                                <WifiOff className="h-5 w-5 text-destructive" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="p-1 bg-destructive text-destructive-foreground">
                            Verifique a configuração do Firebase.
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
         <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addDays(currentMonth, -1))}>Mês Ant.</Button>
         <span className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
         <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addDays(currentMonth, 1))}>Próx. Mês</Button>
       </div>

        <div className="flex-grow overflow-auto border rounded-lg shadow-md bg-card">
          <ShiftTable
            employees={filteredEmployees}
            schedule={schedule}
            dates={datesForTable}
            holidays={holidays}
            onShiftChange={handleShiftChange}
            onDetailChange={handleDetailChange}
            onEditEmployee={setEmployeeToEdit}
            onDeleteEmployee={deleteEmployee}
            onToggleHoliday={handleToggleHoliday}
          />
        </div>


      {showEasterEgg && (
        <div className="absolute bottom-4 right-4">
          <img src="https://picsum.photos/100/100" alt="Easter Egg" width={100} height={100} />
        </div>
      )}
      <Toaster />
    </>
  );
}
