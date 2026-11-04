import { IconButton, type IconName } from '../ds';
import { THEMES, setTheme, useTheme, type Theme } from './theme';

const META: Record<Theme, { icon: IconName; name: string }> = {
  system: { icon: 'monitor', name: 'System (follows your device)' },
  light: { icon: 'sun', name: 'Light' },
  dark: { icon: 'moon', name: 'Dark' },
};

/** One button: System → Light → Dark. Its label says the current theme and the next. */
export function ThemeToggle({ variant = 'standard' }: { variant?: 'standard' | 'tonal' }) {
  const theme = useTheme();
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? 'system';
  return (
    <IconButton
      icon={META[theme].icon}
      size="sm"
      variant={variant}
      label={`Theme: ${META[theme].name}. Switch to ${META[next].name.split(' ')[0]}`}
      data-testid="theme-toggle"
      data-theme-value={theme}
      onClick={() => setTheme(next)}
    />
  );
}
