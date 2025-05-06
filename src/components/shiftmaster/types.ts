import { startOfDay } from 'date-fns';

export type ShiftType = 'Abertura' | 'Intermediário' | 'Fechamento' | 'Nenhum';
export type DayOfWeek = "Domingo" | "Segunda" | "Terça" | "Quarta" | "Quinta" | "Sexta" | "Sábado";

export interface Employee {
  id: number;
  name: string;
  fixedDayOff?: DayOfWeek;
  defaultRole?: string;
  defaultShiftType?: ShiftType;
}

export interface ScheduleEntry {
  shift: ShiftCode;
  role: string; // Role is relevant only when shift is 'TRABALHA'
  baseHours: string; // BaseHours is relevant only when shift is 'TRABALHA'
  holidayReason?: string; // Optional reason for FF shift
}

export type ScheduleData = Record<string, ScheduleEntry>;

export interface FilterState {
  employee: string;
  role: string;
  selectedDate: Date;
}

// Define the possible states for a shift cell
export type ShiftCode = 'TRABALHA' | 'FOLGA' | 'FF'; // Trabalha, Folga, Folga Feriado

// Define descriptions for each shift code for legends/tooltips
export const shiftCodeToDescription: Record<ShiftCode, string> = {
  TRABALHA: 'Trabalha',
  FOLGA: 'Folga',
  FF: 'Folga Feriado',
};

// Define the available shift codes that can be cycled or assigned
// Note: Direct cycling in ShiftCell is only T <-> F. FF is set via popover.
export const availableShiftCodes: ShiftCode[] = ['TRABALHA', 'FOLGA', 'FF'];

// --- Time Mappings (Updated Format: Xh às Yh) ---

// Note: ShiftType (Abertura, etc.) is mainly used for *default* hour assignment.
// The actual hours selected in the popover might vary based on the day's options.

export const shiftTypeToHoursMap: Record<ShiftType, string> = {
    'Abertura': '10h às 18h',
    'Intermediário': '12h às 20h',
    'Fechamento': '14h às 22h',
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

export function getTimeOptionsForDate(date: Date, isHoliday: boolean): string[] {
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  if (isHoliday) {
    // Return holiday options
    return Object.values(holidayTimes).flat();
  } else {
    switch (day) {
      case 0: // Sunday
        return Object.values(sundayTimes).flat();
      case 5: // Friday
      case 6: // Saturday
        return Object.values(fridaySaturdayTimes).flat();
      default: // Monday to Thursday
        return Object.values(mondayThursdayTimes).flat();
    }
  }
}

// Define a unique, non-empty value for "None" options in Select
// Moved from EditEmployeeDialog.tsx for broader use
export const SELECT_NONE_VALUE = "--none--";

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
