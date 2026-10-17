import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary border-transparent',
        secondary: 'bg-secondary text-secondary-foreground border-transparent',
        indigo: 'bg-indigo/10 text-indigo border-transparent',
        outline: 'text-muted-foreground',
        success: 'bg-success/10 text-success border-transparent',
        warning: 'bg-warning/10 text-warning border-transparent',
        destructive: 'bg-destructive/10 text-destructive border-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
