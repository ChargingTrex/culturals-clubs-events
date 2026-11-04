import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navKind, readMotion, setMotion, useFirstLoad } from './motion';
import { ToastProvider, useToast } from './Toast';

const BAR = ['/events', '/passes', '/profile'];

describe('navKind: which page transition a navigation gets (§7.5)', () => {
  it('peers in the nav bar fade through', () => {
    expect(navKind('/events', '/passes', BAR)).toBe('tab');
    expect(navKind('/passes', '/events', BAR, true)).toBe('tab');
  });
  it('a child pushes; its parent, or going back, pops', () => {
    expect(navKind('/events', '/events/12', BAR)).toBe('push');
    expect(navKind('/events/12', '/events', BAR)).toBe('pop');
    expect(navKind('/club/budget', '/club/budget/3', BAR)).toBe('push');
    expect(navKind('/club/budget/3', '/club/budget', BAR, true)).toBe('pop');
    expect(navKind('/staff/approvals/dean/7', '/staff/venues', BAR, true)).toBe('pop');
  });
  it('tapping the bar from a child fades through; sign in and out crossfade', () => {
    expect(navKind('/events/12', '/passes', BAR)).toBe('tab');
    expect(navKind('/events', '/signin', BAR)).toBe('crossfade');
    expect(navKind('/signin', '/events', BAR)).toBe('crossfade');
  });
  it('the same path (search or hash) is no page transition', () => {
    expect(navKind('/events', '/events', BAR)).toBe('none');
  });
});

describe('reduce motion switch (§7.6)', () => {
  afterEach(() => setMotion('system'));
  it('puts the choice on <html data-motion> and remembers it', () => {
    setMotion('reduced');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    expect(readMotion()).toBe('reduced');
    setMotion('full');
    expect(document.documentElement.dataset.motion).toBe('full');
    setMotion('system');
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(readMotion()).toBe('system');
  });
});

describe('timers read the motion tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const root = document.documentElement.style;
    root.setProperty('--toast-hold', '1000ms');
    root.setProperty('--dur-sm', '0.1s');
    root.setProperty('--dur-md', '200ms');
    root.setProperty('--stagger', '20ms');
  });
  afterEach(() => {
    vi.useRealTimers();
    const root = document.documentElement.style;
    for (const p of ['--toast-hold', '--dur-sm', '--dur-md', '--stagger']) root.removeProperty(p);
  });

  it('useFirstLoad: the enter class only while the first load plays', () => {
    const { result, rerender } = renderHook(({ ready }) => useFirstLoad(ready), {
      initialProps: { ready: false },
    });
    expect(result.current).toBe('');
    rerender({ ready: true });
    expect(result.current).toBe('cc-enter');
    rerender({ ready: true }); // a re-render inside the window keeps the animation running
    expect(result.current).toBe('cc-enter');
    act(() => vi.advanceTimersByTime(200 + 5 * 20));
    expect(result.current).toBe('');
    rerender({ ready: true });
    expect(result.current).toBe('');
  });

  it('toast: shown for --toast-hold, exits for --dur-sm, then leaves the DOM', () => {
    function Trigger() {
      const toast = useToast();
      return <button onClick={() => toast.show('Registered')}>go</button>;
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Registered');
    expect(toast).toHaveClass('cc-toast');
    expect(toast).toHaveAttribute('data-state', 'shown');

    act(() => vi.advanceTimersByTime(999));
    expect(toast).toHaveAttribute('data-state', 'shown');
    act(() => vi.advanceTimersByTime(1));
    expect(toast).toHaveAttribute('data-state', 'exiting');
    expect(toast).toHaveClass('cc-toast--out');

    act(() => vi.advanceTimersByTime(99));
    expect(screen.queryByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
