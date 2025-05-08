import { addDays, format as formatDate, startOfDay, startOfMonth, endOfMonth, isEqual } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type ShiftType = 'Abertura' | 'Intermediário' | 'Fechamento' | 'Nenhum';
export type DayOfWeek = "Domingo" | "Segunda" | "Terça" | "Quarta" | "Quinta" | "Sexta" | "Sábado";
export type SortOrder = 'default' | 'asc' | 'desc'; // Add SortOrder type

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
  selectedDate: Date | null; // Allow null for initial state
}

// Define the possible states for a shift cell
export type ShiftCode = 'TRABALHA' | 'FOLGA' | 'FF'; // Trabalha, Folga, Folga Feriado

// Define descriptions (abbreviations) for each shift code for display
export const shiftCodeToDescription: Record<ShiftCode, string> = {
  TRABALHA: 'T',
  FOLGA: 'F',
  FF: 'FF',
};

// Define the available shift codes that can be cycled or assigned
// Note: Direct cycling in ShiftCell is only T <-> F. FF is set via popover.
export const availableShiftCodes: ShiftCode[] = ['TRABALHA', 'FOLGA', 'FF'];

// Define a unique, non-empty value for "None" options in Select
export const SELECT_NONE_VALUE = "--none--";

// --- Constants ---
export const daysOfWeek: DayOfWeek[] = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const availableShiftTypes: ShiftType[] = ['Abertura', 'Intermediário', 'Fechamento', 'Nenhum'];
export const availableRoles: string[] = ['Vendas', 'Caixa', 'Estoque', 'Fiscal', 'Pacote', 'Organização', 'Outro'];

export const roleToEmojiMap: Record<string, string> = {
    'Vendas': '🔵', // Blue
    'Caixa': '🔴', // Red
    'Estoque': '🟢', // Green
    'Fiscal': '🟡', // Yellow
    'Pacote': '🟣', // Purple
    'Organização': '🟠', // Orange
    'Outro': '⚪️', // White/Gray
    // Add more roles and their emojis as needed
};

// Color mapping for roles (Tailwind classes and Hex for PDF)
// Using theme variables where possible for consistency
export const roleToColorStyles: Record<string, { bgClass: string; textClass: string; pdfFill: string; pdfText: string }> = {
    'Vendas':      { bgClass: 'bg-primary',       textClass: 'text-primary-foreground',    pdfFill: '#3498db', pdfText: '#ffffff' }, // Primary (Blue)
    'Caixa':       { bgClass: 'bg-destructive',   textClass: 'text-destructive-foreground', pdfFill: '#e74c3c', pdfText: '#ffffff' }, // Destructive (Red)
    'Estoque':     { bgClass: 'bg-[hsl(var(--chart-2))]', textClass: 'text-white',               pdfFill: '#1abc9c', pdfText: '#ffffff' }, // Chart 2 (Teal/Green) - Assume white text
    'Fiscal':      { bgClass: 'bg-[hsl(var(--chart-4))]', textClass: 'text-black',               pdfFill: '#f1c40f', pdfText: '#000000' }, // Chart 4 (Yellow) - Black text
    'Pacote':      { bgClass: 'bg-purple-500',    textClass: 'text-white',                  pdfFill: '#9b59b6', pdfText: '#ffffff' }, // Purple (Needs theme variable or explicit color)
    'Organização': { bgClass: 'bg-[hsl(var(--chart-5))]', textClass: 'text-white',               pdfFill: '#e67e22', pdfText: '#ffffff' }, // Chart 5 (Orange) - Assume white text
    'Outro':       { bgClass: 'bg-muted',         textClass: 'text-muted-foreground',       pdfFill: '#f0f0f0', pdfText: '#555555' }, // Muted (Gray) - Muted text
    // Fallback/Default style if role is not found
    'DEFAULT':     { bgClass: 'bg-background',    textClass: 'text-foreground',           pdfFill: '#ffffff', pdfText: '#000000' },
};

// Function to get styles for a given role, providing fallback
export function getRoleStyles(role: string | undefined | null): { bgClass: string; textClass: string; pdfFill: string; pdfText: string } {
    const validRole = role && availableRoles.includes(role) ? role : 'Outro'; // Default to 'Outro' if invalid/null
    return roleToColorStyles[validRole] || roleToColorStyles['DEFAULT'];
}


// --- Time Mappings (Updated Format: Xh às Yh) ---

// Note: ShiftType (Abertura, etc.) is mainly used for *default* hour assignment.
// The actual hours selected in the popover might vary based on the day's options.

export const shiftTypeToHoursMap: Record<ShiftType | 'Nenhum', string> = {
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

// Function to get available time options based on date and holiday status
export function getTimeOptionsForDate(date: Date, isHoliday: boolean): string[] {
    const dayOfWeek = date.getDay(); // 0 for Sunday, 1 for Monday, etc.
    let options: string[] = [];

    if (isHoliday) {
        options = [
            ...Object.values(holidayTimes.Abertura),
            ...Object.values(holidayTimes.Fechamento),
        ];
    } else {
        switch (dayOfWeek) {
            case 0: // Sunday
                options = [
                    ...Object.values(sundayTimes.Abertura),
                    ...Object.values(sundayTimes.Fechamento),
                ];
                break;
            case 5: // Friday
            case 6: // Saturday
                options = [
                    ...Object.values(fridaySaturdayTimes.Abertura),
                    ...Object.values(fridaySaturdayTimes.Fechamento),
                ];
                break;
            default: // Monday to Thursday
                options = [
                    ...Object.values(mondayThursdayTimes.Abertura),
                    ...Object.values(mondayThursdayTimes.Intermediário),
                    ...Object.values(mondayThursdayTimes.Fechamento),
                ];
                break;
        }
    }
    // Remove duplicates and sort (optional, but good for consistency)
    return [...new Set(options)].sort();
}
