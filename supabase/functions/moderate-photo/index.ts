// Buy Sell Trade SXM — moderate-photo Edge Function
//
// Admin-only helper: scans one listing photo with AWS Rekognition
// DetectModerationLabels (explicit nudity, violence, weapons, drugs, ...)
// and returns the labels + confidence. The admin panel calls this from
// the "À valider" (moderation) tab so an admin can see an AI opinion
// before approving/rejecting a listing — it does NOT auto-block posting
// by itself (kept as an assist, not an autonomous gate, since it depends
// on an AWS account/keys you set up yourself).
//
// POST { image_url: "https://.../listing-photos/....jpg" }
// Header: Authorization: Bearer <the calling admin's Supabase access token>
//
// Setup:
//   1. Create an AWS account (aws.amazon.com) if you don't have one.
//   2. IAM -> Users -> create a user with programmatic access and ONLY the
//      AmazonRekognitionReadOnlyAccess policy (least privilege).
//   3. supabase secrets set AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1
//   4. supabase functions deploy moderate-photo
//
// Cost: AWS Rekognition image moderation — first 5,000 images/month free,
// then roughly $1 per 1,000 images (check current AWS pricing).

// @deno-types="npm:@aws-sdk/client-rekognition@3"
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from "npm:@aws-sdk/client-rekognition@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";

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

async function callerIsAdmin(bearer: string): Promise<boolean> {
  if (!bearer) return false;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${bearer}`, apikey: SERVICE_KEY },
  });
  if (!userRes.ok) return false;
  const user = await userRes.json();
  if (!user?.id) return false;
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!profRes.ok) return false;
  const rows = await profRes.json();
  return rows?.[0]?.role === "admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "function not configured" }, 500);
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return json({ error: "AWS not configured — set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION secrets" }, 500);
  }

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await callerIsAdmin(bearer))) return json({ error: "admin only" }, 403);

  let body: { image_url?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  const imageUrl = (body.image_url || "").trim();
  if (!imageUrl) return json({ error: "image_url required" }, 400);

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return json({ error: `could not fetch image: ${imgRes.status}` }, 400);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  if (bytes.byteLength > 5 * 1024 * 1024) return json({ error: "image too large (max 5MB for this check)" }, 400);

  try {
    const client = new RekognitionClient({
      region: AWS_REGION,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    });
    const out = await client.send(new DetectModerationLabelsCommand({
      Image: { Bytes: bytes },
      MinConfidence: 60,
    }));
    const labels = (out.ModerationLabels || []).map((l) => ({
      name: l.Name, parentName: l.ParentName, confidence: l.Confidence,
    }));
    const flagged = labels.some((l) =>
      /weapon|drug|gun|firearm|knife|explicit|violence/i.test(String(l.name) + " " + String(l.parentName))
    );
    return json({ flagged, labels });
  } catch (err) {
    return json({ error: `rekognition error: ${(err as Error).message}` }, 502);
  }
});
