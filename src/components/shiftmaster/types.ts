

// Define the possible states for a shift cell
export type ShiftCode = 'T' | 'F' | 'FF'; // Trabalha, Folga, Folga Feriado

// Define descriptions for each shift code for legends/tooltips
export const shiftCodeToDescription: Record<ShiftCode, string> = {
  T: 'Trabalha',
  F: 'Folga',
  FF: 'Folga Feriado',
};

// Define the available shift codes that can be cycled or assigned
export const availableShiftCodes: ShiftCode[] = ['T', 'F', 'FF'];

// Existing types (keep as is unless modification needed based on new requirements)
export type ShiftType = 'Abertura' | 'Intermediário' | 'Fechamento' | 'Nenhum';
export type DayOfWeek = "Domingo" | "Segunda" | "Terça" | "Quarta" | "Quinta" | "Sexta" | "Sábado";

export interface Employee {
  id: number;
  name: string;
  fixedDayOff?: DayOfWeek | "";
  defaultRole?: string;
  defaultShiftType?: ShiftType;
}

export interface ScheduleEntry {
  shift: ShiftCode;
  role: string; // Role is relevant only when shift is 'T'
  baseHours: string; // BaseHours is relevant only when shift is 'T'
}

export type ScheduleData = Record<string, ScheduleEntry>;

export interface FilterState {
  employee: string;
  role: string;
  selectedDate: Date;
}

// --- Time Mappings (Updated Format: Xh às Yh) ---

// Note: ShiftType (Abertura, etc.) is mainly used for *default* hour assignment.
// The actual hours selected in the popover might vary based on the day's options.
export const shiftTypeToHoursMap: Record<ShiftType, string> = {
  'Abertura': '10h às 18h', // Example default, may vary by day
  'Intermediário': '12h às 20h', // Example default, may vary by day
  'Fechamento': '14h às 22h', // Example default, may vary by day
  'Nenhum': '',
};

// Specific time options based on day type
export const mondayThursdayTimes = {
    'Abertura': ['10h às 18h'],
    'Intermediário': ['12h às 20h'],
    'Fechamento': ['14h às 22h'],
};

export const fridaySaturdayTimes = {
    'Abertura': ['10h às 18h', '10h às 19h', '10h às 20h'],
    'Fechamento': ['11h às 21h', '12h às 22h', '13h às 22h'],
};

export const sundayTimes = {
    'Abertura': ['12h às 20h'],
    'Fechamento': ['13h às 21h'],
};

export const holidayTimes = {
    'Abertura': ['12h às 18h', '13h às 19h'],
    'Fechamento': ['14h às 20h', '15h às 21h'],
};

// Function to get available times based on date and holiday status
export const getTimeOptionsForDate = (date: Date, isHoliday: boolean): string[] => {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        console.warn("Invalid date passed to getTimeOptionsForDate. Returning default times.");
        return [...mondayThursdayTimes.Abertura, ...mondayThursdayTimes.Intermediário, ...mondayThursdayTimes.Fechamento];
    }

    if (isHoliday) {
        return [...holidayTimes.Abertura, ...holidayTimes.Fechamento];
    }

    const dayOfWeek = date.getDay(); // 0 = Sunday, ..., 6 = Saturday

    switch (dayOfWeek) {
        case 0: // Sunday
            return [...sundayTimes.Abertura, ...sundayTimes.Fechamento];
        case 5: // Friday
        case 6: // Saturday
            // Combine Abertura and Fechamento for Friday/Saturday
            return [...fridaySaturdayTimes.Abertura, ...fridaySaturdayTimes.Fechamento];
        case 1: // Monday
        case 2: // Tuesday
        case 3: // Wednesday
        case 4: // Thursday
        default:
            // Combine all three for Monday-Thursday
            return [...mondayThursdayTimes.Abertura, ...mondayThursdayTimes.Intermediário, ...mondayThursdayTimes.Fechamento];
    }
};

// --- Constants ---

export const roleToEmojiMap: Record<string, string> = {
    'Caixa': '🔴',
    'Vendas': '🔵',
    'Estoque': '⚫',
    'Fiscal': '🟣',
    'Pacote': '🟢',
    'Organização': '🟡',
    'Outro': '⚪',
};

export const availableRoles = ['Caixa', 'Vendas', 'Estoque', 'Fiscal', 'Pacote', 'Organização', 'Outro'];
export const daysOfWeek: DayOfWeek[] = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const availableShiftTypes: ShiftType[] = ['Abertura', 'Intermediário', 'Fechamento', 'Nenhum'];
