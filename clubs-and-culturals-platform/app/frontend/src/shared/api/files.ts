/** Files behind the bearer token (receipts, event photos): a plain <img> or link cannot open them. */
import { ApiError, buildUrl } from './client';
import { readSession } from '../auth/tokens';

/** The file's bytes. */
export async function fileBlob(apiPath: string): Promise<Blob> {
  const session = readSession();
  const res = await fetch(buildUrl(apiPath.replace(/^\/api\/v1/, '')), {
    headers: session ? { authorization: `Bearer ${session.access_token}` } : {},
  }).catch((cause: unknown) => {
    throw ApiError.network(cause);
  });
  if (!res.ok) throw ApiError.fromBody(res.status, await res.text(), apiPath);
  return res.blob();
}

/** The file as an object URL; the caller revokes it. */
export async function fileUrl(apiPath: string): Promise<string> {
  return URL.createObjectURL(await fileBlob(apiPath));
}

/** Download a bearer-protected file under its own name. */
export async function openFile(apiPath: string, fileName: string): Promise<void> {
  const url = await fileUrl(apiPath);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
