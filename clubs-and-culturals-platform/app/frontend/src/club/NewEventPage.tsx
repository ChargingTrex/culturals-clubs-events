import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Icon, Switch } from '../shared/ds';
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
  start_date: string;
  start_hour: string;
  end_date: string;
  end_hour: string;
  capacity: string;
  expected_attendance: string;
  budget_template: string;
  submit: boolean;
}

/** Events are booked in whole hours (C-02): a date plus an hour, in the browser's zone. */
const toIso = (date: string, hour: string): string =>
  date ? new Date(`${date}T${hour}:00`).toISOString() : '';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

function FieldError({ error, field }: { error: ApiError | null; field: string }) {
  const hit = error?.errors.find((e) => e.field === field);
  return hit ? (
    <p className="mt-1 text-body-md text-danger" role="alert">
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
    start_date: '',
    start_hour: '18',
    end_date: '',
    end_hour: '20',
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
      starts_at: toIso(form.start_date, form.start_hour),
      ends_at: toIso(form.end_date, form.end_hour),
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
      <p className="mb-3 text-body-md">
        <Link
          to="/club/events"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Icon name="chevron-left" size={16} /> Club events
        </Link>
      </p>
      <h1>New event</h1>
      <p className="mt-1.5 mb-5 max-w-[62ch] text-ink-muted">
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
            <p className="text-body-md text-ink-muted sm:col-span-2">
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
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label" htmlFor="ne-start">
                  Start date
                </label>
                <input
                  id="ne-start"
                  type="date"
                  className="field"
                  value={form.start_date}
                  onChange={(e) => {
                    const date = e.target.value;
                    // The end date follows the start until it is set on its own.
                    setForm((f) => ({
                      ...f,
                      start_date: date,
                      end_date: f.end_date && f.end_date !== f.start_date ? f.end_date : date,
                    }));
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="ne-start-hour">
                  Start hour
                </label>
                <select
                  id="ne-start-hour"
                  className="field"
                  value={form.start_hour}
                  onChange={(e) => set('start_hour', e.target.value)}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <FieldError error={err} field="starts_at" />
          </div>
          <div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label" htmlFor="ne-end">
                  End date
                </label>
                <input
                  id="ne-end"
                  type="date"
                  className="field"
                  value={form.end_date}
                  onChange={(e) => set('end_date', e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="ne-end-hour">
                  End hour
                </label>
                <select
                  id="ne-end-hour"
                  className="field"
                  value={form.end_hour}
                  onChange={(e) => set('end_hour', e.target.value)}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <FieldError error={err} field="ends_at" />
          </div>
          <p className="text-body-md text-ink-muted sm:col-span-2">
            Venues are booked in whole hours. Two events in one venue clash if they share an hour.
          </p>
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
              <p className="mt-1 text-caption text-ink-muted">
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
              <div className="overflow-hidden rounded-md border border-line">
                <table className="cc-sheet">
                  <thead>
                    <tr>
                      <th className="label-md" scope="col">
                        Head
                      </th>
                      <th className="label-md cc-al-right" scope="col">
                        Requested
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {template.lines.map((l) => (
                      <tr key={l.head}>
                        <td className="cc-cell--wrap body-md py-1.5">
                          {l.head}
                          <span className="block caption text-ink-muted">{l.explanation}</span>
                        </td>
                        <td className="cc-cell--money figure-md">{inr(l.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="body-md">Contingency {template.contingency.percent}%</td>
                      <td className="cc-cell--money figure-md">
                        {inr(template.contingency.amount)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="label-lg">Total requested</td>
                      <td className="cc-cell--money figure-md" data-testid="template-total">
                        {inr(template.total_requested)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2">
                {template.requires_vc ? (
                  <Pill tone="warn">
                    Above {inr(template.vc_threshold)} — needs the Vice-Chancellor too
                  </Pill>
                ) : (
                  <Pill tone="ok">Society and Dean only</Pill>
                )}
              </p>
              <div className="mt-3">
                <Switch
                  label="Send for approval now"
                  checked={form.submit}
                  onChange={(on) => set('submit', on)}
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-body-md text-ink-muted">
              Saved as a draft with an empty budget. Add lines under Budget, then send it from Club
              events.
            </p>
          )}

          <Button type="submit" block className="mt-4" disabled={create.isPending}>
            {create.isPending
              ? 'Saving…'
              : form.budget_template && form.submit
                ? 'Propose and send'
                : 'Save draft'}
          </Button>
        </aside>
      </form>
      {err ? <ProblemView error={err} /> : null}
    </>
  );
}
