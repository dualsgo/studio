

import { addDays, format, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Employee, ScheduleData, ShiftCode, FilterState, DayOfWeek, ShiftType, ScheduleEntry } from './types'; // Added ScheduleEntry
import { shiftTypeToHoursMap, daysOfWeek, availableRoles, availableShiftTypes, roleToEmojiMap as defaultRoleToEmojiMap } from './types'; // Import maps and constants

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
    date: Date,
    employees: Employee[],
    schedule: ScheduleData,
    roleToEmojiMap: Record<string, string> = defaultRoleToEmojiMap // Use imported default map
): string {
    if (!date || isNaN(date.getTime())) {
        return "*Erro: Data inválida selecionada.*";
    }

    // Capitalize the first letter of the day name
    const dayName = format(date, 'EEEE', { locale: ptBR });
    const capitalizedDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    const formattedDate = format(date, `dd 'de' MMMM`, { locale: ptBR }); // e.g., 07 de maio

    let text = `📅 *Escala - ${capitalizedDayName}, ${formattedDate}*\n\n`;

    // Group employees by shift type and then by role
    const shifts: { [key in ShiftType | 'Especial']?: { [role: string]: ScheduleEntry & { name: string }[] } } = {};
    let hasAnyWorkShift = false;

    employees.forEach(emp => {
        const key = getScheduleKey(emp.id, date);
        const entry = schedule[key];

        if (entry && (entry.shift === 'T' || entry.shift === 'H')) {
            hasAnyWorkShift = true;
            const role = entry.role || 'Sem Função';
            const hours = entry.baseHours || 'Sem Horário';

            let shiftType: ShiftType | 'Especial' = 'Nenhum'; // Default

            if (entry.shift === 'H') {
                shiftType = 'Especial';
            } else if (entry.shift === 'T') {
                // Infer shift type from hours if possible (this is an approximation)
                const lowerHours = hours.toLowerCase();
                 if (lowerHours.includes('10h') || lowerHours.includes('11h')) shiftType = 'Abertura';
                 else if (lowerHours.includes('12h') && !lowerHours.includes('22h')) shiftType = 'Intermediário'; // Avoid 12h-22h being Intermediário
                 else if (lowerHours.includes('13h') || lowerHours.includes('14h') || lowerHours.includes('15h') || lowerHours.includes('21h') || lowerHours.includes('22h')) shiftType = 'Fechamento';
                 // If none match, keep 'Nenhum' or handle as 'Outro'/'T'
            }


             // Initialize shift type group if it doesn't exist
            if (!shifts[shiftType]) {
                shifts[shiftType] = {};
            }
            // Initialize role group within the shift type if it doesn't exist
            if (!shifts[shiftType]![role]) {
                shifts[shiftType]![role] = [];
            }

            // Add employee to the group
            shifts[shiftType]![role].push({ ...entry, name: emp.name });
        }
    });

    // Define the order of shifts for display
    const shiftOrder: (ShiftType | 'Especial')[] = ['Abertura', 'Intermediário', 'Fechamento', 'Especial'];

    // Build the text string section by section
    shiftOrder.forEach(shiftType => {
        const roles = shifts[shiftType];
        if (roles && Object.keys(roles).length > 0) {
            // Add shift type header (only if it's not 'Nenhum' and has entries)
            if (shiftType !== 'Nenhum') {
                 // Determine representative hours for the section header (optional, maybe take the first employee's hours)
                 const firstRole = Object.keys(roles)[0];
                 const firstEntry = roles[firstRole]?.[0];
                 const headerHours = firstEntry?.baseHours ? `(${firstEntry.baseHours})` : ''; // Example: (10h às 18h)

                 // Add header: ⏰ Abertura (10h às 18h) or ✨ Horário Especial
                 const headerEmoji = shiftType === 'Especial' ? '✨' : '⏰';
                 const headerName = shiftType === 'Especial' ? 'Horário Especial' : shiftType;
                text += `${headerEmoji} *${headerName}* ${headerHours}\n`;
            }

            // Add employees grouped by role within the shift type
            Object.keys(roles).sort().forEach(role => { // Sort roles alphabetically
                const emoji = roleToEmojiMap[role] || '⚪'; // Get emoji or default
                roles[role].forEach(empEntry => {
                    text += `${emoji} ${role} - ${empEntry.name} - ${empEntry.baseHours || 'N/A'}\n`;
                });
            });
            text += '\n'; // Add space between shift sections
        }
    });

    if (!hasAnyWorkShift) {
        text += "_Ninguém escalado para trabalho neste dia._";
    }

    return text.trim(); // Remove trailing newline
}
