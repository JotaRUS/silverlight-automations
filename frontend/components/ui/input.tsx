'use client';

import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Input(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500',
        props.className
      )}
    />
  );
}
