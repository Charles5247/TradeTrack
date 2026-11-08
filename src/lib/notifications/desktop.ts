export const desktopAlertsKey = 'trackasuwa:desktop-alerts';
export const alertSoundKey = 'trackasuwa:alert-sound';

export function playAlertSound() {
  if (localStorage.getItem(alertSoundKey) === 'off') return;
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(660, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.29);
    oscillator.onended = () => { void context.close(); };
  } catch { /* Browsers may block audio until the user has interacted with the page. */ }
}

export async function showDesktopAlert(id: string, title: string, body: string, href: string) {
  if (localStorage.getItem(desktopAlertsKey) !== 'on' || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body, icon: '/icons/icon-192x192.png', badge: '/icons/favicon-48x48.png',
    tag: `trackasuwa-${id}`, data: { href },
  });
}
