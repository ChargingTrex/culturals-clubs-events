/**
 * AR-01: the post-event report, one panel. Attendance (from the scans, never typed),
 * photos, social post links, bills against the budget lines, then outcomes and
 * learnings. Submitting needs one photo and the outcomes; missing bills block only
 * settlement (decided 2026-11-08), so the Treasurer can add them after the report.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import type { EventOut } from '../shared/api/types';
import { Button, FileDrop, Icon, IconButton, Stat } from '../shared/ds';
import { fmtDate } from '../shared/format';
import { Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { AuthImage } from '../shared/ui/AuthImage';
import { useToast } from '../shared/ui/Toast';
import {
  clubApi,
  type Budget,
  type EventPhoto,
  type EventReportDraft,
  type EventSocialPost,
} from './api';
import { SpendRow, budgetKey } from './BudgetDetailPage';

const SPEND_PHASE = new Set(['sanctioned', 'settled']);
const PLATFORM: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  other: 'Other',
};

function Step({
  n,
  title,
  note,
  done,
  children,
}: {
  n: number;
  title: string;
  /** Whether the report waits for this step: "Required", "Optional", or what is still owed. */
  note?: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-5" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="flex items-center gap-2 title-sm">
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary-soft text-caption text-on-primary-soft">
            {done ? <Icon name="check" size={14} /> : n}
          </span>
          {title}
        </h4>
        {note ? <span className="caption text-ink-muted">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** The words typed so far, kept in this tab so a reload or a trip to the budget page does not lose them. */
const draftKey = (eventId: string) => `culturals:report-draft:${eventId}`;

function readDraft(eventId: string): { outcomes: string; learnings: string } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(eventId)) ?? '{}') as Record<
      string,
      unknown
    >;
    return {
      outcomes: typeof saved.outcomes === 'string' ? saved.outcomes : '',
      learnings: typeof saved.learnings === 'string' ? saved.learnings : '',
    };
  } catch {
    return { outcomes: '', learnings: '' };
  }
}

/** Removing evidence takes a second, deliberate step, in place. */
function ConfirmRemove({
  question,
  busy,
  onRemove,
  onKeep,
}: {
  question: string;
  busy: boolean;
  onRemove: () => void;
  onKeep: () => void;
}) {
  return (
    <div role="group" aria-label={question} className="flex flex-wrap items-center gap-2">
      <span className="caption text-ink">{question}</span>
      <Button size="sm" variant="outlined" autoFocus disabled={busy} onClick={onKeep}>
        Keep
      </Button>
      <Button size="sm" variant="danger" disabled={busy} onClick={onRemove}>
        {busy ? 'Removing…' : 'Remove'}
      </Button>
    </div>
  );
}

export function PostEventReport({ event, canSpend }: { event: EventOut; canSpend: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const keys = {
    report: ['events', event.id, 'report'],
    photos: ['events', event.id, 'photos'],
    posts: ['events', event.id, 'posts'],
  } as const;
  const refresh = () => {
    for (const k of Object.values(keys)) void queryClient.invalidateQueries({ queryKey: k });
  };
  const report = useQuery<EventReportDraft, ApiError>({
    queryKey: keys.report,
    queryFn: () => clubApi.events.report(event.id),
  });
  const photos = useQuery<EventPhoto[], ApiError>({
    queryKey: keys.photos,
    queryFn: () => clubApi.events.photos(event.id),
  });
  const posts = useQuery<EventSocialPost[], ApiError>({
    queryKey: keys.posts,
    queryFn: () => clubApi.events.posts(event.id),
  });
  const budgetId = event.budget?.id ?? '';
  const budget = useQuery<Budget, ApiError>({
    queryKey: budgetKey(budgetId),
    queryFn: () => clubApi.budget.get(budgetId),
    enabled: budgetId !== '',
  });

  const upload = useMutation<void, ApiError, File[]>({
    mutationFn: async (files) => {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        await clubApi.events.addPhoto(event.id, form);
      }
    },
    onSettled: refresh,
  });
  const editPhoto = useMutation<unknown, ApiError, { photo: EventPhoto; is_highlight: boolean }>({
    mutationFn: ({ photo, is_highlight }) =>
      clubApi.events.editPhoto(event.id, photo.id, { is_highlight }),
    onSuccess: refresh,
  });
  const removePhoto = useMutation<unknown, ApiError, EventPhoto>({
    mutationFn: (photo) => clubApi.events.removePhoto(event.id, photo.id),
    onSuccess: refresh,
    onSettled: () => setConfirming(null),
  });
  /** The photo or post id whose removal is waiting for a second click. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [shotKey, setShotKey] = useState(0);
  const addPost = useMutation<unknown, ApiError>({
    mutationFn: () => clubApi.events.addPost(event.id, url.trim(), shot),
    onSuccess: () => {
      setUrl('');
      setShot(null);
      setShotKey((k) => k + 1);
      refresh();
    },
  });
  const removePost = useMutation<unknown, ApiError, EventSocialPost>({
    mutationFn: (post) => clubApi.events.removePost(event.id, post.id),
    onSuccess: refresh,
    onSettled: () => setConfirming(null),
  });
  const [outcomes, setOutcomes] = useState(() => readDraft(event.id).outcomes);
  const [learnings, setLearnings] = useState(() => readDraft(event.id).learnings);
  const hasDraft = outcomes.trim() !== '' || learnings.trim() !== '';
  useEffect(() => {
    try {
      if (hasDraft)
        sessionStorage.setItem(draftKey(event.id), JSON.stringify({ outcomes, learnings }));
      else sessionStorage.removeItem(draftKey(event.id));
    } catch {
      // Private browsing or a full store: the draft simply lives in this page.
    }
  }, [event.id, outcomes, learnings, hasDraft]);
  const close = useMutation<EventOut, ApiError>({
    mutationFn: () => clubApi.events.close(event.id, { outcomes, learnings }),
    onSuccess: () => {
      setOutcomes('');
      setLearnings('');
      toast.show('Report submitted');
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      refresh();
    },
  });

  if (report.isPending) return <Loading label="Drafting the report…" />;
  if (report.error) return <ProblemView error={report.error} />;
  const r = report.data;
  const submitted = event.status === 'reported' || r.submitted_at !== null;
  const livePhotos = photos.data ?? [];
  const b = budget.data;
  const billsOpen =
    b && SPEND_PHASE.has(b.stage ?? '') && b.stage !== 'settled' ? b.settlement_problems.length : 0;
  const postNeeded = r.social_post_required && r.social_posts === 0;
  const checklist = [
    { label: 'At least one photo', todo: 'Add a photo', ok: r.photos > 0 },
    {
      label: 'A social post link',
      todo: 'Add a social post link',
      ok: r.social_posts > 0,
      optional: !r.social_post_required,
    },
    {
      label: 'Outcomes written',
      todo: 'Write the outcomes',
      ok: submitted || outcomes.trim().length > 0,
    },
    {
      label: billsOpen ? `Bills outstanding (${billsOpen})` : 'Bills and spend',
      ok: !billsOpen,
      optional: true,
    },
  ];
  // Everything the Submit button is waiting for, in the order of the steps.
  const missing = [
    r.photos === 0 ? 'at least one photo' : '',
    postNeeded ? 'a social post link' : '',
    outcomes.trim() ? '' : 'the outcomes',
  ].filter(Boolean);

  return (
    <section className="panel md:col-span-2" aria-label="Post-event report">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3>Post-event report</h3>
        {submitted ? (
          <Pill tone="ok">Submitted{r.submitted_at ? ` ${fmtDate(r.submitted_at)}` : ''}</Pill>
        ) : null}
      </div>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0" aria-label="Checklist">
        {checklist.map((c) => (
          <li key={c.label} data-done={c.ok}>
            <Pill tone={c.ok ? 'ok' : c.optional ? 'plain' : 'warn'}>
              {c.ok || c.optional ? c.label : (c.todo ?? c.label)}
              {!c.ok && c.optional ? ' (optional)' : ''}
            </Pill>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4">
        <Step n={1} title="Attendance" note="Filled in from the door" done>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="report-attendance">
            <Stat label="Registered" value={r.registered} />
            <Stat label="Attended" value={r.attended} />
            <Stat label="Walk-ins" value={r.walk_ins} />
            <Stat label="No-shows" value={r.no_show} />
          </div>
          <p className="caption mt-2 text-ink-muted">Counted at the door by the scan station.</p>
        </Step>

        <Step n={2} title="Photos" note="Required: at least one" done={r.photos > 0}>
          <label className="label" htmlFor="report-photos">
            Add photos (JPG, PNG, WebP or HEIC)
          </label>
          <FileDrop
            id="report-photos"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic"
            disabled={upload.isPending}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) upload.mutate(files);
            }}
          />
          {upload.isPending ? <Loading label="Uploading…" /> : null}
          {upload.error ? <ProblemView error={upload.error} /> : null}
          {photos.error ? <ProblemView error={photos.error} /> : null}
          {livePhotos.length > 0 ? (
            <>
              <p className="caption mt-3 text-ink-muted">
                Star two or three as highlights for the semester report.{' '}
                {r.highlights > 0 ? `${r.highlights} starred so far.` : 'None starred yet.'}
              </p>
              <ul className="m-0 mt-2 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4 lg:grid-cols-5">
                {livePhotos.map((p) => (
                  <li key={p.id} data-testid="report-photo" className="grid content-start gap-1">
                    <AuthImage
                      src={p.file_url}
                      alt={p.caption || 'Event photo'}
                      className="aspect-square w-full rounded-md"
                    />
                    {confirming === p.id ? (
                      <ConfirmRemove
                        question="Remove this photo?"
                        busy={removePhoto.isPending}
                        onRemove={() => removePhoto.mutate(p)}
                        onKeep={() => setConfirming(null)}
                      />
                    ) : (
                      <div className="flex items-center justify-between">
                        <IconButton
                          icon="star"
                          label="Highlight"
                          variant="tint"
                          selected={p.is_highlight}
                          disabled={editPhoto.isPending && editPhoto.variables?.photo.id === p.id}
                          onClick={() =>
                            editPhoto.mutate({ photo: p, is_highlight: !p.is_highlight })
                          }
                        />
                        <IconButton
                          icon="x"
                          label="Remove photo"
                          onClick={() => setConfirming(p.id)}
                        />
                      </div>
                    )}
                    {p.removal_requested ? (
                      <span className="caption text-danger">
                        A student asked for this to be removed
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {editPhoto.error ? <ProblemView error={editPhoto.error} /> : null}
              {removePhoto.error ? <ProblemView error={removePhoto.error} /> : null}
            </>
          ) : null}
        </Step>

        <Step
          n={3}
          title="Social media posts"
          note={r.social_post_required ? 'Required at this attendance' : 'Optional'}
          done={r.social_posts > 0}
        >
          <form
            className="grid gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPost.mutate();
            }}
          >
            <label className="grid gap-1 text-label-md sm:flex-1">
              Post link (Instagram, LinkedIn or other)
              <input
                className="field"
                type="url"
                placeholder="https://instagram.com/p/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-label-md">
              Screenshot (optional)
              <FileDrop
                key={shotKey}
                accept="image/jpeg,image/png,image/webp,image/heic"
                onChange={(e) => setShot(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              type="submit"
              icon="plus"
              className="justify-self-start"
              disabled={addPost.isPending || !url.trim()}
            >
              Add link
            </Button>
          </form>
          {addPost.error ? <ProblemView error={addPost.error} /> : null}
          {posts.error ? <ProblemView error={posts.error} /> : null}
          <ul className="m-0 mt-2 list-none p-0">
            {(posts.data ?? []).map((p) => (
              <li
                key={p.id}
                data-testid="report-post"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-body-md"
              >
                <span className="shrink-0">
                  <Pill tone="info">{PLATFORM[p.platform] ?? p.platform}</Pill>
                </span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 truncate text-primary hover:underline"
                >
                  {p.url}
                </a>
                {confirming === p.id ? (
                  <ConfirmRemove
                    question="Remove this link?"
                    busy={removePost.isPending}
                    onRemove={() => removePost.mutate(p)}
                    onKeep={() => setConfirming(null)}
                  />
                ) : (
                  <IconButton
                    icon="x"
                    label={`Remove ${p.url}`}
                    onClick={() => setConfirming(p.id)}
                  />
                )}
              </li>
            ))}
          </ul>
          {removePost.error ? <ProblemView error={removePost.error} /> : null}
        </Step>

        <Step
          n={4}
          title="Bills and spend"
          note={
            billsOpen
              ? `Optional for the report, ${billsOpen} outstanding for settlement`
              : 'Optional for the report'
          }
          done={!billsOpen}
        >
          {!budgetId || (b && b.nil_declaration) ? (
            <p className="text-body-md text-ink-muted">No budget for this event, so no bills.</p>
          ) : !b ? (
            <Loading />
          ) : !SPEND_PHASE.has(b.stage ?? '') ? (
            <p className="text-body-md text-ink-muted">
              Bills are added once the budget is sanctioned.
            </p>
          ) : canSpend ? (
            <>
              <p className="caption mb-2 text-ink-muted">
                Enter what was spent on each line and attach the invoice or bill. Bills do not hold
                up the report, but the budget cannot settle without them.{' '}
                <Link to={`/club/budget/${b.id}`} className="text-primary hover:underline">
                  Open the budget
                </Link>
              </p>
              <ul className="m-0 list-none rounded-md border border-line p-0">
                {b.lines.map((line) => (
                  <SpendRow key={line.id} budget={b} line={line} canSpend />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-body-md text-ink-muted">
              The Treasurer or President adds the bills
              {billsOpen ? ` (${billsOpen} outstanding)` : ''}.
            </p>
          )}
        </Step>

        <Step
          n={5}
          title="Outcomes and learnings"
          note={submitted ? undefined : 'Required: the outcomes'}
          done={submitted}
        >
          {submitted ? (
            <div className="grid gap-2 text-body-md">
              <p>
                <strong>Outcomes.</strong> {r.outcomes}
              </p>
              {r.learnings ? (
                <p>
                  <strong>Learnings.</strong> {r.learnings}
                </p>
              ) : null}
              <p className="caption text-ink-muted">
                The report is final and now counts in the semester report. Photos, post links and
                bills can still be added above.
              </p>
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                close.mutate();
              }}
            >
              <label className="grid gap-1 text-label-md">
                Outcomes (required): what happened, who came, what it achieved
                <textarea
                  className="field"
                  rows={3}
                  value={outcomes}
                  onChange={(e) => setOutcomes(e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-label-md">
                Learnings: what to keep or change next time
                <textarea
                  className="field"
                  rows={2}
                  value={learnings}
                  onChange={(e) => setLearnings(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button type="submit" disabled={close.isPending || missing.length > 0}>
                  {close.isPending ? 'Submitting…' : 'Submit report'}
                </Button>
                <span className="caption text-ink-muted" data-testid="report-submit-hint">
                  {missing.length > 0
                    ? `Still needed: ${missing.join(' and ')}.`
                    : 'Once submitted, the report cannot be edited.'}
                </span>
              </div>
              {hasDraft ? (
                <p className="caption text-ink-muted">
                  Your draft is kept on this device until you submit.
                </p>
              ) : null}
              {close.error ? <ProblemView error={close.error} /> : null}
            </form>
          )}
        </Step>
      </div>
    </section>
  );
}
