/**
 * AR-01 / PRD §5.10: an event's photos for students, with a way to ask for one
 * to be taken down. The request only flags the photo; the club decides.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request, type ApiError } from '../shared/api/client';
import type { components } from '../shared/api/schema';
import { Button } from '../shared/ds';
import { AuthImage } from '../shared/ui/AuthImage';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';

type EventPhoto = components['schemas']['EventPhoto'];
const enc = encodeURIComponent;

export function EventGallery({ eventId }: { eventId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ['events', eventId, 'photos'] as const;
  const photos = useQuery<EventPhoto[], ApiError>({
    queryKey: key,
    queryFn: () => request<EventPhoto[]>(`/events/${enc(eventId)}/photos`),
  });
  const ask = useMutation<EventPhoto, ApiError, EventPhoto>({
    mutationFn: (p) =>
      request<EventPhoto>(`/events/${enc(eventId)}/photos/${enc(p.id)}/removal-request`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.show('Removal requested — the club will review it');
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const list = photos.data ?? [];
  if (list.length === 0) return null;
  return (
    <section className="panel mt-5" aria-label="Photos">
      <h3>Photos</h3>
      <p className="mt-1 text-body-md text-ink-muted">
        If you are in a photo and want it taken down, ask for its removal.
      </p>
      <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
        {list.map((p) => (
          <li key={p.id} data-testid="gallery-photo" className="grid gap-1">
            <AuthImage src={p.file_url} alt={p.caption || 'Event photo'} className="aspect-square w-full rounded-md" />
            {p.removal_requested ? (
              <span className="caption text-ink-muted">Removal requested</span>
            ) : (
              <Button size="sm" variant="text" disabled={ask.isPending} onClick={() => ask.mutate(p)}>
                Request removal
              </Button>
            )}
          </li>
        ))}
      </ul>
      {ask.error ? <ProblemView error={ask.error} /> : null}
    </section>
  );
}
