

export type ShiftType = 'Abertura' | 'Intermediário' | 'Fechamento' | 'Nenhum'; // Added 'Nenhum' for optional default
export type DayOfWeek = "Domingo" | "Segunda" | "Terça" | "Quarta" | "Quinta" | "Sexta" | "Sábado";

export interface Employee {
  id: number;
  name: string;
  fixedDayOff?: DayOfWeek | ""; // Optional fixed day off, allow empty string for 'None'
  defaultRole?: string; // Optional default role
  defaultShiftType?: ShiftType; // Optional default shift type
}

export type ShiftCode = 'T' | 'F' | 'H' | 'D'; // Trabalha, Folga, Horário Especial, Disponível

export interface ScheduleEntry {
  shift: ShiftCode;
  role: string; // Role is now mandatory within the entry if shift is T/H
  baseHours: string; // BaseHours is now mandatory within the entry if shift is T/H
}

// Schedule data stored as a map: key = "empId-YYYY-MM-DD", value = ScheduleEntry
export type ScheduleData = Record<string, ScheduleEntry>;

export interface FilterState {
  employee: string; // Store employee ID as string for select compatibility
  role: string;
  selectedDate: Date; // Single date selection for WhatsApp and focus
  // startDate and endDate removed
}

// Map ShiftType to baseHours (base mapping, specific day logic might override)
export const shiftTypeToHoursMap: Record<ShiftType, string> = {
  'Abertura': '10h–18h', // Default, overridden by day type
  'Intermediário': '12h–20h', // Default, overridden by day type
  'Fechamento': '14h–22h', // Default, overridden by day type
  'Nenhum': '', // No specific hours for 'Nenhum'
};


// Define specific time options based on day type and shift type concept
export const mondayThursdayTimes = {
    'Abertura': ['10h–18h'],
    'Intermediário': ['12h–20h'],
    'Fechamento': ['14h–22h'],
};

export const fridaySaturdayTimes = {
    'Abertura': ['10h–18h', '10h–19h', '10h–20h'],
    // No Intermediário concept here as per requirement
    'Fechamento': ['11h–21h', '12h–22h', '13h–22h'],
};

export const sundayTimes = {
    'Abertura': ['12h–20h'],
    // No Intermediário concept here
    'Fechamento': ['13h–21h'],
};

export const holidayTimes = {
    'Abertura': ['12h–18h', '13h–19h'],
    // No Intermediário concept here
    'Fechamento': ['14h–20h', '15h–21h'],
};

// Function to get available times based on date and potentially the *intended* shift type (Abertura/Fechamento)
// This might need refinement based on how ShiftCell determines which set of times to show.
export const getTimeOptionsForDate = (date: Date): string[] => {
    const dayOfWeek = date.getDay(); // 0 = Sunday, ..., 6 = Saturday

    // TODO: Add holiday detection logic here.
    // If isHoliday(date), return [...holidayTimes.Abertura, ...holidayTimes.Fechamento];

    if (dayOfWeek === 0) { // Sunday
        return [...sundayTimes.Abertura, ...sundayTimes.Fechamento];
    } else if (dayOfWeek === 5 || dayOfWeek === 6) { // Friday or Saturday
        return [...fridaySaturdayTimes.Abertura, ...fridaySaturdayTimes.Fechamento];
    } else { // Monday to Thursday
        return [...mondayThursdayTimes.Abertura, ...mondayThursdayTimes.Intermediário, ...mondayThursdayTimes.Fechamento];
    }
};


export const availableRoles = ['Caixa', 'Vendas', 'Estoque', 'Fiscal', 'Pacote', 'Organização', 'Outro']; // Added 'Outro'
export const daysOfWeek: DayOfWeek[] = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const availableShiftTypes: ShiftType[] = ['Abertura', 'Intermediário', 'Fechamento', 'Nenhum'];
