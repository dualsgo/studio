
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
    // Base Role and Base Hours properties removed
    { id: 1, name: 'Alice Silva', fixedDayOff: 'Segunda' },
    { id: 2, name: 'Bruno Costa' },
    { id: 3, name: 'Carla Dias', fixedDayOff: 'Quarta' },
    { id: 4, name: 'Daniel Souza' },
    { id: 5, name: 'Eduarda Lima' },
    { id: 6, name: 'Fábio Mendes' },
    { id: 7, name: 'Gabriela Rocha', fixedDayOff: 'Domingo' },
    { id: 8, name: 'Hugo Pereira' },
  ];

  const initialSchedule: ScheduleData = {};
  const today = new Date();
  const initialFilters: InitialFilterState = {
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
      let role = ''; // Default empty role
      let baseHours = ''; // Default empty hours

       if (fixedDayNum !== undefined && dayOfWeek === fixedDayNum) {
           shift = 'F'; // Assign Folga on fixed day off
       } else if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Example: Work weekdays
            shift = 'T';
            // Assign a default role/hour for initial 'T' shifts or leave empty
            // Example: Assign first available role and time
            // role = 'Vendas';
            // baseHours = '10h–18h';
       } else {
            shift = 'F'; // Example: Off weekends
       }


      // Assign initial schedule entry
       initialSchedule[key] = {
         shift: shift,
         role: role, // Assign determined role
         baseHours: baseHours, // Assign determined hours
       };
    }
  });


  return { initialEmployees, initialSchedule, initialFilters };
}
