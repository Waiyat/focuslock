import React from 'react';
import { TouchableOpacity, Text, TouchableOpacityProps } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ title, variant = 'primary', className, ...props }: ButtonProps) {
  const baseClasses = 'px-4 py-3 rounded-xl items-center justify-center';
  const variantClasses = {
    primary: 'bg-blue-600',
    secondary: 'bg-zinc-800',
    danger: 'bg-red-600',
  }[variant];

  return (
    <TouchableOpacity className={`${baseClasses} ${variantClasses} ${className || ''}`} {...props}>
      <Text className="text-white font-semibold text-base">{title}</Text>
    </TouchableOpacity>
  );
}
