/**
 * Splitify API — Supabase Edge Function
 * Parity with backend/code.gs (Apps Script): same actions and { error, data } envelope.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 * Optional but recommended for claim races: SUPABASE_DB_URL (direct Postgres URI, port 5432)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import {
  decode as base64Decode,
  encode as base64Encode,
} from "https://deno.land/std@0.208.0/encoding/base64.ts";

const GEMINI_BILL_DEFAULT_MODEL = "gemini-3-flash-preview";
const GEMINI_BILL_ALLOWED_MODELS: Record<string, boolean> = {
  "gemini-2.5-flash": true,
  "gemini-2.5-flash-lite": true,
  "gemini-3-flash-preview": true,
  "gemini-3.1-flash-lite-preview": true,
  "gemma-3-27b-it": true,
};

const BUCKET = "splitify";
const IMAGE_PREFIX = "bills/";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function responseJson(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeUserName(v: unknown): string {
  return String(v || "").toLowerCase().replace(/\s+/g, "").trim();
}

function normalizeWhitespace(v: unknown): string {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function normalizeItemDescription(raw: unknown): string {
  let original = normalizeWhitespace(raw);
  if (!original) return "";
  let text = original;
  text = text.replace(/^\d+\s*(?:x|×)?\s+/i, "");
  text = text.replace(/\s*\(\d+\)\s*$/, "");
  const atIdx = text.search(/\s+@\s*[€$£]?\s*\d/i);
  if (atIdx >= 0) text = text.substring(0, atIdx);
  const xIdx = text.search(/\s+x\s*\d+\b/i);
  if (xIdx >= 0) text = text.substring(0, xIdx);
  text = text.replace(
    /\s+[€$£]\s*\d+(?:[.,]\d+)?(?:\s+[€$£]\s*\d+(?:[.,]\d+)?)?\s*$/,
    "",
  );
  text = normalizeWhitespace(text.replace(/[-,:;]+$/, ""));
  return text || original;
}

function itemGroupKey(
  description: string,
  unitPrice: number,
  category: string,
): string {
  const descKey = normalizeWhitespace(description).toLowerCase();
  const unitCents = Math.round((Number(unitPrice) || 0) * 100);
  const catKey = normalizeWhitespace(category).toLowerCase();
  return `${descKey}|${catKey}|${unitCents}`;
}

function effectiveItemUnitPrice(
  quantity: number,
  unitRaw: number,
  totalRaw: number,
): number {
  let q = parseInt(String(quantity), 10);
  if (isNaN(q)) q = 0;
  const u = parseFloat(String(unitRaw));
  const t = parseFloat(String(totalRaw));
  if (!isNaN(u) && u > 0) return u;
  if (q > 0 && !isNaN(t)) return t / q;
  return isNaN(u) ? 0 : u;
}

function cleanBase64(s: string): string {
  return String(s || "").replace(/\s/g, "");
}

function sumBillTotal(
  items: Array<{ total_price?: number }> | undefined,
): number {
  let s = 0;
  for (const it of items || []) {
    s += parseFloat(String(it.total_price)) || 0;
  }
  return s;
}

type BillItemRow = {
  row_index: number;
  category: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type ClaimRow = {
  billId: string;
  userName: string;
  rowIndex: number;
  unitIndex: number;
};

async function getActiveBillModelFromConfig(
  sb: ReturnType<typeof createClient>,
): Promise<string> {
  const { data, error } = await sb
    .from("config_entries")
    .select("key, value")
    .eq("key", "aiModelActive")
    .maybeSingle();
  if (error || !data) return GEMINI_BILL_DEFAULT_MODEL;
  const model = String(data.value || "").trim();
  if (model && GEMINI_BILL_ALLOWED_MODELS[model]) return model;
  return GEMINI_BILL_DEFAULT_MODEL;
}

async function getBillItems(
  sb: ReturnType<typeof createClient>,
  billId: string,
): Promise<BillItemRow[]> {
  const { data, error } = await sb
    .from("bill_items")
    .select(
      "row_index, category, description, quantity, unit_price, total_price",
    )
    .eq("bill_id", billId)
    .order("row_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as BillItemRow[];
}

async function getBillMetaRow(
  sb: ReturnType<typeof createClient>,
  billId: string,
) {
  if (!billId) throw new Error("Missing billId");
  const { data, error } = await sb
    .from("bills")
    .select(
      "bill_id, bill_date, venue_name, open, total_paid, image_path, image_mime",
    )
    .eq("bill_id", billId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Bill not found");
  return data as {
    bill_id: string;
    bill_date: string;
    venue_name: string;
    open: boolean;
    total_paid: number | null;
    image_path: string | null;
    image_mime: string | null;
  };
}

async function getBillById(
  sb: ReturnType<typeof createClient>,
  billId: string,
) {
  if (!billId) throw new Error("Missing billId");
  const meta = await getBillMetaRow(sb, billId);
  const rawItems = await getBillItems(sb, billId);
  const items = rawItems.map((row) => {
    const qty = parseInt(String(row.quantity), 10) || 0;
    const rawUnit = parseFloat(String(row.unit_price));
    const rawTotal = parseFloat(String(row.total_price));
    return {
      rowIndex: parseInt(String(row.row_index), 10) || 0,
      category: String(row.category || ""),
      description: normalizeItemDescription(String(row.description || "")),
      quantity: qty,
      unit_price: effectiveItemUnitPrice(qty, rawUnit, rawTotal),
      total_price: isNaN(rawTotal) ? 0 : rawTotal,
    };
  });
  const open = meta.open === true;
  let totalPaid: number | null = meta.total_paid != null
    ? parseFloat(String(meta.total_paid))
    : null;
  if (totalPaid != null && isNaN(totalPaid)) totalPaid = null;
  return {
    billId: billId,
    billDate: formatDate(meta.bill_date) || null,
    venueName: String(meta.venue_name || ""),
    items,
    metadata: {
      open,
      totalPaid,
      billImageId: meta.image_path || null,
    },
  };
}

async function getClaimsByBillId(
  sb: ReturnType<typeof createClient>,
  billId: string,
): Promise<ClaimRow[]> {
  if (!billId) throw new Error("Missing billId");
  const { data, error } = await sb
    .from("claims")
    .select("bill_id, user_name, row_index, unit_index")
    .eq("bill_id", billId)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  const out: ClaimRow[] = [];
  for (const r of data || []) {
    const row = r as {
      user_name: string;
      row_index: number;
      unit_index: number;
    };
    out.push({
      billId,
      userName: String(row.user_name || ""),
      rowIndex: parseInt(String(row.row_index), 10) || 0,
      unitIndex: parseInt(String(row.unit_index), 10) || 0,
    });
  }
  return out;
}

async function getBillSummaryById(
  sb: ReturnType<typeof createClient>,
  billId: string,
) {
  if (!billId) throw new Error("Missing billId");
  const bill = await getBillById(sb, billId);
  const claims = await getClaimsByBillId(sb, billId);
  const claimMap: Record<string, string> = {};
  for (const c of claims) {
    claimMap[`${c.rowIndex}_${c.unitIndex}`] = c.userName;
  }
  const billTotal = sumBillTotal(bill.items);
  const totalPaid = bill.metadata.totalPaid != null
    ? bill.metadata.totalPaid
    : billTotal;
  const tip = Math.max(0, (parseFloat(String(totalPaid)) || 0) - billTotal);
  const tipPercent = billTotal > 0 ? (tip / billTotal) * 100 : 0;

  const byUserSlots: Record<string, { subtotal: number }> = {};
  const byItem: Array<Record<string, unknown>> = [];

  for (const it of bill.items) {
    let claimed = 0;
    const itemClaimByUser: Record<string, number> = {};
    const q = parseInt(String(it.quantity), 10) || 0;
    for (let u = 0; u < q; u++) {
      const key = `${it.rowIndex}_${u}`;
      const name = claimMap[key];
      if (!name) continue;
      claimed++;
      itemClaimByUser[name] = (itemClaimByUser[name] || 0) + 1;
      if (!byUserSlots[name]) byUserSlots[name] = { subtotal: 0 };
      byUserSlots[name].subtotal += parseFloat(String(it.unit_price)) || 0;
    }
    const claimsByUser: Array<{ userName: string; count: number }> = [];
    const itemUserNames = Object.keys(itemClaimByUser).sort();
    for (const nm of itemUserNames) {
      claimsByUser.push({ userName: nm, count: itemClaimByUser[nm] });
    }
    byItem.push({
      description: it.description,
      category: it.category,
      quantity: it.quantity,
      claimed,
      unclaimed: Math.max(0, q - claimed),
      unitPrice: parseFloat(String(it.unit_price)) || 0,
      totalPrice: parseFloat(String(it.total_price)) || 0,
      claimsByUser,
    });
  }

  const byUser: Array<Record<string, unknown>> = [];
  const names = Object.keys(byUserSlots).sort();
  for (const nm of names) {
    const sub = byUserSlots[nm].subtotal;
    const tipShare = billTotal > 0 ? tip * (sub / billTotal) : 0;
    byUser.push({
      userName: nm,
      subtotal: sub,
      tipShare,
      totalWithTip: sub + tipShare,
    });
  }

  return {
    billId,
    billTotal,
    totalPaid,
    tipAmount: tip,
    tipPercent,
    byUser,
    byItem,
  };
}

async function getBillImageById(
  sb: ReturnType<typeof createClient>,
  billId: string,
) {
  if (!billId) throw new Error("Missing billId");
  const meta = await getBillMetaRow(sb, billId);
  const path = meta.image_path;
  if (!path) throw new Error("No bill image for this bill");
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Failed to load image");
  const buf = new Uint8Array(await data.arrayBuffer());
  const base64 = base64Encode(buf);
  const mimeType = meta.image_mime || data.type || "image/jpeg";
  return { mimeType, base64 };
}

async function getConfigNames(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb.from("config_entries").select("key");
  if (error) throw new Error(error.message);
  return (data || []).map((r: { key: string }) => r.key).filter(Boolean);
}

async function getProductIcons(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb.from("config_entries").select("key, value");
  if (error) throw new Error(error.message);
  const out: Array<{
    product: string;
    image: string;
    kind: string;
  }> = [];
  for (const row of data || []) {
    const key = String((row as { key: string }).key || "");
    const image = String((row as { value: string }).value || "").trim();
    if (!key) continue;
    if (key.indexOf("productIconCategory:") === 0) {
      const cat = key.substring("productIconCategory:".length).trim()
        .toLowerCase();
      if (!cat || !image) continue;
      out.push({ product: cat, image, kind: "category" });
      continue;
    }
    if (key.indexOf("productIcon:") !== 0) continue;
    const product = key.substring("productIcon:".length).trim();
    if (!product || !image) continue;
    out.push({ product, image, kind: "description" });
  }
  return out;
}

async function listBills(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb
    .from("bills")
    .select("bill_id, bill_date, venue_name, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data || []) as Array<{
    bill_id: string;
    bill_date: string;
    venue_name: string;
    created_at: string;
  }>;
  return rows.map((r) => ({
    billId: r.bill_id,
    venueName: String(r.venue_name || ""),
    billDate: formatDate(r.bill_date),
    uploadDate: r.created_at
      ? new Date(r.created_at).toISOString()
      : "",
  }));
}

function parseGeminiBillJson(text: string) {
  const cleaned = String(text).replace(/```json\s*/g, "").replace(
    /```\s*/g,
    "",
  ).trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse model response");
  const parsed = JSON.parse(match[0]) as {
    items?: Array<Record<string, unknown>>;
    billDate?: string;
    venueName?: string;
  };
  if (!Array.isArray(parsed.items)) parsed.items = [];
  parsed.billDate = formatDate(parsed.billDate) || formatDate(new Date()) ||
    "";
  return parsed;
}

async function analyzeBillImage(
  sb: ReturnType<typeof createClient>,
  body: { base64?: string; mimeType?: string },
) {
  const base64 = cleanBase64(String(body.base64 || ""));
  const mimeType = body.mimeType || "image/jpeg";
  if (!base64) throw new Error("Missing image data");
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const modelId = await getActiveBillModelFromConfig(sb);

  const prompt =
    'Analyze this bill image and return ONLY JSON with this shape: {"venueName":"Name of the bar, restaurant or hostelry shown on the bill, or empty string if not visible","billDate":"YYYY-MM-DD","items":[{"category":"<slug>","description":"...","quantity":1,"unit_price":0,"total_price":0}]}.' +
    " For each line item, category MUST be exactly one of these strings (pick the best fit; use subtypes whenever possible):" +
    " drink.beer, drink.wine, drink.spirit, drink.cold_soft, drink.hot, drink.other," +
    " food.sandwich, food.wrap, food.burger, food.pizza, food.rice, food.curry, food.noodles, food.plate, food.salad, food.soup, food.fried_side, food.pastry, food.dessert, food.other," +
    " or a top-level bucket only if no subtype fits: food, drink, other." +
    " description must keep meaningful variant qualifiers that distinguish products (for example Pint vs Glass, Bottle vs Draft, and volume markers like 125ml/250ml), while still excluding prices/totals/multipliers/symbols. No markdown, no commentary, JSON only." +
    " If a line shows total and quantity but not unit price, set unit_price to total_price divided by quantity (and keep total_price as on the receipt).";

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${
      encodeURIComponent(apiKey)
    }`;
  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt },
      ],
    }],
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Gemini API error: " + response.status);
  }
  const json = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = json.candidates?.[0]?.content?.parts;
  const text = parts?.[0]?.text || "";
  if (!text) throw new Error("No extraction result from Gemini");
  const parsed = parseGeminiBillJson(text);

  await sb.from("upload_jobs").delete().lt(
    "created_at",
    new Date(Date.now() - 86400000).toISOString(),
  );

  const jobId = crypto.randomUUID();
  const { error: insErr } = await sb.from("upload_jobs").insert({
    job_id: jobId,
    analysis: parsed,
  });
  if (insErr) throw new Error(insErr.message);

  return {
    jobId,
    billDate: parsed.billDate,
    venueName: parsed.venueName || "",
    billTotal: sumBillTotal(
      parsed.items as Array<{ total_price?: number }>,
    ),
    modelId,
  };
}

async function completeBillUpload(
  sb: ReturnType<typeof createClient>,
  body: { jobId?: string; base64?: string; mimeType?: string },
) {
  const jobId = body.jobId;
  if (!jobId) throw new Error("Missing jobId");
  const { data: jobRow, error: jobErr } = await sb
    .from("upload_jobs")
    .select("analysis")
    .eq("job_id", jobId)
    .maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (!jobRow) throw new Error("Analysis expired or invalid jobId");
  const analysis = jobRow.analysis as {
    billDate: string;
    venueName?: string;
    items?: Array<Record<string, unknown>>;
  };

  const billId = crypto.randomUUID();
  let imagePath: string | null = null;
  let imageMime: string | null = null;

  if (body.base64) {
    const bytes = base64Decode(cleanBase64(body.base64));
    imageMime = body.mimeType || "image/jpeg";
    imagePath = `${IMAGE_PREFIX}${billId}.jpg`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(
      imagePath,
      bytes,
      { contentType: imageMime, upsert: true },
    );
    if (upErr) throw new Error(upErr.message);
  }

  const items = analysis.items || [];
  const billItemsInsert = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let qty = parseInt(String(it.quantity), 10) || 1;
    let rawUnit = parseFloat(String(it.unit_price));
    let unit = isNaN(rawUnit) || rawUnit < 0 ? 0 : rawUnit;
    let total = parseFloat(String(it.total_price));
    if (isNaN(total)) total = qty * unit;
    if (unit <= 0 && qty > 0) {
      const tOnly = parseFloat(String(it.total_price));
      if (!isNaN(tOnly)) unit = effectiveItemUnitPrice(qty, 0, tOnly);
    }
    billItemsInsert.push({
      bill_id: billId,
      row_index: i,
      category: String(it.category || "other"),
      description: normalizeItemDescription(String(it.description || "")),
      quantity: qty,
      unit_price: unit,
      total_price: total,
    });
  }

  const { error: billErr } = await sb.from("bills").insert({
    bill_id: billId,
    bill_date: analysis.billDate,
    venue_name: String(analysis.venueName || ""),
    open: true,
    total_paid: null,
    image_path: imagePath,
    image_mime: imageMime,
    created_at: new Date().toISOString(),
  });
  if (billErr) throw new Error(billErr.message);

  if (billItemsInsert.length) {
    const { error: itemsErr } = await sb.from("bill_items").insert(
      billItemsInsert,
    );
    if (itemsErr) throw new Error(itemsErr.message);
  }

  await sb.from("upload_jobs").delete().eq("job_id", jobId);

  return {
    billId,
    billDate: analysis.billDate,
    billTotal: sumBillTotal(items as Array<{ total_price?: number }>),
  };
}

async function updateBillTotalPaid(
  sb: ReturnType<typeof createClient>,
  body: { billId?: string; totalPaid?: number },
) {
  const billId = body.billId;
  const totalPaid = parseFloat(String(body.totalPaid));
  if (!billId) throw new Error("Missing billId");
  if (isNaN(totalPaid) || totalPaid < 0) throw new Error("Invalid totalPaid");

  const { error } = await sb.from("bills").update({ total_paid: totalPaid }).eq(
    "bill_id",
    billId,
  );
  if (error) throw new Error(error.message);

  const bill = await getBillById(sb, billId);
  return {
    billId,
    billTotal: sumBillTotal(bill.items),
    totalPaid,
  };
}

/** Port of submitClaimsByBillId resolution logic (backend/code.gs) */
function resolveClaimsSubmission(
  billItems: Array<{
    rowIndex: number;
    category: string;
    description: string;
    quantity: number;
    unit_price: number;
  }>,
  sheetClaims: ClaimRow[],
  userName: string,
  claims: Array<{ rowIndex: number; unitIndex: number }>,
) {
  const validSlots: Record<string, boolean> = {};
  const slotInfo: Record<
    string,
    { description: string; groupKey: string }
  > = {};
  const groupSlots: Record<string, string[]> = {};

  for (const bi of billItems) {
    const itemDesc = normalizeItemDescription(bi.description);
    const gk = itemGroupKey(
      itemDesc || "item",
      bi.unit_price,
      bi.category,
    );
    const q = parseInt(String(bi.quantity), 10) || 0;
    for (let u = 0; u < q; u++) {
      const slotId = `${bi.rowIndex}_${u}`;
      validSlots[slotId] = true;
      slotInfo[slotId] = { description: itemDesc || "item", groupKey: gk };
      if (!groupSlots[gk]) groupSlots[gk] = [];
      groupSlots[gk].push(slotId);
    }
  }

  for (const c of claims) {
    const key = `${c.rowIndex}_${c.unitIndex}`;
    if (!validSlots[key]) throw new Error("Invalid claim slot: " + key);
  }

  const userLower = normalizeUserName(userName);
  const takenByOthers: Record<string, boolean> = {};
  for (const row of sheetClaims) {
    if (normalizeUserName(row.userName) === userLower) continue;
    takenByOthers[`${row.rowIndex}_${row.unitIndex}`] = true;
  }

  const resolvedSlots: Record<string, boolean> = {};
  const resolvedClaims: Array<{ rowIndex: number; unitIndex: number }> = [];

  for (const cl of claims) {
    const requestedSlot = `${cl.rowIndex}_${cl.unitIndex}`;
    const requestedInfo = slotInfo[requestedSlot];
    const descriptionForError = requestedInfo?.description || "item";
    let chosenSlot = requestedSlot;
    if (takenByOthers[chosenSlot] || resolvedSlots[chosenSlot]) {
      const candidates = requestedInfo
        ? groupSlots[requestedInfo.groupKey] || []
        : [];
      chosenSlot = "";
      for (const candidate of candidates) {
        if (takenByOthers[candidate]) continue;
        if (resolvedSlots[candidate]) continue;
        chosenSlot = candidate;
        break;
      }
      if (!chosenSlot) {
        throw new Error(
          "Another person has claimed the " + descriptionForError +
            ". Please refresh and try again.",
        );
      }
    }
    resolvedSlots[chosenSlot] = true;
    const split = chosenSlot.split("_");
    resolvedClaims.push({
      rowIndex: parseInt(split[0], 10) || 0,
      unitIndex: parseInt(split[1], 10) || 0,
    });
  }

  return resolvedClaims;
}

async function submitClaimsByBillIdWithClient(
  client: Client,
  billId: string,
  userName: string,
  claims: Array<{ rowIndex: number; unitIndex: number }>,
) {
  await client.queryArray`BEGIN`;
  try {
    await client.queryArray`SELECT pg_advisory_xact_lock(hashtext(${billId}))`;

    const itemsRes = await client.queryObject<{
      row_index: number;
      category: string;
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>`
      SELECT row_index, category, description, quantity, unit_price, total_price
      FROM splitify.bill_items WHERE bill_id = ${billId} ORDER BY row_index
    `;

    const claimsRes = await client.queryObject<{
      user_name: string;
      row_index: number;
      unit_index: number;
    }>`
      SELECT user_name, row_index, unit_index FROM splitify.claims WHERE bill_id = ${billId}
    `;

    const billItemsForResolve = (itemsRes.rows || []).map((row) => {
      const qty = parseInt(String(row.quantity), 10) || 0;
      const rawUnit = parseFloat(String(row.unit_price));
      const rawTotal = parseFloat(String(row.total_price));
      return {
        rowIndex: parseInt(String(row.row_index), 10) || 0,
        category: String(row.category || ""),
        description: normalizeItemDescription(String(row.description || "")),
        quantity: qty,
        unit_price: effectiveItemUnitPrice(qty, rawUnit, rawTotal),
      };
    });

    const sheetClaims: ClaimRow[] = (claimsRes.rows || []).map((r) => ({
      billId,
      userName: String(
        (r as { user_name: string }).user_name || "",
      ),
      rowIndex:
        parseInt(String((r as { row_index: number }).row_index), 10) || 0,
      unitIndex:
        parseInt(String((r as { unit_index: number }).unit_index), 10) || 0,
    }));

    const resolved = resolveClaimsSubmission(
      billItemsForResolve,
      sheetClaims,
      userName,
      claims,
    );

    const uNorm = normalizeUserName(userName);
    await client.queryObject`
      DELETE FROM splitify.claims WHERE bill_id = ${billId}
        AND lower(regexp_replace(trim(user_name), '\\s+', '', 'g')) = ${uNorm}
    `;

    for (const rc of resolved) {
      await client.queryObject`
        INSERT INTO splitify.claims (bill_id, user_name, row_index, unit_index)
        VALUES (${billId}, ${userName}, ${rc.rowIndex}, ${rc.unitIndex})
      `;
    }

    await client.queryArray`COMMIT`;
  } catch (e) {
    await client.queryArray`ROLLBACK`;
    throw e;
  }
}

async function submitClaimsByBillId(
  sb: ReturnType<typeof createClient>,
  body: {
    billId?: string;
    userName?: string;
    claims?: Array<{ rowIndex: number; unitIndex: number }>;
  },
) {
  const billId = body.billId;
  const userName = String(body.userName || "").trim();
  const claims = Array.isArray(body.claims) ? body.claims : [];
  if (!billId) throw new Error("Missing billId");
  if (!userName) throw new Error("Missing userName");

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    throw new Error(
      "SUPABASE_DB_URL must be set for claim submission (direct Postgres URI, port 5432)",
    );
  }
  const client = new Client(dbUrl);
  await client.connect();
  try {
    await submitClaimsByBillIdWithClient(client, billId, userName, claims);
  } finally {
    await client.end();
  }

  return { ok: true, claims: await getClaimsByBillId(sb, billId) };
}

async function deleteBillById(
  sb: ReturnType<typeof createClient>,
  body: { billId?: string },
) {
  const billId = String(body.billId || "").trim();
  if (!billId) throw new Error("Missing billId");

  const meta = await getBillMetaRow(sb, billId).catch(() => null);
  if (!meta) throw new Error("Bill not found");

  if (meta.image_path) {
    await sb.storage.from(BUCKET).remove([meta.image_path]);
  }

  const { error } = await sb.from("bills").delete().eq("bill_id", billId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function doGet(
  sb: ReturnType<typeof createClient>,
  url: URL,
): Promise<Response> {
  const action = url.searchParams.get("action") || "";
  const out: { error: string | null; data: unknown } = { error: null, data: null };
  try {
    if (action === "getBillById") {
      out.data = await getBillById(sb, url.searchParams.get("billId") || "");
    } else if (action === "getClaimsByBillId") {
      out.data = await getClaimsByBillId(
        sb,
        url.searchParams.get("billId") || "",
      );
    } else if (action === "getBillSummaryById") {
      out.data = await getBillSummaryById(
        sb,
        url.searchParams.get("billId") || "",
      );
    } else if (action === "getBillImageById") {
      out.data = await getBillImageById(
        sb,
        url.searchParams.get("billId") || "",
      );
    } else if (action === "configNames") {
      out.data = await getConfigNames(sb);
    } else if (action === "getProductIcons") {
      out.data = await getProductIcons(sb);
    } else if (action === "getActiveBillModel") {
      out.data = { modelId: await getActiveBillModelFromConfig(sb) };
    } else if (action === "listBills") {
      out.data = await listBills(sb);
    } else if (action === "getQuips") {
      const { data, error } = await sb.from("config_entries").select("key, value");
      if (error) throw new Error(error.message);
      const quips: string[] = [];
      for (const row of data || []) {
        const k = String((row as { key: string }).key || "").toLowerCase();
        const v = String((row as { value: string }).value || "");
        if ((k === "quip" || k === "quips") && v) quips.push(v);
      }
      out.data = quips;
    } else {
      throw new Error("Unknown or missing action");
    }
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return responseJson(out);
}

async function doPost(
  sb: ReturnType<typeof createClient>,
  req: Request,
): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }
  const action = String(body.action || "");
  const out: { error: string | null; data: unknown } = { error: null, data: null };
  try {
    if (action === "analyzeBillImage") {
      out.data = await analyzeBillImage(
        sb,
        body as { base64?: string; mimeType?: string },
      );
    } else if (action === "completeBillUpload") {
      out.data = await completeBillUpload(
        sb,
        body as { jobId?: string; base64?: string; mimeType?: string },
      );
    } else if (action === "updateBillTotalPaid") {
      out.data = await updateBillTotalPaid(
        sb,
        body as { billId?: string; totalPaid?: number },
      );
    } else if (action === "submitClaimsByBillId") {
      out.data = await submitClaimsByBillId(
        sb,
        body as {
          billId?: string;
          userName?: string;
          claims?: Array<{ rowIndex: number; unitIndex: number }>;
        },
      );
    } else if (action === "deleteBillById") {
      out.data = await deleteBillById(sb, body as { billId?: string });
    } else {
      throw new Error("Unknown or missing action");
    }
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return responseJson(out);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey, {
    db: { schema: "splitify" },
  });

  if (req.method === "GET") {
    return doGet(sb, new URL(req.url));
  }
  if (req.method === "POST") {
    return doPost(sb, req);
  }
  return responseJson({ error: "Method not allowed", data: null }, 405);
});
