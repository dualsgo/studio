
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftFilters } from './ShiftFilters';
import { ShiftTable } from './ShiftTable';
import type { Employee, ScheduleData, FilterState, ShiftCode, DayOfWeek, ShiftType } from './types';
import { generateInitialData, getScheduleKey, generateWhatsAppText, getDatesInRange } from './utils';
import { useToast } from "@/hooks/use-toast";
import { isBefore, parseISO, differenceInDays, addDays, format, startOfMonth, endOfMonth } from 'date-fns'; // Added month functions
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { UserPlus, FileText, MessageSquareText, Eraser, RotateCcw } from 'lucide-react'; // Added Eraser and RotateCcw icons
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
import 'jspdf-autotable';

// Extend jsPDF interface for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const STORAGE_KEY = 'shiftMasterSchedule';

// Use the updated FilterState directly
type AppFilterState = FilterState;
type AppPartialFilterState = Partial<AppFilterState>;


export function ShiftMasterApp() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date())); // State to track the displayed month
  const [filters, setFilters] = useState<AppFilterState>({
    employee: '',
    role: '',
    selectedDate: new Date(), // Default selected date is today
  });
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false); // State for reset confirmation

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // --- Data Initialization and Persistence ---
  useEffect(() => {
    setIsClient(true);
    const storedData = localStorage.getItem(STORAGE_KEY);
    let loadedSuccessfully = false;
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        if (parsedData.employees && parsedData.schedule) {
          setEmployees(parsedData.employees);
          const loadedFilters = parsedData.filters || {};
          setFilters({
            employee: loadedFilters.employee || '',
            role: loadedFilters.role || '',
            // Ensure selectedDate is a Date object
            selectedDate: loadedFilters.selectedDate ? parseISO(loadedFilters.selectedDate) : new Date(),
          });
           // Set the current month based on the loaded selectedDate
           setCurrentMonth(startOfMonth(loadedFilters.selectedDate ? parseISO(loadedFilters.selectedDate) : new Date()));
          setSchedule(parsedData.schedule);
          loadedSuccessfully = true;
        }
      } catch (error) {
        console.error("Failed to parse stored schedule data:", error);
        toast({ title: "Erro", description: "Falha ao carregar dados salvos. Redefinindo para o padrão.", variant: "destructive" });
      }
    }

    if (!loadedSuccessfully) {
      initializeDefaultData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const initializeDefaultData = useCallback(() => {
    const { initialEmployees, initialSchedule, initialFilters } = generateInitialData();
    setEmployees(initialEmployees);
    setSchedule(initialSchedule);
    setFilters(initialFilters);
    setCurrentMonth(startOfMonth(initialFilters.selectedDate)); // Set month based on initial filters
    // No need to save here, the effect below will handle it
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (isClient && employees.length > 0) {
      saveToLocalStorage(employees, schedule, filters);
    }
  }, [employees, schedule, filters, isClient]); // Added isClient dependency

   const saveToLocalStorage = (emps: Employee[], sched: ScheduleData, filt: AppFilterState) => {
    if (!isClient) return;
    try {
      // Ensure selectedDate is stringified correctly
      const filtersToStore = {
        ...filt,
        selectedDate: filt.selectedDate?.toISOString(),
      };
      const dataToStore = JSON.stringify({ employees: emps, schedule: sched, filters: filtersToStore });
      localStorage.setItem(STORAGE_KEY, dataToStore);
    } catch (error) {
      console.error("Failed to save schedule data:", error);
      toast({ title: "Erro", description: "Não foi possível salvar as alterações no armazenamento local.", variant: "destructive" });
    }
  };


  // --- Filter Handlers ---

  const handleFilterChange = useCallback((newFilters: AppPartialFilterState) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    // If the selectedDate changes, update the displayed month
    if (newFilters.selectedDate) {
      setCurrentMonth(startOfMonth(newFilters.selectedDate));
    }
  }, []);

  // No separate clear filters button needed for the current setup

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

  const confirmDeleteEmployee = useCallback(() => {
    if (deletingEmployeeId === null) return;
    setEmployees(prev => prev.filter(emp => emp.id !== deletingEmployeeId));
    setSchedule(prev => {
        const newSchedule = { ...prev };
        Object.keys(newSchedule).forEach(key => {
            if (key.startsWith(`${deletingEmployeeId}-`)) {
                delete newSchedule[key];
            }
        });
        return newSchedule;
    });
    toast({ title: "Sucesso", description: "Colaborador removido." });
    setDeletingEmployeeId(null);
  }, [deletingEmployeeId, toast]);

  const handleSaveEmployee = useCallback((employeeData: Employee) => {
      setEmployees(prev => {
          const existingIndex = prev.findIndex(e => e.id === employeeData.id);
          if (existingIndex > -1) {
              const updatedEmployees = [...prev];
              updatedEmployees[existingIndex] = employeeData;
              return updatedEmployees;
          } else {
              const newId = prev.length > 0 ? Math.max(...prev.map(e => e.id)) + 1 : 1;
              return [...prev, { ...employeeData, id: newId }];
          }
      });
      setIsEditDialogOpen(false);
      setEditingEmployee(null);
      toast({ title: "Sucesso", description: `Colaborador ${employeeData.id ? 'atualizado' : 'adicionado'}.` });
  }, [toast]);


  // --- Schedule Management Handlers ---

   const checkFixedDayOff = (employee: Employee, date: Date): boolean => {
    if (!employee.fixedDayOff) return false;
    const dayOfWeek = date.getDay();
    const fixedDayMapping: { [key in DayOfWeek]?: number } = {
        "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6
    };
    const fixedDayNum = fixedDayMapping[employee.fixedDayOff];
    return fixedDayNum !== undefined && dayOfWeek === fixedDayNum;
  };


  const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
    const employee = employees.find(e => e.id === empId);
    if (!employee) return;

    // --- Validation Rules ---
    if (newShift === 'T') {
        if (checkFixedDayOff(employee, date)) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} tem folga fixa neste dia (${employee.fixedDayOff}).`,
                variant: "destructive",
            });
            return;
        }

        const tempSchedule = { ...schedule };
        const key = getScheduleKey(empId, date);
        const existingEntry = schedule[key];
        const role = existingEntry?.role || employee.defaultRole || '';
        const defaultHours = employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum'
                           ? require('./types').shiftTypeToHoursMap[employee.defaultShiftType]
                           : '';
        const baseHours = existingEntry?.baseHours || defaultHours;

         tempSchedule[key] = { shift: newShift, role: role, baseHours: baseHours };

        let consecutiveDays = 0;
        for (let i = 0; i < 7; i++) {
            const checkDate = addDays(date, -i);
            const checkKey = getScheduleKey(empId, checkDate);
            const dayShift = (i === 0) ? tempSchedule[checkKey]?.shift : schedule[checkKey]?.shift;
             if (dayShift === 'T') consecutiveDays++;
             else if (i > 0) break;
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
             let previousConsecutiveSundays = 0;
             for (let k = 1; k <= 3; k++) {
                 const prevSunday = addDays(date, -k * 7);
                 const prevKey = getScheduleKey(empId, prevSunday);
                 if (schedule[prevKey]?.shift === 'T') previousConsecutiveSundays++;
                 else break;
             }
             if (previousConsecutiveSundays >= 3) {
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
      const existingEntry = prev[key];
      const role = existingEntry?.role || employee.defaultRole || '';
       const defaultHours = employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum'
                            ? require('./types').shiftTypeToHoursMap[employee.defaultShiftType]
                            : '';
       const baseHours = existingEntry?.baseHours || defaultHours;

      return {
        ...prev,
        [key]: {
          ...existingEntry,
          shift: newShift,
          role: (newShift === 'T' || newShift === 'H') ? role : '',
          baseHours: (newShift === 'T' || newShift === 'H') ? baseHours : '',
        },
      };
    });
  }, [employees, schedule, toast]);


  const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours', value: string) => {
      setSchedule(prev => {
          const key = getScheduleKey(empId, date);
           const currentEntry = prev[key] || { shift: 'D', role: '', baseHours: '' };
           if (currentEntry.shift !== 'T' && currentEntry.shift !== 'H') {
               toast({
                   title: "Ação Inválida",
                   description: "Só é possível definir Função/Horário para dias de Trabalho (T) ou Horário Especial (H).",
                   variant: "default"
               });
               return prev;
           }
          return { ...prev, [key]: { ...currentEntry, [field]: value } };
      });
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
       let hasMatchingRole = false;
       let currentDate = new Date(monthStart);
       while (currentDate <= monthEnd) {
         const key = getScheduleKey(emp.id, currentDate);
         const daySchedule = schedule[key];
         if (daySchedule && (daySchedule.shift === 'T' || daySchedule.shift === 'H') && daySchedule.role === roleFilter) {
           hasMatchingRole = true;
           break;
         }
         currentDate = addDays(currentDate, 1);
         if (differenceInDays(currentDate, monthStart) > 40) break; // Safety break
       }
       if (!hasMatchingRole) return false;
     }
     return true;
   });
 }, [employees, schedule, filters, currentMonth, isClient]);

  // --- Reset Scale Handler ---
  const handleResetScale = useCallback(() => {
    setIsResetConfirmOpen(true);
  }, []);

  const confirmResetScale = useCallback(() => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const datesForMonth = getDatesInRange(monthStart, monthEnd);
      const newSchedule = { ...schedule }; // Start with existing schedule

      employees.forEach(emp => {
          datesForMonth.forEach(date => {
              const key = getScheduleKey(emp.id, date);
              newSchedule[key] = { shift: 'F', role: '', baseHours: '' }; // Set to Folga
          });
      });

      setSchedule(newSchedule);
      setIsResetConfirmOpen(false);
      toast({ title: "Sucesso", description: `Escala do mês de ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada para 'Folga'.` });
  }, [currentMonth, employees, schedule, toast]);


  // --- PDF & WhatsApp Generation ---

 const generatePdf = useCallback(() => {
     if (!isClient) return;

     const doc = new jsPDF({ orientation: 'landscape' });
     const tableStartDate = startOfMonth(currentMonth);
     const tableEndDate = endOfMonth(currentMonth);
     const datesInRange = getDatesInRange(tableStartDate, tableEndDate);

     doc.setFontSize(18);
     doc.text('ShiftMaster - Escala de Trabalho', 14, 20);
     doc.setFontSize(11);
     doc.setTextColor(100);
     const dateRangeText = `Mês: ${format(tableStartDate, 'MMMM yyyy', { locale: ptBR })}`;
     doc.text(dateRangeText, 14, 28);

     const head = [['Colaborador', ...datesInRange.map(d => format(d, 'EEE dd', { locale: ptBR }))]]; // Shorter date format

     const body = filteredEmployees.map(emp => {
         const row = [emp.name];
         datesInRange.forEach(date => {
             const key = getScheduleKey(emp.id, date);
             const entry = schedule[key];
             let cellText = '-';
             if (entry) {
                 if (entry.shift === 'T') cellText = `${entry.role}\n${entry.baseHours}`;
                 else if (entry.shift === 'H') cellText = `${entry.role}\n${entry.baseHours}\n(H)`;
                 else if (entry.shift === 'F') cellText = 'F'; // Shorten Folga
                 else if (entry.shift === 'D') cellText = 'D'; // Show D for Disponible
             }
             row.push(cellText);
         });
         return row;
     });

     doc.autoTable({
         startY: 35,
         head: head,
         body: body,
         theme: 'grid',
         headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7 },
         styles: { cellPadding: 1, fontSize: 6, valign: 'middle', halign: 'center', minCellHeight: 10 }, // Adjusted padding and font size
         columnStyles: {
             0: { halign: 'left', fontStyle: 'bold', minCellWidth: 25, cellWidth: 'wrap' }, // Employee name column narrower
             // Dynamically set width for date columns if needed, e.g., based on number of days
         },
          didParseCell: function (data) {
             if (data.cell.section === 'body') {
                 const cellText = data.cell.raw?.toString() || '';
                 if (cellText === 'F') {
                     data.cell.styles.fillColor = [220, 220, 220]; // Gray for Folga
                     data.cell.styles.textColor = [100, 100, 100];
                 } else if (cellText.includes('(H)')) {
                      data.cell.styles.fillColor = [52, 152, 219]; // Blue for Special
                      data.cell.styles.textColor = 255;
                 } else if (cellText === 'D') {
                      data.cell.styles.fillColor = [240, 240, 240]; // Lighter gray for Disponible
                      data.cell.styles.textColor = [150, 150, 150];
                 } else if (cellText !== '-') { // Assume Work (T)
                     data.cell.styles.fillColor = [231, 76, 60]; // Red for Work
                     data.cell.styles.textColor = 255;
                 }
                 // Make cell text bold for Work/Special
                  if (cellText.includes('(H)') || (cellText !== '-' && cellText !== 'F' && cellText !== 'D')) {
                      data.cell.styles.fontStyle = 'bold';
                  }
             }
          }
     });

     doc.save(`escala_${format(tableStartDate, 'yyyyMM')}.pdf`);
     toast({ title: "Sucesso", description: "PDF da escala gerado." });

 }, [isClient, currentMonth, filteredEmployees, schedule, toast]); // Depend on currentMonth


  const generateDailyWhatsAppText = useCallback(() => {
      if (!isClient || !filters.selectedDate) {
           toast({ title: "Erro", description: "Selecione uma data para gerar o texto do WhatsApp.", variant: "destructive" });
          return;
      }

      const text = generateWhatsAppText(filters.selectedDate, employees, schedule); // Use selectedDate from filters

      navigator.clipboard.writeText(text).then(() => {
          toast({ title: "Sucesso", description: `Texto da escala de ${format(filters.selectedDate, 'dd/MM/yyyy')} copiado.` });
      }).catch(err => {
          console.error('Failed to copy WhatsApp text: ', err);
          toast({ title: "Erro", description: "Falha ao copiar texto.", variant: "destructive" });
      });

  }, [isClient, filters.selectedDate, employees, schedule, toast]); // Depend on selectedDate


  // --- Render Logic ---

  if (!isClient) {
    return <div className="flex justify-center items-center h-screen"><p>Carregando gerenciador de escalas...</p></div>;
  }

  // Calculate dates for the current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const datesForTable = getDatesInRange(monthStart, monthEnd);


  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col h-screen">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
         <h1 className="text-2xl font-bold text-primary">ShiftMaster – Gerenciador de Escalas</h1>
         <div className="flex items-center space-x-2 flex-wrap gap-2">
            <Button onClick={generatePdf}>
                 <FileText className="mr-2 h-4 w-4" /> Gerar PDF (Mês Atual)
            </Button>
             {/* Updated Button Text */}
            <Button onClick={generateDailyWhatsAppText}>
                <MessageSquareText className="mr-2 h-4 w-4" /> Texto WhatsApp (Dia Sel.)
            </Button>
             <Button onClick={handleAddEmployee}>
                 <UserPlus className="mr-2 h-4 w-4" /> Adicionar Colaborador
             </Button>
              {/* Reset Scale Button */}
             <Button variant="outline" onClick={handleResetScale}>
                <RotateCcw className="mr-2 h-4 w-4" /> Zerar Escala (Mês)
             </Button>
         </div>
      </div>

       <ShiftFilters
         filters={filters}
         employees={employees}
         roles={require('./types').availableRoles}
         onFilterChange={handleFilterChange}
         // onClearFilters removed
      />

      {/* TODO: Add Month Navigation Buttons here */}
       <div className="flex justify-center items-center my-4 space-x-4">
          <Button variant="outline" onClick={() => setCurrentMonth(prev => addDays(startOfMonth(prev), -1))}>Mês Anterior</Button>
          <span className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="outline" onClick={() => setCurrentMonth(prev => addDays(endOfMonth(prev), 1))}>Próximo Mês</Button>
       </div>


      <div ref={tableContainerRef} className="flex-grow overflow-auto mt-4 border rounded-lg shadow-md">
           <ShiftTable
             employees={filteredEmployees}
             schedule={schedule}
             // Pass the calculated dates for the current month
             dates={datesForTable}
             onShiftChange={handleShiftChange}
             onDetailChange={handleDetailChange}
             onEditEmployee={handleEditEmployee}
             onDeleteEmployee={handleDeleteEmployee}
          />
      </div>

       {/* Edit Employee Dialog */}
       <EditEmployeeDialog
           isOpen={isEditDialogOpen}
           onOpenChange={setIsEditDialogOpen}
           employee={editingEmployee}
           onSave={handleSaveEmployee}
       />

       {/* Delete Confirmation Dialog */}
        <AlertDialog open={deletingEmployeeId !== null} onOpenChange={(open) => !open && setDeletingEmployeeId(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                <AlertDialogDescription>
                    Tem certeza que deseja remover "{employees.find(e => e.id === deletingEmployeeId)?.name || ''}"? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeletingEmployeeId(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteEmployee} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Remover
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Reset Scale Confirmation Dialog */}
        <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Zerar Escala</AlertDialogTitle>
                <AlertDialogDescription>
                    Tem certeza que deseja zerar a escala para o mês de {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}?
                    Todos os dias serão definidos como 'Folga' (F). Esta ação não pode ser desfeita.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmResetScale} variant="destructive">
                    Zerar Escala
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
