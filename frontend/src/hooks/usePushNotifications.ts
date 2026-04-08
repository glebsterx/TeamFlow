import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/taskDisplay';
import { showToast } from '../utils/toast';
import { urlBase64ToUint8Array } from '../utils/taskUtils';

const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;

// #272 — Reliable iOS device detection
function isIOSDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPhone / iPod / iPod touch
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh but has touch
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

function checkIOSPWA(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  // iOS Safari sets navigator.standalone = true when added to Home Screen
  const navStandalone = !!(navigator as any).standalone;
  // Standard display-mode check (also covers minimal-ui, fullscreen)
  let displayStandalone = false;
  try {
    displayStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches;
  } catch { /* ignore */ }
  return navStandalone || displayStandalone;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [iosPWA, setIOSPWA] = useState(false);

  // Detect iOS PWA mode on mount and on visibility change
  const checkPWA = useCallback(() => {
    if (isIOSDevice()) {
      setIOSPWA(checkIOSPWA());
    } else {
      setIOSPWA(false);
    }
  }, []);

  useEffect(() => {
    checkPWA();
    // Re-check after a short delay (iOS may update matchMedia lazily)
    const t1 = setTimeout(checkPWA, 500);
    const t2 = setTimeout(checkPWA, 2000);
    // Also re-check on visibility change (when user returns from adding to home screen)
    document.addEventListener('visibilitychange', checkPWA);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.removeEventListener('visibilitychange', checkPWA);
    };
  }, [checkPWA]);

  const isIOSafari = isIOSDevice() && !iosPWA;

  const subscribe = async () => {
    if (!isSecureContext) {
      setPushError('Web Push работает только по HTTPS');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushError('Браузер не поддерживает Web Push');
      return;
    }
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 8000)),
      ]) as ServiceWorkerRegistration;
      const { data } = await axios.get(`${API_URL}/api/push/config`);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key) as any,
      });
      const json = sub.toJSON();
      await axios.post(`${API_URL}/api/push/subscribe`, { endpoint: json.endpoint, keys: json.keys as any });
      setSubscribed(true);
      setPermission('granted');
      setPushError(null);
      showToast('🔔 Push-уведомления включены!', 'success');
    } catch (e: any) {
      const msg = e?.message || 'Ошибка подписки';
      setPushError(msg);
      showToast(msg, 'error');
    }
  };

  const requestAndSubscribe = async () => {
    if (!isSecureContext) {
      setPushError('Требуется HTTPS');
      showToast('Web Push работает только по HTTPS', 'error');
      return;
    }

    // #272 — iOS Safari (not PWA) cannot use Web Push
    // Re-check in case the user just added to Home Screen and came back
    checkPWA();
    const currentlyIOSafari = isIOSDevice() && !checkIOSPWA();

    if (currentlyIOSafari) {
      setPushError('Добавьте на экран «Домой»');
      showToast('iOS: добавьте сайт на экран «Домой» для уведомлений', 'warning', 10000);
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        await subscribe();
      } else {
        setPushError('Заблокировано');
        showToast('Разрешите уведомления в настройках браузера', 'error');
      }
    } catch (e: any) {
      const msg = e?.message || 'Ошибка запроса разрешения';
      setPushError(msg);
      showToast(msg, 'error');
    }
  };

  const swRegistered = useRef(false);

  useEffect(() => {
    if (!isSecureContext || !('serviceWorker' in navigator)) return;
    if (swRegistered.current) return;
    swRegistered.current = true;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (reg) => {
      if ('pushManager' in reg) {
        const existing = await reg.pushManager.getSubscription();
        if (existing) setSubscribed(true);
      }
    }).catch(() => {});
  }, []);

  const unsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!('pushManager' in reg)) {
        setSubscribed(false);
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const json = sub.toJSON();
        await axios.delete(`${API_URL}/api/push/unsubscribe`, { data: { endpoint: json.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      showToast('Уведомления отключены', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Ошибка отключения', 'error');
    }
  };

  return {
    permission,
    subscribed,
    pushError,
    requestAndSubscribe,
    unsubscribe,
    isIOSafari,
    isIOSPWA: iosPWA,
  };
}
