
export interface Employee {
  id: number;
  name: string;
  // baseRole and baseHours removed
  fixedDayOff?: "Domingo" | "Segunda" | "Terça" | "Quarta" | "Quinta" | "Sexta" | "Sábado"; // Optional fixed day off
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
