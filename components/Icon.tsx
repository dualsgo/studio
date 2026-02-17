
import React from 'react';

interface IconProps {
  name: string;
  className?: string;
  fill?: boolean;
}

export const Icon: React.FC<IconProps> = ({ name, className = '', fill = false }) => {
  return (
    <span 
      className={`material-symbols-rounded select-none inline-flex items-center justify-center ${className} ${fill ? 'fill-1' : ''}`}
      style={{ fontVariationSettings: fill ? "'FILL' 1" : "'FILL' 0" }}
    >
      {name}
    </span>
  );
};
