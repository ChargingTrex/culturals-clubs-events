/** Join / Leave controls shared by the club directory and the profile's "My clubs" tab. */
import { useState } from 'react';
import type { ClubOut } from '../shared/api/types';
import { Button, Chip } from '../shared/ds';
import { ProblemView } from '../shared/ui/ProblemView';
import { useClubMembership } from './useClubs';

/** Join / Request to join, or the "Requested" chip while a request waits. */
export function JoinControl({ club, atCap }: { club: ClubOut; atCap: boolean }) {
  const { join } = useClubMembership(club);
  if (club.my_join_request_state === 'pending') {
    return (
      <Chip tone="pending" icon="clock">
        Requested
      </Chip>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={club.join_mode === 'open' ? 'filled' : 'tonal'}
        disabled={atCap || join.isPending}
        aria-label={`${club.join_mode === 'open' ? 'Join' : 'Request to join'} ${club.name}`}
        onClick={() => join.mutate()}
      >
        {join.isPending ? 'Joining…' : club.join_mode === 'open' ? 'Join' : 'Request to join'}
      </Button>
      {join.error ? <ProblemView error={join.error} className="w-full" /> : null}
    </div>
  );
}

/** Leave, confirmed inline; the API's refusal (an office held) is shown as itself. */
export function LeaveControl({ club }: { club: ClubOut }) {
  const { leave } = useClubMembership(club);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="outlined"
        aria-label={`Leave ${club.name}`}
        onClick={() => setConfirming(true)}
      >
        Leave
      </Button>
    );
  }
  return (
    <div className="note w-full text-left" role="group" aria-label={`Confirm leaving ${club.name}`}>
      <p>Leave {club.name}? You can ask to join again later.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="danger"
          disabled={leave.isPending}
          onClick={() => leave.mutate()}
        >
          {leave.isPending ? 'Leaving…' : 'Yes, leave'}
        </Button>
        <Button
          size="sm"
          variant="text"
          onClick={() => {
            setConfirming(false);
            leave.reset();
          }}
        >
          Stay
        </Button>
      </div>
      {leave.error ? <ProblemView error={leave.error} /> : null}
    </div>
  );
}
