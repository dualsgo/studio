
import { Employee } from './types';

export const SHIFT_HOURS = {
  WEEKDAY: ['10h às 18h20', '12h às 20h20', '13h40 às 22h'],
  SUNDAY: ['12h às 20h', '13h às 21h'],
  HOLIDAY: ['12h às 16h', '13h às 17h', '14h às 18h', '15h às 19h', '16h às 20h', '17h às 21h']
};

export const SHIFT_DEFINITIONS = [
  { name: 'Abertura', label: 'Abertura (10h-18h20)', hours: '10h às 18h20' },
  { name: 'Intermediário', label: 'Intermediário (12h-20h20)', hours: '12h às 20h20' },
  { name: 'Fechamento', label: 'Fechamento (13h40-22h)', hours: '13h40 às 22h' }
];

const names = [
  'Jheferson Lima', 'Lidi Santos', 'Renata Silva', 'Thais Souza', 'Marcos Oliveira', 
  'Camila Peixoto', 'Cátia Souza', 'Erika Melo', 'Luiz Fernando', 'Carol Dias',
  'Aline Rocha', 'Bianca Vaz', 'Lidiane Costa', 'Luiza Paes', 'Rafael Silva'
];

const daysOff = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export const MOCK_EMPLOYEES: Employee[] = names.map((name, i) => {
  const isYA = i > 12; 
  const defaultHour = i < 7 ? '10h às 18h20' : (i < 10 ? '12h às 20h20' : '13h40 às 22h');
  return {
    id: (i + 1).toString(),
    name,
    isYoungApprentice: isYA,
    courseDay: isYA ? 'Quarta-feira' : undefined,
    status: 'active',
    statusColor: i % 2 === 0 ? '#ff8400' : '#3b82f6',
    shifts: {
      "2026-02": Array.from({ length: 31 }, () => (Math.random() > 0.2 ? 'T' : 'F'))
    },
    dailyHours: {
      "2026-02": Array(31).fill(defaultHour)
    },
    workPeriod: defaultHour,
    preferredDayOff: daysOff[i % daysOff.length],
    shiftName: i < 7 ? 'Abertura' : (i < 10 ? 'Intermediário' : 'Fechamento')
  }
});
