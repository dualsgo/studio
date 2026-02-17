import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    Employee,
    ScheduleData,
    FilterState,
    ShiftCode,
    DayOfWeek,
    ScheduleEntry,
    daysOfWeek,
    shiftTypeToHoursMap,
    getTimeOptionsForDate,
    SortOrder
} from '@/components/shiftmaster/types';
import { generateInitialData, getScheduleKey, getDatesInRange } from '@/components/shiftmaster/utils';
import { useToast } from "@/hooks/use-toast";
import {
    isBefore,
    parseISO,
    addDays,
    format as formatDate,
    startOfMonth,
    endOfMonth,
    isEqual,
    startOfDay,
    parse
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BackupData {
    employees: Employee[];
    schedule: ScheduleData;
    filters: Omit<FilterState, 'selectedDate'> & { selectedDateISO?: string };
    holidays: string[];
    version: number;
}

const BACKUP_VERSION = 1;
const LOCAL_STORAGE_KEY = 'escalaMensalData';
const toastDuration = 3000;

export function useSchedule() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [schedule, setSchedule] = useState<ScheduleData>({});
    const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
    const [filters, setFilters] = useState<FilterState>({
        employee: '',
        role: '',
        selectedDate: null,
    });
    const [sortOrder, setSortOrder] = useState<SortOrder>('default');
    const [holidays, setHolidays] = useState<Date[]>([]);

    // UI State
    const [employeeToDelete, setEmployeeToDelete] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isClearingMonth, setIsClearingMonth] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [initialLoadCompleted, setInitialLoadCompleted] = useState(false);

    const { toast } = useToast();
    const isClient = typeof window !== 'undefined';

    // Helper: Check if a date is a holiday
    const isHolidayFn = useCallback((date: Date): boolean => {
        if (!date || isNaN(date.getTime())) return false;
        const dateStart = startOfDay(date);
        return holidays.some(holiday => {
            if (!holiday || !(holiday instanceof Date) || isNaN(holiday.getTime())) {
                return false;
            }
            return isEqual(startOfDay(holiday), dateStart);
        });
    }, [holidays]);

    // --- Persist to Local Storage ---
    const saveDataToLocalStorage = useCallback((
        employeesData: Employee[],
        scheduleData: ScheduleData,
        filtersData: FilterState,
        holidaysData: Date[]
    ) => {
        if (!isClient) return;
        try {
            const dataToStore: BackupData = {
                employees: employeesData,
                schedule: scheduleData,
                filters: {
                    employee: filtersData.employee,
                    role: filtersData.role,
                    selectedDateISO: filtersData.selectedDate?.toISOString()
                },
                holidays: holidaysData.map(date => date.toISOString()),
                version: BACKUP_VERSION,
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToStore));
        } catch (error) {
            console.error("Failed to save data to localStorage:", error);
            toast({ title: "Erro de Armazenamento Local", description: "Não foi possível salvar as alterações localmente.", variant: "destructive", duration: toastDuration });
        }
    }, [isClient, toast]);

    // --- Load from Local Storage ---
    const loadDataFromLocalStorage = useCallback(() => {
        if (!isClient) return false;
        const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localData) {
            try {
                const parsedData: BackupData = JSON.parse(localData);
                if (parsedData.employees && parsedData.schedule && parsedData.filters && parsedData.holidays) {
                    if (parsedData.version !== BACKUP_VERSION) {
                        console.warn(`Local storage data version mismatch. Expected ${BACKUP_VERSION}, found ${parsedData.version}.`);
                    }

                    setEmployees(parsedData.employees);
                    setSchedule(parsedData.schedule);

                    const loadedSelectedDate = parsedData.filters.selectedDateISO
                        ? startOfDay(parseISO(parsedData.filters.selectedDateISO))
                        : startOfDay(new Date());

                    const loadedFilters: FilterState = {
                        employee: parsedData.filters.employee ?? '',
                        role: parsedData.filters.role ?? '',
                        selectedDate: loadedSelectedDate
                    };
                    setFilters(loadedFilters);

                    const loadedHolidays = (parsedData.holidays || []).map((isoString: string) => startOfDay(parseISO(isoString)));
                    setHolidays(loadedHolidays);

                    console.log("Data loaded from LocalStorage");
                    toast({ title: 'Dados Locais Carregados', description: 'Usando dados salvos anteriormente.', variant: 'default', duration: toastDuration });
                    return true;
                } else {
                    console.warn("Local storage data structure is invalid.");
                    localStorage.removeItem(LOCAL_STORAGE_KEY);
                }
            } catch (error) {
                console.error("Failed to parse localStorage data:", error);
                toast({ title: "Erro nos Dados Locais", description: "Não foi possível ler os dados locais. Usando dados padrão.", variant: "warning", duration: toastDuration });
                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
        }
        return false;
    }, [isClient, toast]);

    // Initial Load Effect
    useEffect(() => {
        if (!isClient || !hasMounted || initialLoadCompleted) return;

        const loadData = async () => {
            setIsLoading(true);

            const loadedFromLocal = loadDataFromLocalStorage();

            if (!loadedFromLocal) {
                console.log("No valid data found, generating initial data...");
                const baseDateForInitialData = new Date();
                const { initialEmployees, initialSchedule, initialFilters, initialHolidays } = generateInitialData(baseDateForInitialData);
                setEmployees(initialEmployees);
                setSchedule(initialSchedule);
                setFilters(initialFilters);
                setHolidays(initialHolidays);
                saveDataToLocalStorage(initialEmployees, initialSchedule, initialFilters, initialHolidays);
                toast({ title: 'Dados Iniciais Gerados', description: 'Comece a configurar sua escala.', variant: 'default', duration: toastDuration });
            }

            setFilters(prevFilters => {
                if (prevFilters.selectedDate === null) {
                    return { ...prevFilters, selectedDate: startOfDay(new Date()) };
                }
                return prevFilters;
            });

            setInitialLoadCompleted(true);
            setIsLoading(false);
        };

        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isClient, hasMounted, initialLoadCompleted]);

    // Mounting Check
    useEffect(() => {
        setHasMounted(true);
    }, []);

    // Sync Current Month
    useEffect(() => {
        if (!isClient || !hasMounted) return;
        if (filters.selectedDate) {
            const newCurrentMonth = startOfMonth(filters.selectedDate);
            if (!currentMonth || !isEqual(newCurrentMonth, currentMonth)) {
                setCurrentMonth(newCurrentMonth);
            }
        } else if (initialLoadCompleted && !currentMonth) {
            const now = new Date();
            setCurrentMonth(startOfMonth(now));
            setFilters(prev => ({ ...prev, selectedDate: startOfDay(now) }));
        }
    }, [filters.selectedDate, currentMonth, initialLoadCompleted, isClient, hasMounted]);

    // Auto-save Effect
    useEffect(() => {
        if (!isLoading && initialLoadCompleted && isClient && currentMonth && filters.selectedDate) {
            const handler = setTimeout(() => {
                saveDataToLocalStorage(employees, schedule, filters, holidays);
            }, 1000);

            return () => clearTimeout(handler);
        }
    }, [employees, schedule, filters, holidays, saveDataToLocalStorage, isLoading, initialLoadCompleted, isClient, currentMonth]);


    // --- Actions ---

    // Apply defaults logic extracted
    const applyEmployeeDefaults = useCallback((
        employee: Employee,
        currentSchedule: ScheduleData,
        currentHolidays: Date[],
        holidayCheckFn: (date: Date) => boolean,
        monthForContext: Date
    ): ScheduleData => {
        if (!monthForContext || isNaN(monthForContext.getTime())) {
            return currentSchedule;
        }

        const newSchedule = { ...currentSchedule };
        const datesInMonth = getDatesInRange(startOfMonth(monthForContext), endOfMonth(monthForContext));
        const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
        daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);

        datesInMonth.forEach(date => {
            const key = getScheduleKey(employee.id, date);
            const dayOfWeek = date.getDay();
            const isFixedDayOff = employee.fixedDayOff && dayOfWeek === fixedDayMapping[employee.fixedDayOff];
            const dayIsActuallyHoliday = holidayCheckFn(date);

            let entry: ScheduleEntry = newSchedule[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };

            if (isFixedDayOff) {
                if (entry.shift !== 'FF') {
                    entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
            }
            else if (dayIsActuallyHoliday) {
                if (entry.shift === 'FOLGA' || entry.shift === 'TRABALHA' || !newSchedule[key]) {
                    entry = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                }
            }
            else if (employee.defaultRole && employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum') {
                if (entry.shift === 'FOLGA') {
                    entry.shift = 'TRABALHA';
                    entry.role = employee.defaultRole;
                    const dayOptions = getTimeOptionsForDate(date, false);
                    let defaultHour = '';
                    if (employee.defaultShiftType && employee.defaultShiftType !== 'Nenhum') {
                        const basicDefaultHour = shiftTypeToHoursMap[employee.defaultShiftType] || '';
                        if (dayOptions.includes(basicDefaultHour)) {
                            defaultHour = basicDefaultHour;
                        }
                    }
                    if (!defaultHour && dayOptions.length > 0) {
                        defaultHour = dayOptions[0];
                    }
                    entry.baseHours = defaultHour;
                    entry.holidayReason = undefined;
                }
            }
            else if (entry.shift !== 'FF' && entry.shift !== 'TRABALHA') {
                entry = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
            }

            newSchedule[key] = entry;
        });
        return newSchedule;
    }, []);

    const addEmployee = (employeeData: Employee) => {
        if (!isClient) return;
        const maxId = employees.reduce((max, emp) => Math.max(max, emp.id), 0);
        const newEmployee = { ...employeeData, id: maxId + 1 };
        const newEmployeesArray = [...employees, newEmployee];
        setEmployees(newEmployeesArray);

        const updatedSchedule = applyEmployeeDefaults(newEmployee, schedule, holidays, isHolidayFn, currentMonth || new Date());
        setSchedule(updatedSchedule);
        toast({ title: "Sucesso", description: "Colaborador adicionado.", duration: toastDuration });
    };

    const updateEmployee = (employeeData: Employee) => {
        if (!isClient || !currentMonth) return;
        const updatedEmployees = employees.map(emp =>
            emp.id === employeeData.id ? employeeData : emp
        );
        setEmployees(updatedEmployees);

        const updatedSchedule = applyEmployeeDefaults(employeeData, schedule, holidays, isHolidayFn, currentMonth);
        setSchedule(updatedSchedule);
        toast({ title: "Sucesso", description: "Colaborador atualizado.", duration: toastDuration });
    };

    const confirmDeleteEmployee = useCallback(async () => {
        if (employeeToDelete === null || !isClient) return;

        const employeeName = employees.find(e => e.id === employeeToDelete)?.name || 'este colaborador';
        const newEmployees = employees.filter(emp => emp.id !== employeeToDelete);
        const newSchedule = { ...schedule };
        const keysToDelete: string[] = [];

        Object.keys(newSchedule).forEach(key => {
            if (key.startsWith(`${employeeToDelete}-`)) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => delete newSchedule[key]);

        setEmployees(newEmployees);
        setSchedule(newSchedule);
        setEmployeeToDelete(null);
        toast({ title: "Sucesso", description: `Colaborador "${employeeName}" removido.`, duration: toastDuration });
    }, [employeeToDelete, employees, schedule, toast, isClient]);

    const handleShiftChange = useCallback((empId: number, date: Date, newShift: ShiftCode) => {
        if (!isClient) return;
        const key = getScheduleKey(empId, date);
        const updatedSchedule = { ...schedule };
        const employee = employees.find(e => e.id === empId);
        const dayIsHoliday = isHolidayFn(date);

        let entry: ScheduleEntry = updatedSchedule[key] || { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
        entry = { ...entry, shift: newShift };

        if (newShift === 'TRABALHA') {
            entry.role = entry.role || employee?.defaultRole || '';
            const dayOptions = getTimeOptionsForDate(date, dayIsHoliday);
            if (!entry.baseHours || !dayOptions.includes(entry.baseHours)) {
                let defaultHour = '';
                const defaultShiftType = employee?.defaultShiftType;
                if (defaultShiftType && defaultShiftType !== 'Nenhum') {
                    const basicDefault = shiftTypeToHoursMap[defaultShiftType || 'Nenhum'];
                    if (dayOptions.includes(basicDefault)) {
                        defaultHour = basicDefault;
                    }
                }
                if (!defaultHour && dayOptions.length > 0) {
                    defaultHour = dayOptions[0];
                }
                entry.baseHours = defaultHour;
            }
            entry.holidayReason = undefined;
        } else if (newShift === 'FOLGA') {
            entry.role = '';
            entry.baseHours = '';
            entry.holidayReason = undefined;
        } else if (newShift === 'FF') {
            entry.role = '';
            entry.baseHours = '';
            entry.holidayReason = entry.holidayReason || 'Feriado';
        }

        updatedSchedule[key] = entry;
        setSchedule(updatedSchedule);
    }, [employees, schedule, isHolidayFn, isClient]);

    const handleDetailChange = useCallback((empId: number, date: Date, field: 'role' | 'baseHours' | 'holidayReason', value: string) => {
        if (!isClient) return;
        const key = getScheduleKey(empId, date);
        const updatedSchedule = { ...schedule };

        if (!updatedSchedule[key]) {
            const isDayHoliday = isHolidayFn(date);
            updatedSchedule[key] = isDayHoliday
                ? { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' }
                : { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
        }

        const currentEntry = updatedSchedule[key];

        if (currentEntry.shift !== 'TRABALHA' && (field === 'role' || field === 'baseHours')) {
            toast({ title: "Aviso", description: "Função/Horário só se aplicam a dias de Trabalho (T).", variant: "default", duration: toastDuration });
            return;
        }
        if (currentEntry.shift !== 'FF' && field === 'holidayReason') {
            toast({ title: "Aviso", description: "Motivo só se aplica a Folga Feriado (FF).", variant: "default", duration: toastDuration });
            return;
        }

        updatedSchedule[key] = { ...currentEntry, [field]: value };
        setSchedule(updatedSchedule);
    }, [schedule, toast, isHolidayFn, isClient]);

    const handleToggleHoliday = useCallback((date: Date) => {
        if (!isClient || !currentMonth) return;
        const dateStart = startOfDay(date);
        const currentHolidays = [...holidays];
        const currentScheduleState = { ...schedule };

        const isCurrentlyHoliday = isHolidayFn(dateStart);
        const updatedHolidays = isCurrentlyHoliday
            ? currentHolidays.filter(holiday => !isEqual(holiday, dateStart))
            : [...currentHolidays, dateStart].sort((a, b) => a.getTime() - b.getTime());

        setHolidays(updatedHolidays);

        const updatedSchedule = { ...currentScheduleState };
        employees.forEach(emp => {
            const key = getScheduleKey(emp.id, date);
            let entry = updatedSchedule[key];
            const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
            daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
            const isFixedDayOff = emp.fixedDayOff && date.getDay() === fixedDayMapping[emp.fixedDayOff];

            if (!isCurrentlyHoliday) {
                if (!isFixedDayOff && (!entry || entry.shift === 'TRABALHA' || entry.shift === 'FOLGA')) {
                    updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                }
            }
            else {
                if (entry && entry.shift === 'FF') {
                    if (isFixedDayOff) {
                        updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                    }
                    else if (emp.defaultRole && emp.defaultShiftType && emp.defaultShiftType !== 'Nenhum') {
                        const dayOptions = getTimeOptionsForDate(date, false);
                        let defaultHour = '';
                        const basicDefaultHour = shiftTypeToHoursMap[emp.defaultShiftType] || '';
                        if (dayOptions.includes(basicDefaultHour)) {
                            defaultHour = basicDefaultHour;
                        } else if (dayOptions.length > 0) {
                            defaultHour = dayOptions[0];
                        }
                        updatedSchedule[key] = { shift: 'TRABALHA', role: emp.defaultRole, baseHours: defaultHour, holidayReason: undefined };
                    }
                    else {
                        updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                    }
                }
            }
        });
        setSchedule(updatedSchedule);
        toast({ title: "Feriado Atualizado", description: `Dia ${formatDate(date, 'dd/MM')} ${isCurrentlyHoliday ? 'não é mais' : 'agora é'} feriado.`, duration: toastDuration });

    }, [holidays, employees, schedule, toast, isHolidayFn, currentMonth, isClient]);

    const handleFilterChange = (newFilters: Partial<FilterState>) => {
        if (!isClient) return;
        const updatedFilters = { ...filters, ...newFilters };
        if (newFilters.selectedDate) {
            const normalizedDate = startOfDay(newFilters.selectedDate);
            if (!filters.selectedDate || !isEqual(normalizedDate, filters.selectedDate)) {
                updatedFilters.selectedDate = normalizedDate;
                const newMonth = startOfMonth(normalizedDate);
                if (!currentMonth || !isEqual(newMonth, currentMonth)) {
                    setCurrentMonth(newMonth);
                }
            }
        } else if (newFilters.selectedDate === null) {
            updatedFilters.selectedDate = null;
        }
        setFilters(updatedFilters);
    };

    const confirmClearMonth = useCallback(() => {
        if (!currentMonth || !isClient) {
            toast({ title: "Erro", description: "Mês atual não definido ou erro do cliente.", variant: "destructive", duration: toastDuration });
            setIsClearingMonth(false);
            return;
        }

        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const datesInMonth = getDatesInRange(monthStart, monthEnd);
        const updatedSchedule = { ...schedule };

        employees.forEach(emp => {
            datesInMonth.forEach(date => {
                const key = getScheduleKey(emp.id, date);
                const fixedDayMapping: { [key in DayOfWeek]?: number } = {};
                daysOfWeek.forEach((day, index) => fixedDayMapping[day] = index);
                const isFixedDayOff = emp.fixedDayOff && date.getDay() === fixedDayMapping[emp.fixedDayOff];

                if (isFixedDayOff) {
                    updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
                else if (isHolidayFn(date)) {
                    updatedSchedule[key] = { shift: 'FF', role: '', baseHours: '', holidayReason: 'Feriado' };
                }
                else {
                    updatedSchedule[key] = { shift: 'FOLGA', role: '', baseHours: '', holidayReason: undefined };
                }
            });
        });

        setSchedule(updatedSchedule);
        setIsClearingMonth(false);
        toast({ title: "Sucesso", description: `Escala de ${formatDate(currentMonth, 'MMMM yyyy', { locale: ptBR })} zerada.`, duration: toastDuration });
    }, [currentMonth, schedule, employees, toast, isHolidayFn, isClient]);

    const handleSortChange = useCallback(() => {
        setSortOrder(prevOrder => {
            if (prevOrder === 'default') return 'asc';
            if (prevOrder === 'asc') return 'desc';
            return 'default';
        });
    }, []);

    const datesForTable = useMemo(() => {
        if (!currentMonth || isNaN(currentMonth.getTime())) return [];
        return getDatesInRange(startOfMonth(currentMonth), endOfMonth(currentMonth));
    }, [currentMonth]);

    const filteredAndSortedEmployees = useMemo(() => {
        if (!employees) return [];

        const filtered = employees.filter(emp => {
            if (filters.employee && emp.id !== parseInt(filters.employee)) return false;

            if (filters.role) {
                if (!datesForTable || datesForTable.length === 0) return false;

                const worksInRole = datesForTable.some(date => {
                    const key = getScheduleKey(emp.id, date);
                    return schedule[key]?.shift === 'TRABALHA' && schedule[key]?.role === filters.role;
                });
                if (!worksInRole) return false;
            }
            return true;
        });

        if (sortOrder === 'asc') {
            return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortOrder === 'desc') {
            return [...filtered].sort((a, b) => b.name.localeCompare(a.name));
        } else {
            return filtered;
        }

    }, [employees, filters, datesForTable, schedule, sortOrder]);


    return {
        employees,
        schedule,
        currentMonth,
        filters,
        holidays,
        sortOrder,
        isLoading,
        isClearingMonth,
        filteredAndSortedEmployees,
        datesForTable,
        employeeToDelete,
        hasMounted,
        setEmployees,
        setSchedule,
        setFilters,
        setSortOrder,
        setHolidays,
        setIsClearingMonth,
        setEmployeeToDelete,
        addEmployee,
        updateEmployee,
        deleteEmployee: setEmployeeToDelete, // Alias for setting employee to delete
        confirmDeleteEmployee,
        handleShiftChange,
        handleDetailChange,
        handleToggleHoliday,
        handleFilterChange,
        handleSortChange,
        handleClearMonth: () => setIsClearingMonth(true),
        confirmClearMonth,
        isHolidayFn
    };
}
