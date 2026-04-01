/**
 * Sheets Read – fast-read path: load data from published Google Sheet CSV.
 * api.js uses this by default for supported read actions.
 * Requires: SheetsConfig (sheets-config.js)
 */
var SheetsRead = (function () {

  // ---------------------------------------------------------------------------
  // CSV parser – handles BOM, quoted fields, embedded commas and newlines.
  // ---------------------------------------------------------------------------
  function parseCSV(text) {
    if (typeof text !== 'string') return [];
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    while (i < text.length) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') {
        if (text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = ''; i++; continue;
      }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += ch; i++;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  // ---------------------------------------------------------------------------
  // Fetch a sheet tab as a 2-D array (header row + data rows).
  // ---------------------------------------------------------------------------
  function fetchSheetRows(sheetName) {
    var url = SheetsConfig.getSheetUrl(sheetName);
    if (!url) return Promise.reject(new Error('Sheet URL not configured for: ' + sheetName));
    return fetch(url, { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.text(); })
      .then(parseCSV);
  }

  // ---------------------------------------------------------------------------
  // Column helpers
  // ---------------------------------------------------------------------------
  function colIndex(headers, name) {
    var lc = name.toLowerCase();
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toLowerCase() === lc) return i;
    }
    return -1;
  }

  function rowVal(row, idx) {
    return idx >= 0 && idx < row.length ? String(row[idx] || '').trim() : '';
  }

  function rowFloat(row, idx) {
    var v = parseFloat(rowVal(row, idx));
    return isNaN(v) ? 0 : v;
  }

  function rowInt(row, idx) {
    var v = parseInt(rowVal(row, idx), 10);
    return isNaN(v) ? 0 : v;
  }

  function formatDate(v) {
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function normalizeDriveFileId(v) {
    if (!v) return null;
    var m = v.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : v;
  }

  // ---------------------------------------------------------------------------
  // Config sheet helpers (shared by configNames / getProductIcons / getActiveBillModel)
  // ---------------------------------------------------------------------------
  var GEMINI_BILL_DEFAULT_MODEL = 'gemini-3-flash-preview';
  var GEMINI_BILL_ALLOWED_MODELS = {
    'gemini-2.5-flash': true,
    'gemini-2.5-flash-lite': true,
    'gemini-3-flash-preview': true,
    'gemini-3.1-flash-lite-preview': true,
    'gemma-3-27b-it': true
  };

  function fetchConfigEntries() {
    return fetchSheetRows('Config').then(function (rows) {
      if (rows.length < 2) return [];
      var headers = rows[0];
      var cKey = colIndex(headers, 'Key');
      var cValue = colIndex(headers, 'Value');
      if (cKey < 0 || cValue < 0) return [];
      var out = [];
      for (var i = 1; i < rows.length; i++) {
        var key = rowVal(rows[i], cKey);
        var value = rowVal(rows[i], cValue);
        if (!key) continue;
        out.push({ key: key, value: value });
      }
      return out;
    });
  }

  // ---------------------------------------------------------------------------
  // Action implementations
  // ---------------------------------------------------------------------------

  function getConfigNames() {
    return fetchConfigEntries().then(function (entries) {
      return entries.map(function (e) { return e.key; });
    });
  }

  function getProductIcons() {
    return fetchConfigEntries().then(function (entries) {
      var out = [];
      for (var i = 0; i < entries.length; i++) {
        var key = entries[i].key;
        if (key.indexOf('productIcon:') !== 0) continue;
        var product = key.substring('productIcon:'.length).trim();
        var image = entries[i].value.trim();
        if (!product || !image) continue;
        out.push({ product: product, image: image });
      }
      return out;
    });
  }

  function getQuips() {
    return fetchConfigEntries().then(function (entries) {
      var out = [];
      for (var i = 0; i < entries.length; i++) {
        var lk = entries[i].key.toLowerCase();
        if ((lk === 'quip' || lk === 'quips') && entries[i].value) out.push(entries[i].value);
      }
      return out;
    });
  }

  function getActiveBillModel() {
    return fetchConfigEntries().then(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].key !== 'aiModelActive') continue;
        var model = entries[i].value.trim();
        if (model && GEMINI_BILL_ALLOWED_MODELS[model]) return { modelId: model };
        return { modelId: GEMINI_BILL_DEFAULT_MODEL };
      }
      return { modelId: GEMINI_BILL_DEFAULT_MODEL };
    });
  }

  function getBillById(billId) {
    return Promise.all([
      fetchSheetRows('Bills'),
      fetchSheetRows('BillMeta')
    ]).then(function (results) {
      var billRows = results[0];
      var metaRows = results[1];

      // Parse BillMeta
      if (metaRows.length < 2) throw new Error('Bill not found');
      var mh = metaRows[0];
      var mcBillId   = colIndex(mh, 'BillId');
      var mcDate     = colIndex(mh, 'BillDate');
      var mcImage    = colIndex(mh, 'BillImageId');
      var mcOpen     = colIndex(mh, 'Open');
      var mcPaid     = colIndex(mh, 'TotalPaid');
      var mcVenueName = colIndex(mh, 'VenueName');
      var metaRow = null;
      for (var m = 1; m < metaRows.length; m++) {
        if (rowVal(metaRows[m], mcBillId) === billId) { metaRow = metaRows[m]; break; }
      }
      if (!metaRow) throw new Error('Bill not found');

      var billDate  = formatDate(rowVal(metaRow, mcDate));
      var imageId   = normalizeDriveFileId(rowVal(metaRow, mcImage));
      var openRaw   = rowVal(metaRow, mcOpen);
      var open      = openRaw.toUpperCase() === 'TRUE';
      var paidStr   = rowVal(metaRow, mcPaid);
      var totalPaid = paidStr !== '' ? parseFloat(paidStr) : null;
      if (isNaN(totalPaid)) totalPaid = null;
      var venueName = mcVenueName >= 0 ? rowVal(metaRow, mcVenueName) : '';

      // Parse Bills
      var items = [];
      if (billRows.length >= 2) {
        var bh = billRows[0];
        var bcBillId = colIndex(bh, 'BillId');
        var bcRow    = colIndex(bh, 'RowIndex');
        var bcCat    = colIndex(bh, 'Category');
        var bcDesc   = colIndex(bh, 'Description');
        var bcQty    = colIndex(bh, 'Quantity');
        var bcUnit   = colIndex(bh, 'UnitPrice');
        var bcTotal  = colIndex(bh, 'TotalPrice');
        for (var b = 1; b < billRows.length; b++) {
          if (rowVal(billRows[b], bcBillId) !== billId) continue;
          items.push({
            rowIndex:    rowInt(billRows[b], bcRow),
            category:    rowVal(billRows[b], bcCat),
            description: rowVal(billRows[b], bcDesc),
            quantity:    rowInt(billRows[b], bcQty),
            unit_price:  rowFloat(billRows[b], bcUnit),
            total_price: rowFloat(billRows[b], bcTotal)
          });
        }
      }

      return {
        billId: billId,
        billDate: billDate,
        venueName: venueName,
        items: items,
        metadata: { open: open, totalPaid: totalPaid, billImageId: imageId }
      };
    });
  }

  function getClaimsByBillId(billId) {
    return fetchSheetRows('Claims').then(function (rows) {
      if (rows.length < 2) return [];
      var h = rows[0];
      var cBillId = colIndex(h, 'BillId');
      var cName   = colIndex(h, 'UserName');
      var cRow    = colIndex(h, 'RowIndex');
      var cUnit   = colIndex(h, 'UnitIndex');
      var out = [];
      for (var i = 1; i < rows.length; i++) {
        if (rowVal(rows[i], cBillId) !== billId) continue;
        out.push({
          billId:    billId,
          userName:  rowVal(rows[i], cName),
          rowIndex:  rowInt(rows[i], cRow),
          unitIndex: rowInt(rows[i], cUnit)
        });
      }
      return out;
    });
  }

  function getBillSummaryById(billId) {
    return Promise.all([
      getBillById(billId),
      getClaimsByBillId(billId)
    ]).then(function (results) {
      var bill   = results[0];
      var claims = results[1];

      var claimMap = {};
      for (var c = 0; c < claims.length; c++) {
        claimMap[claims[c].rowIndex + '_' + claims[c].unitIndex] = claims[c].userName;
      }

      var billTotal = 0;
      for (var x = 0; x < bill.items.length; x++) billTotal += bill.items[x].total_price || 0;

      var totalPaid   = bill.metadata.totalPaid != null ? bill.metadata.totalPaid : billTotal;
      var tip         = Math.max(0, totalPaid - billTotal);
      var tipPercent  = billTotal > 0 ? (tip / billTotal) * 100 : 0;

      var byUserSlots = {};
      var byItem      = [];

      for (var i = 0; i < bill.items.length; i++) {
        var it = bill.items[i];
        var claimed = 0;
        var itemClaimByUser = {};
        for (var u = 0; u < it.quantity; u++) {
          var key  = it.rowIndex + '_' + u;
          var name = claimMap[key];
          if (!name) continue;
          claimed++;
          itemClaimByUser[name] = (itemClaimByUser[name] || 0) + 1;
          if (!byUserSlots[name]) byUserSlots[name] = { subtotal: 0 };
          byUserSlots[name].subtotal += it.unit_price || 0;
        }
        var claimsByUser   = [];
        var itemUserNames  = Object.keys(itemClaimByUser).sort();
        for (var iu = 0; iu < itemUserNames.length; iu++) {
          claimsByUser.push({ userName: itemUserNames[iu], count: itemClaimByUser[itemUserNames[iu]] });
        }
        byItem.push({
          description: it.description,
          category:    it.category,
          quantity:    it.quantity,
          claimed:     claimed,
          unclaimed:   Math.max(0, it.quantity - claimed),
          unitPrice:   it.unit_price || 0,
          totalPrice:  it.total_price || 0,
          claimsByUser: claimsByUser
        });
      }

      var byUser = [];
      var names  = Object.keys(byUserSlots).sort();
      for (var n = 0; n < names.length; n++) {
        var nm       = names[n];
        var sub      = byUserSlots[nm].subtotal;
        var tipShare = billTotal > 0 ? tip * (sub / billTotal) : 0;
        byUser.push({
          userName:     nm,
          subtotal:     sub,
          tipShare:     tipShare,
          totalWithTip: sub + tipShare
        });
      }

      return {
        billId:     billId,
        billTotal:  billTotal,
        totalPaid:  totalPaid,
        tipAmount:  tip,
        tipPercent: tipPercent,
        byUser:     byUser,
        byItem:     byItem
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------
  var READ_ACTIONS = {
    getBillById:        true,
    getClaimsByBillId:  true,
    getBillSummaryById: true,
    configNames:        true,
    getProductIcons:    true,
    getActiveBillModel: true,
    getQuips:           true
  };

  function isReadAction(action) {
    return READ_ACTIONS[action] === true;
  }

  function getReadResponse(params) {
    var action = params.action;
    if (action === 'getBillById')        return getBillById(params.billId);
    if (action === 'getClaimsByBillId')  return getClaimsByBillId(params.billId);
    if (action === 'getBillSummaryById') return getBillSummaryById(params.billId);
    if (action === 'configNames')        return getConfigNames();
    if (action === 'getProductIcons')    return getProductIcons();
    if (action === 'getActiveBillModel') return getActiveBillModel();
    if (action === 'getQuips')           return getQuips();
    return Promise.reject(new Error('Unknown fast-read action: ' + action));
  }

  return {
    isReadAction:    isReadAction,
    getReadResponse: getReadResponse
  };
})();
