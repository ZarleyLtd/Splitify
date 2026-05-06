(function (global) {
  /**
   * Request display mode (second arg on most SplitifyAPI methods):
   * - foreground (default): full-screen working indicator; blocks interaction while pending.
   * - quiet: no indicator; user can keep using the page (background saves, silent refresh, etc.).
   * Alias: mode "background" is treated like "quiet".
   */
  var MODE = { FOREGROUND: "foreground", QUIET: "quiet", BACKGROUND: "background" };

  function isQuietMode(options) {
    var m = options && options.mode;
    return m === MODE.QUIET || m === MODE.BACKGROUND;
  }

  function requestStart(action) {
    if (global.SplitifyWorking && global.SplitifyWorking.begin) {
      global.SplitifyWorking.begin("Working: " + action + "...");
    }
  }

  function requestEnd() {
    if (global.SplitifyWorking && global.SplitifyWorking.end) {
      global.SplitifyWorking.end();
    }
  }

  function getApiUrl() {
    var url = global.SPLITIFY_CONFIG && global.SPLITIFY_CONFIG.API_URL;
    if (!url || url.indexOf("PASTE_YOUR_SUPABASE_SPLITIFY_API_URL_HERE") >= 0) {
      throw new Error("API_URL is not configured in assets/js/config/sheets-config.js");
    }
    return url.replace(/\/$/, "");
  }

  function toQuery(params) {
    var keys = Object.keys(params || {});
    if (!keys.length) return "";
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (params[k] === undefined || params[k] === null) continue;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
    }
    return parts.length ? "?" + parts.join("&") : "";
  }

  function requestGet(action, params, options) {
    var quiet = isQuietMode(options);
    var url = getApiUrl() + toQuery(Object.assign({}, params || {}, { action: action }));
    if (!quiet) requestStart(action);
    return fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(unwrap)
      .then(function (data) {
        if (!quiet) requestEnd();
        return data;
      }, function (err) {
        if (!quiet) requestEnd();
        throw err;
      });
  }

  function requestGetDirect(action, params, options) {
    var showWorking = options && options.mode === MODE.FOREGROUND;
    var url = getApiUrl() + toQuery(Object.assign({}, params || {}, { action: action }));
    if (showWorking) requestStart(action);
    return fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(unwrap)
      .then(function (data) {
        if (showWorking) requestEnd();
        return data;
      }, function (err) {
        if (showWorking) requestEnd();
        throw err;
      });
  }

  function requestPost(action, body, options) {
    var quiet = isQuietMode(options);
    var payload = Object.assign({}, body || {}, { action: action });
    if (!quiet) requestStart(action);
    return fetch(getApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json();
      })
      .then(unwrap)
      .then(function (data) {
        if (!quiet) requestEnd();
        return data;
      }, function (err) {
        if (!quiet) requestEnd();
        throw err;
      });
  }

  function unwrap(res) {
    if (!res) throw new Error("Empty response");
    if (res.error) throw new Error(res.error);
    return res.data;
  }

  global.SplitifyAPI = {
    MODE: MODE,
    analyzeBillImage: function (payload, options) {
      return requestPost("analyzeBillImage", payload, options);
    },
    completeBillUpload: function (payload, options) {
      return requestPost("completeBillUpload", payload, options);
    },
    updateBillTotalPaid: function (payload, options) {
      return requestPost("updateBillTotalPaid", payload, options);
    },
    getBillById: function (billId, options) {
      return requestGet("getBillById", { billId: billId }, options);
    },
    getClaimsByBillId: function (billId, options) {
      return requestGet("getClaimsByBillId", { billId: billId }, options);
    },
    getBillImageById: function (billId, options) {
      return requestGet("getBillImageById", { billId: billId }, options);
    },
    getBillSummaryById: function (billId, options) {
      return requestGet("getBillSummaryById", { billId: billId }, options);
    },
    submitClaimsByBillId: function (payload, options) {
      return requestPost("submitClaimsByBillId", payload, options);
    },
    listBills: function (options) {
      return requestGet("listBills", {}, options);
    },
    deleteBillById: function (payload, options) {
      return requestPost("deleteBillById", payload, options);
    },
    getConfigNames: function (options) {
      return requestGet("configNames", {}, options);
    },
    getProductIcons: function (options) {
      return requestGet("getProductIcons", {}, options);
    },
    getActiveBillModel: function (options) {
      return requestGet("getActiveBillModel", {}, options);
    },
    setActiveBillModel: function (payload, options) {
      return requestPost("setActiveBillModel", payload, options);
    },
    getQuips: function (options) {
      return requestGet("getQuips", {}, options);
    },
    getClaimsByBillIdDirect: function (billId, options) {
      return requestGetDirect("getClaimsByBillId", { billId: billId }, options);
    },
    getBillSummaryByIdDirect: function (billId, options) {
      return requestGetDirect("getBillSummaryById", { billId: billId }, options);
    }
  };
})(typeof window !== "undefined" ? window : this);
