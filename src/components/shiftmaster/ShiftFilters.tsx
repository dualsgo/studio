
'use client';

import React from 'react';
import type { Employee, FilterState } from './types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Eraser } from 'lucide-react'; // Import Eraser icon
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ShiftFiltersProps {
  filters: FilterState; // Use the updated FilterState
  employees: Employee[];
  roles: string[];
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  // onClearFilters removed, handled differently now
}

// Define a constant for the "all" value to avoid magic strings
const ALL_VALUE = "all"; // Use a non-empty, unique value

export function ShiftFilters({
  filters,
  employees,
  roles,
  onFilterChange,
}: ShiftFiltersProps) {

  const handleSelectChange = (name: keyof Pick<FilterState, 'employee' | 'role'>) => (value: string) => {
    const actualValue = value === ALL_VALUE ? '' : value;
    onFilterChange({ [name]: actualValue });
  };

  const handleDateChange = (date?: Date) => {
    if (date) {
      onFilterChange({ selectedDate: date });
    }
  };

  // Get the start and end of the current month for the Calendar
  const currentMonthStart = startOfMonth(filters.selectedDate || new Date());
  const currentMonthEnd = endOfMonth(filters.selectedDate || new Date());


  return (
    <Card className="p-4 shadow-sm mb-4">
       <CardHeader className="p-2 mb-2">
        <CardTitle className="text-lg text-primary">Filtros e Seleção de Data</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
          {/* Adjusted grid columns for fewer filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">

            {/* Employee Filter */}
            <div className="space-y-1">
              <Label htmlFor="employee-filter">Colaborador</Label>
              <Select value={filters.employee || ALL_VALUE} onValueChange={handleSelectChange('employee')}>
                <SelectTrigger id="employee-filter">
                  <SelectValue placeholder="Selecione Colaborador" />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={`emp-${emp.id}`} value={emp.id.toString()}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role Filter */}
            <div className="space-y-1">
              <Label htmlFor="role-filter">Função</Label>
              <Select value={filters.role || ALL_VALUE} onValueChange={handleSelectChange('role')}>
                <SelectTrigger id="role-filter">
                  <SelectValue placeholder="Selecione a Função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                  {roles.map(role => (
                    <SelectItem key={`role-${role}`} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

             {/* Selected Date Filter */}
            <div className="space-y-1">
                <Label htmlFor="selected-date-filter">Data para WhatsApp</Label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="selected-date-filter"
                        variant={"outline"}
                        className="w-full justify-start text-left font-normal"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.selectedDate ? format(filters.selectedDate, "PPP", { locale: ptBR }) : <span>Selecione data</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={filters.selectedDate}
                        onSelect={handleDateChange}
                        // Display the current month based on the selected date
                        month={filters.selectedDate || new Date()}
                        // Allow selecting any day within the displayed month
                        // Optional: Disable dates outside the current month if needed
                        // disabled={(date) => date < currentMonthStart || date > currentMonthEnd}
                        initialFocus
                        locale={ptBR}
                    />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Action Buttons - Clear button removed */}
            {/* Reset Scale button moved to main app header */}
            {/* <div className="flex items-end">
                 <Button variant="outline" onClick={onClearFilters} className="w-full">
                   <FilterX className="mr-2 h-4 w-4" /> Limpar Filtros
                 </Button>
            </div> */}
          </div>
      </CardContent>
    </Card>
  );
}
