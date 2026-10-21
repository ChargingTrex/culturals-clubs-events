import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireCapability } from './shared/nav/guards';
import { PAGES, pageForPath, type PageDef } from './shared/nav/pages';
import { createQueryClient } from './shared/queryClient';
import { AppShell } from './shared/ui/AppShell';
import { ToastProvider } from './shared/ui/Toast';
import { HomeRedirect, NotBuiltPage, NotFoundPage } from './shared/ui/pages';
import { EventDetailPage } from './student/EventDetailPage';
import { EventsPage } from './student/EventsPage';
import { PassesPage } from './student/PassesPage';
import { ProfilePage } from './student/ProfilePage';
import { SignInPage } from './student/SignInPage';

function page(path: string): PageDef {
  const def = pageForPath(path);
  if (!def) throw new Error(`No page table entry for ${path}`);
  return def;
}

const STUDENT_SCREENS: Array<[PageDef, React.ReactElement]> = [
  [page('/events'), <EventsPage key="events" />],
  [page('/passes'), <PassesPage key="passes" />],
  [page('/profile'), <ProfilePage key="profile" />],
];

const BUILT = new Set(STUDENT_SCREENS.map(([def]) => def.path));

/** Routes only — tests mount this inside a MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        {STUDENT_SCREENS.map(([def, element]) => (
          <Route
            key={def.path}
            path={def.path}
            element={
              <RequireCapability need={def.need} probe={def.probe}>
                {element}
              </RequireCapability>
            }
          />
        ))}
        <Route path="/events/:id" element={<EventDetailPage />} />
        {PAGES.filter((def) => !BUILT.has(def.path)).map((def) => (
          <Route
            key={def.path}
            path={def.path}
            element={
              <RequireCapability need={def.need} probe={def.probe}>
                <NotBuiltPage page={def} />
              </RequireCapability>
            }
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function Providers({
  client,
  children,
}: {
  client?: QueryClient;
  children: React.ReactNode;
}) {
  const queryClient = useMemo(() => client ?? createQueryClient(), [client]);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  );
}
