import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { clearSession } from '../shared/auth/tokens';
import { resetState, server } from './server';

// jsdom has no canvas; draw a deterministic stand-in that still carries the value.
vi.mock('../shared/ui/qr', () => ({
  qrDataUrl: async (text: string) => `data:image/svg+xml,${encodeURIComponent(text)}`,
}));

// findBy*/waitFor default to 1 s, which flakes on a loaded machine; the flows are not slow.
configure({ asyncUtilTimeout: 10_000 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetState();
  clearSession();
  localStorage.clear();
});
afterAll(() => server.close());
