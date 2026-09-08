const { spawnSync } = require("child_process");
const { randomBytes, webcrypto } = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT_REF = "szhaxlmronirhnntlwyb";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function run(args, options = {}) {
  const res = spawnSync("supabase", args, {
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32"
  });
  if (res.status !== 0) {
    const err = res.stderr ? res.stderr.toString() : "";
    throw new Error(`supabase ${args.join(" ")} failed${err ? `: ${err}` : ""}`);
  }
  return res.stdout ? res.stdout.toString() : "";
}

(async () => {
  const kp = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKey = b64url(await webcrypto.subtle.exportKey("raw", kp.publicKey));
  const privateJwk = await webcrypto.subtle.exportKey("jwk", kp.privateKey);
  const pushSecret = randomBytes(32).toString("base64url");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bst-push-"));
  const envFile = path.join(tempDir, "push.env");
  const sqlFile = path.join(tempDir, "push-vault.sql");

  try {
    fs.writeFileSync(envFile, [
      `VAPID_PUBLIC_KEY=${publicKey}`,
      `VAPID_PRIVATE_KEY=${privateJwk.d}`,
      "VAPID_SUBJECT=mailto:admin@buyselltradesxm.com",
      `PUSH_FUNCTION_SECRET=${pushSecret}`
    ].join("\n"));

    run(["secrets", "set", "--project-ref", PROJECT_REF, "--env-file", envFile]);

    const escapedSecret = pushSecret.replace(/'/g, "''");
    fs.writeFileSync(sqlFile, `
select vault.create_secret('${escapedSecret}', 'PUSH_FUNCTION_SECRET', 'Shared secret used by the message trigger to call send-push');
select vault.create_secret('${PROJECT_URL}', 'PROJECT_URL', 'Buy Sell Trade SXM production Supabase URL');
`);
    run(["db", "query", "--linked", "--project-ref", PROJECT_REF, "--file", sqlFile]);

    const configPath = path.join(process.cwd(), "push-config.js");
    const current = fs.readFileSync(configPath, "utf8");
    const next = current.replace(
      /window\.VAPID_PUBLIC_KEY\s*=\s*"[^"]*";/,
      `window.VAPID_PUBLIC_KEY = "${publicKey}";`
    );
    if (next === current) throw new Error("Could not update VAPID public key in push-config.js");
    fs.writeFileSync(configPath, next);

    console.log(JSON.stringify({ ok: true, projectRef: PROJECT_REF, publicKeyUpdated: true }, null, 2));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
