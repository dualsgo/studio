'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { ShiftCode } from './types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Briefcase, Edit2, CalendarX2 } from 'lucide-react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getTimeOptionsForDate, shiftCodeToDescription, availableShiftCodes, getRoleStyles } from './types'; // Import helpers

interface ShiftCellProps {
  shift: ShiftCode;
  role: string;
  baseHours: string;
  holidayReason?: string;
  date: Date;
  availableRoles: string[];
  isHoliday: boolean;
  onChange: (newShift: ShiftCode) => void;
  onDetailChange: (field: 'role' | 'baseHours' | 'holidayReason', value: string) => void;
  hasViolation: boolean;
}

// Only cycle T and F on simple click
const shiftCycle: ShiftCode[] = ['TRABALHA', 'FOLGA'];

const SELECT_NONE_VALUE = "--none--";

export function ShiftCell({
  shift,
  role,
  baseHours,
  holidayReason,
  date,
  availableRoles,
  isHoliday,
  onChange,
  onDetailChange,
  hasViolation,
}: ShiftCellProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  // Internal state for popover edits before saving
  const [popoverShift, setPopoverShift] = useState<ShiftCode>(shift);
  const [popoverRole, setPopoverRole] = useState(role);
  const [popoverBaseHours, setPopoverBaseHours] = useState(baseHours);
  const [popoverHolidayReason, setPopoverHolidayReason] = useState(holidayReason ?? '');

  // Reset popover state when cell data changes externally or popover opens/closes
  useEffect(() => {
    if (isPopoverOpen) {
        setPopoverShift(shift);
        setPopoverRole(role);
        setPopoverBaseHours(baseHours);
        setPopoverHolidayReason(holidayReason ?? '');
    }
  }, [isPopoverOpen, shift, role, baseHours, holidayReason]);


  // Determine available time options based on the date AND holiday status
  const availableTimesForDay = useMemo(() => getTimeOptionsForDate(date, isHoliday), [date, isHoliday]);

  const handleSimpleClick = useCallback((event: React.MouseEvent) => {
     // Prevent simple click from opening popover if modifier keys are pressed
     if (event.shiftKey || event.ctrlKey || event.metaKey) {
       return;
     }

    // Only cycle between T and F on simple click
    if (shift === 'TRABALHA' || shift === 'FOLGA') {
        const currentIndex = shiftCycle.indexOf(shift);
        const nextIndex = (currentIndex + 1) % shiftCycle.length;
        onChange(shiftCycle[nextIndex]); // Directly call onChange for simple T/F toggle
    }
    // Do nothing on simple click if shift is 'FF'
  }, [shift, onChange]);

  const handleOpenPopover = useCallback((event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault(); // Prevent context menu on right-click
    event.stopPropagation();
     if (!isPopoverOpen) {
       setIsPopoverOpen(true);
     }
  }, [isPopoverOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Always prevent default context menu
    handleOpenPopover(e); // Open our popover instead
  }, [handleOpenPopover]);

   // Handle saving changes from the popover
   const handlePopoverSave = () => {
     // Call onChange only if the shift code itself changed
     if (popoverShift !== shift) {
       onChange(popoverShift);
     }
     // Call onDetailChange for any detail that changed
     if (popoverShift === 'TRABALHA') {
        if (popoverRole !== role) {
            onDetailChange('role', popoverRole);
        }
        if (popoverBaseHours !== baseHours) {
            onDetailChange('baseHours', popoverBaseHours);
        }
        // Clear reason if switching from FF to T
        if (shift === 'FF') {
            onDetailChange('holidayReason', '');
        }
     } else if (popoverShift === 'FF') {
        if (popoverHolidayReason !== (holidayReason ?? '')) {
           onDetailChange('holidayReason', popoverHolidayReason);
        }
        // Clear role/hours if switching to FF
        if (shift === 'TRABALHA') {
            onDetailChange('role', '');
            onDetailChange('baseHours', '');
        }
     } else { // popoverShift is 'FOLGA'
         // Clear details if switching to F
         if (shift === 'TRABALHA') {
             onDetailChange('role', '');
             onDetailChange('baseHours', '');
         }
          if (shift === 'FF') {
             onDetailChange('holidayReason', '');
         }
     }

     setIsPopoverOpen(false);
   };

   // Handlers for changes within the popover
   const handlePopoverShiftChange = (value: string) => {
       setPopoverShift(value as ShiftCode);
       // Reset details if changing shift type away from T or FF
       if (value !== 'TRABALHA') {
           setPopoverRole('');
           setPopoverBaseHours('');
       }
       if (value !== 'FF') {
           setPopoverHolidayReason('');
       }
   };
   const handlePopoverRoleChange = (value: string) => {
       setPopoverRole(value === SELECT_NONE_VALUE ? "" : value);
   };
   const handlePopoverTimeChange = (value: string) => {
       setPopoverBaseHours(value === SELECT_NONE_VALUE ? "" : value);
   };
   const handlePopoverReasonChange = (event: React.ChangeEvent<HTMLInputElement>) => {
       setPopoverHolidayReason(event.target.value);
   };

  // Get display text (abbreviation)
  const getShiftDisplayText = (code: ShiftCode): string => {
      return shiftCodeToDescription[code];
  };

  // Determine dynamic styles based on shift and role
  const roleStyles = getRoleStyles(role);
  const cellStyles = useMemo(() => {
    switch (shift) {
      case 'TRABALHA':
        return `${roleStyles.bgClass} ${roleStyles.textClass}`;
      case 'FOLGA':
        return 'bg-muted text-muted-foreground';
      case 'FF':
        return 'bg-accent text-accent-foreground';
      default:
        return 'bg-background text-foreground'; // Fallback
    }
  }, [shift, roleStyles]);


  const cellTitle = `Dia: ${format(date, 'dd/MM')} - ${shiftCodeToDescription[shift]}${shift === 'FF' && holidayReason ? ` (${holidayReason})` : ''}
${shift === 'TRABALHA' ? `Função: ${role || 'N/A'}, Horário: ${baseHours || 'N/A'}` : ''}
Clique: ${shift === 'TRABALHA' || shift === 'FOLGA' ? 'Alternar T/F' : 'Nada'}
Shift/Ctrl/Direito: Detalhes/Mudar Turno`;

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full h-full flex flex-col items-center justify-center text-xs p-0.5 sm:p-1 select-none relative transition-colors duration-150 ease-in-out group focus:outline-none focus:ring-1 focus:ring-ring focus:z-10',
            cellStyles, // Apply dynamic styles
            isHoliday ? 'border border-dashed border-primary/50' : '',
            // Violation ring only for 'T' shifts
            hasViolation && shift === 'TRABALHA' ? 'ring-1 sm:ring-2 ring-offset-1 ring-yellow-500' : '',
            'hover:brightness-90 dark:hover:brightness-110'
          )}
          onClick={handleSimpleClick} // Use simple click handler
          onContextMenu={handleContextMenu} // Use custom context menu handler
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenPopover(e); }} // Allow opening with keyboard
          onMouseDown={(e) => { // Open on Shift/Ctrl/Meta click
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              handleOpenPopover(e);
            }
          }}
          title={cellTitle} // Use dynamic title
        >
          {/* Display Shift Code (Abbreviation) */}
          <span className="font-semibold text-xs sm:text-sm pointer-events-none">{getShiftDisplayText(shift)}</span>

          {/* Display role and hours ONLY if shift is 'T' */}
          {shift === 'TRABALHA' && (
            <>
              <span className="block truncate text-[8px] sm:text-[10px] opacity-80 pointer-events-none leading-tight">{role || 'S/Função'}</span>
              <span className="block truncate text-[8px] sm:text-[10px] opacity-80 pointer-events-none leading-tight">{baseHours || 'S/Horário'}</span>
            </>
          )}
          {/* Display holiday reason ONLY if shift is 'FF' */}
          {shift === 'FF' && holidayReason && (
            <span className="block truncate text-[8px] sm:text-[10px] opacity-80 pointer-events-none leading-tight" title={holidayReason}>{`(${holidayReason})`}</span>
          )}

          {/* Edit icon visible for all shifts, triggers popover */}
          <div
            data-edit-icon="true"
            className="absolute bottom-0 right-0 p-0.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Editar detalhes/turno"
            role="button"
            tabIndex={-1}
          >
            <Edit2 className="h-2 w-2 sm:h-2.5 sm:w-2.5 opacity-50 group-hover:opacity-100 pointer-events-none" />
          </div>
        </button>
      </PopoverTrigger>

      {/* Popover Content - Always render structure, but conditionally show fields */}
      <PopoverContent className="w-56 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="space-y-3">
          <p className="text-sm font-medium mb-2">Editar Dia</p>

          {/* Shift Type Select */}
          <div className="space-y-1">
              <Label htmlFor={`shift-type-select-${date.toISOString()}`} className="text-xs">Tipo</Label>
              <Select value={popoverShift} onValueChange={handlePopoverShiftChange}>
                  <SelectTrigger id={`shift-type-select-${date.toISOString()}`} className="h-8 text-xs w-full">
                      <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                      {availableShiftCodes.map(code => (
                          <SelectItem key={`shift-opt-${code}`} value={code} className="text-xs">
                              {shiftCodeToDescription[code]} {/* Show abbreviation */}
                          </SelectItem>
                      ))}
                  </SelectContent>
              </Select>
          </div>

          {/* Conditional Fields based on selected popoverShift */}
          {popoverShift === 'TRABALHA' && (
            <>
              {/* Role Select */}
              <div className="space-y-1">
                <Label htmlFor={`role-select-${date.toISOString()}`} className="text-xs">Função</Label>
                <Select value={popoverRole || SELECT_NONE_VALUE} onValueChange={handlePopoverRoleChange}>
                  <SelectTrigger id={`role-select-${date.toISOString()}`} className="h-8 text-xs w-full">
                    <Briefcase className="mr-1 h-3 w-3 flex-shrink-0" />
                    <span className="truncate flex-grow text-left">
                      <SelectValue placeholder="Selecione..." />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE} key="role-none">Nenhuma</SelectItem>
                    {availableRoles.map(r => (
                      <SelectItem key={`role-opt-${r}`} value={r} className="text-xs">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Time Select */}
              <div className="space-y-1">
                <Label htmlFor={`time-select-${date.toISOString()}`} className="text-xs">Horário</Label>
                <Select value={popoverBaseHours || SELECT_NONE_VALUE} onValueChange={handlePopoverTimeChange}>
                  <SelectTrigger id={`time-select-${date.toISOString()}`} className="h-8 text-xs w-full">
                    <Clock className="mr-1 h-3 w-3 flex-shrink-0" />
                    <span className="truncate flex-grow text-left">
                      <SelectValue placeholder="Selecione..." />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE} key="time-none">Nenhum</SelectItem>
                    {availableTimesForDay.map(t => (
                      <SelectItem key={`time-opt-${t}`} value={t} className="text-xs">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {popoverShift === 'FF' && (
            <div className="space-y-1">
                <Label htmlFor={`holiday-reason-${date.toISOString()}`} className="text-xs">Motivo Feriado (Opcional)</Label>
                <Input
                    id={`holiday-reason-${date.toISOString()}`}
                    type="text"
                    placeholder="Ex: Carnaval"
                    value={popoverHolidayReason}
                    onChange={handlePopoverReasonChange}
                    className="h-8 text-xs"
                />
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setIsPopoverOpen(false)}>Cancelar</Button>
            <Button size="sm" className="text-xs h-7" onClick={handlePopoverSave}>Salvar</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
