import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/taskDisplay';
import { showToast } from '../utils/toast';
import { urlBase64ToUint8Array } from '../utils/taskUtils';

const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

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
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 5000)),
      ]) as ServiceWorkerRegistration;
      const { data } = await axios.get(`${API_URL}/api/push/vapid-public-key`);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      });
      const json = sub.toJSON();
      await axios.post(`${API_URL}/api/push/subscribe`, { endpoint: json.endpoint, keys: json.keys });
      setSubscribed(true);
      setPermission('granted');
      setPushError(null);
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
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') await subscribe();
    else {
      setPushError('Заблокировано');
      showToast('Разрешите уведомления в настройках браузера', 'error');
    }
  };

  useEffect(() => {
    if (!isSecureContext || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      if (existing) setSubscribed(true);
    }).catch(() => {});
  }, []);

  return { permission, subscribed, pushError, requestAndSubscribe };
}
