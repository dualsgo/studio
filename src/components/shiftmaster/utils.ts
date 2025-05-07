import { addDays, format as formatDate, startOfDay, startOfMonth, endOfMonth, isEqual } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Employee, ScheduleData, ShiftCode, FilterState, DayOfWeek, ShiftType, ScheduleEntry } from './types';
import { daysOfWeek, getTimeOptionsForDate, holidayTimes, shiftTypeToHoursMap, roleToEmojiMap as defaultRoleToEmojiMap, shiftCodeToDescription } from './types';


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


// Function to generate initial data - Accepts currentMonth for context
export function generateInitialData(currentMonth: Date): {
  initialEmployees: Employee[];
  initialSchedule: ScheduleData;
  initialFilters: FilterState;
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
  // Use the passed currentMonth to determine the selectedDate for filters
  const initialSelectedDate = new Date(currentMonth); // Could be startOfMonth(currentMonth) or a specific day
  const initialFilters: FilterState = {
      employee: '',
      role: '',
      selectedDate: initialSelectedDate,
  };
   const initialHolidays: Date[] = [];
    if (currentMonth.getMonth() === 11) { 
      initialHolidays.push(startOfDay(new Date(currentMonth.getFullYear(), 11, 25)));
    }
    if (currentMonth.getMonth() === 0) { 
        initialHolidays.push(startOfDay(new Date(currentMonth.getFullYear(), 0, 1)));
    }


  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const datesForMonth = getDatesInRange(monthStart, monthEnd);
  const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
  daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);


  initialEmployees.forEach(emp => {
    datesForMonth.forEach(date => {
      const key = getScheduleKey(emp.id, date);
      const dayOfWeek = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const isFixedDayOff = emp.fixedDayOff && dayOfWeek === fixedDayMapping[emp.fixedDayOff];
      const dayIsHoliday = isInitialHoliday(date, initialHolidays); 

      let entry: ScheduleEntry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };

      if (isFixedDayOff) {
          entry.shift = 'FOLGA';
      }
      else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
            entry.shift = 'TRABALHA';
            entry.role = emp.defaultRole;
            const dayOptions = getTimeOptionsForDate(date, dayIsHoliday);
             let defaultHour = ''; 
              if (emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                  if (dayIsHoliday) {
                     defaultHour = (Object.values(holidayTimes).flat())[0];
                  } else {
                    defaultHour = shiftTypeToHoursMap[emp.defaultShiftType] || ''; 
                  }
                  // Ensure defaultHour is actually one of the valid options for the day
                  if (!dayOptions.includes(defaultHour) && dayOptions.length > 0) {
                      defaultHour = dayOptions[0]; // Fallback to first valid option
                  } else if (!dayOptions.includes(defaultHour)) {
                      defaultHour = ''; // No valid option if dayOptions is empty
                  }
              }
              
              if (!defaultHour && dayOptions.length > 0) {
                  defaultHour = dayOptions[0];
              }
              entry.baseHours = defaultHour;
       }
      if (dayIsHoliday && entry.shift === 'FOLGA') {
           entry.shift = 'FF';
           entry.holidayReason = 'Feriado';
      }

      initialSchedule[key] = entry;
    });
  });

  return { initialEmployees, initialSchedule, initialFilters, initialHolidays };
}


// Helper function to generate WhatsApp text for a specific date
export function generateWhatsAppText(
    date: Date | null, // Allow null for initial state
    employees: Employee[],
    schedule: ScheduleData,
    isHoliday: boolean, 
    roleToEmojiMap: Record<string, string> = defaultRoleToEmojiMap
): string {
    if (!date || isNaN(date.getTime())) {
        return "*Erro: Data inválida selecionada.*";
    }

    const dayName = formatDate(date, 'EEEE', { locale: ptBR });
    const capitalizedDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    const formattedDate = formatDate(date, "dd 'de' MMMM", { locale: ptBR });

    let text = `📅 *Escala - ${capitalizedDayName}, ${formattedDate}${isHoliday ? ' (Feriado)' : ''}*\n\n`;

    const shifts: { [key in ShiftType | 'Outro']?: { [role: string]: { name: string; hours: string }[] } } = {};
    const folgas: { [key in ShiftCode]?: { name: string; reason?: string }[] } = {};
    let hasAnyWorkShift = false;

    employees.forEach(emp => {
        const key = getScheduleKey(emp.id, date);
        const entry = schedule[key];

        if (!entry || entry.shift === 'FOLGA' || entry.shift === 'FF') {
            const shiftType = entry?.shift || 'FOLGA';
            if (!folgas[shiftType]) folgas[shiftType] = [];
            folgas[shiftType]!.push({
                name: emp.name,
                reason: entry?.holidayReason
            });
        } else if (entry.shift === 'TRABALHA') {
            hasAnyWorkShift = true;
            const role = entry.role || 'S/Função';
            const hours = entry.baseHours || 'S/Horário';
            let inferredShiftType: ShiftType | 'Outro' = 'Outro'; 

            const lowerHours = hours.toLowerCase().replace(/h/g, ''); 

            if (lowerHours.startsWith('10') || lowerHours.startsWith('11') || (lowerHours.startsWith('12') && (isHoliday || date.getDay() === 0))) inferredShiftType = 'Abertura';
            else if (lowerHours.startsWith('12') && !lowerHours.includes(' às 22') && !isHoliday && date.getDay() !== 0 && date.getDay() !== 5 && date.getDay() !== 6) inferredShiftType = 'Intermediário'; 
            else if (lowerHours.includes(' às 20') || lowerHours.includes(' às 21') || lowerHours.includes(' às 22')) inferredShiftType = 'Fechamento';


            if (!shifts[inferredShiftType]) shifts[inferredShiftType] = {};
            if (!shifts[inferredShiftType]![role]) shifts[inferredShiftType]![role] = [];

            shifts[inferredShiftType]![role].push({ name: emp.name, hours });
        }
    });

    const shiftOrder: (ShiftType | 'Outro')[] = ['Abertura', 'Intermediário', 'Fechamento', 'Outro'];

    shiftOrder.forEach(shiftType => {
        const roles = shifts[shiftType];
        if (roles && Object.keys(roles).length > 0) {
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
            let displayShiftTypeName = shiftType !== 'Outro' ? shiftType : (Object.keys(shifts).filter(k => k !== 'Outro' && shifts[k as keyof typeof shifts] && Object.keys(shifts[k as keyof typeof shifts]!).length > 0).length > 0 ? 'Turno' : '');
             if (displayShiftTypeName) {
                text += `${headerEmoji} *${displayShiftTypeName}${representativeHour ? ` (${representativeHour})` : ''}*\n`;
            }

            Object.keys(roles).sort().forEach(role => {
                const emoji = roleToEmojiMap[role] || '⚪';
                roles[role].sort((a, b) => a.name.localeCompare(b.name)).forEach(empEntry => {
                    text += `${emoji} ${role} - ${empEntry.name}${empEntry.hours && empEntry.hours !== 'S/Horário' ? ` - ${empEntry.hours}` : ''}\n`;
                });
            });
            text += '\n'; 
        }
    });

     if (Object.keys(folgas).length > 0) {
        for (const shiftKey in folgas) { // Iterate using shiftKey which is ShiftCode
            const folgaType = shiftKey as ShiftCode; // Cast to ShiftCode
            text += `🛌 *${shiftCodeToDescription[folgaType]}s:*\n`;
            folgas[folgaType]!.sort((a, b) => a.name.localeCompare(b.name)).forEach(folga => {
                const reasonText = folgaType === 'FF' ? ` (${folga.reason || 'Feriado'})` : '';
                text += `😴 ${folga.name}${reasonText}\n`;
            });
            text += '\n';
        }
     }


    if (!hasAnyWorkShift && Object.keys(folgas).length === 0) {
        text += "_Nenhuma informação de escala para este dia._";
    }

    return text.trim(); 
}
