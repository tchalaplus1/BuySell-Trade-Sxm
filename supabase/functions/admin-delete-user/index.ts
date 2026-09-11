// Buy Sell Trade SXM — admin-delete-user Edge Function
//
// POST { user_id: "<uuid>" }
// Header: Authorization: Bearer <the calling admin's Supabase access token>
//
// Permanently deletes an auth.users row (and, via FK cascades, that user's
// profile). Their listings keep existing (seller_id -> null, so they show
// with the "Example" badge instead of vanishing), their messages are
// deleted (messages.sender_id/recipient_id -> cascade), same as any other
// Supabase Auth user deletion.
//
// This can only be done with the service-role key, which is why it must
// run server-side (an Edge Function), never in the browser.
//
// Deploy (Supabase CLI, once linked to this project):
//   supabase functions deploy admin-delete-user
// No extra secrets needed — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// already provided to every Edge Function automatically.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

function serviceKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (direct) return direct;
  const bundle = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  try {
    const p = JSON.parse(bundle);
    if (typeof p === "string") return p;
    if (p && typeof p === "object") {
      for (const v of Object.values(p)) if (typeof v === "string" && v.length > 20) return v as string;
    }
  } catch (_e) { /* ignore */ }
  return "";
}
const SERVICE_KEY = serviceKey();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function callerIsAdmin(bearer: string): Promise<{ ok: boolean; id?: string }> {
  if (!bearer) return { ok: false };
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${bearer}`, apikey: SERVICE_KEY },
  });
  if (!userRes.ok) return { ok: false };
  const user = await userRes.json();
  if (!user?.id) return { ok: false };

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!profRes.ok) return { ok: false };
  const rows = await profRes.json();
  return { ok: rows?.[0]?.role === "admin", id: user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "function not configured" }, 500);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { ok: isAdmin, id: adminId } = await callerIsAdmin(bearer);
  if (!isAdmin) return json({ error: "admin only" }, 403);

  let body: { user_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  const targetId = (body.user_id || "").trim();
  if (!targetId) return json({ error: "user_id required" }, 400);
  if (targetId === adminId) return json({ error: "cannot delete your own account this way" }, 400);

  const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!delRes.ok) {
    const errText = await delRes.text().catch(() => "");
    return json({ error: `delete failed: ${delRes.status} ${errText}` }, 502);
  }

  await fetch(`${SUPABASE_URL}/rest/v1/admin_events`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify([{
      admin_id: adminId,
      action: "admin_delete_user",
      target_type: "user",
      target_id: targetId,
      metadata: {},
    }]),
  }).catch(() => {});

  return json({ ok: true });
});
