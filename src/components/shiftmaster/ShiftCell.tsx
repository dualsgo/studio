
'use client';

import React, { useState, useCallback } from 'react';
import type { ShiftCode } from './types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Briefcase, Edit2 } from 'lucide-react'; // Icons for details
import { Label } from "@/components/ui/label"; // Import Label

interface ShiftCellProps {
  shift: ShiftCode;
  role: string;
  baseHours: string;
  date: Date;
  availableRoles: string[];
  availableTimes: string[];
  onChange: (newShift: ShiftCode) => void;
  onDetailChange: (field: 'role' | 'baseHours', value: string) => void;
  hasViolation: boolean; // To style the cell if there's a violation
}

const shiftStyles: Record<ShiftCode, string> = {
  T: 'bg-destructive text-destructive-foreground', // Red background, light text
  F: 'bg-muted text-muted-foreground', // Gray background, darker gray text
  H: 'bg-primary text-primary-foreground', // Blue background, light text
  D: 'bg-background text-foreground border border-dashed border-muted-foreground/50', // Default background, subtle border
};

const shiftCycle: ShiftCode[] = ['D', 'T', 'F', 'H']; // Cycle order on click

export function ShiftCell({
  shift,
  role,
  baseHours,
  date,
  availableRoles,
  availableTimes,
  onChange,
  onDetailChange,
  hasViolation,
}: ShiftCellProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleClick = useCallback((event: React.MouseEvent) => {
    // Only cycle shift if not clicking on the edit icon area implicitly
     if ((event.target as HTMLElement).closest('svg[data-edit-icon="true"]')) {
         return; // Don't cycle if clicking near the icon
     }
     // Allow opening popover with Shift+Click
     if (event.shiftKey && (shift === 'T' || shift === 'H')) {
         setIsPopoverOpen(true);
         return; // Prevent cycling
     }

    const currentIndex = shiftCycle.indexOf(shift);
    const nextIndex = (currentIndex + 1) % shiftCycle.length;
    onChange(shiftCycle[nextIndex]);
  }, [shift, onChange]);

  // Prevent context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Open popover on right-click (or Ctrl+Click/Meta+Click) for T and H shifts
    if ((e.ctrlKey || e.metaKey || e.button === 2) && (shift === 'T' || shift === 'H')) {
        setIsPopoverOpen(true);
    }
  }, [shift]);


  const handleRoleChange = (value: string) => {
    // Treat a special value like "none" or a specific placeholder value as clearing the role
    onDetailChange('role', value === "select-none" ? "" : value);
    // setIsPopoverOpen(false); // Keep open for easier multi-editing
  };

  const handleTimeChange = (value: string) => {
     onDetailChange('baseHours', value === "select-none" ? "" : value);
    // setIsPopoverOpen(false); // Keep open
  };

  const handleOpenPopover = (e: React.MouseEvent) => {
     e.stopPropagation(); // Prevent click from bubbling to the cell's main click handler
     setIsPopoverOpen(true);
   };


  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'w-full h-full flex flex-col items-center justify-center cursor-pointer text-xs p-1 select-none relative transition-colors duration-150 ease-in-out group', // Added group for hover state on icon
            shiftStyles[shift],
            hasViolation && shift === 'T' ? 'ring-2 ring-offset-1 ring-yellow-500' : '', // Visual cue for violation on 'T' cells
            'hover:brightness-90 dark:hover:brightness-110'
          )}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          title={`Clique: Alterar Estado | Shift+Clique ou Botão Direito: Editar | Ícone: Editar`} // Updated tooltip
        >
           <span className="font-semibold text-sm">{shift}</span>
           {(shift === 'T' || shift === 'H') && (
             <>
               <span className="block truncate text-[10px] opacity-80">{role || 'Sem função'}</span>
               <span className="block truncate text-[10px] opacity-80">{baseHours || 'Sem horário'}</span>
             </>
           )}
            {/* Small edit icon to hint at popover */}
            {(shift === 'T' || shift === 'H') && (
                 <button
                     data-edit-icon="true" // Add data attribute
                     onClick={handleOpenPopover}
                     className="absolute bottom-0.5 right-0.5 p-0.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-ring"
                     aria-label="Editar detalhes"
                 >
                    <Edit2 className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100" />
                 </button>
            )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Editar Detalhes</p>
          {/* Role Select */}
          <div className="space-y-1">
            <Label htmlFor={`role-select-${date.toISOString()}`} className="text-xs">Função</Label>
            <Select value={role || "select-none"} onValueChange={handleRoleChange}>
              <SelectTrigger id={`role-select-${date.toISOString()}`} className="h-8 text-xs">
                 <Briefcase className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent>
                {/* Add a "None" option if role can be empty */}
                <SelectItem value="select-none" key="role-none">Nenhuma</SelectItem>
                {availableRoles.map(r => (
                  <SelectItem key={`role-opt-${r}`} value={r} className="text-xs">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
           {/* Time Select */}
          <div className="space-y-1">
            <Label htmlFor={`time-select-${date.toISOString()}`} className="text-xs">Horário</Label>
            <Select value={baseHours || "select-none"} onValueChange={handleTimeChange}>
              <SelectTrigger id={`time-select-${date.toISOString()}`} className="h-8 text-xs">
                <Clock className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Horário" />
              </SelectTrigger>
              <SelectContent>
                 {/* Add a "None" option if hours can be empty */}
                 <SelectItem value="select-none" key="time-none">Nenhum</SelectItem>
                {availableTimes.map(t => (
                  <SelectItem key={`time-opt-${t}`} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
           {/* Close button */}
           <Button variant="outline" size="sm" className="w-full mt-2 text-xs h-7" onClick={() => setIsPopoverOpen(false)}>Fechar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
