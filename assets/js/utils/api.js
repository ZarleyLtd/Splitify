(function (global) {
  function requestStart(action) {
    if (global.SplitifyWorking && global.SplitifyWorking.begin) {
      global.SplitifyWorking.begin('Working: ' + action + '...');
    }
  }

  function requestEnd() {
    if (global.SplitifyWorking && global.SplitifyWorking.end) {
      global.SplitifyWorking.end();
    }
  }

  function getApiUrl() {
    var url = global.SPLITIFY_CONFIG && global.SPLITIFY_CONFIG.API_URL;
    if (!url || url.indexOf('PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') >= 0) {
      throw new Error('API_URL is not configured in assets/js/config/sheets-config.js');
    }
    return url;
  }

  function toQuery(params) {
    var keys = Object.keys(params || {});
    if (!keys.length) return '';
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (params[k] === undefined || params[k] === null) continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
    }
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  function requestGet(action, params) {
    if (typeof SheetsRead !== 'undefined' && SheetsRead.isReadAction(action)) {
      requestStart(action);
      return SheetsRead.getReadResponse(Object.assign({}, params || {}, { action: action }))
        .then(function (data) { requestEnd(); return data; },
              function (err)  { requestEnd(); throw err; });
    }
    var url = getApiUrl() + toQuery(Object.assign({}, params || {}, { action: action }));
    requestStart(action);
    return fetch(url).then(function (r) { return r.json(); }).then(unwrap).then(function (data) {
      requestEnd();
      return data;
    }, function (err) {
      requestEnd();
      throw err;
    });
  }

  // Always hits the Apps Script API directly — used for silent background refreshes
  // where freshness matters and the published-CSV cache lag is unacceptable.
  function requestGetDirect(action, params) {
    var url = getApiUrl() + toQuery(Object.assign({}, params || {}, { action: action }));
    return fetch(url).then(function (r) { return r.json(); }).then(unwrap);
  }

  function requestPost(action, body) {
    var payload = Object.assign({}, body || {}, { action: action });
    requestStart(action);
    return fetch(getApiUrl(), {
      method: 'POST',
      // Use a simple content type to avoid CORS preflight with Apps Script web apps.
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(unwrap).then(function (data) {
      requestEnd();
      return data;
    }, function (err) {
      requestEnd();
      throw err;
    });
  }

  function unwrap(res) {
    if (!res) throw new Error('Empty response');
    if (res.error) throw new Error(res.error);
    return res.data;
  }

  global.SplitifyAPI = {
    analyzeBillImage: function (payload) { return requestPost('analyzeBillImage', payload); },
    completeBillUpload: function (payload) { return requestPost('completeBillUpload', payload); },
    updateBillTotalPaid: function (payload) { return requestPost('updateBillTotalPaid', payload); },
    getBillById: function (billId) { return requestGet('getBillById', { billId: billId }); },
    getClaimsByBillId: function (billId) { return requestGet('getClaimsByBillId', { billId: billId }); },
    getBillImageById: function (billId) { return requestGet('getBillImageById', { billId: billId }); },
    getBillSummaryById: function (billId) { return requestGet('getBillSummaryById', { billId: billId }); },
    submitClaimsByBillId: function (payload) { return requestPost('submitClaimsByBillId', payload); },
    getConfigNames: function () { return requestGet('configNames', {}); },
    getProductIcons: function () { return requestGet('getProductIcons', {}); },
    getActiveBillModel: function () { return requestGet('getActiveBillModel', {}); },
    getQuips: function () { return requestGet('getQuips', {}); },
    getClaimsByBillIdDirect: function (billId) { return requestGetDirect('getClaimsByBillId', { billId: billId }); },
    getBillSummaryByIdDirect: function (billId) { return requestGetDirect('getBillSummaryById', { billId: billId }); }
  };
})(typeof window !== 'undefined' ? window : this);
