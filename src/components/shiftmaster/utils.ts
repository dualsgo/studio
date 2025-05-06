
import { addDays, format, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Employee, ScheduleData, ShiftCode, FilterState, DayOfWeek, ShiftType } from './types';
import { shiftTypeToHoursMap, daysOfWeek, availableRoles, availableShiftTypes } from './types'; // Import maps and constants

// Define type without 'store' for initial filters (already correct, just ensuring consistency)
type InitialFilterState = FilterState; // Use the updated FilterState directly

// Function to generate a range of dates
export function getDatesInRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  let currentDate = startOfDay(startDate);
  const finalDate = startOfDay(endDate);

  if (isNaN(currentDate.getTime()) || isNaN(finalDate.getTime())) {
      console.error("Invalid start or end date provided to getDatesInRange");
      // Default to current month if dates are invalid
      const today = new Date();
      currentDate = startOfMonth(today);
      const defaultEndDate = endOfMonth(today);
       while (currentDate <= defaultEndDate) {
          dates.push(new Date(currentDate));
          currentDate = addDays(currentDate, 1);
          if (dates.length > 40) break; // Safety break for month view
      }
      return dates;
  }


  while (currentDate <= finalDate) {
    dates.push(new Date(currentDate)); // Create a new Date object instance
     // Ensure we don't get stuck in an infinite loop
    if (dates.length > 40) { // Limit to slightly more than a month
        console.warn("getDatesInRange exceeded 40 days, breaking loop.");
        break;
    }
    currentDate = addDays(currentDate, 1);
  }
  return dates;
}

// Function to create a unique key for the schedule map
export function getScheduleKey(employeeId: number, date: Date): string {
   if (!(date instanceof Date) || isNaN(date.getTime())) {
        console.error("Invalid date provided to getScheduleKey for employee:", employeeId);
        // Handle invalid date, maybe return a default key or throw error
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        return `${employeeId}-${todayStr}-invalidDate`;
    }
  return `${employeeId}-${format(date, 'yyyy-MM-dd')}`;
}


// Function to generate some initial data for demonstration
export function generateInitialData(): {
  initialEmployees: Employee[];
  initialSchedule: ScheduleData;
  initialFilters: InitialFilterState; // Use the updated FilterState
} {
  const initialEmployees: Employee[] = [
    // Base Role and Base Hours properties removed, added defaults
    { id: 1, name: 'Alice Silva', fixedDayOff: 'Segunda', defaultRole: 'Vendas', defaultShiftType: 'Abertura' },
    { id: 2, name: 'Bruno Costa', defaultRole: 'Caixa', defaultShiftType: 'Intermediário' },
    { id: 3, name: 'Carla Dias', fixedDayOff: 'Quarta', defaultRole: 'Estoque', defaultShiftType: 'Fechamento' },
    { id: 4, name: 'Daniel Souza', defaultRole: 'Fiscal' }, // No default shift type
    { id: 5, name: 'Eduarda Lima', defaultRole: 'Pacote', defaultShiftType: 'Abertura' },
    { id: 6, name: 'Fábio Mendes', defaultRole: 'Organização', defaultShiftType: 'Intermediário'},
    { id: 7, name: 'Gabriela Rocha', fixedDayOff: 'Domingo', defaultRole: 'Vendas'},
    { id: 8, name: 'Hugo Pereira', defaultRole: 'Caixa', defaultShiftType: 'Fechamento' },
  ];

  const initialSchedule: ScheduleData = {};
  const today = new Date();
  const initialFilters: InitialFilterState = {
      employee: '',
      role: '',
      selectedDate: today, // Initialize selectedDate to today
      // startDate and endDate removed
  };

  // Populate some initial schedule data for the current month
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const datesForMonth = getDatesInRange(monthStart, monthEnd);


  initialEmployees.forEach(emp => {
    datesForMonth.forEach(date => {
      const key = getScheduleKey(emp.id, date);

      const dayOfWeek = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
       daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index); // Populate mapping

      const fixedDayNum = emp.fixedDayOff ? fixedDayMapping[emp.fixedDayOff] : undefined;
      let shift: ShiftCode = 'D'; // Default to Disponible
      let role = '';
      let baseHours = '';

       if (fixedDayNum !== undefined && dayOfWeek === fixedDayNum) {
           shift = 'F'; // Assign Folga on fixed day off
       } else {
           // Pre-fill with 'T' and default info only if defaults exist
            if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                 shift = 'T';
                 role = emp.defaultRole;
                 // Use the base mapping for initial data, ShiftCell handles specific options
                 baseHours = shiftTypeToHoursMap[emp.defaultShiftType];
             } else {
                 shift = 'D'; // Otherwise, leave as Disponible
             }
       }


      // Assign initial schedule entry
       initialSchedule[key] = {
         shift: shift,
         role: role,
         baseHours: baseHours,
       };
    });
  });


  return { initialEmployees, initialSchedule, initialFilters };
}


// Helper function to generate WhatsApp text for a specific date
export function generateWhatsAppText(
    date: Date, // Takes the specific date as input
    employees: Employee[],
    schedule: ScheduleData
): string {
    if (!date || isNaN(date.getTime())) {
        return "*Erro: Data inválida selecionada.*";
    }
    const formattedDate = format(date, 'EEEE, dd/MM/yyyy', { locale: ptBR });
    let text = `*Escala do Dia: ${formattedDate}*\n\n`;
    let hasEntries = false;

    employees.forEach(emp => {
        const key = getScheduleKey(emp.id, date);
        const entry = schedule[key];

        if (entry && entry.shift === 'T') { // Only include employees working ('T')
            text += `- *${emp.name}:* ${entry.role || 'N/A'} (${entry.baseHours || 'N/A'})\n`;
            hasEntries = true;
        } else if (entry && entry.shift === 'H') { // Also include special hours ('H')
            text += `- *${emp.name}:* ${entry.role || 'N/A'} (${entry.baseHours || 'N/A'}) - *HORÁRIO ESPECIAL*\n`;
            hasEntries = true;
        }
         // Optionally include Folga ('F')
         // else if (entry && entry.shift === 'F') {
         //     text += `- *${emp.name}:* Folga\n`;
         //     hasEntries = true;
         // }
    });

    if (!hasEntries) {
        text += "Ninguém escalado para trabalho neste dia.";
    }

    return text;
}
