#!/usr/bin/env node
/**
 * One-time storage migration: copy Splitify receipt images
 * from bucket "bill-images" to bucket "splitify".
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   SOURCE_BUCKET (default: bill-images)
 *   TARGET_BUCKET (default: splitify)
 *   PREFIX        (default: bills)
 *
 * Usage:
 *   node scripts/migrate-bucket-bill-images-to-splitify.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SOURCE_BUCKET = process.env.SOURCE_BUCKET || "bill-images";
const TARGET_BUCKET = process.env.TARGET_BUCKET || "splitify";
const PREFIX = process.env.PREFIX || "bills";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const authHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function listObjects(offset = 0, limit = 100) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(SOURCE_BUCKET)}`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix: PREFIX,
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`List failed: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function isFileRow(row) {
  return row && typeof row.name === "string" && row.id != null;
}

function objectPathFromRow(rowName) {
  if (rowName.startsWith(`${PREFIX}/`)) return rowName;
  return `${PREFIX}/${rowName}`;
}

async function downloadObject(path) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SOURCE_BUCKET)}/${path}`,
    { headers: authHeaders },
  );
  if (!res.ok) {
    throw new Error(`Download failed for ${path}: ${res.status} ${await res.text()}`);
  }
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}

async function uploadObject(path, bytes, contentType) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(TARGET_BUCKET)}/${path}?upsert=true`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": contentType,
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    throw new Error(`Upload failed for ${path}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  console.log(
    `Copying storage objects from ${SOURCE_BUCKET} to ${TARGET_BUCKET} (prefix: ${PREFIX})`,
  );

  let offset = 0;
  const pageSize = 100;
  let copied = 0;
  let seen = 0;

  while (true) {
    const rows = await listObjects(offset, pageSize);
    if (!rows.length) break;

    for (const row of rows) {
      seen++;
      if (!isFileRow(row)) continue;
      const path = objectPathFromRow(row.name);
      const { bytes, contentType } = await downloadObject(path);
      await uploadObject(path, bytes, contentType);
      copied++;
      if (copied % 20 === 0) {
        console.log(`Copied ${copied} files...`);
      }
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Done. Scanned ${seen} entries, copied ${copied} files.`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
