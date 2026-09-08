/* Buy Sell Trade Sxm — Web Push client (shared by index.html + marketplace.html)
 *
 *   window.Push.supported()   -> boolean
 *   window.Push.status()      -> Promise<'unsupported'|'denied'|'default'|'ready'|'on'>
 *   window.Push.enable()      -> Promise<{ok, status, reason?}>
 *   window.Push.disable()     -> Promise<{ok}>
 *   window.Push.syncEndpoint()-> Promise<void>   (re-upsert on load if already subscribed)
 *
 * Depends on: push-config.js (VAPID_PUBLIC_KEY, PUSH_ENABLED), the service
 * worker at /sw.js, and SB.savePushSubscription / SB.deletePushSubscription.
 */
(function () {
  'use strict';

  function supported() {
    return !!window.PUSH_ENABLED &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      typeof window.VAPID_PUBLIC_KEY === 'string' &&
      window.VAPID_PUBLIC_KEY.length > 20;
  }

  function urlBase64ToUint8Array(base64) {
    var padding = '='.repeat((4 - (base64.length % 4)) % 4);
    var b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function readyReg() {
    return navigator.serviceWorker.ready;
  }

  function subToJSON(sub) {
    // sub.toJSON() gives { endpoint, keys: { p256dh, auth } }
    var j = sub.toJSON();
    return {
      endpoint: j.endpoint,
      p256dh: j.keys && j.keys.p256dh,
      auth: j.keys && j.keys.auth,
      user_agent: navigator.userAgent
    };
  }

  function status() {
    if (!supported()) return Promise.resolve('unsupported');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return readyReg()
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        if (sub) return 'on';
        return Notification.permission === 'granted' ? 'ready' : 'default';
      })
      .catch(function () { return 'default'; });
  }

  function enable() {
    if (!supported()) return Promise.resolve({ ok: false, status: 'unsupported' });
    if (Notification.permission === 'denied') {
      return Promise.resolve({ ok: false, status: 'denied' });
    }
    return Promise.resolve(Notification.requestPermission())
      .then(function (perm) {
        if (perm !== 'granted') return { ok: false, status: perm };
        return readyReg().then(function (reg) {
          return reg.pushManager.getSubscription().then(function (existing) {
            if (existing) return existing;
            return reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY)
            });
          });
        }).then(function (sub) {
          if (!(window.SB && SB.savePushSubscription)) {
            return { ok: true, status: 'on', reason: 'no-backend' };
          }
          return SB.savePushSubscription(subToJSON(sub)).then(function (saved) {
            return saved
              ? { ok: true, status: 'on' }
              : { ok: false, status: 'ready', reason: 'save-failed' };
          });
        });
      })
      .catch(function (err) {
        console.warn('[push] enable failed:', err);
        return { ok: false, status: 'error', reason: String(err && err.message || err) };
      });
  }

  function disable() {
    if (!('serviceWorker' in navigator)) return Promise.resolve({ ok: true });
    return readyReg()
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        if (!sub) return { ok: true };
        var endpoint = sub.endpoint;
        return sub.unsubscribe()
          .then(function () {
            if (window.SB && SB.deletePushSubscription) return SB.deletePushSubscription(endpoint);
          })
          .then(function () { return { ok: true }; });
      })
      .catch(function (err) {
        console.warn('[push] disable failed:', err);
        return { ok: false };
      });
  }

  // Endpoints rotate; re-upsert on load if the user is already subscribed so
  // the row on the server stays fresh.
  function syncEndpoint() {
    if (!supported() || Notification.permission !== 'granted') return Promise.resolve();
    return readyReg()
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        if (sub && window.SB && SB.savePushSubscription) {
          return SB.savePushSubscription(subToJSON(sub));
        }
      })
      .catch(function () {});
  }

  window.Push = {
    supported: supported,
    status: status,
    enable: enable,
    disable: disable,
    syncEndpoint: syncEndpoint
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      var data = event.data || {};
      if (data.type !== 'push-nav' || !data.url) return;
      var url = new URL(data.url, window.location.origin);
      if (url.pathname === window.location.pathname && url.search) {
        history.replaceState(null, '', url.pathname + url.search);
      } else if (url.pathname !== window.location.pathname) {
        window.location.href = url.href;
      }
    });
  }
})();
