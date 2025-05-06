import { addDays, format as formatDate, startOfDay, startOfMonth, endOfMonth, isEqual } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Employee, ScheduleData, ShiftCode, FilterState, DayOfWeek, ShiftType, ScheduleEntry } from './types';
import { daysOfWeek, roleToEmojiMap as defaultRoleToEmojiMap, shiftCodeToDescription, getTimeOptionsForDate, SELECT_NONE_VALUE } from './types'; // Import daysOfWeek and other needed types/constants

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
        const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
        return `${employeeId}-${todayStr}-invalidDate`;
    }
  return `${employeeId}-${formatDate(date, 'yyyy-MM-dd')}`;
}

// Helper function to check if a date is a holiday (used only for initial data generation)
const isInitialHoliday = (date: Date, initialHolidays: Date[]): boolean => {
    const dateStart = startOfDay(date);
    return initialHolidays.some(h => isEqual(h, dateStart));
};


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
    { id: 6, name: 'Fábio Mendes', fixedDayOff: 'Sexta', defaultRole: 'Organização', defaultShiftType: 'Intermediário'},
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


  initialEmployees.forEach(emp => {
    datesForMonth.forEach(date => {
      const key = getScheduleKey(emp.id, date);
      const dayOfWeek = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const isFixedDayOff = emp.fixedDayOff && dayOfWeek === fixedDayMapping[emp.fixedDayOff];
      const dayIsHoliday = isInitialHoliday(date, initialHolidays); // Check against initial holidays

      // Default entry structure
      let entry: ScheduleEntry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined }; // Default to FOLGA

      // If it's a fixed day off, it remains FOLGA
      if (isFixedDayOff) {
          entry.shift = 'FOLGA';
      }
      // Otherwise, if not fixed day off, check if they have a default TRABALHA schedule
      else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
            entry.shift = 'TRABALHA';
            entry.role = emp.defaultRole;
            // Determine appropriate default hours based on day AND if it's a holiday
            const dayOptions = getTimeOptionsForDate(date, dayIsHoliday);
            // const defaultBase = shiftTypeToHoursMap[emp.defaultShiftType]; // shiftTypeToHoursMap moved to types.ts
             let defaultHour = ''; // Start with no specific hour
              if (emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                  const basicDefault = shiftTypeToHoursMap[emp.defaultShiftType] || ''; // Get the basic default hour string
                  if (dayOptions.includes(basicDefault)) { // Check if it's valid for the day
                      defaultHour = basicDefault;
                  }
              }
              // If no valid default hour was found or set, use the first available option
              if (!defaultHour && dayOptions.length > 0) {
                  defaultHour = dayOptions[0];
              }
              entry.baseHours = defaultHour;
       }
      // If it's a holiday and the shift is currently FOLGA (not fixed, no default T),
      // set it to FF.
      if (dayIsHoliday && entry.shift === 'FOLGA') {
           entry.shift = 'FF';
           // Optional: Set a generic holiday reason or leave it empty for manual input
           entry.holidayReason = 'Feriado';
      }

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

    const dayName = formatDate(date, 'EEEE', { locale: ptBR });
    const capitalizedDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    const formattedDate = formatDate(date, "dd 'de' MMMM", { locale: ptBR });

    let text = `📅 *Escala - ${capitalizedDayName}, ${formattedDate}${isHoliday ? ' (Feriado)' : ''}*\n\n`;

    // Group employees by shift type inferred from hours, then by role
    const shifts: { [key in ShiftType | 'Outro']?: { [role: string]: { name: string; hours: string }[] } } = {};
    const folgas: { code: ShiftCode; name: string; reason?: string }[] = [];
    let hasAnyWorkShift = false;

    employees.forEach(emp => {
        const key = getScheduleKey(emp.id, date);
        const entry = schedule[key];

        if (!entry || entry.shift === 'FOLGA' || entry.shift === 'FF') {
            // Ensure entry exists for FF reason
            folgas.push({
                code: entry?.shift || 'FOLGA', // Default to FOLGA if no entry
                name: emp.name,
                reason: entry?.shift === 'FF' ? entry.holidayReason : undefined
            });
        } else if (entry.shift === 'TRABALHA') {
            hasAnyWorkShift = true;
            const role = entry.role || 'S/Função';
            const hours = entry.baseHours || 'S/Horário';
            let inferredShiftType: ShiftType | 'Outro' = 'Outro'; // Default to 'Outro'

            // Infer shift type based on typical start/end times
            const lowerHours = hours.toLowerCase().replace(/h/g, ''); // Remove 'h' for easier parsing

            if (lowerHours.startsWith('10') || lowerHours.startsWith('11') || (lowerHours.startsWith('12') && (isHoliday || date.getDay() === 0))) inferredShiftType = 'Abertura';
            else if (lowerHours.startsWith('12') && !lowerHours.includes(' às 22') && !isHoliday && date.getDay() !== 0 && date.getDay() !== 5 && date.getDay() !== 6) inferredShiftType = 'Intermediário'; // Added more specific condition for Intermediario
            else if (lowerHours.includes(' às 20') || lowerHours.includes(' às 21') || lowerHours.includes(' às 22')) inferredShiftType = 'Fechamento';


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

            const headerEmoji = shiftType === 'Abertura' ? '☀️' : shiftType === 'Intermediário' ? '⏱️' : shiftType === 'Fechamento' ? '🌙' : '⏰';
             // Use a display name that makes sense, default to 'Turno' if it's 'Outro' and others exist
            let displayShiftTypeName = shiftType !== 'Outro' ? shiftType : (Object.keys(shifts).filter(k => k !== 'Outro' && shifts[k as keyof typeof shifts] && Object.keys(shifts[k as keyof typeof shifts]!).length > 0).length > 0 ? 'Turno' : '');

            // Only add header if there's a name (prevents empty 'Outro' header sometimes)
             if (displayShiftTypeName) {
                text += `${headerEmoji} *${displayShiftTypeName}${representativeHour ? ` (${representativeHour})` : ''}*\n`;
            }

            Object.keys(roles).sort().forEach(role => {
                const emoji = roleToEmojiMap[role] || '⚪';
                roles[role].sort((a, b) => a.name.localeCompare(b.name)).forEach(empEntry => {
                    text += `${emoji} ${role} - ${empEntry.name}${empEntry.hours && empEntry.hours !== 'S/Horário' ? ` - ${empEntry.hours}` : ''}\n`;
                });
            });
            text += '\n'; // Add space after each shift type block
        }
    });

     // Add Folgas section if any
     if (folgas.length > 0) {
         text += `🛌 *${shiftCodeToDescription['FOLGA']}s*\n`; // Use description from map
         // Sort folgas by name
         folgas.sort((a,b) => a.name.localeCompare(b.name)).forEach(folga => {
             // Use description for FF as well
             const folgaType = folga.code === 'FF' ? ` (${folga.reason || shiftCodeToDescription['FF']})` : '';
             text += `😴 ${folga.name}${folgaType}\n`;
         });
         text += '\n';
     }


    if (!hasAnyWorkShift && folgas.length === 0) {
        text += "_Nenhuma informação de escala para este dia._";
    }

    return text.trim(); // Remove trailing newline
}
