import { useState, useMemo, useCallback } from 'react';
import { Employee, ShiftType, MonthYear } from '../types';
import { MOCK_EMPLOYEES, SHIFT_HOURS, SHIFT_DEFINITIONS } from '../constants';

export const useSchedule = () => {
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [currentMY, setCurrentMY] = useState<MonthYear>({ month: 2, year: 2026 }); // March 2026
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [waModal, setWaModal] = useState<{ show: boolean, text: string }>({ show: false, text: '' });

  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onClose: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info' | 'success';
    isAlert?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    onClose: () => { }
  });

  const monthKey = `${currentMY.year}-${currentMY.month.toString().padStart(2, '0')}`;

  // Simulated "today"
  const today = useMemo(() => new Date(2026, 2, 15), []);

  const openConfirmation = useCallback((options: {
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info' | 'success';
    isAlert?: boolean;
  }) => {
    setConfirmationModal({
      isOpen: true,
      onClose: () => setConfirmationModal(prev => ({ ...prev, isOpen: false })),
      ...options
    });
  }, []);

  const updateShift = useCallback((empId: string, dayIdx: number, newShift: ShiftType) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id === empId) {
        const currentMonthShifts = emp.shifts[monthKey] || Array(31).fill('F');
        const updatedShifts = [...currentMonthShifts];
        updatedShifts[dayIdx] = newShift;
        return { ...emp, shifts: { ...emp.shifts, [monthKey]: updatedShifts } };
      }
      return emp;
    }));
  }, [monthKey]);

  const updateEmployeeDailyHour = useCallback((empId: string, dayIdx: number, newHour: string) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id === empId) {
        const currentMonthHours = emp.dailyHours[monthKey] || Array(31).fill(emp.workPeriod);
        const updatedHours = [...currentMonthHours];
        updatedHours[dayIdx] = newHour;
        return { ...emp, dailyHours: { ...emp.dailyHours, [monthKey]: updatedHours } };
      }
      return emp;
    }));
  }, [monthKey]);

  // New function to update Shift Name (Turno) for a specific day
  const updateEmployeeDailyShiftName = useCallback((empId: string, dayIdx: number, newShiftName: string) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id === empId) {
        const currentDailyShiftNames = emp.dailyShiftNames?.[monthKey] || Array(31).fill(emp.shiftName);
        const updatedShiftNames = [...currentDailyShiftNames];
        updatedShiftNames[dayIdx] = newShiftName;

        // Also update the hour to the default of the new shift
        const shiftDef = SHIFT_DEFINITIONS.find(s => s.name === newShiftName);
        const currentMonthHours = emp.dailyHours[monthKey] || Array(31).fill(emp.workPeriod);
        const updatedHours = [...currentMonthHours];

        if (shiftDef) {
          updatedHours[dayIdx] = shiftDef.hours;
        }

        return {
          ...emp,
          dailyShiftNames: { ...emp.dailyShiftNames, [monthKey]: updatedShiftNames },
          dailyHours: { ...emp.dailyHours, [monthKey]: updatedHours }
        };
      }
      return emp;
    }));
  }, [monthKey]);

  const resetMonth = useCallback(() => {
    openConfirmation({
      title: "Confirmar Reset",
      message: "Deseja apagar os lançamentos manuais deste mês e retornar ao estado original?",
      type: 'warning',
      onConfirm: () => {
        const daysInMonth = new Date(currentMY.year, currentMY.month + 1, 0).getDate();
        setEmployees(prev => prev.map(emp => ({
          ...emp,
          shifts: { ...emp.shifts, [monthKey]: Array(daysInMonth).fill('F') },
          dailyHours: { ...emp.dailyHours, [monthKey]: Array(daysInMonth).fill(emp.workPeriod) },
          dailyShiftNames: { ...emp.dailyShiftNames, [monthKey]: Array(daysInMonth).fill(emp.shiftName) }
        })));
      }
    });
  }, [currentMY, monthKey, openConfirmation]);

  const generateNextMonth = useCallback(() => {
    let nextMonth = currentMY.month + 1;
    let nextYear = currentMY.year;
    if (nextMonth > 11) { nextMonth = 0; nextYear++; }

    const targetKey = `${nextYear}-${nextMonth.toString().padStart(2, '0')}`;
    const daysInTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const monthsNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    let totalWorkDays = 0;
    let totalOffDays = 0;

    const newShiftsMap: Record<string, ShiftType[]> = {};
    const newHoursMap: Record<string, string[]> = {};
    const newShiftNamesMap: Record<string, string[]> = {};

    employees.forEach((emp, index) => {
      const shifts = Array.from({ length: daysInTargetMonth }, (_, dayIdx) => {
        const date = new Date(nextYear, nextMonth, dayIdx + 1);
        const dayOfWeek = date.getDay();

        // Young Apprentice Logic: Saturday (6) and Sunday (0) are always OFF
        if (emp.isYoungApprentice) {
          if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
            return 'F' as ShiftType;
          }
          if (weekdays[dayOfWeek] === emp.courseDay) return 'C' as ShiftType;
        }

        if (weekdays[dayOfWeek] === emp.preferredDayOff) { totalOffDays++; return 'F' as ShiftType; }

        if (dayOfWeek === 0) { // Sunday Rotation for non-YA (YA handled above)
          const weekNum = Math.floor(dayIdx / 7);
          const isWorking = (index + weekNum) % 2 === 0;
          if (isWorking) { totalWorkDays++; return 'T' as ShiftType; }
          totalOffDays++; return 'F' as ShiftType;
        }

        totalWorkDays++;
        return 'T' as ShiftType;
      });

      const hours = Array.from({ length: daysInTargetMonth }, (_, dayIdx) => {
        const date = new Date(nextYear, nextMonth, dayIdx + 1);
        if (date.getDay() === 0) return SHIFT_HOURS.SUNDAY[0];
        return emp.workPeriod;
      });

      const shiftNames = Array.from({ length: daysInTargetMonth }, () => emp.shiftName);

      newShiftsMap[emp.id] = shifts;
      newHoursMap[emp.id] = hours;
      newShiftNamesMap[emp.id] = shiftNames;
    });

    const summaryText = `Previsão de Dias de Trabalho: ${totalWorkDays}\nAplicação de Folgas Padrão e Rotação de Domingos.\n\nO mês atual será preservado.`;

    openConfirmation({
      title: `Gerar Escala de ${monthsNames[nextMonth]}`,
      message: summaryText,
      confirmText: 'Gerar Escala',
      type: 'info',
      onConfirm: () => {
        setEmployees(prev => prev.map(emp => ({
          ...emp,
          shifts: { ...emp.shifts, [targetKey]: newShiftsMap[emp.id] },
          dailyHours: { ...emp.dailyHours, [targetKey]: newHoursMap[emp.id] },
          dailyShiftNames: { ...emp.dailyShiftNames, [targetKey]: newShiftNamesMap[emp.id] }
        })));
        // Auto navigate to the generated month
        setCurrentMY({ month: nextMonth, year: nextYear });
        setSelectedDayIdx(0);
      }
    });

  }, [currentMY, employees, openConfirmation]);

  const shareWhatsApp = useCallback((dayIdx: number) => {
    const weekdays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const date = new Date(currentMY.year, currentMY.month, dayIdx + 1);

    let text = `📅 *ESCALA RI HAPPY - ${weekdays[date.getDay()].toUpperCase()}*\n📍 ${dayIdx + 1} de ${months[date.getMonth()]} de ${currentMY.year}\n\n`;

    const uniqueHours = Array.from(new Set(employees.filter(e => {
      const s = (e.shifts[monthKey] || [])[dayIdx];
      return s === 'T' || s === 'FF';
    }).map(e => (e.dailyHours[monthKey] || [])[dayIdx] || e.workPeriod))).sort();

    uniqueHours.forEach(h => {
      const empsInHour = employees.filter(e => {
        const s = (e.shifts[monthKey] || [])[dayIdx];
        const hForDay = (e.dailyHours[monthKey] || [])[dayIdx] || e.workPeriod;
        return (s === 'T' || s === 'FF') && hForDay === h;
      });
      if (empsInHour.length > 0) {
        text += `⏰ *${h}*\n`;
        empsInHour.forEach(e => text += `• ${e.name}\n`);
        text += `\n`;
      }
    });

    const mShiftsGetter = (e: Employee) => (e.shifts[monthKey] || [])[dayIdx];
    const off = employees.filter(e => ['F', 'FE', 'C'].includes(mShiftsGetter(e)));
    if (off.length > 0) {
      text += `━━━━━━━━━━━━━━━\n🌴 *FOLGA / CURSO / FÉRIAS*\n`;
      off.forEach(e => {
        const shift = mShiftsGetter(e);
        const label = shift === 'FE' ? 'Férias' : shift === 'C' ? 'Curso' : 'Folga';
        const emoji = shift === 'FE' ? '🟣' : shift === 'C' ? '📘' : '⚪';
        text += `${emoji} ${e.name} (${label})\n`;
      });
    }
    setWaModal({ show: true, text });
  }, [currentMY, employees, monthKey]);

  const addEmployee = useCallback((name: string, isYoung: boolean, courseDay: string, shiftName: string) => {
    const shiftDef = SHIFT_DEFINITIONS.find(s => s.name === shiftName);
    const workPeriod = shiftDef ? shiftDef.hours : '10h às 18h20';

    const newEmp: Employee = {
      id: Date.now().toString(),
      name,
      isYoungApprentice: isYoung,
      courseDay: isYoung ? courseDay : undefined,
      status: 'active',
      statusColor: '#' + Math.floor(Math.random() * 16777215).toString(16),
      shifts: {},
      dailyHours: {},
      dailyShiftNames: {},
      workPeriod,
      preferredDayOff: 'Segunda-feira',
      shiftName
    };
    setEmployees(prev => [...prev, newEmp]);
  }, []);

  const updateEmployee = useCallback((id: string, data: Partial<Employee>) => {
    // If shiftName is updated, also update workPeriod
    if (data.shiftName) {
      const shiftDef = SHIFT_DEFINITIONS.find(s => s.name === data.shiftName);
      if (shiftDef) {
        data.workPeriod = shiftDef.hours;
      }
    }
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
  }, []);

  const deleteEmployee = useCallback((id: string) => {
    // Confirmation handled in UI or here? 
    // Usually UI calls confirm, but let's expose specific function if UI needs it. 
    // UI can call openConfirmation directly if we export it, OR 
    // we export a requestDeleteEmployee(id) that opens modal.
    // Let's stick to doing it in UI for simple cases or wrapped here.
    setEmployees(prev => prev.filter(e => e.id !== id));
  }, []);

  const navigateMonth = useCallback((direction: 'next' | 'prev') => {
    setCurrentMY(prev => {
      let m = prev.month + (direction === 'next' ? 1 : -1);
      let y = prev.year;
      if (m > 11) { m = 0; y++; }
      if (m < 0) { m = 11; y--; }
      return { month: m, year: y };
    });
  }, []);

  const closeWaModal = useCallback(() => setWaModal({ show: false, text: '' }), []);

  return {
    employees,
    currentMY,
    selectedDayIdx,
    waModal,
    confirmationModal, // Exported
    today,
    monthKey,
    updateShift,
    updateEmployeeDailyHour,
    updateEmployeeDailyShiftName, // Exported
    resetMonth,
    generateNextMonth,
    shareWhatsApp,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    setSelectedDayIdx,
    navigateMonth,
    closeWaModal,
    openConfirmation // Exported for UI components to use
  };
};
