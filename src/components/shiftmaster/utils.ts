
import { addDays, format, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Employee, ScheduleData, ShiftCode, FilterState, DayOfWeek, ShiftType, ScheduleEntry } from './types';
import { shiftTypeToHoursMap, daysOfWeek, availableRoles, availableShiftTypes, roleToEmojiMap as defaultRoleToEmojiMap, getTimeOptionsForDate } from './types'; // Import updated types and utils
import { isEqual } from 'date-fns';

type InitialFilterState = FilterState;

// Function to generate a range of dates
export function getDatesInRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  let currentDate = startOfDay(startDate);
  const finalDate = startOfDay(endDate);

  if (isNaN(currentDate.getTime()) || isNaN(finalDate.getTime())) {
      console.error("Invalid start or end date provided to getDatesInRange");
      const today = new Date();
      currentDate = startOfMonth(today);
      const defaultEndDate = endOfMonth(today);
       while (currentDate <= defaultEndDate) {
          dates.push(new Date(currentDate));
          currentDate = addDays(currentDate, 1);
          if (dates.length > 40) break;
      }
      return dates;
  }

  while (currentDate <= finalDate) {
    dates.push(new Date(currentDate));
    if (dates.length > 45) { // Slightly larger safety break
        console.warn("getDatesInRange exceeded 45 days, breaking loop.");
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
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        return `${employeeId}-${todayStr}-invalidDate`;
    }
  return `${employeeId}-${format(date, 'yyyy-MM-dd')}`;
}

// Function to generate initial data
export function generateInitialData(): {
  initialEmployees: Employee[];
  initialSchedule: ScheduleData;
  initialFilters: InitialFilterState;
  initialHolidays: Date[]; // Add initial holidays
} {
  const initialEmployees: Employee[] = [
    { id: 1, name: 'Alice Silva', fixedDayOff: 'Segunda', defaultRole: 'Vendas', defaultShiftType: 'Abertura' },
    { id: 2, name: 'Bruno Costa', defaultRole: 'Caixa', defaultShiftType: 'Intermediário' },
    { id: 3, name: 'Carla Dias', fixedDayOff: 'Quarta', defaultRole: 'Estoque', defaultShiftType: 'Fechamento' },
    { id: 4, name: 'Daniel Souza', defaultRole: 'Fiscal' },
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
      selectedDate: today,
  };
   // Example initial holidays (e.g., New Year's Day if relevant)
   const initialHolidays: Date[] = [];
   // Add logic here to determine holidays for the initial month if needed
   // Example: If current month is December, add Christmas
    if (today.getMonth() === 11) { // December is month 11
      initialHolidays.push(startOfDay(new Date(today.getFullYear(), 11, 25)));
    }
    // Example: Add New Year's Day if January
    if (today.getMonth() === 0) { // January is month 0
        initialHolidays.push(startOfDay(new Date(today.getFullYear(), 0, 1)));
    }


  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const datesForMonth = getDatesInRange(monthStart, monthEnd);
  const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
  daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);

   // Helper function to check if a date is an initial holiday
   const isInitialHoliday = (date: Date): boolean => {
       const dateStart = startOfDay(date);
       return initialHolidays.some(h => isEqual(h, dateStart));
   };


  initialEmployees.forEach(emp => {
    datesForMonth.forEach(date => {
      const key = getScheduleKey(emp.id, date);
      const dayOfWeek = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const isFixedDayOff = emp.fixedDayOff && dayOfWeek === fixedDayMapping[emp.fixedDayOff];
      const dayIsHoliday = isInitialHoliday(date); // Check against initial holidays

      // Default entry structure
      let entry: ScheduleEntry = { shift: 'F', role: '', baseHours: '', holidayReason: undefined };

      // If it's a fixed day off, ensure it's 'F'
      if (isFixedDayOff) {
          entry.shift = 'F';
      }
      // Otherwise, if not fixed day off, determine if 'T' based on defaults
      else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
            entry.shift = 'T';
            entry.role = emp.defaultRole;
            // Determine appropriate default hours based on day AND if it's a holiday
            const dayOptions = getTimeOptionsForDate(date, dayIsHoliday);
            const defaultBase = shiftTypeToHoursMap[emp.defaultShiftType];
             // Try to use the standard default, otherwise the first available option for that day
            entry.baseHours = dayOptions.includes(defaultBase) ? defaultBase : (dayOptions[0] || '');
       }
       // If it's a holiday and the employee would otherwise be 'F' (not fixed, no default T),
       // Consider setting to FF? Or leave as F? Let's leave as F for simplicity, FF can be set manually.
       // if (dayIsHoliday && entry.shift === 'F') {
       //    // Optional: Automatically set to FF?
       //    // entry.shift = 'FF';
       //    // entry.holidayReason = 'Feriado'; // Generic reason
       // }

      initialSchedule[key] = entry;
    });
  });

  return { initialEmployees, initialSchedule, initialFilters, initialHolidays };
}


// Helper function to generate WhatsApp text for a specific date
export function generateWhatsAppText(
    date: Date,
    employees: Employee[],
    schedule: ScheduleData,
    isHoliday: boolean, // Pass holiday status for the day title
    roleToEmojiMap: Record<string, string> = defaultRoleToEmojiMap
): string {
    if (!date || isNaN(date.getTime())) {
        return "*Erro: Data inválida selecionada.*";
    }

    const dayName = format(date, 'EEEE', { locale: ptBR });
    const capitalizedDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    const formattedDate = format(date, `dd 'de' MMMM`, { locale: ptBR });

    let text = `📅 *Escala - ${capitalizedDayName}, ${formattedDate}${isHoliday ? ' (Feriado)' : ''}*\n\n`;

    // Group employees by shift type inferred from hours, then by role
    const shifts: { [key in ShiftType | 'Outro']?: { [role: string]: { name: string; hours: string }[] } } = {};
    const folgas: { code: ShiftCode; name: string; reason?: string }[] = [];
    let hasAnyWorkShift = false;

    employees.forEach(emp => {
        const key = getScheduleKey(emp.id, date);
        const entry = schedule[key];

        if (!entry || entry.shift === 'F' || entry.shift === 'FF') {
            // Ensure entry exists for FF reason
            folgas.push({
                code: entry?.shift || 'F',
                name: emp.name,
                reason: entry?.shift === 'FF' ? entry.holidayReason : undefined
            });
        } else if (entry.shift === 'T') {
            hasAnyWorkShift = true;
            const role = entry.role || 'S/Função';
            const hours = entry.baseHours || 'S/Horário';
            let inferredShiftType: ShiftType | 'Outro' = 'Outro'; // Default to 'Outro'

            // Basic inference logic based on typical start/end times
            // This inference needs to be robust or match how shifts are categorized
            const lowerHours = hours.toLowerCase().replace('h', '');
             if (lowerHours.startsWith('10') || lowerHours.startsWith('11') || (lowerHours.startsWith('12') && (isHoliday || date.getDay() === 0))) inferredShiftType = 'Abertura';
             else if (lowerHours.startsWith('12') && !lowerHours.endsWith('22') && !isHoliday && date.getDay() !== 0) inferredShiftType = 'Intermediário';
             else if (lowerHours.includes('às 20') || lowerHours.includes('às 21') || lowerHours.includes('às 22')) inferredShiftType = 'Fechamento';


            if (!shifts[inferredShiftType]) shifts[inferredShiftType] = {};
            if (!shifts[inferredShiftType]![role]) shifts[inferredShiftType]![role] = [];

            shifts[inferredShiftType]![role].push({ name: emp.name, hours });
        }
    });

    // Order for display: Abertura, Intermediário, Fechamento, Outro
    const shiftOrder: (ShiftType | 'Outro')[] = ['Abertura', 'Intermediário', 'Fechamento', 'Outro'];

    shiftOrder.forEach(shiftType => {
        const roles = shifts[shiftType];
        if (roles && Object.keys(roles).length > 0) {
             // Find a representative hour for the section header (first valid hour)
             let representativeHour = '';
             outerLoop:
             for (const role in roles) {
                for (const empData of roles[role]) {
                    if (empData.hours && empData.hours !== 'S/Horário') {
                        representativeHour = empData.hours;
                        break outerLoop;
                    }
                }
             }

             // Use emojis and formatting similar to the example
             const headerEmoji = shiftType === 'Abertura' ? '☀️' : shiftType === 'Intermediário' ? '⏱️' : shiftType === 'Fechamento' ? '🌙' : '⏰';
             // Display header only if the shift type is not 'Outro' or if 'Outro' is the only one with entries
             const displayShiftType = shiftType !== 'Outro' ? shiftType : (Object.keys(shifts).length === 1 ? 'Turno' : '');

             if (displayShiftType) {
                 text += `${headerEmoji} *${displayShiftType}${representativeHour ? ` (${representativeHour})` : ''}*\n`;
             }


            Object.keys(roles).sort().forEach(role => {
                const emoji = roleToEmojiMap[role] || '⚪';
                // Sort employees within the role by name
                roles[role].sort((a, b) => a.name.localeCompare(b.name)).forEach(empEntry => {
                    // Include role only if different from previous line within same shift type? No, example shows it repeated.
                    text += `${emoji} ${role} - ${empEntry.name}${empEntry.hours && empEntry.hours !== 'S/Horário' ? ` - ${empEntry.hours}` : ''}\n`;
                });
            });
            text += '\n'; // Add space after each shift type block
        }
    });

     // Add Folgas section if any
     if (folgas.length > 0) {
         text += `🛌 *Folgas*\n`;
         // Sort folgas by name
         folgas.sort((a,b) => a.name.localeCompare(b.name)).forEach(folga => {
             const folgaType = folga.code === 'FF' ? (folga.reason ? ` (${folga.reason})` : ' (Feriado)') : '';
             text += `😴 ${folga.name}${folgaType}\n`;
         });
         text += '\n';
     }


    if (!hasAnyWorkShift && folgas.length === 0) {
        text += "_Nenhuma informação de escala para este dia._";
    }

    return text.trim(); // Remove trailing newline
}
