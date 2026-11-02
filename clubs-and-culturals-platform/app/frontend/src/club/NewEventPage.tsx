import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import type { Page } from '../shared/api/types';
import { inr } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import {
  clubApi,
  KINDS,
  type BudgetTemplates,
  type EventCreate,
  type EventCreated,
  type EventKind,
  type Venue,
} from './api';
import { useMyClubs } from './useMyClubs';

const NO_TEMPLATE = '';

interface FormState {
  club: string;
  title: string;
  kind: EventKind;
  description: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  capacity: string;
  expected_attendance: string;
  budget_template: string;
  submit: boolean;
}

/** `datetime-local` value → ISO with the browser's offset applied. */
const toIso = (local: string): string => (local ? new Date(local).toISOString() : '');

function FieldError({ error, field }: { error: ApiError | null; field: string }) {
  const hit = error?.errors.find((e) => e.field === field);
  return hit ? (
    <p className="mt-1 text-[0.82rem] text-bad" role="alert">
      {hit.message}
    </p>
  ) : null;
}

export function NewEventPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { clubs, isPending: clubsPending } = useMyClubs('clubs_can_propose');

  const [form, setForm] = useState<FormState>({
    club: '',
    title: '',
    kind: 'performance',
    description: '',
    venue: '',
    starts_at: '',
    ends_at: '',
    capacity: '100',
    expected_attendance: '80',
    budget_template: NO_TEMPLATE,
    submit: false,
  });
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const club = form.club || clubs[0]?.id || '';
  const expected = Math.max(1, Number(form.expected_attendance) || 1);

  const venues = useQuery<Page<Venue>, ApiError>({
    queryKey: ['venues'],
    queryFn: () => clubApi.venues(),
    staleTime: 10 * 60_000,
  });
  const templates = useQuery<BudgetTemplates, ApiError>({
    queryKey: ['budget', 'templates', expected],
    queryFn: () => clubApi.budget.templates(expected),
    placeholderData: (prev) => prev,
  });

  const activeVenues = (venues.data?.results ?? []).filter((v) => v.active !== false);
  const venue = activeVenues.find((v) => v.id === form.venue);
  const template = templates.data?.templates.find((t) => t.name === form.budget_template);

  const create = useMutation<EventCreated, ApiError, EventCreate>({
    mutationFn: (body) => clubApi.events.create(body),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
      const clashes = created.soft_clashes.length;
      toast.show(
        created.approval
          ? `Sent for approval${clashes ? ` — ${clashes} soft clash${clashes > 1 ? 'es' : ''} noted` : ''}`
          : 'Saved as a draft — the Treasurer can price it now',
      );
      navigate(`/club/events/${created.id}`);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      club,
      title: form.title.trim(),
      kind: form.kind,
      description: form.description.trim(),
      venue: form.venue,
      starts_at: toIso(form.starts_at),
      ends_at: toIso(form.ends_at),
      capacity: Number(form.capacity),
      expected_attendance: Number(form.expected_attendance),
      ...(form.budget_template ? { budget_template: form.budget_template } : {}),
      submit: form.budget_template ? form.submit : false,
    });
  };

  if (clubsPending) return <Loading />;
  if (clubs.length === 0) {
    return (
      <>
        <h1>New event</h1>
        <Empty>Only a club&apos;s office bearers can propose events.</Empty>
      </>
    );
  }

  const err = create.error;

  return (
    <>
      <p className="mb-3 text-[0.875rem]">
        <Link to="/club/events" className="text-muted hover:underline">
          ← Club events
        </Link>
      </p>
      <h1>New event</h1>
      <p className="mt-1.5 mb-5 max-w-[62ch] text-muted">
        Propose it here. Pick a budget template to send it straight for approval, or save it as a
        draft and let the Treasurer price it line by line.
      </p>

      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[1fr_340px]" noValidate>
        <div className="panel grid gap-4 sm:grid-cols-2">
          {clubs.length > 1 ? (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ne-club">
                Club
              </label>
              <select
                id="ne-club"
                className="field"
                value={club}
                onChange={(e) => set('club', e.target.value)}
              >
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-[0.9rem] text-muted sm:col-span-2">
              For <strong className="text-ink">{clubs[0]?.name}</strong>
            </p>
          )}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ne-title">
              Title
            </label>
            <input
              id="ne-title"
              className="field"
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
            <FieldError error={err} field="title" />
          </div>
          <div>
            <label className="label" htmlFor="ne-kind">
              Kind
            </label>
            <select
              id="ne-kind"
              className="field"
              value={form.kind}
              onChange={(e) => set('kind', e.target.value as EventKind)}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ne-venue">
              Venue
            </label>
            <select
              id="ne-venue"
              className="field"
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
            >
              <option value="">Choose a venue</option>
              {activeVenues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · seats {v.capacity}
                </option>
              ))}
            </select>
            {venues.error ? <ProblemView error={venues.error} /> : null}
            <FieldError error={err} field="venue" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ne-desc">
              Description
            </label>
            <textarea
              id="ne-desc"
              className="field min-h-[90px]"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ne-start">
              Starts
            </label>
            <input
              id="ne-start"
              type="datetime-local"
              className="field"
              value={form.starts_at}
              onChange={(e) => set('starts_at', e.target.value)}
            />
            <FieldError error={err} field="starts_at" />
          </div>
          <div>
            <label className="label" htmlFor="ne-end">
              Ends
            </label>
            <input
              id="ne-end"
              type="datetime-local"
              className="field"
              value={form.ends_at}
              onChange={(e) => set('ends_at', e.target.value)}
            />
            <FieldError error={err} field="ends_at" />
          </div>
          <div>
            <label className="label" htmlFor="ne-capacity">
              Capacity
            </label>
            <input
              id="ne-capacity"
              type="number"
              min={1}
              className="field"
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
            />
            {venue ? (
              <p className="mt-1 text-[0.8rem] text-muted">
                {venue.name} seats {venue.capacity}.
              </p>
            ) : null}
            <FieldError error={err} field="capacity" />
          </div>
          <div>
            <label className="label" htmlFor="ne-expected">
              Expected attendance
            </label>
            <input
              id="ne-expected"
              type="number"
              min={1}
              className="field"
              value={form.expected_attendance}
              onChange={(e) => set('expected_attendance', e.target.value)}
            />
            <FieldError error={err} field="expected_attendance" />
          </div>
        </div>

        <aside className="panel self-start">
          <h3>Budget</h3>
          <label className="label mt-3" htmlFor="ne-template">
            Template
          </label>
          <select
            id="ne-template"
            className="field"
            value={form.budget_template}
            onChange={(e) => {
              set('budget_template', e.target.value);
              set('submit', e.target.value !== NO_TEMPLATE);
            }}
          >
            <option value={NO_TEMPLATE}>None — the Treasurer prices it</option>
            {(templates.data?.templates ?? []).map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          {templates.error ? <ProblemView error={templates.error} /> : null}

          {template ? (
            <div className="mt-3">
              <table className="w-full text-[0.875rem]">
                <tbody>
                  {template.lines.map((l) => (
                    <tr key={l.head} className="border-b border-line">
                      <td className="py-1.5">
                        {l.head}
                        <span className="block text-[0.75rem] text-muted">{l.explanation}</span>
                      </td>
                      <td className="py-1.5 text-right">{inr(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-line">
                    <td className="py-1.5">Contingency {template.contingency.percent}%</td>
                    <td className="py-1.5 text-right">{inr(template.contingency.amount)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold">Total requested</td>
                    <td className="py-1.5 text-right font-semibold" data-testid="template-total">
                      {inr(template.total_requested)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2">
                {template.requires_vc ? (
                  <Pill tone="warn">
                    Above {inr(template.vc_threshold)} — needs the Vice-Chancellor too
                  </Pill>
                ) : (
                  <Pill tone="ok">Society and Dean only</Pill>
                )}
              </p>
              <label className="mt-3 flex items-center gap-2 text-[0.9rem]">
                <input
                  type="checkbox"
                  checked={form.submit}
                  onChange={(e) => set('submit', e.target.checked)}
                />
                Send for approval now
              </label>
            </div>
          ) : (
            <p className="mt-3 text-[0.875rem] text-muted">
              Saved as a draft with an empty budget. Add lines under Budget, then send it from Club
              events.
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary mt-4 w-full justify-center"
            disabled={create.isPending}
          >
            {create.isPending
              ? 'Saving…'
              : form.budget_template && form.submit
                ? 'Propose and send'
                : 'Save draft'}
          </button>
        </aside>
      </form>
      {err ? <ProblemView error={err} /> : null}
    </>
  );
}
