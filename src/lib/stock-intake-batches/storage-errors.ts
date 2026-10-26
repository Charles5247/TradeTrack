/** Storage may return HTTP 400 with a more specific string statusCode, e.g. 404. */
export function storageErrorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  const provider = 'statusCode' in error ? Number(error.statusCode) : NaN;
  const transport = 'status' in error ? Number(error.status) : 0;
  return Number.isInteger(provider) && provider >= 400 && provider <= 599
    ? provider : transport;
}
