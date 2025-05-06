import { addDays, format, startOfDay } from 'date-fns';
import type { Employee, ScheduleData, ShiftCode, FilterState } from './types';

// Define type without 'store' for initial filters
type InitialFilterState = Omit<FilterState, 'store'>;

// Function to generate a range of dates
export function getDatesInRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  let currentDate = startOfDay(startDate);
  const finalDate = startOfDay(endDate);

  if (isNaN(currentDate.getTime()) || isNaN(finalDate.getTime())) {
      console.error("Invalid start or end date provided to getDatesInRange");
      // Return a default range, e.g., today for 7 days
      currentDate = startOfDay(new Date());
      const defaultEndDate = addDays(currentDate, 6);
      while (currentDate <= defaultEndDate) {
          dates.push(new Date(currentDate));
          currentDate = addDays(currentDate, 1);
      }
      return dates;
  }


  while (currentDate <= finalDate) {
    dates.push(new Date(currentDate)); // Create a new Date object instance
     // Ensure we don't get stuck in an infinite loop if dates are weird
    if (dates.length > 366) { // Limit to roughly a year's worth of days
        console.warn("getDatesInRange exceeded 366 days, breaking loop.");
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
        // Handle invalid date, maybe return a default key or throw error
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        return `${employeeId}-${todayStr}-invalidDate`;
    }
  return `${employeeId}-${format(date, 'yyyy-MM-dd')}`;
}


// Function to generate some initial data for demonstration
export function generateInitialData(): {
  initialEmployees: Employee[];
  initialSchedule: ScheduleData;
  initialFilters: InitialFilterState; // Use the type without 'store'
} {
  const initialEmployees: Employee[] = [
    // Store property removed from employee definitions
    { id: 1, name: 'Alice Silva', baseRole: 'Vendas', baseHours: '10h–18h', fixedDayOff: 'Segunda' },
    { id: 2, name: 'Bruno Costa', baseRole: 'Caixa', baseHours: '12h–20h' },
    { id: 3, name: 'Carla Dias', baseRole: 'Estoque', baseHours: '14h–22h', fixedDayOff: 'Quarta' },
    { id: 4, name: 'Daniel Souza', baseRole: 'Fiscal', baseHours: '10h–18h' },
    { id: 5, name: 'Eduarda Lima', baseRole: 'Pacote', baseHours: '12h–20h' },
    { id: 6, name: 'Fábio Mendes', baseRole: 'Organização', baseHours: '14h–22h' },
    { id: 7, name: 'Gabriela Rocha', baseRole: 'Vendas', baseHours: '10h–18h', fixedDayOff: 'Domingo' },
    { id: 8, name: 'Hugo Pereira', baseRole: 'Caixa', baseHours: '12h–20h' },
  ];

  const initialSchedule: ScheduleData = {};
  const today = new Date();
  const initialFilters: InitialFilterState = {
      // store property removed
      employee: '',
      role: '',
      startDate: today,
      endDate: addDays(today, 6),
  };

  // Populate some initial schedule data for the next week
  initialEmployees.forEach(emp => {
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const key = getScheduleKey(emp.id, date);
      // Simple initial assignment (e.g., work Mon-Fri, off Sat/Sun)
      // Respect Fixed Day Off
      const dayOfWeek = date.getDay();
      const fixedDayMapping: { [key: string]: number } = { "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6 };
      const fixedDayNum = fixedDayMapping[emp.fixedDayOff || ""];
      let shift: ShiftCode = 'D'; // Default to Disponible

       if (fixedDayNum !== undefined && dayOfWeek === fixedDayNum) {
           shift = 'F'; // Assign Folga on fixed day off
       } else if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Example: Work weekdays
            shift = 'T';
       } else {
            shift = 'F'; // Example: Off weekends
       }


      // Assign initial shift respecting fixed day off
       initialSchedule[key] = {
         shift: shift,
         role: emp.baseRole,
         baseHours: emp.baseHours,
       };
    }
  });


  return { initialEmployees, initialSchedule, initialFilters };
}
