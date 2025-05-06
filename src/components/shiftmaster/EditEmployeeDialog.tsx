
'use client';

import React, { useEffect } from 'react';
import type { Employee, DayOfWeek, ShiftType } from './types';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { daysOfWeek, availableRoles, availableShiftTypes } from './types'; // Import constants

// Define a unique, non-empty value for "None" options in Select
const SELECT_NONE_VALUE = "select-none";

// Zod schema for validation
const employeeSchema = z.object({
  id: z.number().nullable(), // Allow null for new employees
  name: z.string().min(2, { message: "O nome deve ter pelo menos 2 caracteres." }),
  // Allow SELECT_NONE_VALUE for the "Nenhuma" option in the form
  fixedDayOff: z.enum([SELECT_NONE_VALUE, ...daysOfWeek]),
  // Allow optional string (Zod automatically handles mapping empty string from form to undefined)
  defaultRole: z.string().optional(),
  // Allow SELECT_NONE_VALUE for the "Nenhum" option in the form
  defaultShiftType: z.enum([SELECT_NONE_VALUE, ...availableShiftTypes]),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EditEmployeeDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  employee: Employee | null; // Null when adding a new employee
  onSave: (employeeData: Employee) => void;
}

export function EditEmployeeDialog({ isOpen, onOpenChange, employee, onSave }: EditEmployeeDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    // Set default values, mapping empty/undefined to SELECT_NONE_VALUE for selects
    defaultValues: {
      id: null,
      name: '',
      fixedDayOff: SELECT_NONE_VALUE,
      defaultRole: '', // Keep empty for optional string
      defaultShiftType: SELECT_NONE_VALUE,
    },
  });

  // Reset form when dialog opens or employee changes
  useEffect(() => {
    if (isOpen) {
      reset({
        id: employee?.id ?? null,
        name: employee?.name ?? '',
        // Map empty/undefined employee values to SELECT_NONE_VALUE for the form state
        fixedDayOff: employee?.fixedDayOff || SELECT_NONE_VALUE,
        defaultRole: employee?.defaultRole ?? '', // Keep as empty string if undefined
        defaultShiftType: employee?.defaultShiftType || SELECT_NONE_VALUE,
      });
    }
  }, [isOpen, employee, reset]);

  const onSubmit = (data: EmployeeFormData) => {
     // Map SELECT_NONE_VALUE back to undefined or empty string before saving
     const saveData: Employee = {
         id: data.id ?? 0, // Use 0 or handle appropriately if ID generation is elsewhere
         name: data.name,
         fixedDayOff: data.fixedDayOff === SELECT_NONE_VALUE ? undefined : data.fixedDayOff as DayOfWeek,
         defaultRole: data.defaultRole || undefined, // Zod handles empty string -> undefined if optional
         defaultShiftType: data.defaultShiftType === SELECT_NONE_VALUE ? undefined : data.defaultShiftType as ShiftType,
     };
    onSave(saveData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar Colaborador' : 'Adicionar Colaborador'}</DialogTitle>
          <DialogDescription>
            {employee ? 'Atualize as informações do colaborador.' : 'Preencha os dados do novo colaborador.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            {/* Name Field */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nome
              </Label>
              <div className="col-span-3">
                <Input
                  id="name"
                  {...register('name')}
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
              </div>
            </div>

            {/* Fixed Day Off Field */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fixedDayOff" className="text-right">
                Folga Fixa
              </Label>
              <Controller
                name="fixedDayOff"
                control={control}
                render={({ field }) => (
                  // Use the form field value directly, which includes SELECT_NONE_VALUE
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id="fixedDayOff" className="col-span-3">
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                       {/* Use SELECT_NONE_VALUE for the "Nenhuma" item */}
                      <SelectItem value={SELECT_NONE_VALUE}>Nenhuma</SelectItem>
                      {daysOfWeek.map(day => (
                        <SelectItem key={day} value={day}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
               {errors.fixedDayOff && <p className="col-start-2 col-span-3 text-xs text-destructive mt-1">{errors.fixedDayOff.message}</p>}
            </div>

            {/* Default Role Field */}
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="defaultRole" className="text-right">
                    Função Padrão
                </Label>
                <Controller
                    name="defaultRole"
                    control={control}
                    render={({ field }) => (
                        // For optional string field, map empty string to SELECT_NONE_VALUE for display
                        <Select onValueChange={field.onChange} value={field.value || SELECT_NONE_VALUE}>
                            <SelectTrigger id="defaultRole" className="col-span-3">
                                <SelectValue placeholder="Nenhuma" />
                            </SelectTrigger>
                            <SelectContent>
                                {/* Use SELECT_NONE_VALUE for the "Nenhuma" item */}
                                <SelectItem value={SELECT_NONE_VALUE}>Nenhuma</SelectItem>
                                {availableRoles.map(role => (
                                    <SelectItem key={role} value={role}>{role}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
                {errors.defaultRole && <p className="col-start-2 col-span-3 text-xs text-destructive mt-1">{errors.defaultRole.message}</p>}
            </div>


            {/* Default Shift Type Field */}
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="defaultShiftType" className="text-right">
                    Turno Padrão
                </Label>
                 <Controller
                     name="defaultShiftType"
                     control={control}
                     render={({ field }) => (
                         // Use the form field value directly, which includes SELECT_NONE_VALUE
                         <Select onValueChange={field.onChange} value={field.value}>
                             <SelectTrigger id="defaultShiftType" className="col-span-3">
                                <SelectValue placeholder="Nenhum" />
                             </SelectTrigger>
                             <SelectContent>
                                {/* Use SELECT_NONE_VALUE for the "Nenhum" item */}
                                <SelectItem value={SELECT_NONE_VALUE}>Nenhum</SelectItem>
                                {/* Filter out 'Nenhum' type as it's handled by SELECT_NONE_VALUE */}
                                {availableShiftTypes.filter(type => type !== 'Nenhum').map(type => (
                                     <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                             </SelectContent>
                         </Select>
                     )}
                 />
                 {errors.defaultShiftType && <p className="col-start-2 col-span-3 text-xs text-destructive mt-1">{errors.defaultShiftType.message}</p>}
            </div>

          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancelar</Button>
            </DialogClose>
            <Button type="submit">Salvar Alterações</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
