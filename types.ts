
export type ShiftType = 'T' | 'F' | 'FF' | 'FE' | 'C'; // Trabalho, Folga, Feriado, Férias, Curso

export interface Employee {
  id: string;
  name: string;
  isYoungApprentice: boolean;
  courseDay?: string; // e.g. 'Segunda-feira'
  status: 'active' | 'inactive';
  statusColor: string;
  shifts: Record<string, ShiftType[]>; // Keyed by "YYYY-MM"
  dailyHours: Record<string, string[]>; // Keyed by "YYYY-MM", stores specific hours per day
  dailyShiftNames?: Record<string, string[]>; // Keyed by "YYYY-MM", stores specific shift name per day
  dailyRoles?: Record<string, string[]>; // Keyed by "YYYY-MM", stores specific role per day (e.g. Caixa, Vendedor)
  workPeriod: string; // Default work period
  preferredDayOff: string;
  shiftName: string;
  vacationStart?: string; // YYYY-MM-DD
  vacationEnd?: string;   // YYYY-MM-DD
}

export interface ComplianceAlert {
  id: string;
  type: 'danger' | 'warning' | 'info';
  title: string;
  description: string;
}

export interface CoverageStat {
  label: string;
  value: string;
  total: string;
  change?: string;
  status: 'optimal' | 'warning' | 'danger';
  icon: string;
}

export interface MonthYear {
  month: number; // 0-11
  year: number;
}
