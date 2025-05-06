'use client';

import React, { useState, useCallback } from 'react';
import type { ShiftCode } from './types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Briefcase, Edit2 } from 'lucide-react'; // Icons for details

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

  const handleClick = useCallback(() => {
    const currentIndex = shiftCycle.indexOf(shift);
    const nextIndex = (currentIndex + 1) % shiftCycle.length;
    onChange(shiftCycle[nextIndex]);
  }, [shift, onChange]);

  // Prevent context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Could implement right-click specific logic here if needed, like opening the popover
    // setIsPopoverOpen(true);
  }, []);


  const handleRoleChange = (value: string) => {
    onDetailChange('role', value);
    // setIsPopoverOpen(false); // Optionally close popover after selection
  };

  const handleTimeChange = (value: string) => {
    onDetailChange('baseHours', value);
    // setIsPopoverOpen(false); // Optionally close popover after selection
  };


  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'w-full h-full flex flex-col items-center justify-center cursor-pointer text-xs p-1 select-none relative transition-colors duration-150 ease-in-out',
            shiftStyles[shift],
            hasViolation && shift === 'T' ? 'ring-2 ring-offset-1 ring-yellow-500' : '', // Visual cue for violation on 'T' cells
            'hover:brightness-90 dark:hover:brightness-110'
          )}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          title={`Clique para alterar estado. Shift+Clique para editar detalhes.`} // Tooltip updated
        >
           <span className="font-semibold text-sm">{shift}</span>
           {(shift === 'T' || shift === 'H') && (
             <>
               <span className="block truncate text-[10px] opacity-80">{role}</span>
               <span className="block truncate text-[10px] opacity-80">{baseHours}</span>
             </>
           )}
            {/* Small edit icon to hint at popover */}
            {(shift === 'T' || shift === 'H') && (
                 <Edit2 className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 opacity-50 group-hover:opacity-100" />
            )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Editar Detalhes</p>
          <div className="space-y-1">
            <Label htmlFor={`role-select-${date.toISOString()}`} className="text-xs">Função</Label>
            <Select value={role} onValueChange={handleRoleChange}>
              <SelectTrigger id={`role-select-${date.toISOString()}`} className="h-8 text-xs">
                 <Briefcase className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map(r => (
                  <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`time-select-${date.toISOString()}`} className="text-xs">Horário</Label>
            <Select value={baseHours} onValueChange={handleTimeChange}>
              <SelectTrigger id={`time-select-${date.toISOString()}`} className="h-8 text-xs">
                <Clock className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Horário" />
              </SelectTrigger>
              <SelectContent>
                {availableTimes.map(t => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
           {/* Close button might be useful */}
           {/* <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setIsPopoverOpen(false)}>Fechar</Button> */}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Need Label component
import { Label } from "@/components/ui/label";
