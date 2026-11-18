declare module 'web-push' {
  interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  interface PushOptions {
    vapidDetails: { subject: string; publicKey: string; privateKey: string };
    TTL?: number;
    timeout?: number;
  }
  interface PushResponse { statusCode: number }
  const webpush: {
    sendNotification(subscription: PushSubscription, payload: string, options: PushOptions): Promise<PushResponse>;
  };
  export default webpush;
}
