import { Navigate, useLocation } from 'react-router-dom';
import { useCapabilities } from '../auth/useCapabilities';
import { firstAllowedPath, type PageDef } from '../nav/pages';
import { Loading } from './Empty';
import { ProblemView } from './ProblemView';

/** `/` → the first page this role is offered. */
export function HomeRedirect() {
  const { capabilities, isLoading } = useCapabilities();
  if (!capabilities) return isLoading ? <Loading /> : null;
  return <Navigate to={firstAllowedPath(capabilities)} replace />;
}

/** A page the role is offered but which another slice builds. */
export function NotBuiltPage({ page }: { page: PageDef }) {
  return (
    <>
      <h1>{page.title}</h1>
      <div className="note mt-4">
        This screen is part of checklist row <strong>{page.slice}</strong> and is not in this build.
        The link is offered because your role may open it; the route guard and the API have already
        agreed you can.
      </div>
    </>
  );
}

export function NotFoundPage() {
  const location = useLocation();
  return (
    <ProblemView
      error={{
        status: 404,
        code: 'NOT_FOUND',
        title: 'No such page',
        detail: `Nothing lives at ${location.pathname}.`,
        instance: location.pathname,
      }}
    />
  );
}
