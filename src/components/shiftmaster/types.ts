export interface Employee {
  id: number;
  name: string;
  baseRole: string;
  baseHours: string;
  // store property removed
  fixedDayOff?: "Domingo" | "Segunda" | "Terça" | "Quarta" | "Quinta" | "Sexta" | "Sábado"; // Optional fixed day off
}

export type ShiftCode = 'T' | 'F' | 'H' | 'D'; // Trabalha, Folga, Horário Especial, Disponível

export interface ScheduleEntry {
  shift: ShiftCode;
  role: string;
  baseHours: string;
}

// Schedule data stored as a map: key = "empId-YYYY-MM-DD", value = ScheduleEntry
export type ScheduleData = Record<string, ScheduleEntry>;

export interface FilterState {
  // store property removed
  employee: string; // Store employee ID as string for select compatibility
  role: string;
  startDate: Date;
  endDate: Date;
}
