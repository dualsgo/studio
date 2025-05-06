
'use client';

import React, { useState, useCallback, useMemo } from 'react';
import type { ShiftCode } from './types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Briefcase, Edit2 } from 'lucide-react';
import { Label } from "@/components/ui/label";
import { getTimeOptionsForDate, shiftCodeToDescription } from './types'; // Import updated function and descriptions

interface ShiftCellProps {
  shift: ShiftCode;
  role: string;
  baseHours: string;
  date: Date;
  availableRoles: string[];
  isHoliday: boolean; // New prop to indicate if the day is a holiday
  onChange: (newShift: ShiftCode) => void;
  onDetailChange: (field: 'role' | 'baseHours', value: string) => void;
  hasViolation: boolean;
}

// Updated styles for T, F, FF. Removed H, D.
const shiftStyles: Record<ShiftCode, string> = {
  T: 'bg-destructive text-destructive-foreground', // Red
  F: 'bg-muted text-muted-foreground',           // Gray
  FF: 'bg-accent text-accent-foreground',        // Green (for Folga Feriado)
};

// Updated cycle order: Only T and F. FF is set manually or via logic.
const shiftCycle: ShiftCode[] = ['T', 'F'];

const SELECT_NONE_VALUE = "--none--";

export function ShiftCell({
  shift,
  role,
  baseHours,
  date,
  availableRoles,
  isHoliday, // Use the isHoliday prop
  onChange,
  onDetailChange,
  hasViolation,
}: ShiftCellProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Determine available time options based on the date AND holiday status
  const availableTimesForDay = useMemo(() => getTimeOptionsForDate(date, isHoliday), [date, isHoliday]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('[data-edit-icon="true"]')) {
      return;
    }
    // Allow opening popover with Shift+Click/Ctrl+Click/Right-click only for 'T' shifts
    if ((event.shiftKey || event.ctrlKey || event.metaKey || event.button === 2) && shift === 'T') {
      if (!isPopoverOpen) {
        setIsPopoverOpen(true);
      }
      event.preventDefault(); // Prevent context menu
      return;
    }

    // Cycle shift only if it's currently T or F
    if (shift === 'T' || shift === 'F') {
        const currentIndex = shiftCycle.indexOf(shift);
        // Ensure index is found before cycling (should always be for T/F)
        if (currentIndex !== -1) {
            const nextIndex = (currentIndex + 1) % shiftCycle.length;
            onChange(shiftCycle[nextIndex]);
        }
    }
    // Do not cycle if shift is 'FF' or any other future code
  }, [shift, onChange, isPopoverOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleRoleChange = (value: string) => {
    onDetailChange('role', value === SELECT_NONE_VALUE ? "" : value);
  };

  const handleTimeChange = (value: string) => {
    onDetailChange('baseHours', value === SELECT_NONE_VALUE ? "" : value);
  };

  const handleOpenPopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPopoverOpen(true);
  };

  const getShiftDisplayText = (code: ShiftCode): string => {
      // Show full description on small screens, just the code on larger ones? Or always code?
      // Let's stick with the code for brevity in the cell. Use tooltip for full name.
      return code;
  };

  const cellTitle = `Dia: ${format(date, 'dd/MM')} - ${shiftCodeToDescription[shift]}\nClique: ${shift === 'T' || shift === 'F' ? 'Alternar Trabalho/Folga' : 'Sem ação'}\nShift/Ctrl/Direito (em T): Detalhes`;

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full h-full flex flex-col items-center justify-center text-xs p-0.5 sm:p-1 select-none relative transition-colors duration-150 ease-in-out group focus:outline-none focus:ring-1 focus:ring-ring focus:z-10',
            shiftStyles[shift],
            // Highlight holidays with a subtle border or background change maybe?
            isHoliday ? 'border border-dashed border-primary/50' : '',
            // Violation ring only for 'T' shifts
            hasViolation && shift === 'T' ? 'ring-1 sm:ring-2 ring-offset-1 ring-yellow-500' : '',
            'hover:brightness-90 dark:hover:brightness-110'
          )}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          title={cellTitle} // Use dynamic title
        >
          {/* Display Shift Code */}
          <span className="font-semibold text-xs sm:text-sm pointer-events-none">{getShiftDisplayText(shift)}</span>

          {/* Display role and hours ONLY if shift is 'T' */}
          {shift === 'T' && (
            <>
              <span className="block truncate text-[8px] sm:text-[10px] opacity-80 pointer-events-none leading-tight">{role || 'S/Função'}</span>
              <span className="block truncate text-[8px] sm:text-[10px] opacity-80 pointer-events-none leading-tight">{baseHours || 'S/Horário'}</span>
              {/* Edit icon ONLY for 'T' shifts */}
              <div
                data-edit-icon="true"
                onClick={handleOpenPopover}
                onContextMenu={(e) => { e.stopPropagation(); e.preventDefault(); handleOpenPopover(e); }}
                className="absolute bottom-0 right-0 p-0.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                aria-label="Editar detalhes"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenPopover(e as any); }}
              >
                <Edit2 className="h-2 w-2 sm:h-2.5 sm:w-2.5 opacity-50 group-hover:opacity-100 pointer-events-none" />
              </div>
            </>
          )}
        </button>
      </PopoverTrigger>

      {/* Popover Content - Render ONLY if shift is 'T' */}
      {shift === 'T' && (
        <PopoverContent className="w-48 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="space-y-2">
            <p className="text-sm font-medium">Editar Detalhes</p>
            {/* Role Select */}
            <div className="space-y-1">
              <Label htmlFor={`role-select-${date.toISOString()}`} className="text-xs">Função</Label>
              <Select value={role || SELECT_NONE_VALUE} onValueChange={handleRoleChange}>
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
            {/* Time Select - Uses times based on date AND isHoliday */}
            <div className="space-y-1">
              <Label htmlFor={`time-select-${date.toISOString()}`} className="text-xs">Horário</Label>
              <Select value={baseHours || SELECT_NONE_VALUE} onValueChange={handleTimeChange}>
                <SelectTrigger id={`time-select-${date.toISOString()}`} className="h-8 text-xs w-full">
                  <Clock className="mr-1 h-3 w-3 flex-shrink-0" />
                  <span className="truncate flex-grow text-left">
                    <SelectValue placeholder="Selecione..." />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE_VALUE} key="time-none">Nenhum</SelectItem>
                  {/* Use availableTimesForDay determined based on the date and holiday status */}
                  {availableTimesForDay.map(t => (
                    <SelectItem key={`time-opt-${t}`} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="w-full mt-2 text-xs h-7" onClick={() => setIsPopoverOpen(false)}>Fechar</Button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

// Helper function to format date (needed internally) - consider moving to utils if used elsewhere
import { format } from 'date-fns';
