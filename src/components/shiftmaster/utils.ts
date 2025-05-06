
import { addDays, format, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Employee, ScheduleData, ShiftCode, FilterState, DayOfWeek, ShiftType, ScheduleEntry } from './types';
import { shiftTypeToHoursMap, daysOfWeek, availableRoles, availableShiftTypes, roleToEmojiMap as defaultRoleToEmojiMap, getTimeOptionsForDate } from './types'; // Import updated types and utils

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
   // Example: if (today.getMonth() === 0) initialHolidays.push(new Date(today.getFullYear(), 0, 1));

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

      // Default to Folga (F)
      let shift: ShiftCode = 'F';
      let role = '';
      let baseHours = '';

      // If it's not a fixed day off, check if we should set to Trabalha (T) based on defaults
      if (!isFixedDayOff && emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
            shift = 'T';
            role = emp.defaultRole;
            // Determine appropriate default hours based on day (assuming not holiday initially)
            const dayOptions = getTimeOptionsForDate(date, false); // Assume not holiday for initial fill
            const defaultBase = shiftTypeToHoursMap[emp.defaultShiftType];
             // Try to use the standard default, otherwise the first available option for that day
            baseHours = dayOptions.includes(defaultBase) ? defaultBase : (dayOptions[0] || '');
       }

      initialSchedule[key] = { shift, role, baseHours };
    });
  });

  return { initialEmployees, initialSchedule, initialFilters, initialHolidays };
}


// Helper function to generate WhatsApp text for a specific date
export function generateWhatsAppText(
    date: Date,
    employees: Employee[],
    schedule: ScheduleData,
    isHoliday: boolean, // Pass holiday status
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
    const folgas: { code: ShiftCode; name: string }[] = [];
    let hasAnyWorkShift = false;

    employees.forEach(emp => {
        const key = getScheduleKey(emp.id, date);
        const entry = schedule[key];

        if (!entry || entry.shift === 'F' || entry.shift === 'FF') {
            folgas.push({ code: entry?.shift || 'F', name: emp.name });
        } else if (entry.shift === 'T') {
            hasAnyWorkShift = true;
            const role = entry.role || 'S/Função';
            const hours = entry.baseHours || 'S/Horário';
            let inferredShiftType: ShiftType | 'Outro' = 'Outro'; // Default to 'Outro'

            // Basic inference logic based on typical start/end times
            const lowerHours = hours.toLowerCase().replace('h', ''); // Normalize for comparison
            if (lowerHours.startsWith('10') || lowerHours.startsWith('11') || (lowerHours.startsWith('12') && isHoliday)) inferredShiftType = 'Abertura';
            else if (lowerHours.startsWith('12') && !lowerHours.endsWith('22') && !isHoliday) inferredShiftType = 'Intermediário'; // Normal Intermediário
            else if (lowerHours.endsWith('20') || lowerHours.endsWith('21') || lowerHours.endsWith('22') || (lowerHours.startsWith('13') && isHoliday)) inferredShiftType = 'Fechamento';

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
             // Determine representative hours for the section header (take first non-empty hour)
             let headerHours = '';
             outerLoop: for (const role in roles) {
                 for (const empEntry of roles[role]) {
                     if (empEntry.hours && empEntry.hours !== 'S/Horário') {
                         headerHours = `(${empEntry.hours})`;
                         break outerLoop;
                     }
                 }
             }

             const headerEmoji = shiftType === 'Abertura' ? '☀️' : shiftType === 'Intermediário' ? '⏱️' : shiftType === 'Fechamento' ? '🌙' : '⏰';
             const headerName = shiftType;
             text += `${headerEmoji} *${headerName}* ${headerHours}\n`;

            Object.keys(roles).sort().forEach(role => {
                const emoji = roleToEmojiMap[role] || '⚪';
                // Sort employees within the role by name
                roles[role].sort((a, b) => a.name.localeCompare(b.name)).forEach(empEntry => {
                    text += `${emoji} ${role} - ${empEntry.name} ${empEntry.hours !== 'S/Horário' ? `- ${empEntry.hours}` : ''}\n`;
                });
            });
            text += '\n';
        }
    });

     // Add Folgas section if any
     if (folgas.length > 0) {
         text += `🛌 *Folgas*\n`;
         // Sort folgas by name
         folgas.sort((a,b) => a.name.localeCompare(b.name)).forEach(folga => {
             const folgaType = folga.code === 'FF' ? ' (Feriado)' : '';
             text += `😴 ${folga.name}${folgaType}\n`;
         });
         text += '\n';
     }


    if (!hasAnyWorkShift && folgas.length === 0) {
        text += "_Nenhuma informação de escala para este dia._";
    }

    return text.trim();
}
