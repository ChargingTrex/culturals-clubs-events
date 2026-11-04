/** Class-name helpers shared by the design-system components and pages. */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type ButtonVariant =
  'filled' | 'tonal' | 'outlined' | 'text' | 'approve' | 'reject' | 'danger';

/** Class names for a button, so links (<Link className={buttonClass(…)}>) look identical. */
export function buttonClass(
  variant: ButtonVariant = 'filled',
  size: 'sm' | 'md' | 'lg' = 'md',
  block = false,
  className?: string,
) {
  return cx(
    'cc-btn',
    `cc-btn--${variant}`,
    `cc-btn--${size}`,
    block && 'cc-btn--block',
    'label-lg',
    className,
  );
}
