import { addDays } from 'date-fns';
import { Employee, ScheduleData, DayOfWeek } from './types';
import { getScheduleKey } from './utils';

export const checkViolations = (
  empId: number, 
  date: Date, 
  employees: Employee[], 
  schedule: ScheduleData
): { consecutiveDays: boolean; consecutiveSundays: boolean; fixedDayOff: boolean } => {
    const employee = employees.find(e => e.id === empId);
    if (!employee) return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };

    const key = getScheduleKey(empId, date);
    const currentShift = schedule[key]?.shift;

    // Violations only apply if the shift is 'TRABALHA'
    if (currentShift !== 'TRABALHA') {
        return { consecutiveDays: false, consecutiveSundays: false, fixedDayOff: false };
    }

    // 1. Consecutive Days Check (> 6 ending *on this date*)
    let consecutiveDaysCount = 1; // Start with 1 for the current date
    for (let i = 1; i <= 6; i++) { // Check previous 6 days
        const checkDate = addDays(date, -i);
        if (schedule[getScheduleKey(empId, checkDate)]?.shift === 'TRABALHA') {
             consecutiveDaysCount++;
        } else {
             break; // Stop if a non-T day is found
        }
    }
    const consecutiveDaysViolation = consecutiveDaysCount > 6;

   // 2. Consecutive Sundays Check (> 3 ending *on this date*)
   let consecutiveSundaysViolation = false;
   if (date.getDay() === 0) { // If the current date is a Sunday
       let consecutiveSundaysCount = 1; // Start with 1 for the current Sunday
       for (let i = 1; i <= 3; i++) { // Check previous 3 Sundays
           const checkSunday = addDays(date, -i * 7);
           if (schedule[getScheduleKey(empId, checkSunday)]?.shift === 'TRABALHA') {
                consecutiveSundaysCount++;
           } else {
                break; // Stop if a previous Sunday wasn't 'T'
           }
       }
       consecutiveSundaysViolation = consecutiveSundaysCount > 3;
   }

    // 3. Fixed Day Off Check (Working on the designated fixed day off)
     const dayOfWeek = date.getDay();
     const fixedDayMapping: { [key in DayOfWeek]?: number } = {
         "Domingo": 0, "Segunda": 1, "Terça": 2, "Quarta": 3, "Quinta": 4, "Sexta": 5, "Sábado": 6
     };
     const fixedDayNum = employee.fixedDayOff ? fixedDayMapping[employee.fixedDayOff] : undefined;
     const fixedDayOffViolation = fixedDayNum !== undefined && dayOfWeek === fixedDayNum;

    return {
        consecutiveDays: consecutiveDaysViolation,
        consecutiveSundays: consecutiveSundaysViolation,
        fixedDayOff: fixedDayOffViolation
    };
};
