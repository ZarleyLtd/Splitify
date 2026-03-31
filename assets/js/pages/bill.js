(function (global) {
  var rootEl;
  var state = {
    billId: null,
    tab: 'claim',
    bill: null,
    claims: [],
    userName: '',
    claimMap: {},
    mySelection: [],
    summaryView: 'byItem',
    billImageDataUrl: null,
    productIcons: []
  };

  function init(el) {
    rootEl = el;
    var params = new URLSearchParams(window.location.search || '');
    state.billId = params.get('billId');
    if (!state.billId) {
      rootEl.innerHTML = '<main class="panel"><h1>Splitify</h1><p class="status status--error">Missing billId in URL.</p></main>';
      return;
    }
    renderShell();
    loadData();
  }

  function renderShell() {
    rootEl.innerHTML =
      '<div class="smoke-bg"></div>' +
      '<main class="panel panel--wide">' +
      '<h1>Splitify</h1>' +
      '<p class="muted">Bill ID: ' + escapeHtml(state.billId) + '</p>' +
      '<div class="tabs">' +
      '<button id="tab-claim" class="tab tab--active">Claim</button>' +
      '<button id="tab-summary" class="tab">Summary</button>' +
      '</div>' +
      '<div id="tab-content"></div>' +
      '</main>';
    document.getElementById('tab-claim').addEventListener('click', function () { setTab('claim'); });
    document.getElementById('tab-summary').addEventListener('click', function () { setTab('summary'); });
    renderTab();
  }

  function setTab(tab) {
    state.tab = tab;
    document.getElementById('tab-claim').classList.toggle('tab--active', tab === 'claim');
    document.getElementById('tab-summary').classList.toggle('tab--active', tab === 'summary');
    renderTab();
  }

  function loadData() {
    Promise.all([
      SplitifyAPI.getBillById(state.billId),
      SplitifyAPI.getClaimsByBillId(state.billId),
      SplitifyAPI.getProductIcons().catch(function () { return []; })
    ]).then(function (results) {
      state.bill = results[0];
      state.claims = results[1] || [];
      state.productIcons = results[2] || [];
      state.claimMap = SplitifyClaimsState.buildClaimMap(state.claims);
      state.mySelection = SplitifyClaimsState.getMySelectionFromClaims(state.claims, state.userName);
      renderTab();
    }).catch(function (err) {
      var mount = document.getElementById('tab-content');
      mount.innerHTML = '<p class="status status--error">' + escapeHtml(err.message || String(err)) + '</p>';
    });
  }

  function renderTab() {
    var mount = document.getElementById('tab-content');
    if (!mount) return;
    if (!state.bill) {
      mount.innerHTML = '<p class="status">Loading bill...</p>';
      return;
    }
    if (state.tab === 'summary') return renderSummaryTab(mount);
    return renderClaimTab(mount);
  }

  function renderClaimTab(mount) {
    mount.innerHTML =
      '<div class="bill-tools"><button id="open-bill-image-claim" class="icon-btn" type="button" title="Open bill image" aria-label="Open bill image">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14"></path><path d="M3 16l5-5 4 4 3-3 6 6"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg>' +
      '</button></div>' +
      '<div id="name-mount"></div>' +
      '<div id="bill-items"></div>' +
      '<div id="claim-selection-summary" class="card claim-selection-summary"></div>' +
      '<p id="claim-status" class="status"></p>' +
      '<button id="submit-claims-btn" class="btn">Submit My Claims</button>';
    document.getElementById('open-bill-image-claim').addEventListener('click', openBillImageLightbox);
    SplitifyNameCombobox.mount(document.getElementById('name-mount'), {
      initialValue: state.userName,
      onSelect: function (name) {
        state.userName = resolveExistingUserName(name);
        state.mySelection = SplitifyClaimsState.getMySelectionFromClaims(state.claims, state.userName);
        renderClaimSelectionSummary();
      }
    });

    var groups = buildConsolidated(state.bill.items || []);
    var list = document.getElementById('bill-items');
    list.innerHTML = '';
    for (var i = 0; i < groups.length; i++) {
      list.appendChild(SplitifyProductRow.render({
        category: groups[i].category,
        description: groups[i].description,
        slots: groups[i].slots,
        productIcons: state.productIcons,
        claimMap: state.claimMap,
        currentUser: state.userName,
        onSlotClick: onSlotClick
      }));
    }
    renderClaimSelectionSummary();
    document.getElementById('submit-claims-btn').addEventListener('click', submitClaims);
  }

  function onSlotClick(rowIndex, unitIndex) {
    if (!state.userName) {
      var s = document.getElementById('claim-status');
      s.textContent = 'Enter your name first.';
      s.className = 'status status--error';
      return;
    }
    var st = SplitifyClaimsState.getSlotState(state.claimMap, state.userName, rowIndex, unitIndex);
    var idx = state.mySelection.findIndex(function (s) { return s.rowIndex === rowIndex && s.unitIndex === unitIndex; });
    if (st === 'claimed-by-other') return;
    if (st === 'claimed-by-me' || idx >= 0) {
      state.mySelection = state.mySelection.filter(function (s) { return !(s.rowIndex === rowIndex && s.unitIndex === unitIndex); });
    } else {
      state.mySelection.push({ rowIndex: rowIndex, unitIndex: unitIndex });
    }
    // optimistic remap for UI
    var claimMap = SplitifyClaimsState.buildClaimMap(state.claims);
    for (var i = 0; i < state.mySelection.length; i++) {
      claimMap[SplitifyClaimsState.slotKey(state.mySelection[i].rowIndex, state.mySelection[i].unitIndex)] = state.userName;
    }
    state.claimMap = claimMap;
    renderTab();
  }

  function renderClaimSelectionSummary() {
    var el = document.getElementById('claim-selection-summary');
    if (!el || !state.bill) return;

    var itemsByRow = {};
    var billItems = state.bill.items || [];
    for (var i = 0; i < billItems.length; i++) {
      itemsByRow[billItems[i].rowIndex] = billItems[i];
    }

    var subtotal = 0;
    var byDescription = {};
    for (var s = 0; s < state.mySelection.length; s++) {
      var slot = state.mySelection[s];
      var item = itemsByRow[slot.rowIndex];
      if (!item) continue;
      subtotal += parseFloat(item.unit_price) || 0;
      var key = item.description || 'Item';
      byDescription[key] = (byDescription[key] || 0) + 1;
    }

    var billTotal = 0;
    for (var b = 0; b < billItems.length; b++) {
      billTotal += parseFloat(billItems[b].total_price) || 0;
    }
    var totalPaid = state.bill.metadata && state.bill.metadata.totalPaid != null ? (parseFloat(state.bill.metadata.totalPaid) || 0) : billTotal;
    var tipAmount = Math.max(0, totalPaid - billTotal);
    var tipShare = billTotal > 0 ? tipAmount * (subtotal / billTotal) : 0;
    var totalWithTip = subtotal + tipShare;

    var names = Object.keys(byDescription).sort();
    var listHtml = '';
    if (!names.length) {
      listHtml = '<div class="summary-subline">No items selected yet.</div>';
    } else {
      for (var n = 0; n < names.length; n++) {
        listHtml += '<div class="summary-subline">' + escapeHtml(names[n]) + ' (' + byDescription[names[n]] + ')</div>';
      }
    }

    el.innerHTML =
      '<h3>Selection So Far</h3>' +
      listHtml +
      '<ul class="summary-list">' +
      '<li><span>Items subtotal</span><strong>EUR ' + SplitifyFormatters.formatMoney(subtotal) + '</strong></li>' +
      '<li><span>Tip share</span><strong>EUR ' + SplitifyFormatters.formatMoney(tipShare) + '</strong></li>' +
      '<li><span>Total with tip</span><strong>EUR ' + SplitifyFormatters.formatMoney(totalWithTip) + '</strong></li>' +
      '</ul>';
  }

  function submitClaims() {
    if (!state.userName) {
      return updateClaimStatus('Enter your name first.', true);
    }
    SplitifyAPI.submitClaimsByBillId({
      billId: state.billId,
      userName: state.userName,
      claims: state.mySelection
    }).then(function (res) {
      state.claims = res.claims || [];
      state.claimMap = SplitifyClaimsState.buildClaimMap(state.claims);
      updateClaimStatus('Claims saved.');
      setTab('summary');
    }).catch(function (err) {
      updateClaimStatus(err.message || String(err), true);
    });
  }

  function updateClaimStatus(text, isErr) {
    var el = document.getElementById('claim-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'status' + (isErr ? ' status--error' : '');
  }

  function renderSummaryTab(mount) {
    mount.innerHTML = '<div class="bill-tools">' +
      '<button id="summary-view-toggle" class="btn btn--secondary" type="button">View: ' + (state.summaryView === 'byUser' ? 'By User' : 'By Item') + '</button>' +
      '<button id="open-bill-image-summary" class="icon-btn" type="button" title="Open bill image" aria-label="Open bill image">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14"></path><path d="M3 16l5-5 4 4 3-3 6 6"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg>' +
      '</button></div><div id="summary-mount" class="summary-grid"></div>';
    document.getElementById('summary-view-toggle').addEventListener('click', function () {
      state.summaryView = state.summaryView === 'byUser' ? 'byItem' : 'byUser';
      renderSummaryTab(mount);
    });
    document.getElementById('open-bill-image-summary').addEventListener('click', openBillImageLightbox);
    SplitifyAPI.getBillSummaryById(state.billId).then(function (summary) {
      SplitifySummary.render(document.getElementById('summary-mount'), summary, { viewMode: state.summaryView });
    }).catch(function (err) {
      mount.innerHTML = '<p class="status status--error">' + escapeHtml(err.message || String(err)) + '</p>';
    });
  }

  function openBillImageLightbox() {
    if (!state.billId || typeof SplitifyAPI === 'undefined' || !SplitifyAPI.getBillImageById) return;
    var overlay = document.createElement('div');
    overlay.className = 'claims-bill-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Original bill image');
    overlay.innerHTML = '<div class="claims-bill-lightbox__content"><button type="button" class="claims-bill-lightbox__close" aria-label="Close">×</button><div class="claims-bill-lightbox__loading">Loading...</div></div>';
    document.body.appendChild(overlay);

    function closeLightbox() {
      overlay.removeEventListener('click', onOverlayClick);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onOverlayClick(e) {
      if (e.target === overlay) closeLightbox();
    }

    overlay.querySelector('.claims-bill-lightbox__close').addEventListener('click', closeLightbox);
    overlay.addEventListener('click', onOverlayClick);

    function showImage(dataUrl) {
      var loadingEl = overlay.querySelector('.claims-bill-lightbox__loading');
      if (!loadingEl || !overlay.parentNode) return;
      var img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Bill image';
      img.className = 'claims-bill-lightbox__img';
      loadingEl.parentNode.replaceChild(img, loadingEl);
    }

    if (state.billImageDataUrl) {
      showImage(state.billImageDataUrl);
      return;
    }
    SplitifyAPI.getBillImageById(state.billId).then(function (data) {
      var mimeType = data && data.mimeType ? data.mimeType : 'image/jpeg';
      var base64 = data && data.base64 ? data.base64 : '';
      if (!base64) throw new Error('No bill image found');
      state.billImageDataUrl = 'data:' + mimeType + ';base64,' + base64;
      showImage(state.billImageDataUrl);
    }).catch(function (err) {
      var loadingEl = overlay.querySelector('.claims-bill-lightbox__loading');
      if (loadingEl) loadingEl.textContent = 'Failed to load image: ' + (err.message || err);
    });
  }

  function buildConsolidated(items) {
    var map = {};
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var key = (it.category || '') + '|' + (it.description || '');
      if (!map[key]) {
        map[key] = { category: it.category || '', description: it.description || 'Item', slots: [] };
        out.push(map[key]);
      }
      var qty = parseInt(it.quantity, 10) || 0;
      for (var u = 0; u < qty; u++) {
        map[key].slots.push({ rowIndex: it.rowIndex, unitIndex: u });
      }
    }
    return out;
  }

  function resolveExistingUserName(typedName) {
    var clean = String(typedName || '').trim();
    if (!clean) return '';
    var target = SplitifyClaimsState.normalizeName(clean);
    for (var i = 0; i < state.claims.length; i++) {
      var existing = String(state.claims[i].userName || '').trim();
      if (!existing) continue;
      if (SplitifyClaimsState.normalizeName(existing) === target) {
        return existing;
      }
    }
    return clean;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.SplitifyBillPage = { init: init };
})(typeof window !== 'undefined' ? window : this);
