export type SmsSendRequest = { to: string; body: string; idempotencyKey: string };
export type SmsSendResult = { providerMessageId: string };

/** Provider-neutral boundary. No adapter is active until the owner chooses one. */
export interface SmsProvider {
  readonly name: string;
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}

export function configuredSmsProvider(): SmsProvider | null {
  return null;
}
