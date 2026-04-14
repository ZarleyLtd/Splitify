/**
 * Splitify - Google Apps Script Web App backend.
 * BillId-first model for uploader + claim + summary workflow.
 */
var SHEETS = {
  CONFIG: 'Config',
  BILLS: 'Bills',
  CLAIMS: 'Claims',
  BILL_META: 'BillMeta'
};

var GEMINI_BILL_DEFAULT_MODEL = 'gemini-3-flash-preview';
var GEMINI_BILL_ALLOWED_MODELS = {
  'gemini-2.5-flash': true,
  'gemini-2.5-flash-lite': true,
  'gemini-3-flash-preview': true,
  'gemini-3.1-flash-lite-preview': true,
  'gemma-3-27b-it': true
};

function doGet(e) {
  var out = { error: null, data: null };
  try {
    var p = e && e.parameter ? e.parameter : {};
    var action = p.action || '';
    if (action === 'getBillById') out.data = getBillById(p.billId);
    else if (action === 'getClaimsByBillId') out.data = getClaimsByBillId(p.billId);
    else if (action === 'getBillSummaryById') out.data = getBillSummaryById(p.billId);
    else if (action === 'getBillImageById') out.data = getBillImageById(p.billId);
    else if (action === 'configNames') out.data = getConfigNames();
    else if (action === 'getProductIcons') out.data = getProductIcons();
    else if (action === 'getActiveBillModel') out.data = getActiveBillModel();
    else if (action === 'listBills') out.data = listBills();
    else throw new Error('Unknown or missing action');
  } catch (err) {
    out.error = err.message || String(err);
  }
  return responseJson(out);
}

function doPost(e) {
  var out = { error: null, data: null };
  try {
    var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = body.action || '';
    if (action === 'analyzeBillImage') out.data = analyzeBillImage(body);
    else if (action === 'completeBillUpload') out.data = completeBillUpload(body);
    else if (action === 'updateBillTotalPaid') out.data = updateBillTotalPaid(body);
    else if (action === 'submitClaimsByBillId') out.data = submitClaimsByBillId(body);
    else if (action === 'deleteBillById') out.data = deleteBillById(body);
    else throw new Error('Unknown or missing action');
  } catch (err) {
    out.error = err.message || String(err);
  }
  return responseJson(out);
}

function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function formatDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  var d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function normalizeUserName(v) {
  return String(v || '').toLowerCase().replace(/\s+/g, '').trim();
}

function normalizeWhitespace_(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function normalizeItemDescription_(raw) {
  var original = normalizeWhitespace_(raw);
  if (!original) return '';
  var text = original;
  // Receipt lines often begin with quantity (e.g. "5 French Fries @ 6.50").
  text = text.replace(/^\d+\s*(?:x|×)?\s+/i, '');
  // Remove trailing count markers that can be duplicated in OCR output.
  text = text.replace(/\s*\(\d+\)\s*$/, '');
  var atIdx = text.search(/\s+@\s*[€$£]?\s*\d/i);
  if (atIdx >= 0) text = text.substring(0, atIdx);
  var xIdx = text.search(/\s+x\s*\d+\b/i);
  if (xIdx >= 0) text = text.substring(0, xIdx);
  text = text.replace(/\s+[€$£]\s*\d+(?:[.,]\d+)?(?:\s+[€$£]\s*\d+(?:[.,]\d+)?)?\s*$/, '');
  text = normalizeWhitespace_(text.replace(/[-,:;]+$/, ''));
  return text || original;
}

function itemDescriptionKey_(description) {
  return normalizeWhitespace_(description).toLowerCase();
}

function normalizeDriveFileId(v) {
  if (!v) return null;
  var s = String(v).trim();
  var m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s;
}

function getColIndex(header, name) {
  for (var i = 0; i < header.length; i++) {
    if (String(header[i] || '').trim().toLowerCase() === String(name).toLowerCase()) return i;
  }
  return -1;
}

function getMetaRowByBillId(metaSheet, billId) {
  var data = metaSheet.getDataRange().getValues();
  if (data.length < 2) return null;
  var header = data[0];
  var billIdCol = getColIndex(header, 'BillId');
  if (billIdCol < 0) return null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][billIdCol] || '').trim() === billId) {
      return { rowNum: i + 1, row: data[i], header: header };
    }
  }
  return null;
}

function uploadSortKey_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
  if (v == null || v === '') return 0;
  var d = new Date(v);
  if (!isNaN(d.getTime())) return d.getTime();
  return 0;
}

function formatUploadIso_(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  var s = String(v).trim();
  if (!s) return '';
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return s;
}

function listBills() {
  var ss = getSpreadsheet();
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  if (!metaSheet) throw new Error('BillMeta sheet not found');
  var data = metaSheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var header = data[0];
  var cBillId = getColIndex(header, 'BillId');
  var cDate = getColIndex(header, 'BillDate');
  var cVenue = getColIndex(header, 'VenueName');
  var cCreated = getColIndex(header, 'CreatedAt');
  if (cCreated < 0) cCreated = getColIndex(header, 'UploadedAt');
  if (cBillId < 0 || cDate < 0) throw new Error('BillMeta missing BillId or BillDate');

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var billId = String(data[i][cBillId] || '').trim();
    if (!billId) continue;
    var billDate = formatDate(data[i][cDate]);
    var venueName = cVenue >= 0 ? String(data[i][cVenue] || '') : '';
    var rawUpload = cCreated >= 0 ? data[i][cCreated] : '';
    rows.push({
      billId: billId,
      venueName: venueName,
      billDate: billDate,
      uploadDate: formatUploadIso_(rawUpload),
      _sort: uploadSortKey_(rawUpload)
    });
  }
  rows.sort(function (a, b) {
    return b._sort - a._sort;
  });
  var out = [];
  for (var j = 0; j < rows.length; j++) {
    out.push({
      billId: rows[j].billId,
      venueName: rows[j].venueName,
      billDate: rows[j].billDate,
      uploadDate: rows[j].uploadDate
    });
  }
  return out;
}

function deleteSheetRowsForBillId_(sheet, billId) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var h = data[0];
  var cBill = getColIndex(h, 'BillId');
  if (cBill < 0) return;
  for (var d = data.length - 1; d >= 1; d--) {
    if (String(data[d][cBill] || '').trim() === billId) {
      sheet.deleteRow(d + 1);
    }
  }
}

function deleteBillById(body) {
  var billId = String((body && body.billId) || '').trim();
  if (!billId) throw new Error('Missing billId');
  var ss = getSpreadsheet();
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  var claimsSheet = ss.getSheetByName(SHEETS.CLAIMS);
  if (!metaSheet || !billsSheet || !claimsSheet) throw new Error('Required sheet not found');

  var metaRow = getMetaRowByBillId(metaSheet, billId);
  if (!metaRow) throw new Error('Bill not found');
  var cImage = getColIndex(metaRow.header, 'BillImageId');
  var imageId = cImage >= 0 ? normalizeDriveFileId(metaRow.row[cImage]) : null;
  if (imageId) {
    try {
      DriveApp.getFileById(imageId).setTrashed(true);
    } catch (driveErr) {
      // File missing or no access — still remove sheet rows
    }
  }

  deleteSheetRowsForBillId_(claimsSheet, billId);
  deleteSheetRowsForBillId_(billsSheet, billId);

  var metaAgain = getMetaRowByBillId(metaSheet, billId);
  if (metaAgain) {
    metaSheet.deleteRow(metaAgain.rowNum);
  }
  return { ok: true };
}

function getBillById(billId) {
  if (!billId) throw new Error('Missing billId');
  var ss = getSpreadsheet();
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  if (!billsSheet || !metaSheet) throw new Error('Bills or BillMeta sheet not found');
  var metaRow = getMetaRowByBillId(metaSheet, billId);
  if (!metaRow) throw new Error('Bill not found');

  var hMeta = metaRow.header;
  var cDate = getColIndex(hMeta, 'BillDate');
  var cImage = getColIndex(hMeta, 'BillImageId');
  var cOpen = getColIndex(hMeta, 'Open');
  var cTotalPaid = getColIndex(hMeta, 'TotalPaid');
  var cVenueName = getColIndex(hMeta, 'VenueName');
  var billDate = formatDate(metaRow.row[cDate]);
  var imageId = normalizeDriveFileId(metaRow.row[cImage]);
  var openRaw = metaRow.row[cOpen];
  var open = openRaw === true || String(openRaw).toUpperCase() === 'TRUE';
  var totalPaid = parseFloat(metaRow.row[cTotalPaid]);
  if (isNaN(totalPaid)) totalPaid = null;
  var venueName = cVenueName >= 0 ? String(metaRow.row[cVenueName] || '') : '';

  var data = billsSheet.getDataRange().getValues();
  if (data.length < 2) return { billId: billId, billDate: billDate, venueName: venueName, items: [], metadata: { open: open, totalPaid: totalPaid, billImageId: imageId } };
  var h = data[0];
  var cBillId = getColIndex(h, 'BillId');
  var cRow = getColIndex(h, 'RowIndex');
  var cCat = getColIndex(h, 'Category');
  var cDesc = getColIndex(h, 'Description');
  var cQty = getColIndex(h, 'Quantity');
  var cUnit = getColIndex(h, 'UnitPrice');
  var cTotal = getColIndex(h, 'TotalPrice');

  var items = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cBillId] || '').trim() !== billId) continue;
    items.push({
      rowIndex: parseInt(data[i][cRow], 10) || 0,
      category: String(data[i][cCat] || ''),
      description: normalizeItemDescription_(String(data[i][cDesc] || '')),
      quantity: parseInt(data[i][cQty], 10) || 0,
      unit_price: parseFloat(data[i][cUnit]) || 0,
      total_price: parseFloat(data[i][cTotal]) || 0
    });
  }
  return { billId: billId, billDate: billDate, venueName: venueName, items: items, metadata: { open: open, totalPaid: totalPaid, billImageId: imageId } };
}

function getClaimsByBillId(billId) {
  if (!billId) throw new Error('Missing billId');
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CLAIMS);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var h = data[0];
  var cBillId = getColIndex(h, 'BillId');
  var cName = getColIndex(h, 'UserName');
  var cRow = getColIndex(h, 'RowIndex');
  var cUnit = getColIndex(h, 'UnitIndex');
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cBillId] || '').trim() !== billId) continue;
    out.push({
      billId: billId,
      userName: String(data[i][cName] || ''),
      rowIndex: parseInt(data[i][cRow], 10) || 0,
      unitIndex: parseInt(data[i][cUnit], 10) || 0
    });
  }
  return out;
}

function getBillImageById(billId) {
  var bill = getBillById(billId);
  var id = normalizeDriveFileId(bill.metadata.billImageId);
  if (!id) throw new Error('No bill image for this bill');
  var file = DriveApp.getFileById(id);
  var blob = file.getBlob();
  return { mimeType: blob.getContentType() || 'image/jpeg', base64: Utilities.base64Encode(blob.getBytes()) };
}

function sumBillTotal(items) {
  var s = 0;
  var arr = items || [];
  for (var i = 0; i < arr.length; i++) s += parseFloat(arr[i].total_price) || 0;
  return s;
}

function getBillSummaryById(billId) {
  var bill = getBillById(billId);
  var claims = getClaimsByBillId(billId);
  var claimMap = {};
  for (var c = 0; c < claims.length; c++) {
    claimMap[claims[c].rowIndex + '_' + claims[c].unitIndex] = claims[c].userName;
  }
  var billTotal = sumBillTotal(bill.items);
  var totalPaid = bill.metadata.totalPaid != null ? bill.metadata.totalPaid : billTotal;
  var tip = Math.max(0, (parseFloat(totalPaid) || 0) - billTotal);
  var tipPercent = billTotal > 0 ? (tip / billTotal) * 100 : 0;

  var byUserSlots = {};
  var byItem = [];
  for (var i = 0; i < bill.items.length; i++) {
    var it = bill.items[i];
    var claimed = 0;
    var itemClaimByUser = {};
    for (var u = 0; u < it.quantity; u++) {
      var key = it.rowIndex + '_' + u;
      var name = claimMap[key];
      if (!name) continue;
      claimed++;
      if (!itemClaimByUser[name]) itemClaimByUser[name] = 0;
      itemClaimByUser[name] += 1;
      if (!byUserSlots[name]) byUserSlots[name] = { subtotal: 0 };
      byUserSlots[name].subtotal += parseFloat(it.unit_price) || 0;
    }
    var claimsByUser = [];
    var itemUserNames = Object.keys(itemClaimByUser).sort();
    for (var iu = 0; iu < itemUserNames.length; iu++) {
      claimsByUser.push({ userName: itemUserNames[iu], count: itemClaimByUser[itemUserNames[iu]] });
    }
    var unclaimed = Math.max(0, (parseInt(it.quantity, 10) || 0) - claimed);
    byItem.push({
      description: it.description,
      category: it.category,
      quantity: it.quantity,
      claimed: claimed,
      unclaimed: unclaimed,
      unitPrice: parseFloat(it.unit_price) || 0,
      totalPrice: parseFloat(it.total_price) || 0,
      claimsByUser: claimsByUser
    });
  }

  var byUser = [];
  var names = Object.keys(byUserSlots).sort();
  for (var n = 0; n < names.length; n++) {
    var nm = names[n];
    var sub = byUserSlots[nm].subtotal;
    var tipShare = billTotal > 0 ? tip * (sub / billTotal) : 0;
    byUser.push({
      userName: nm,
      subtotal: sub,
      tipShare: tipShare,
      totalWithTip: sub + tipShare
    });
  }
  return { billId: billId, billTotal: billTotal, totalPaid: totalPaid, tipAmount: tip, tipPercent: tipPercent, byUser: byUser, byItem: byItem };
}

function getConfigNames() {
  var entries = getConfigEntries_();
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].key) out.push(entries[i].key);
  }
  return out;
}

function getProductIcons() {
  var entries = getConfigEntries_();
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var key = entries[i].key;
    if (!key) continue;
    var image = String(entries[i].value || '').trim();
    if (key.indexOf('productIconCategory:') === 0) {
      var cat = String(key.substring('productIconCategory:'.length) || '').trim().toLowerCase();
      if (!cat || !image) continue;
      out.push({ product: cat, image: image, kind: 'category' });
      continue;
    }
    if (key.indexOf('productIcon:') !== 0) continue;
    var product = String(key.substring('productIcon:'.length) || '').trim();
    if (!product || !image) continue;
    out.push({ product: product, image: image, kind: 'description' });
  }
  return out;
}

function getActiveBillModel() {
  return { modelId: getActiveBillModelFromConfig_() };
}

function getConfigEntries_() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var cKey = getColIndex(data[0], 'Key');
  var cValue = getColIndex(data[0], 'Value');
  if (cKey < 0 || cValue < 0) return [];
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][cKey] || '').trim();
    var value = String(data[i][cValue] || '').trim();
    if (!key) continue;
    out.push({ key: key, value: value });
  }
  return out;
}

function getActiveBillModelFromConfig_() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheet) return GEMINI_BILL_DEFAULT_MODEL;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return GEMINI_BILL_DEFAULT_MODEL;
  var header = data[0];
  var cKey = getColIndex(header, 'Key');
  var cValue = getColIndex(header, 'Value');
  if (cKey < 0 || cValue < 0) return GEMINI_BILL_DEFAULT_MODEL;

  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][cKey] || '').trim();
    if (key !== 'aiModelActive') continue;
    var model = String(data[i][cValue] || '').trim();
    if (model && GEMINI_BILL_ALLOWED_MODELS[model]) return model;
    return GEMINI_BILL_DEFAULT_MODEL;
  }
  return GEMINI_BILL_DEFAULT_MODEL;
}

function analyzeBillImage(body) {
  var base64 = body.base64;
  var mimeType = body.mimeType || 'image/jpeg';
  if (!base64) throw new Error('Missing image data');
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in script properties');
  var modelId = getActiveBillModelFromConfig_();

  var prompt =
    'Analyze this bill image and return ONLY JSON with this shape: {"venueName":"Name of the bar, restaurant or hostelry shown on the bill, or empty string if not visible","billDate":"YYYY-MM-DD","items":[{"category":"<slug>","description":"...","quantity":1,"unit_price":0,"total_price":0}]}.' +
    ' For each line item, category MUST be exactly one of these strings (pick the best fit; use subtypes whenever possible):' +
    ' drink.beer, drink.wine, drink.spirit, drink.cold_soft, drink.hot, drink.other,' +
    ' food.sandwich, food.wrap, food.burger, food.pizza, food.rice, food.curry, food.noodles, food.plate, food.salad, food.soup, food.fried_side, food.pastry, food.dessert, food.other,' +
    ' or a top-level bucket only if no subtype fits: food, drink, other.' +
    ' description must be product name only (no quantities, prices, multipliers, symbols, or totals). No markdown, no commentary, JSON only.';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent?key=' + encodeURIComponent(apiKey);
  var payload = {
    contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }]
  };
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Gemini API error: ' + response.getResponseCode());
  var json = JSON.parse(response.getContentText() || '{}');
  var text = (((json.candidates || [])[0] || {}).content || {}).parts;
  text = text && text[0] && text[0].text ? text[0].text : '';
  if (!text) throw new Error('No extraction result from Gemini');
  var parsed = parseGeminiBillJson(text);
  var jobId = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('splitifyUpload_' + jobId, JSON.stringify(parsed));
  return { jobId: jobId, billDate: parsed.billDate, venueName: parsed.venueName || '', billTotal: sumBillTotal(parsed.items), modelId: modelId };
}

function parseGeminiBillJson(text) {
  var cleaned = String(text).replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  var match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse model response');
  var parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed.items)) parsed.items = [];
  parsed.billDate = formatDate(parsed.billDate) || formatDate(new Date());
  return parsed;
}

function completeBillUpload(body) {
  var jobId = body.jobId;
  if (!jobId) throw new Error('Missing jobId');
  var stored = PropertiesService.getScriptProperties().getProperty('splitifyUpload_' + jobId);
  if (!stored) throw new Error('Analysis expired or invalid jobId');
  var analysis = JSON.parse(stored);

  var ss = getSpreadsheet();
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  if (!billsSheet || !metaSheet) throw new Error('Bills or BillMeta sheet not found');

  var billId = Utilities.getUuid();
  var imageId = '';
  if (body.base64) {
    var bytes = Utilities.base64Decode(body.base64);
    var blob = Utilities.newBlob(bytes, body.mimeType || 'image/jpeg', 'bill-' + billId + '.jpg');
    var folder = getOrCreateSubfolder_('Splitify', 'images');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    imageId = file.getId();
  }

  var items = analysis.items || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var qty = parseInt(it.quantity, 10) || 1;
    var unit = parseFloat(it.unit_price) || 0;
    var total = parseFloat(it.total_price);
    if (isNaN(total)) total = qty * unit;
    billsSheet.appendRow([
      billId,
      analysis.billDate,
      i,
      String(it.category || 'other'),
      normalizeItemDescription_(String(it.description || '')),
      qty,
      unit,
      total
    ]);
  }
  metaSheet.appendRow([billId, analysis.billDate, imageId, true, '', new Date().toISOString(), String(analysis.venueName || '')]);
  PropertiesService.getScriptProperties().deleteProperty('splitifyUpload_' + jobId);
  return { billId: billId, billDate: analysis.billDate, billTotal: sumBillTotal(items) };
}

function updateBillTotalPaid(body) {
  var billId = body.billId;
  var totalPaid = parseFloat(body.totalPaid);
  if (!billId) throw new Error('Missing billId');
  if (isNaN(totalPaid) || totalPaid < 0) throw new Error('Invalid totalPaid');
  var ss = getSpreadsheet();
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  if (!metaSheet) throw new Error('BillMeta sheet not found');
  var data = metaSheet.getDataRange().getValues();
  if (data.length < 2) throw new Error('Bill not found');
  var h = data[0];
  var cBillId = getColIndex(h, 'BillId');
  var cTotal = getColIndex(h, 'TotalPaid');
  if (cBillId < 0 || cTotal < 0) throw new Error('BillMeta missing BillId or TotalPaid');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cBillId] || '').trim() === billId) {
      metaSheet.getRange(i + 1, cTotal + 1).setValue(totalPaid);
      var bill = getBillById(billId);
      return {
        billId: billId,
        billTotal: sumBillTotal(bill.items),
        totalPaid: totalPaid
      };
    }
  }
  throw new Error('Bill not found');
}

function submitClaimsByBillId(body) {
  var billId = body.billId;
  var userName = String(body.userName || '').trim();
  var claims = Array.isArray(body.claims) ? body.claims : [];
  if (!billId) throw new Error('Missing billId');
  if (!userName) throw new Error('Missing userName');

  var ss = getSpreadsheet();
  var claimsSheet = ss.getSheetByName(SHEETS.CLAIMS);
  if (!claimsSheet) throw new Error('Claims sheet not found');

  // Serialize claim writes so concurrent users cannot both read a stale sheet,
  // resolve the same slot, and overwrite each other (last writer appeared to win).
  var lock = LockService.getScriptLock();
  var haveLock = false;
  try {
    lock.waitLock(30000);
    haveLock = true;

    // Build valid slots from bill items (fresh bill inside lock).
    var bill = getBillById(billId);
    var validSlots = {};
    var slotInfo = {};
    var groupSlots = {};
    for (var i = 0; i < bill.items.length; i++) {
      var itemDesc = normalizeItemDescription_(bill.items[i].description);
      var groupKey = itemDescriptionKey_(itemDesc || 'item');
      for (var u = 0; u < bill.items[i].quantity; u++) {
        var slotId = bill.items[i].rowIndex + '_' + u;
        validSlots[slotId] = true;
        slotInfo[slotId] = { description: itemDesc || 'item', groupKey: groupKey };
        if (!groupSlots[groupKey]) groupSlots[groupKey] = [];
        groupSlots[groupKey].push(slotId);
      }
    }
    for (var c = 0; c < claims.length; c++) {
      var key = claims[c].rowIndex + '_' + claims[c].unitIndex;
      if (!validSlots[key]) throw new Error('Invalid claim slot: ' + key);
    }

    var data = claimsSheet.getDataRange().getValues();
    var h = data[0];
    var cBillId = getColIndex(h, 'BillId');
    var cName = getColIndex(h, 'UserName');
    var cRow = getColIndex(h, 'RowIndex');
    var cUnit = getColIndex(h, 'UnitIndex');
    if (cBillId < 0 || cName < 0 || cRow < 0 || cUnit < 0) throw new Error('Claims sheet missing columns');

    var userLower = normalizeUserName(userName);
    var takenByOthers = {};
    var resolvedSlots = {};
    var resolvedClaims = [];
    for (var ri = 1; ri < data.length; ri++) {
      if (String(data[ri][cBillId] || '').trim() !== billId) continue;
      var rowName = normalizeUserName(data[ri][cName]);
      if (rowName === userLower) continue;
      takenByOthers[(parseInt(data[ri][cRow], 10) || 0) + '_' + (parseInt(data[ri][cUnit], 10) || 0)] = true;
    }
    for (var k = 0; k < claims.length; k++) {
      var requestedSlot = claims[k].rowIndex + '_' + claims[k].unitIndex;
      var requestedInfo = slotInfo[requestedSlot];
      var descriptionForError = requestedInfo && requestedInfo.description ? requestedInfo.description : 'item';
      var chosenSlot = requestedSlot;
      if (takenByOthers[chosenSlot] || resolvedSlots[chosenSlot]) {
        var candidates = requestedInfo && groupSlots[requestedInfo.groupKey] ? groupSlots[requestedInfo.groupKey] : [];
        chosenSlot = null;
        for (var cs = 0; cs < candidates.length; cs++) {
          var candidate = candidates[cs];
          if (takenByOthers[candidate]) continue;
          if (resolvedSlots[candidate]) continue;
          chosenSlot = candidate;
          break;
        }
        if (!chosenSlot) {
          throw new Error('Another person has claimed the ' + descriptionForError + '. Please refresh and try again.');
        }
      }
      resolvedSlots[chosenSlot] = true;
      var split = chosenSlot.split('_');
      resolvedClaims.push({
        rowIndex: parseInt(split[0], 10) || 0,
        unitIndex: parseInt(split[1], 10) || 0
      });
    }

    // Delete existing claims for this user + bill (indices from same snapshot as resolution).
    for (var d = data.length - 1; d >= 1; d--) {
      if (String(data[d][cBillId] || '').trim() === billId && normalizeUserName(data[d][cName]) === userLower) {
        claimsSheet.deleteRow(d + 1);
      }
    }
    for (var a = 0; a < resolvedClaims.length; a++) {
      claimsSheet.appendRow([billId, userName, parseInt(resolvedClaims[a].rowIndex, 10), parseInt(resolvedClaims[a].unitIndex, 10)]);
    }
    return { ok: true, claims: getClaimsByBillId(billId) };
  } finally {
    if (haveLock) lock.releaseLock();
  }
}

function getOrCreateSubfolder_(rootName, subName) {
  var rootIter = DriveApp.getFoldersByName(rootName);
  var root = rootIter.hasNext() ? rootIter.next() : DriveApp.getRootFolder().createFolder(rootName);
  var subIter = root.getFoldersByName(subName);
  return subIter.hasNext() ? subIter.next() : root.createFolder(subName);
}
