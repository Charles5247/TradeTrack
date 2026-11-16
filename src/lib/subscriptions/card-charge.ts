export function classifyCardCharge(status: number, result: unknown): { accepted: boolean; actionRequired: boolean } {
  const code = result && typeof result === 'object' ? (result as { code?: unknown }).code : null;
  return {
    accepted: status >= 200 && status < 300 && code === '00',
    actionRequired: (code != null && code !== '00') || (status >= 400 && status < 500),
  };
}
