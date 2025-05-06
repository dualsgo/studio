
'use client';

import React, { useState, useCallback } from 'react';
import type { ShiftCode } from './types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Briefcase, Edit2 } from 'lucide-react'; // Icons for details
import { Label } from "@/components/ui/label"; // Import Label
import { getTimeOptionsForDate } from './types'; // Import function to get time options

interface ShiftCellProps {
  shift: ShiftCode;
  role: string; // Current role for this specific cell/day
  baseHours: string; // Current base hours for this specific cell/day
  date: Date;
  availableRoles: string[]; // Global list of available roles
  // availableTimes removed, will be determined by date
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

// Special value for representing "None" or clearing the selection in the popover selects
const SELECT_NONE_VALUE = "--none--";

export function ShiftCell({
  shift,
  role,
  baseHours,
  date,
  availableRoles,
  onChange,
  onDetailChange,
  hasViolation,
}: ShiftCellProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleClick = useCallback((event: React.MouseEvent) => {
    // Prevent cycling if clicking the edit icon or if popover should open
     if ((event.target as HTMLElement).closest('[data-edit-icon="true"]')) {
         return;
     }
     // Allow opening popover with Shift+Click or Ctrl+Click/Meta+Click/Right-click for T and H shifts
     if ((event.shiftKey || event.ctrlKey || event.metaKey || event.button === 2) && (shift === 'T' || shift === 'H')) {
         // Check if popover is already open to prevent immediate re-closing on right-click context menu event
         if (!isPopoverOpen) {
            setIsPopoverOpen(true);
         }
         event.preventDefault(); // Prevent default context menu on right-click
         return;
     }

    // Cycle shift if none of the above conditions met
    const currentIndex = shiftCycle.indexOf(shift);
    const nextIndex = (currentIndex + 1) % shiftCycle.length;
    onChange(shiftCycle[nextIndex]);
  }, [shift, onChange, isPopoverOpen]); // Added isPopoverOpen to deps

  // Prevent context menu on the main cell div (handled in handleClick)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);


  const handleRoleChange = (value: string) => {
    onDetailChange('role', value === SELECT_NONE_VALUE ? "" : value);
  };

  const handleTimeChange = (value: string) => {
     onDetailChange('baseHours', value === SELECT_NONE_VALUE ? "" : value);
  };

  // Explicitly open popover when clicking the edit icon
   const handleOpenPopover = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent click from bubbling to the cell's main click handler
      setIsPopoverOpen(true);
   };

   // Determine available time options based on the date
   const availableTimesForDay = getTimeOptionsForDate(date);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
         {/* Using a Button as trigger for better accessibility and focus management */}
         <button
          className={cn(
            'w-full h-full flex flex-col items-center justify-center text-xs p-1 select-none relative transition-colors duration-150 ease-in-out group focus:outline-none focus:ring-1 focus:ring-ring focus:z-10', // Added focus styles and z-index
            shiftStyles[shift],
            hasViolation && (shift === 'T' || shift === 'H') ? 'ring-2 ring-offset-1 ring-yellow-500' : '', // Highlight violation on T/H
            'hover:brightness-90 dark:hover:brightness-110'
          )}
          onClick={handleClick}
          onContextMenu={handleContextMenu} // Prevent context menu on the button itself
          title={`Clique: Alterar Estado | Shift/Ctrl/Direito: Editar Detalhes`} // Updated tooltip
        >
           <span className="font-semibold text-sm pointer-events-none">{shift}</span>
            {/* Display role and hours only if shift is T or H */}
           {(shift === 'T' || shift === 'H') && (
             <>
               <span className="block truncate text-[10px] opacity-80 pointer-events-none">{role || 'Sem função'}</span>
               <span className="block truncate text-[10px] opacity-80 pointer-events-none">{baseHours || 'Sem horário'}</span>
                {/* Edit icon specifically for T and H shifts */}
               <div
                 data-edit-icon="true" // Keep data attribute for targeting
                 onClick={handleOpenPopover} // Open popover on icon click
                 onContextMenu={(e) => { e.stopPropagation(); e.preventDefault(); handleOpenPopover(e); }} // Also open on right-click icon
                 className="absolute bottom-0.5 right-0.5 p-0.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer" // Make it look clickable
                 aria-label="Editar detalhes"
                 role="button" // Semantically a button
                 tabIndex={0} // Make it focusable
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenPopover(e as any); }} // Keyboard activation
               >
                 <Edit2 className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100 pointer-events-none" />
               </div>
             </>
           )}
        </button>
      </PopoverTrigger>
      {/* Popover Content - Render only if shift allows editing */}
      {(shift === 'T' || shift === 'H') && (
          <PopoverContent className="w-48 p-2" onOpenAutoFocus={(e) => e.preventDefault()}> {/* Prevent focus stealing */}
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
               {/* Time Select */}
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
                    {/* Use availableTimesForDay determined based on the date */}
                    {availableTimesForDay.map(t => (
                      <SelectItem key={`time-opt-${t}`} value={t} className="text-xs">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
               {/* Close button */}
               <Button variant="outline" size="sm" className="w-full mt-2 text-xs h-7" onClick={() => setIsPopoverOpen(false)}>Fechar</Button>
            </div>
          </PopoverContent>
       )}
    </Popover>
  );
}
