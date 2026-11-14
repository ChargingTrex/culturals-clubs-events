/**
 * AR-11: read a proposal or a budget sheet without downloading it.
 *
 * - A stored proposal (`ProposalPreview`): a PDF in the browser's own viewer, a
 *   .docx as the text the API extracts, a legacy .doc as a download.
 * - A file just chosen in a form (`FilePreview`): a PDF or a CSV, before it is sent.
 *
 * Both open in the design system's sheet. The API decides who may read a stored
 * proposal; this only renders what it returns.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type ApiError, request } from '../api/client';
import { fileBlob, openFile } from '../api/files';
import type { components } from '../api/schema';
import { parseCsv } from '../csv';
import { BottomSheet, Button } from '../ds';
import { Loading } from './Empty';
import { ProblemView } from './ProblemView';

export type ProposalDocument = components['schemas']['ProposalDocument'];
type ProposalText = components['schemas']['ProposalPreview'];

const FRAME = 'h-[70vh] w-full rounded-md border border-line bg-surface';

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-body-md text-ink-muted">{children}</p>;
}

/** A PDF held in memory, shown by the browser's viewer. */
function PdfFrame({ blob, title }: { blob: Blob; title: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    // Re-typed: the API serves documents as a download, and a viewer needs the real type.
    const next = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? <iframe title={title} src={url} className={FRAME} /> : null;
}

function CsvTable({ text }: { text: string }) {
  const { rows, truncated } = parseCsv(text);
  const [head, ...body] = rows;
  if (!head) return <Note>This sheet is empty.</Note>;
  return (
    <>
      <Note>
        {body.length} row{body.length === 1 ? '' : 's'}
        {truncated ? ' shown; the sheet has more' : ''}. The server checks every row when it is
        uploaded.
      </Note>
      <div className="max-h-[60vh] overflow-auto rounded-md border border-line">
        <table className="cc-sheet">
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={i} className="label-md" scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {head.map((_, c) => (
                  <td key={c} className="cc-cell--wrap body-md">
                    {row[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TextBlocks({ data }: { data: ProposalText }) {
  return (
    <>
      <Note>
        Text only: layout, images and tracked changes are not shown. Download the file for the
        document as written.
        {data.truncated ? ' The preview stops early; the file is longer.' : ''}
      </Note>
      <div className="max-h-[60vh] overflow-auto rounded-md border border-line bg-surface px-5 py-4">
        {data.blocks.length === 0 ? <p className="text-ink-muted">No text in this document.</p> : null}
        {data.blocks.map((b, i) =>
          b.kind === 'heading' ? (
            <h3 key={i} className="title-md mt-4 mb-1.5 first:mt-0">
              {b.text}
            </h3>
          ) : (
            <p
              key={i}
              className={
                b.kind === 'row'
                  ? 'border-b border-line py-1 text-body-md'
                  : 'mb-2.5 whitespace-pre-wrap text-body-lg'
              }
            >
              {b.text}
            </p>
          ),
        )}
      </div>
    </>
  );
}

/** A proposal already attached to an event. */
export function ProposalPreview({ doc, onClose }: { doc: ProposalDocument; onClose: () => void }) {
  const pdf = useQuery<Blob, ApiError>({
    queryKey: ['proposal-file', doc.id],
    enabled: doc.preview === 'pdf',
    staleTime: Infinity,
    queryFn: () => fileBlob(doc.file_url),
  });
  const text = useQuery<ProposalText, ApiError>({
    queryKey: ['proposal-text', doc.id],
    enabled: doc.preview === 'text',
    staleTime: Infinity,
    queryFn: () =>
      request<ProposalText>(doc.file_url.replace(/^\/api\/v1/, '').replace(/\/file$/, '/preview')),
  });
  const [downloadError, setDownloadError] = useState<ApiError | null>(null);
  const error = pdf.error ?? text.error ?? downloadError;
  return (
    <BottomSheet title={doc.file_name} onClose={onClose}>
      {doc.preview === 'none' ? (
        <Note>This file type cannot be shown here. Download it to read it.</Note>
      ) : null}
      {(doc.preview === 'pdf' && pdf.isPending) || (doc.preview === 'text' && text.isPending) ? (
        <Loading label="Opening the document…" />
      ) : null}
      {pdf.data ? <PdfFrame blob={pdf.data} title={doc.file_name} /> : null}
      {text.data ? <TextBlocks data={text.data} /> : null}
      {error ? <ProblemView error={error} /> : null}
      <div className="mt-4 flex justify-end">
        <Button
          variant="tonal"
          size="sm"
          onClick={() => {
            setDownloadError(null);
            openFile(doc.file_url, doc.file_name).catch((err: ApiError) => setDownloadError(err));
          }}
        >
          Download
        </Button>
      </div>
    </BottomSheet>
  );
}

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
const isCsv = (file: File) => file.type === 'text/csv' || /\.csv$/i.test(file.name);

/** Whether a file chosen in a form can be shown before it is uploaded. */
export const canPreviewFile = (file: File): boolean => isPdf(file) || isCsv(file);

/** A file chosen in a form, before it is uploaded. Nothing leaves the browser. */
export function FilePreview({ file, onClose }: { file: File; onClose: () => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (isCsv(file)) void file.text().then((t) => live && setCsv(t));
    return () => {
      live = false;
    };
  }, [file]);
  return (
    <BottomSheet title={file.name} onClose={onClose}>
      {isPdf(file) ? (
        <PdfFrame blob={file} title={file.name} />
      ) : isCsv(file) ? (
        csv === null ? (
          <Loading label="Reading the sheet…" />
        ) : (
          <CsvTable text={csv} />
        )
      ) : (
        <Note>
          A Word document can be previewed once it is attached to the event. Other files cannot be
          shown here.
        </Note>
      )}
    </BottomSheet>
  );
}
