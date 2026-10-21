import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes, Providers } from '../App';
import { writeSession } from '../shared/auth/tokens';
import { createQueryClient } from '../shared/queryClient';
import { makeSession } from './capabilities';
import { state } from './server';

/** Mount the real routes at `path`, optionally already signed in as `roles`. */
export function renderAt(path: string, { roles }: { roles?: string[] } = {}) {
  if (roles) {
    state.roles = roles;
    writeSession(makeSession(roles));
  }
  const client = createQueryClient({ retry: false });
  return render(
    <Providers client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Providers>,
  );
}
