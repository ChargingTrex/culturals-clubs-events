import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, FileDrop, Icon, Switch } from '../shared/ds';
import type { ApiError } from '../shared/api/client';
import type { Page } from '../shared/api/types';
import { inr } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { FilePreview, canPreviewFile } from '../shared/ui/DocumentPreview';
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
import { CSV_TEMPLATE } from './budgetShared';
import { useMyClubs } from './useMyClubs';
import { useCapabilities } from '../shared/auth/useCapabilities';

const NO_TEMPLATE = '';
/** Budget select value for "I am uploading the budget sheet" (not a template name). */
const UPLOAD_SHEET = '__upload__';
const PROPOSAL_TYPES = '.pdf,.doc,.docx';
const PROPOSAL_MAX_BYTES = 10 * 1024 * 1024;

interface Proposed {
  created: EventCreated;
  sent: boolean;
  /** A step after the draft was saved that the API refused; the draft itself is kept. */
  failed?: { step: 'proposal document' | 'budget sheet' | 'sending for approval'; error: ApiError };
}

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
  const { capabilities } = useCapabilities();
  const [proposal, setProposal] = useState<File | null>(null);
  const [sheet, setSheet] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState<File | null>(null);

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
  const uploading = form.budget_template === UPLOAD_SHEET;
  const template = templates.data?.templates.find((t) => t.name === form.budget_template);
  // The sheet upload writes budget lines, which only the President, VP and Treasurer may do.
  const canUploadSheet = capabilities?.clubs_with_budget_access.includes(club) ?? false;
  const proposalTooBig = proposal !== null && proposal.size > PROPOSAL_MAX_BYTES;
  const priced = template !== undefined || (uploading && sheet !== null);
  const sending = priced && form.submit;

  /**
   * A file cannot ride in the JSON create, and a submitted proposal is locked, so
   * with a file the order is: save the draft, attach the files, then send. If a
   * later step is refused the draft is kept and the event page says what to redo.
   */
  const create = useMutation<Proposed, ApiError, EventCreate>({
    mutationFn: async (body) => {
      const staged = proposal !== null || (uploading && sheet !== null);
      const created = await clubApi.events.create(staged ? { ...body, submit: false } : body);
      if (!staged) return { created, sent: created.approval !== null };
      let step: NonNullable<Proposed['failed']>['step'] = 'proposal document';
      try {
        if (proposal) await clubApi.events.setProposalDocument(created.id, proposal);
        if (uploading && sheet) {
          step = 'budget sheet';
          const data = new FormData();
          data.append('file', sheet);
          data.append('mode', 'replace');
          await clubApi.budget.importLines(created.budget?.id ?? '', data);
        }
        if (sending) {
          step = 'sending for approval';
          await clubApi.events.submit(created.id);
          return { created, sent: true };
        }
      } catch (error) {
        return { created, sent: false, failed: { step, error: error as ApiError } };
      }
      return { created, sent: false };
    },
    onSuccess: ({ created, sent, failed }) => {
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
      const clashes = created.soft_clashes.length;
      toast.show(
        failed
          ? `Saved as a draft, but the ${failed.step} step was refused: ${failed.error.detail || failed.error.title}`
          : sent
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
      ...(template ? { budget_template: template.name } : {}),
      submit: template ? form.submit : false,
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
        Propose it here and attach the proposal document. For the budget, pick a template, upload
        the budget sheet, or save a draft and let the Treasurer enter it line by line.
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
              onChange={(e) => {
                set('venue', e.target.value);
                // Capacity starts at what the venue seats; it stays editable below.
                const picked = activeVenues.find((v) => v.id === e.target.value);
                if (picked) set('capacity', String(picked.capacity));
              }}
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
              max={venue?.capacity}
              className="field"
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
            />
            {venue ? (
              <p className="mt-1 text-caption text-ink-muted">
                Filled from {venue.name}, which seats {venue.capacity}. Lower it if you are
                admitting fewer.
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
            <option value={NO_TEMPLATE}>None — the Treasurer enters it</option>
            {canUploadSheet ? <option value={UPLOAD_SHEET}>Upload the budget sheet (CSV)</option> : null}
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
          ) : uploading ? (
            <div className="mt-3">
              <label className="label" htmlFor="ne-sheet">
                Budget sheet (CSV: head, amount, basis optional)
              </label>
              <FileDrop
                id="ne-sheet"
                                accept=".csv,text/csv"
                onChange={(e) => setSheet(e.target.files?.[0] ?? null)}
              />
              <span className="mt-1 flex flex-wrap gap-x-4">
                <a
                  className="caption text-primary hover:underline"
                  href={CSV_TEMPLATE}
                  download="budget-template.csv"
                >
                  Download the budget template
                </a>
                {sheet ? (
                  <button
                    type="button"
                    className="caption text-primary hover:underline"
                    onClick={() => setPreviewing(sheet)}
                  >
                    Preview the sheet
                  </button>
                ) : null}
              </span>
              <p className="mt-2 text-body-md text-ink-muted">
                Every row is checked. If one is wrong nothing is imported, and the event is kept as
                a draft for you to fix the sheet.
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
              Saved as a draft with an empty budget. The Treasurer adds the lines under Budget, then
              it is sent from Club events.
            </p>
          )}

          <label className="label mt-4" htmlFor="ne-proposal">
            Proposal document (PDF or Word, up to 10 MB)
          </label>
          <FileDrop
            id="ne-proposal"
                        accept={PROPOSAL_TYPES}
            onChange={(e) => setProposal(e.target.files?.[0] ?? null)}
          />
          {proposalTooBig ? (
            <p className="mt-1 text-body-md text-danger" role="alert">
              That file is over 10 MB. Choose a smaller one.
            </p>
          ) : (
            <p className="caption mt-1 text-ink-muted">
              Read by the Cultural Society and the Dean with the budget. Not shown to students.
            </p>
          )}
          {proposal && canPreviewFile(proposal) ? (
            <button
              type="button"
              className="caption mt-1 text-primary hover:underline"
              onClick={() => setPreviewing(proposal)}
            >
              Preview the proposal
            </button>
          ) : null}

          <Button
            type="submit"
            block
            className="mt-4"
            disabled={create.isPending || proposalTooBig || (uploading && sheet === null)}
          >
            {create.isPending ? 'Saving…' : sending ? 'Propose and send' : 'Save draft'}
          </Button>
        </aside>
      </form>
      {err ? <ProblemView error={err} /> : null}
      {previewing ? <FilePreview file={previewing} onClose={() => setPreviewing(null)} /> : null}
    </>
  );
}
