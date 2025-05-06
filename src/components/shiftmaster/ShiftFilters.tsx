'use client';

import React from 'react';
import type { Employee, FilterState } from './types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input'; // For employee search
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Search, FilterX } from 'lucide-react';

interface ShiftFiltersProps {
  filters: FilterState;
  employees: Employee[];
  roles: string[];
  stores: string[];
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onClearFilters: () => void;
}

export function ShiftFilters({
  filters,
  employees,
  roles,
  stores,
  onFilterChange,
  onClearFilters,
}: ShiftFiltersProps) {

  const handleSelectChange = (name: keyof FilterState) => (value: string) => {
    onFilterChange({ [name]: value });
  };

  const handleDateChange = (name: 'startDate' | 'endDate') => (date?: Date) => {
    if (date) {
      onFilterChange({ [name]: date });
    }
  };

  return (
    <Card className="p-4 shadow-sm">
       <CardHeader className="p-2 mb-2">
        <CardTitle className="text-lg text-primary">Filtros</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
            {/* Store Filter */}
            <div className="space-y-1">
              <Label htmlFor="store-filter">Loja</Label>
              <Select value={filters.store || ''} onValueChange={handleSelectChange('store')}>
                <SelectTrigger id="store-filter">
                  <SelectValue placeholder="Selecione a Loja" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {stores.map(store => (
                    <SelectItem key={store} value={store}>{store}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee Filter */}
            <div className="space-y-1">
              <Label htmlFor="employee-filter">Colaborador</Label>
               {/* Using Select for now, could enhance with search later */}
              <Select value={filters.employee || ''} onValueChange={handleSelectChange('employee')}>
                <SelectTrigger id="employee-filter">
                  <SelectValue placeholder="Selecione Colaborador" />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="">Todos</SelectItem>
                   {/* Add search input here if needed */}
                   {/* <div className="p-2"><Input placeholder="Buscar..." /></div> */}
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role Filter */}
            <div className="space-y-1">
              <Label htmlFor="role-filter">Função</Label>
              <Select value={filters.role || ''} onValueChange={handleSelectChange('role')}>
                <SelectTrigger id="role-filter">
                  <SelectValue placeholder="Selecione a Função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {roles.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

             {/* Start Date Filter */}
            <div className="space-y-1">
                <Label htmlFor="start-date-filter">Data Inicial</Label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="start-date-filter"
                        variant={"outline"}
                        className="w-full justify-start text-left font-normal"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.startDate ? format(filters.startDate, "PPP", { locale: ptBR }) : <span>Selecione data</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={filters.startDate}
                        onSelect={handleDateChange('startDate')}
                        initialFocus
                        locale={ptBR}
                    />
                    </PopoverContent>
                </Popover>
            </div>


            {/* End Date Filter */}
             <div className="space-y-1">
                <Label htmlFor="end-date-filter">Data Final</Label>
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="end-date-filter"
                        variant={"outline"}
                        className="w-full justify-start text-left font-normal"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.endDate ? format(filters.endDate, "PPP", { locale: ptBR }) : <span>Selecione data</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={filters.endDate}
                        onSelect={handleDateChange('endDate')}
                        initialFocus
                        locale={ptBR}
                        disabled={(date) =>
                         filters.startDate ? date < filters.startDate : false
                        }
                    />
                    </PopoverContent>
                </Popover>
            </div>


            {/* Action Buttons */}
            <div className="flex items-end space-x-2">
                 {/* Apply button is implicit via state changes, adding Clear */}
                 <Button variant="outline" onClick={onClearFilters} className="w-full">
                   <FilterX className="mr-2 h-4 w-4" /> Limpar
                 </Button>
                 {/* We don't need an explicit Apply button as filters update state directly */}
                 {/* <Button className="w-full">Aplicar</Button> */}
            </div>
          </div>
      </CardContent>
    </Card>
  );
}

// Need Card components for styling
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
