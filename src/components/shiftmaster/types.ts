

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
  startDate: Date;
  endDate: Date;
}

// Map ShiftType to baseHours
export const shiftTypeToHoursMap: Record<ShiftType, string> = {
  'Abertura': '10h–18h',
  'Intermediário': '12h–20h',
  'Fechamento': '14h–22h',
  'Nenhum': '', // No specific hours for 'Nenhum'
};

export const availableRoles = ['Caixa', 'Vendas', 'Estoque', 'Fiscal', 'Pacote', 'Organização', 'Outro']; // Added 'Outro'
export const daysOfWeek: DayOfWeek[] = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const availableShiftTypes: ShiftType[] = ['Abertura', 'Intermediário', 'Fechamento', 'Nenhum'];
