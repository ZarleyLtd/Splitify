#!/usr/bin/env node
/**
 * One-time migration: Google Apps Script backend (Sheets + Drive) → Supabase.
 *
 * Prerequisites:
 * - Run supabase/migrations on your project (tables + bucket).
 * - Env:
 *   LEGACY_API_URL   — Apps Script web app URL (same as old SPLITIFY_CONFIG.API_URL)
 *   SUPABASE_URL     — https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: node scripts/migrate-google-to-supabase.mjs
 *
 * Idempotent: skips bills that already exist in splitify.bills.
 */

const LEGACY = process.env.LEGACY_API_URL?.replace(/\/$/, "");
const SB = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!LEGACY || !SB || !KEY) {
  console.error(
    "Set LEGACY_API_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const sbHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Accept-Profile": "splitify",
  "Content-Profile": "splitify",
  Prefer: "return=minimal,resolution=merge-duplicates",
};

function legacyQueryUrl(action, params = {}) {
  const u = new URL(LEGACY);
  u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function legacyGet(action, params = {}) {
  const r = await fetch(legacyQueryUrl(action, params));
  const j = await r.json();
  if (j.error) throw new Error(`Legacy ${action}: ${j.error}`);
  return j.data;
}

async function legacyPost(action, body) {
  const r = await fetch(LEGACY, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ action, ...body }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`Legacy ${action}: ${j.error}`);
  return j.data;
}

async function sbExists(billId) {
  const u = `${SB}/rest/v1/bills?bill_id=eq.${encodeURIComponent(billId)}&select=bill_id`;
  const r = await fetch(u, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Supabase bills check: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function sbInsert(table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${SB}/rest/v1/${table}`, {
    method: "POST",
    headers: sbHeaders,
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    throw new Error(`Supabase insert ${table}: ${r.status} ${await r.text()}`);
  }
}

async function sbUploadImage(billId, base64, mimeType) {
  const path = `bills/${billId}.jpg`;
  const bin = Buffer.from(base64, "base64");
  const r = await fetch(
    `${SB}/storage/v1/object/splitify/${path}?upsert=true`,
    {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": mimeType || "image/jpeg",
      },
      body: bin,
    },
  );
  if (!r.ok && r.status !== 409) {
    throw new Error(`Storage upload: ${r.status} ${await r.text()}`);
  }
  const patch = await fetch(
    `${SB}/rest/v1/bills?bill_id=eq.${encodeURIComponent(billId)}`,
    {
      method: "PATCH",
      headers: sbHeaders,
      body: JSON.stringify({ image_path: path, image_mime: mimeType || "image/jpeg" }),
    },
  );
  if (!patch.ok) {
    throw new Error(`Bill image_path patch: ${patch.status} ${await patch.text()}`);
  }
}

async function migrateBill(listRow) {
  const billId = listRow.billId;
  if (await sbExists(billId)) {
    console.log("skip (exists)", billId);
    return;
  }

  const bill = await legacyGet("getBillById", { billId });
  const claims = (await legacyGet("getClaimsByBillId", { billId })) || [];

  const billRow = {
    bill_id: bill.billId,
    bill_date: bill.billDate,
    venue_name: bill.venueName || "",
    open: bill.metadata?.open !== false,
    total_paid: bill.metadata?.totalPaid ?? null,
    image_path: null,
    image_mime: null,
    created_at: listRow.uploadDate || new Date().toISOString(),
  };

  const items = bill.items || [];
  const itemRows = items.map((it) => ({
    bill_id: billId,
    row_index: it.rowIndex,
    category: it.category || "other",
    description: it.description || "",
    quantity: it.quantity ?? 1,
    unit_price: it.unit_price ?? 0,
    total_price: it.total_price ?? 0,
  }));

  const claimRows = claims.map((c) => ({
    bill_id: billId,
    user_name: c.userName,
    row_index: c.rowIndex,
    unit_index: c.unitIndex,
  }));

  await sbInsert("bills", [billRow]);
  await sbInsert("bill_items", itemRows);
  await sbInsert("claims", claimRows);

  try {
    const img = await legacyGet("getBillImageById", { billId });
    if (img && img.base64) {
      await sbUploadImage(billId, img.base64, img.mimeType);
    }
  } catch (e) {
    console.warn("  no image for", billId, e.message || e);
  }

  console.log("migrated", billId);
}

async function main() {
  const bills = await legacyGet("listBills");
  if (!bills || !bills.length) {
    console.log("No bills on legacy backend.");
    return;
  }
  console.log(`Migrating ${bills.length} bills...`);
  for (const row of bills) {
    try {
      await migrateBill(row);
    } catch (e) {
      console.error("Failed", row.billId, e.message || e);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
