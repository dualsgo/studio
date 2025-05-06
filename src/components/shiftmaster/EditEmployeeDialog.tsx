
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

// Zod schema for validation
const employeeSchema = z.object({
  id: z.number().nullable(), // Allow null for new employees
  name: z.string().min(2, { message: "O nome deve ter pelo menos 2 caracteres." }),
  fixedDayOff: z.enum(["", ...daysOfWeek]), // Allow empty string for "Nenhuma"
  defaultRole: z.string().optional(), // Optional field
  defaultShiftType: z.enum(["", ...availableShiftTypes]), // Allow empty string for "Nenhum"
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
    defaultValues: {
      id: null,
      name: '',
      fixedDayOff: "",
      defaultRole: '',
      defaultShiftType: "",
    },
  });

  // Reset form when dialog opens or employee changes
  useEffect(() => {
    if (isOpen) {
      reset({
        id: employee?.id ?? null,
        name: employee?.name ?? '',
        fixedDayOff: employee?.fixedDayOff || "", // Handle undefined or null
        defaultRole: employee?.defaultRole ?? '',
        defaultShiftType: employee?.defaultShiftType || "",
      });
    }
  }, [isOpen, employee, reset]);

  const onSubmit = (data: EmployeeFormData) => {
     // Ensure optional fields are correctly passed, converting "" back to undefined if needed by onSave
     const saveData: Employee = {
         id: data.id ?? 0, // Use 0 or handle appropriately if ID generation is elsewhere
         name: data.name,
         fixedDayOff: data.fixedDayOff === "" ? undefined : data.fixedDayOff as DayOfWeek,
         defaultRole: data.defaultRole || undefined,
         defaultShiftType: data.defaultShiftType === "" ? undefined : data.defaultShiftType as ShiftType,
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
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <SelectTrigger id="fixedDayOff" className="col-span-3">
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {daysOfWeek.map(day => (
                        <SelectItem key={day} value={day}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
               {/* Error display for select (optional, less common) */}
               {/* {errors.fixedDayOff && <p className="col-start-2 col-span-3 text-xs text-destructive mt-1">{errors.fixedDayOff.message}</p>} */}
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
                       <Select onValueChange={field.onChange} value={field.value || ""}>
                           <SelectTrigger id="defaultRole" className="col-span-3">
                           <SelectValue placeholder="Nenhuma" />
                           </SelectTrigger>
                           <SelectContent>
                           <SelectItem value="">Nenhuma</SelectItem>
                           {availableRoles.map(role => (
                               <SelectItem key={role} value={role}>{role}</SelectItem>
                           ))}
                           </SelectContent>
                       </Select>
                   )}
                />
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
                         <Select onValueChange={field.onChange} value={field.value || ""}>
                             <SelectTrigger id="defaultShiftType" className="col-span-3">
                             <SelectValue placeholder="Nenhum" />
                             </SelectTrigger>
                             <SelectContent>
                                <SelectItem value="">Nenhum</SelectItem>
                                {availableShiftTypes.filter(type => type !== 'Nenhum').map(type => ( // Exclude 'Nenhum' from options if it represents empty
                                     <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                             </SelectContent>
                         </Select>
                     )}
                 />
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
