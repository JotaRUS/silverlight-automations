import type { PropsWithChildren } from 'react';

import { cn } from '@/lib/utils';

interface BadgeProps extends PropsWithChildren {
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

const toneClasses: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700'
};

export function Badge({ children, tone = 'neutral' }: BadgeProps): JSX.Element {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-medium', toneClasses[tone])}>
      {children}
    </span>
  );
}
