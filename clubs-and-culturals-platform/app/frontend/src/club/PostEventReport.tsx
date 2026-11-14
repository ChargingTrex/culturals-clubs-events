/**
 * AR-01: the post-event report, one panel. Attendance (from the scans, never typed),
 * photos, social post links, bills against the budget lines, then outcomes and
 * learnings. Submitting needs one photo and the outcomes; missing bills block only
 * settlement (decided 2026-11-08), so the Treasurer can add them after the report.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import type { EventOut } from '../shared/api/types';
import { Button, Icon, Stat } from '../shared/ds';
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

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4" aria-label={title}>
      <h4 className="mb-3 flex items-center gap-2 title-sm">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary-soft text-caption">
          {done ? <Icon name="check" size={14} /> : n}
        </span>
        {title}
      </h4>
      {children}
    </section>
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
    mutationFn: ({ photo, is_highlight }) => clubApi.events.editPhoto(event.id, photo.id, { is_highlight }),
    onSuccess: refresh,
  });
  const removePhoto = useMutation<unknown, ApiError, EventPhoto>({
    mutationFn: (photo) => clubApi.events.removePhoto(event.id, photo.id),
    onSuccess: refresh,
  });
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
  });
  const [outcomes, setOutcomes] = useState('');
  const [learnings, setLearnings] = useState('');
  const close = useMutation<EventOut, ApiError>({
    mutationFn: () => clubApi.events.close(event.id, { outcomes, learnings }),
    onSuccess: () => {
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
  const billsOpen = b && SPEND_PHASE.has(b.stage ?? '') && b.stage !== 'settled' ? b.settlement_problems.length : 0;
  const checklist = [
    { label: 'At least one photo', ok: r.photos > 0 },
    { label: 'A social post link', ok: r.social_posts > 0, optional: !r.social_post_required },
    { label: 'Outcomes written', ok: submitted || outcomes.trim().length > 0 },
    { label: billsOpen ? `Bills outstanding (${billsOpen})` : 'Bills and spend', ok: !billsOpen, optional: true },
  ];

  return (
    <section className="panel md:col-span-2" aria-label="Post-event report">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3>Post-event report</h3>
        {submitted ? <Pill tone="ok">Submitted{r.submitted_at ? ` ${fmtDate(r.submitted_at)}` : ''}</Pill> : null}
      </div>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0" aria-label="Checklist">
        {checklist.map((c) => (
          <li key={c.label}>
            <Pill tone={c.ok ? 'ok' : c.optional ? 'plain' : 'warn'}>
              {c.ok ? '✓ ' : ''}
              {c.label}
              {!c.ok && c.optional ? ' (optional)' : ''}
            </Pill>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4">
        <Step n={1} title="Attendance" done>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="report-attendance">
            <Stat label="Registered" value={r.registered} />
            <Stat label="Attended" value={r.attended} />
            <Stat label="Walk-ins" value={r.walk_ins} />
            <Stat label="No-shows" value={r.no_show} />
          </div>
          <p className="caption mt-2 text-ink-muted">Counted at the door by the scan station.</p>
        </Step>

        <Step n={2} title="Photos" done={r.photos > 0}>
          <label className="label" htmlFor="report-photos">
            Add photos (JPG, PNG, WebP or HEIC). Star two or three as highlights for the semester report.
          </label>
          <input
            id="report-photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="field"
            disabled={upload.isPending}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) upload.mutate(files);
            }}
          />
          {upload.isPending ? <Loading label="Uploading…" /> : null}
          {upload.error ? <ProblemView error={upload.error} /> : null}
          {livePhotos.length > 0 ? (
            <ul className="m-0 mt-3 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-5">
              {livePhotos.map((p) => (
                <li key={p.id} data-testid="report-photo" className="grid gap-1">
                  <AuthImage src={p.file_url} alt={p.caption || 'Event photo'} className="aspect-square w-full rounded-md" />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={p.is_highlight ? 'filled' : 'outlined'}
                      aria-pressed={p.is_highlight}
                      aria-label={p.is_highlight ? 'Highlight (click to unmark)' : 'Mark as highlight'}
                      onClick={() => editPhoto.mutate({ photo: p, is_highlight: !p.is_highlight })}
                    >
                      ★
                    </Button>
                    <Button size="sm" variant="outlined" aria-label="Remove photo" onClick={() => removePhoto.mutate(p)}>
                      <Icon name="x" size={14} />
                    </Button>
                  </div>
                  {p.removal_requested ? <span className="caption text-danger">Removal requested</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Step>

        <Step n={3} title="Social media posts" done={r.social_posts > 0}>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPost.mutate();
            }}
          >
            <label className="grid flex-1 gap-1 text-label-md">
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
              <input
                key={shotKey}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="field"
                onChange={(e) => setShot(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button type="submit" size="sm" icon="plus" disabled={addPost.isPending || !url.trim()}>
              Add link
            </Button>
          </form>
          {addPost.error ? <ProblemView error={addPost.error} /> : null}
          <ul className="m-0 mt-2 list-none p-0">
            {(posts.data ?? []).map((p) => (
              <li key={p.id} data-testid="report-post" className="flex items-center gap-2 py-1 text-body-md">
                <Pill tone="info">{p.platform}</Pill>
                <a href={p.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-primary">
                  {p.url}
                </a>
                <Button size="sm" variant="outlined" aria-label={`Remove ${p.url}`} onClick={() => removePost.mutate(p)}>
                  <Icon name="x" size={14} />
                </Button>
              </li>
            ))}
          </ul>
        </Step>

        <Step n={4} title="Bills and spend" done={!billsOpen}>
          {!budgetId || (b && b.nil_declaration) ? (
            <p className="text-body-md text-ink-muted">No budget for this event, so no bills.</p>
          ) : !b ? (
            <Loading />
          ) : !SPEND_PHASE.has(b.stage ?? '') ? (
            <p className="text-body-md text-ink-muted">Bills are added once the budget is sanctioned.</p>
          ) : canSpend ? (
            <>
              <p className="caption mb-2 text-ink-muted">
                Enter what was spent on each line and attach the invoice or bill. Bills do not hold up the report,
                but the budget cannot settle without them. <Link to={`/club/budget/${b.id}`}>Open the budget</Link>
              </p>
              <ul className="m-0 list-none rounded-md border border-line p-0">
                {b.lines.map((line) => (
                  <SpendRow key={line.id} budget={b} line={line} canSpend />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-body-md text-ink-muted">
              The Treasurer or President adds the bills{billsOpen ? ` — ${billsOpen} outstanding` : ''}.
            </p>
          )}
        </Step>

        <Step n={5} title="Outcomes and learnings" done={submitted}>
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
                <textarea className="field" rows={3} value={outcomes} onChange={(e) => setOutcomes(e.target.value)} />
              </label>
              <label className="grid gap-1 text-label-md">
                Learnings: what to keep or change next time
                <textarea className="field" rows={2} value={learnings} onChange={(e) => setLearnings(e.target.value)} />
              </label>
              <div>
                <Button type="submit" disabled={close.isPending || !outcomes.trim() || r.photos === 0}>
                  Submit report
                </Button>
                {r.photos === 0 ? <span className="caption ml-3 text-ink-muted">Add a photo first.</span> : null}
              </div>
              {close.error ? <ProblemView error={close.error} /> : null}
            </form>
          )}
        </Step>
      </div>
    </section>
  );
}
