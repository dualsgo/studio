
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftFilters } from './ShiftFilters';
import { ShiftTable } from './ShiftTable';
import type { Employee, ScheduleData, FilterState, ShiftCode, DayOfWeek, ShiftType } from './types';
import { generateInitialData, getScheduleKey, generateWhatsAppText } from './utils';
import { useToast } from "@/hooks/use-toast";
import { isAfter, isBefore, parseISO, differenceInDays, addDays, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { UserPlus, FileText, MessageSquareText } from 'lucide-react';
import { EditEmployeeDialog } from './EditEmployeeDialog'; // Import the new dialog
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

// Extend jsPDF interface for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const STORAGE_KEY = 'shiftMasterSchedule';

// Define types without the 'store' property for filters
type AppFilterState = Omit<FilterState, 'store'>;
type AppPartialFilterState = Partial<AppFilterState>;


export function ShiftMasterApp() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [filters, setFilters] = useState<AppFilterState>({
    employee: '',
    role: '',
    startDate: new Date(),
    endDate: addDays(new Date(), 6), // Default to 1 week view
  });
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null);

  // Ref for the table container, might be needed for PDF generation context
  const tableContainerRef = useRef<HTMLDivElement>(null);


  // --- Data Initialization and Persistence ---

  // Load data from localStorage on mount
  useEffect(() => {
    setIsClient(true); // Indicate component has mounted on the client
    const storedData = localStorage.getItem(STORAGE_KEY);
    let loadedSuccessfully = false;
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        if (parsedData.employees && parsedData.schedule) {
          setEmployees(parsedData.employees);
          // Convert date strings back to Date objects for filters
           const { store, ...loadedFilters } = parsedData.filters || {}; // Handle missing filters gracefully
            setFilters({
                employee: loadedFilters.employee || '',
                role: loadedFilters.role || '',
                startDate: loadedFilters.startDate ? parseISO(loadedFilters.startDate) : new Date(),
                endDate: loadedFilters.endDate ? parseISO(loadedFilters.endDate) : addDays(new Date(), 6),
            });
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
  }, [toast]); // Add toast dependency

  const initializeDefaultData = useCallback(() => {
    const { initialEmployees, initialSchedule, initialFilters } = generateInitialData();
    setEmployees(initialEmployees);
    setSchedule(initialSchedule);
    setFilters(initialFilters);
    // No need to save here, the effect below will handle it
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (isClient && employees.length > 0) { // Only save if client-side and data is initialized
      saveToLocalStorage(employees, schedule, filters);
    }
  }, [employees, schedule, filters, isClient]);

  const saveToLocalStorage = (emps: Employee[], sched: ScheduleData, filt: AppFilterState) => {
    if (!isClient) return;
    try {
      // Ensure dates in filters are stringified correctly
      const filtersToStore = {
        ...filt,
        startDate: filt.startDate?.toISOString(),
        endDate: filt.endDate?.toISOString(),
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
    setFilters(prev => {
      const updatedFilters = { ...prev, ...newFilters };
      // Ensure endDate is not before startDate
      if (updatedFilters.endDate && updatedFilters.startDate && isBefore(updatedFilters.endDate, updatedFilters.startDate)) {
        updatedFilters.endDate = updatedFilters.startDate;
        toast({ title: "Aviso", description: "A data final não pode ser anterior à data inicial.", variant: "default" });
      }
      return updatedFilters;
    });
  }, [toast]);

  const handleClearFilters = useCallback(() => {
    const today = new Date();
    setFilters({
      employee: '',
      role: '',
      startDate: today,
      endDate: addDays(today, 6),
    });
  }, []);

  // --- Employee Management Handlers ---

  const handleAddEmployee = useCallback(() => {
    setEditingEmployee(null); // Ensure we are adding, not editing
    setIsEditDialogOpen(true);
  }, []);

  const handleEditEmployee = useCallback((employee: Employee) => {
    setEditingEmployee(employee);
    setIsEditDialogOpen(true);
  }, []);

  const handleDeleteEmployee = useCallback((empId: number) => {
    setDeletingEmployeeId(empId);
    // The AlertDialog trigger will open the confirmation dialog
  }, []);

  const confirmDeleteEmployee = useCallback(() => {
    if (deletingEmployeeId === null) return;

    setEmployees(prev => prev.filter(emp => emp.id !== deletingEmployeeId));
    // Also remove schedule entries for the deleted employee
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
    setDeletingEmployeeId(null); // Close dialog implicitly by resetting state
  }, [deletingEmployeeId, toast]);

  const handleSaveEmployee = useCallback((employeeData: Employee) => {
      setEmployees(prev => {
          const existingIndex = prev.findIndex(e => e.id === employeeData.id);
          if (existingIndex > -1) {
              // Update existing employee
              const updatedEmployees = [...prev];
              updatedEmployees[existingIndex] = employeeData;
              return updatedEmployees;
          } else {
              // Add new employee (assign a new ID)
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
    if (!employee.fixedDayOff) return false; // No fixed day off set
    const dayOfWeek = date.getDay(); // 0 = Sunday, ..., 6 = Saturday
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
        // 1. Check Fixed Day Off
        if (checkFixedDayOff(employee, date)) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} tem folga fixa neste dia (${employee.fixedDayOff}).`,
                variant: "destructive",
            });
            return; // Prevent update
        }

         // Create a temporary schedule state for validation checks
        const tempSchedule = { ...schedule };
        const key = getScheduleKey(empId, date);
         // Use existing details if available, otherwise pull from employee defaults
        const existingEntry = schedule[key];
        const role = existingEntry?.role || employee.defaultRole || '';
        const baseHours = existingEntry?.baseHours || (employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum' ? require('./types').shiftTypeToHoursMap[employee.defaultShiftType] : '');

         tempSchedule[key] = {
             shift: newShift,
             role: role,
             baseHours: baseHours,
         };

        // 2. Check Consecutive Work Days (using temp schedule)
        let consecutiveDays = 0;
        for (let i = 0; i < 7; i++) { // Check up to 6 days back + current day
            const checkDate = addDays(date, -i);
            const checkKey = getScheduleKey(empId, checkDate);
             // Check the temporary schedule for the current date, original schedule for past dates
            const dayShift = (i === 0) ? tempSchedule[checkKey]?.shift : schedule[checkKey]?.shift;
             if (dayShift === 'T') {
                consecutiveDays++;
             } else if (i > 0) { // Stop if a non-work day breaks the streak *before* the current day
                 break;
             }
        }
         if (consecutiveDays > 6) {
            toast({
                title: "Regra Violada",
                description: `${employee.name} não pode trabalhar mais de 6 dias consecutivos.`,
                variant: "destructive",
            });
            return; // Prevent update
        }


        // 3. Check Consecutive Sundays (using original schedule for past Sundays)
         if (date.getDay() === 0) { // Only check if the changed day is a Sunday
             let previousConsecutiveSundays = 0;
             for (let k = 1; k <= 3; k++) { // Check up to 3 Sundays *before* the current one
                 const prevSunday = addDays(date, -k * 7);
                 const prevKey = getScheduleKey(empId, prevSunday);
                 // Use the original schedule for previous days
                 if (schedule[prevKey]?.shift === 'T') {
                     previousConsecutiveSundays++;
                 } else {
                     break; // Streak broken
                 }
             }
             // If already worked 3 consecutive Sundays before this one, cannot work this one.
             if (previousConsecutiveSundays >= 3) {
                 toast({
                     title: "Regra Violada",
                     description: `${employee.name} não pode trabalhar mais de 3 domingos consecutivos.`,
                     variant: "destructive",
                 });
                 return; // Prevent update
             }
         }
    }

    // --- Update Schedule ---
    setSchedule(prev => {
      const key = getScheduleKey(empId, date);
      const existingEntry = prev[key];

       // Use existing role/hours if they exist, otherwise try employee defaults
       const role = existingEntry?.role || employee.defaultRole || '';
       const baseHours = existingEntry?.baseHours || (employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum' ? require('./types').shiftTypeToHoursMap[employee.defaultShiftType] : '');


      return {
        ...prev,
        [key]: {
          ...existingEntry, // Keep any other potential future fields
          shift: newShift,
          // Set role/hours if changing TO T or H, clear if changing AWAY
          role: (newShift === 'T' || newShift === 'H') ? role : '',
          baseHours: (newShift === 'T' || newShift === 'H') ? baseHours : '',
        },
      };
    });
  }, [employees, schedule, toast]);


  // Updated handleDetailChange: Only modifies schedule for a specific date.
  const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours', value: string) => {
      setSchedule(prev => {
          const key = getScheduleKey(empId, date);
           // Get current entry or initialize with 'D' if it doesn't exist
           const currentEntry = prev[key] || { shift: 'D', role: '', baseHours: '' };

           // Only allow setting role/hours if the shift is 'T' or 'H'
           if (currentEntry.shift !== 'T' && currentEntry.shift !== 'H') {
               toast({
                   title: "Ação Inválida",
                   description: "Só é possível definir Função/Horário para dias de Trabalho (T) ou Horário Especial (H). Primeiro altere o estado da célula.",
                   variant: "default"
               });
               return prev; // Return previous state without changes
           }

          return {
              ...prev,
              [key]: {
                  ...currentEntry,
                  [field]: value, // Update the specific field (role or baseHours)
              },
          };
      });
  }, [toast]);


  // --- Data Filtering for Display ---
 const filteredEmployees = React.useMemo(() => {
   if (!isClient) return []; // Don't filter until client-side hydration

   const { employee: employeeFilter, role: roleFilter, startDate, endDate } = filters;

   return employees.filter(emp => {
     // Employee ID filter
     if (employeeFilter && emp.id !== parseInt(employeeFilter)) return false;

     // Role filter: Check if the employee *ever* works the selected role in the date range
     if (roleFilter && startDate && endDate) {
       let hasMatchingRole = false;
       let currentDate = new Date(startDate);
       while (currentDate <= endDate) {
         const key = getScheduleKey(emp.id, currentDate);
         const daySchedule = schedule[key];
         if (daySchedule && (daySchedule.shift === 'T' || daySchedule.shift === 'H') && daySchedule.role === roleFilter) {
           hasMatchingRole = true;
           break; // Found a match, no need to check further dates
         }
         currentDate = addDays(currentDate, 1);
         if (differenceInDays(currentDate, startDate) > 366) break; // Safety break
       }
       if (!hasMatchingRole) return false; // If role filter is active and no match found, exclude employee
     }

     // If employee filter passed and role filter passed (or wasn't active), include employee
     return true;
   });
 }, [employees, schedule, filters, isClient]);

 // --- PDF & WhatsApp Generation ---

 const generatePdf = useCallback(() => {
     if (!isClient) return; // Ensure running on client

     const doc = new jsPDF({ orientation: 'landscape' });
     const tableStartDate = filters.startDate || new Date();
     const tableEndDate = filters.endDate || addDays(new Date(), 6);
     const datesInRange = getDatesInRange(tableStartDate, tableEndDate);

     doc.setFontSize(18);
     doc.text('ShiftMaster - Escala de Trabalho', 14, 20);
     doc.setFontSize(11);
     doc.setTextColor(100);
     const dateRangeText = `Período: ${format(tableStartDate, 'dd/MM/yyyy')} - ${format(tableEndDate, 'dd/MM/yyyy')}`;
     doc.text(dateRangeText, 14, 28);

     const head = [['Colaborador', ...datesInRange.map(d => format(d, 'EEE dd/MM', { locale: ptBR }))]];

     const body = filteredEmployees.map(emp => {
         const row = [emp.name];
         datesInRange.forEach(date => {
             const key = getScheduleKey(emp.id, date);
             const entry = schedule[key];
             let cellText = '-'; // Default for D or F
             if (entry) {
                 if (entry.shift === 'T') {
                     cellText = `${entry.role}\n${entry.baseHours}`;
                 } else if (entry.shift === 'H') {
                     cellText = `${entry.role}\n${entry.baseHours}\n(H)`; // Indicate special
                 } else if (entry.shift === 'F') {
                     cellText = 'Folga';
                 }
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
         headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center' },
         styles: { cellPadding: 1.5, fontSize: 8, valign: 'middle', halign: 'center' },
         columnStyles: {
             0: { halign: 'left', fontStyle: 'bold', minCellWidth: 35 }, // Employee name column
         },
         didParseCell: function (data) {
            // Add basic coloring based on content (optional)
            if (data.cell.section === 'body') {
                 const cellText = data.cell.raw?.toString() || '';
                 if (cellText === 'Folga') {
                     data.cell.styles.fillColor = [220, 220, 220]; // Light gray for Folga
                     data.cell.styles.textColor = [100, 100, 100];
                 } else if (cellText.includes('(H)')) {
                     data.cell.styles.fillColor = [52, 152, 219]; // Blue for Special (H)
                     data.cell.styles.textColor = 255;
                 } else if (cellText !== '-' && !cellText.includes('Folga')) { // Assume Work (T)
                     data.cell.styles.fillColor = [231, 76, 60]; // Red for Work (T)
                     data.cell.styles.textColor = 255;
                 }
            }
         }
     });

     doc.save(`escala_${format(tableStartDate, 'yyyyMMdd')}_${format(tableEndDate, 'yyyyMMdd')}.pdf`);
     toast({ title: "Sucesso", description: "PDF da escala gerado." });

 }, [isClient, filters.startDate, filters.endDate, filteredEmployees, schedule, toast, ptBR]); // Ensure ptBR locale is correctly imported or handled


  const generateDailyWhatsAppText = useCallback(() => {
      if (!isClient) return;

      const today = new Date(); // Generate for today's date
      const text = generateWhatsAppText(today, employees, schedule);

      // Attempt to copy to clipboard
      navigator.clipboard.writeText(text).then(() => {
          toast({ title: "Sucesso", description: "Texto da escala de hoje copiado para a área de transferência." });
      }).catch(err => {
          console.error('Failed to copy WhatsApp text: ', err);
          toast({ title: "Erro", description: "Falha ao copiar texto. Verifique as permissões do navegador.", variant: "destructive" });
          // Fallback: Maybe display the text in a modal?
      });

      // Note: Directly opening WhatsApp with pre-filled text requires specific URL schemes and user interaction.
      // Copying to clipboard is a more reliable cross-platform approach.

  }, [isClient, employees, schedule, toast]);


  // --- Render Logic ---

  if (!isClient) {
    return <div className="flex justify-center items-center h-screen"><p>Carregando gerenciador de escalas...</p></div>;
  }


  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col h-screen">
      <div className="flex justify-between items-center mb-4">
         <h1 className="text-2xl font-bold text-primary">ShiftMaster – Gerenciador de Escalas</h1>
         <div className="flex items-center space-x-2">
            <Button onClick={generatePdf}>
                 <FileText className="mr-2 h-4 w-4" /> Gerar PDF
            </Button>
            <Button onClick={generateDailyWhatsAppText}>
                <MessageSquareText className="mr-2 h-4 w-4" /> Texto WhatsApp (Hoje)
            </Button>
             <Button onClick={handleAddEmployee}>
                 <UserPlus className="mr-2 h-4 w-4" /> Adicionar Colaborador
             </Button>
         </div>
      </div>

       <ShiftFilters
         filters={filters}
         employees={employees} // Pass all employees to filters for selection
         roles={require('./types').availableRoles} // Use availableRoles from types
         onFilterChange={handleFilterChange}
         onClearFilters={handleClearFilters}
      />

      <div ref={tableContainerRef} className="flex-grow overflow-auto mt-4 border rounded-lg shadow-md">
           <ShiftTable
             employees={filteredEmployees} // Pass filtered employees to table
             schedule={schedule}
             startDate={filters.startDate}
             endDate={filters.endDate}
             onShiftChange={handleShiftChange}
             onDetailChange={handleDetailChange}
             onEditEmployee={handleEditEmployee}
             onDeleteEmployee={handleDeleteEmployee} // Pass delete handler
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
            {/* Trigger is handled programmatically by setting deletingEmployeeId */}
            {/* <AlertDialogTrigger asChild><button className="hidden"></button></AlertDialogTrigger> */}
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                <AlertDialogDescription>
                    Tem certeza que deseja remover o colaborador "{employees.find(e => e.id === deletingEmployeeId)?.name || ''}"?
                    Todas as suas informações de escala também serão removidas. Esta ação não pode ser desfeita.
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

    </div>
  );
}
