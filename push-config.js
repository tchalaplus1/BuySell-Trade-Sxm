/* Buy Sell Trade Sxm — Web Push public config.
 *
 * The VAPID PUBLIC key is meant to be shipped to the browser (it is the
 * `applicationServerKey` passed to pushManager.subscribe). The matching
 * PRIVATE key lives only as a Supabase Edge Function secret — never here.
 *
 * Regenerate the pair with:  node scripts/gen-vapid.js
 */
window.VAPID_PUBLIC_KEY = "BPd4myux0lMD7nZGZzqfIJnGmaiuaw5PqTZWriakbzND7NSwKCBg0MSKv1cFmUMH7oEJw_ml0A4pnGp5Mf1M1mw";

/* Master switch — set false to hide the "enable notifications" UI without
 * ripping the code out (e.g. if the Edge Function isn't deployed yet). */
window.PUSH_ENABLED = true;
