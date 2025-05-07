import {
  RotateCcw,
  FileText,
  UserPlus,
  Save,      // Added Save icon
  Upload,    // Added Upload icon
  type LucideIcon,
} from 'lucide-react';

// Basic SVG placeholder for WhatsApp - replace with a proper SVG if needed
const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* Simplified path for WhatsApp icon */}
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
     <path d="M16.5 15.5c-.2-.1-.8-.4-1-.4-.2 0-.3-.1-.5.1-.7.5-1.2 1-1.6 1.1-.4.1-.8.1-1.1 0-.3-.1-.6-.2-.9-.4-.3-.2-.6-.4-.9-.7-.3-.3-.6-.6-.8-.9-.2-.3-.4-.6-.5-.9-.1-.3-.1-.7 0-1 .1-.4.5-1.1 1-1.6.2-.1.1-.3 0-.5-.1-.2-.4-.8-.4-1 0-.2-.1-.3-.2-.5-.1-.2-.2-.2-.4-.2h-.5c-.2 0-.5.1-.7.3-.2.2-.8.7-.8 1.7 0 1 .8 2 .9 2.1.1.1 1.3 2.1 3.2 2.8.4.2.8.3 1.1.4.5.1 1 .1 1.4-.1.5-.2 1.2-.5 1.4-.9.2-.4.2-.8.1-.9-.1-.1-.2-.2-.4-.3z"></path>
  </svg>
);


export type Icon = LucideIcon;

export const Icons = {
  reload: RotateCcw,
  document: FileText,
  whatsapp: WhatsAppIcon, // Use the placeholder or a real SVG
  userPlus: UserPlus,
  save: Save,          // Added Save icon mapping
  upload: Upload,        // Added Upload icon mapping
};
