import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  TEMPORARY LOGO VECTOR — clearly labeled placeholder per brand guidance.
 *
 *  The official ConAI logo SVG has not been supplied yet. This asset follows the
 *  required brand description — "a geometric C enclosing a four-pointed spark" —
 *  and must be replaced when the official SVG arrives (BRAND.logo.status).
 *  It is NOT a new invented brand mark; it is a faithful interim rendering.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface LogoProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  /** Render the wordmark next to the mark. */
  withWordmark?: boolean;
  wordmarkClassName?: string;
}

const SPARK_PATH =
  'M12 1.6c.75 5.1 2.4 7.9 10.4 10.4-8 2.5-9.65 5.3-10.4 10.4-.75-5.1-2.4-7.9-10.4-10.4 8-2.5 9.65-5.3 10.4-10.4Z';

export const Logo = React.forwardRef<SVGSVGElement, LogoProps>(
  ({ size = 28, withWordmark = false, wordmarkClassName, className, ...props }, ref) => {
    const mark = (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        width={size}
        height={size}
        role="img"
        aria-label="ConAI"
        className={cn('shrink-0', className)}
        {...props}
      >
        <title>ConAI (temporary logo vector)</title>
        {/* Geometric C — 270° arc opening to the right */}
        <path
          d="M35.31 12.69A16 16 0 1 0 35.31 35.31"
          fill="none"
          stroke="#7C3AED"
          strokeWidth="6.5"
          strokeLinecap="butt"
        />
        {/* Four-pointed spark enclosed by the C */}
        <g transform="translate(12 12)">
          <path d={SPARK_PATH} fill="#4338CA" />
        </g>
      </svg>
    );

    if (!withWordmark) return mark;

    return (
      <span className={cn('inline-flex items-center gap-2', wordmarkClassName)}>
        {mark}
        <span className="font-heading text-foreground text-lg font-extrabold tracking-tight">
          ConAI
        </span>
      </span>
    );
  },
);
Logo.displayName = 'Logo';
