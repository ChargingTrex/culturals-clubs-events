import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileDrop } from './FileDrop';

const pdf = new File(['x'.repeat(2048)], 'proposal.pdf', { type: 'application/pdf' });

describe('FileDrop', () => {
  it('names the chosen file and hands it back empty when removed', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    render(
      <>
        <label htmlFor="doc">Proposal</label>
        <FileDrop id="doc" onChange={(e) => seen.push(e.target.files?.length ?? 0)} />
      </>,
    );
    await user.upload(screen.getByLabelText('Proposal'), pdf);
    expect(screen.getByTestId('file-held')).toHaveTextContent('proposal.pdf');
    expect(screen.getByTestId('file-held')).toHaveTextContent('2 KB');

    await user.click(screen.getByRole('button', { name: 'Remove proposal.pdf' }));
    expect(screen.queryByTestId('file-held')).not.toBeInTheDocument();
    expect(seen).toEqual([1, 0]);
  });

  it('shows nothing held when the caller empties the input to upload at once', async () => {
    const user = userEvent.setup();
    const sent = vi.fn();
    render(
      <FileDrop
        aria-label="Photos"
        multiple
        onChange={(e) => {
          sent([...(e.target.files ?? [])].length);
          e.target.value = '';
        }}
      />,
    );
    await user.upload(screen.getByLabelText('Photos'), [pdf, pdf]);
    expect(sent).toHaveBeenCalledWith(2);
    expect(screen.queryByTestId('file-held')).not.toBeInTheDocument();
  });
});
