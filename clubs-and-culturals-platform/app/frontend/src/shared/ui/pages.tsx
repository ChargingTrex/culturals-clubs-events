import { Link, Navigate, useLocation } from 'react-router-dom';
import { useCapabilities } from '../auth/useCapabilities';
import { EmptyState, buttonClass } from '../ds';
import { firstAllowedPath, type PageDef } from '../nav/pages';
import { Loading } from './Empty';

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
      <EmptyState
        className="mt-5 rounded-lg border border-dashed border-line"
        title="Not in this build yet"
      >
        This screen is part of checklist row <strong>{page.slice}</strong>. The link is offered
        because your role may open it; the route guard and the API have already agreed you can.
      </EmptyState>
    </>
  );
}

export function NotFoundPage() {
  const location = useLocation();
  return (
    <EmptyState
      className="rounded-lg border border-dashed border-line"
      title="No such page"
      action={
        <Link className={buttonClass('tonal', 'sm')} to="/">
          Go to your first page
        </Link>
      }
    >
      Nothing lives at <span className="mono-md">{location.pathname}</span>.
    </EmptyState>
  );
}
