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
    summaryCache: null,
    billImageDataUrl: null,
    productIcons: [],
    claimsLoaded: false,
    mySelectionOriginal: [],
    /** Per consolidated group key `g0`…: slot order (matches theConfessional: sort by state once, then stable). */
    consolidatedRowOrder: {},
    /** Per consolidated group key `g0`…: portion-claim mode (header pie toggle). */
    portionClaimModeByGroup: {}
  };

  var SLOT_STATE_ORDER = {
    'claimed-by-me': 0,
    'shared-by-me': 1,
    'available': 2,
    'shared-by-other': 3,
    'claimed-by-other': 4
  };

  function getOrderedSlotsForGroup(group, groupIndex) {
    var rowKey = 'g' + groupIndex;
    var slots = group.slots || [];
    if (state.consolidatedRowOrder[rowKey] && state.consolidatedRowOrder[rowKey].length === slots.length) {
      return state.consolidatedRowOrder[rowKey];
    }
    var withState = slots.map(function (s) {
      return {
        rowIndex: s.rowIndex,
        unitIndex: s.unitIndex,
        state: SplitifyClaimsState.getSlotState(state.claimMap, state.userName, s.rowIndex, s.unitIndex)
      };
    });
    withState.sort(function (a, b) {
      return SLOT_STATE_ORDER[a.state] - SLOT_STATE_ORDER[b.state];
    });
    var ordered = withState.map(function (x) {
      return { rowIndex: x.rowIndex, unitIndex: x.unitIndex };
    });
    state.consolidatedRowOrder[rowKey] = ordered;
    return ordered;
  }

  function init(el) {
    rootEl = el;
    var params = new URLSearchParams(window.location.search || '');
    state.billId = params.get('billId');
    if (!state.billId) {
      rootEl.innerHTML =
        '<main class="panel"><h1>Splitify</h1><p class="status status--error">Missing billId in URL.</p></main>' +
        '<p id="bill-caption" class="bill-cartoon-caption"></p>';
      SplitifyQuips.applyRandomQuip('bill-caption');
      return;
    }
    renderShell();
    prefetchBillImage();
    prefetchBillMeta();
  }

  function prefetchBillMeta() {
    if (!state.billId) return;
    SplitifyAPI.getBillById(state.billId)
      .then(function (bill) {
        state.bill = bill;
        updateBillMetaHeader(bill.venueName, bill.billDate);
      })
      .catch(function () {
        updateBillMetaHeader('', null);
      });
  }

  function updateBillMetaHeader(venueName, billDate) {
    var venueEl = document.getElementById('bill-venue-name');
    var dateEl = document.getElementById('bill-date-display');
    if (venueEl) {
      venueEl.textContent = venueName || '';
      venueEl.classList.remove('bill-venue-name--loading');
      if (!venueName) venueEl.classList.add('bill-venue-name--empty');
    }
    if (dateEl) {
      dateEl.textContent = billDate ? SplitifyFormatters.formatBillDateDisplay(billDate) : '';
    }
  }

  function prefetchBillImage() {
    var apiUrl = global.SPLITIFY_CONFIG && global.SPLITIFY_CONFIG.API_URL;
    if (!apiUrl || !state.billId) return;
    var url = apiUrl + '?action=getBillImageById&billId=' + encodeURIComponent(state.billId);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && !res.error && res.data && res.data.base64) {
          state.billImageDataUrl = 'data:' + (res.data.mimeType || 'image/jpeg') + ';base64,' + res.data.base64;
        }
      })
      .catch(function () { /* silently ignore — lightbox will fetch on demand if this fails */ });
  }

  function renderShell() {
    rootEl.innerHTML =
      '<main class="panel panel--wide">' +
      '<h1>Splitify</h1>' +
      '<div id="bill-meta-header" class="bill-meta-header">' +
      '<span id="bill-venue-name" class="bill-venue-name bill-venue-name--loading">Loading\u2026</span>' +
      '<span id="bill-date-display" class="bill-date"></span>' +
      '</div>' +
      '<div class="tabs">' +
      '<button id="tab-claim" class="tab tab--active">Claim</button>' +
      '<button id="tab-summary" class="tab">Summary</button>' +
      '<button type="button" id="open-bill-image" class="bill-image-fab" title="Open bill image" aria-label="Open bill image">' +
      '<span class="bill-image-fab__receipt" aria-hidden="true"></span>' +
      '</button>' +
      '</div>' +
      '<div id="tab-content"></div>' +
      '</main>' +
      '<p id="bill-caption" class="bill-cartoon-caption"></p>';
    document.getElementById('tab-claim').addEventListener('click', function () { setTab('claim'); });
    document.getElementById('tab-summary').addEventListener('click', function () { setTab('summary'); });
    document.getElementById('open-bill-image').addEventListener('click', openBillImageLightbox);
    SplitifyQuips.applyRandomQuip('bill-caption');
    renderTab();
  }

  function setTab(tab) {
    var prev = state.tab;
    state.tab = tab;
    document.getElementById('tab-claim').classList.toggle('tab--active', tab === 'claim');
    document.getElementById('tab-summary').classList.toggle('tab--active', tab === 'summary');
    // Always fetch fresh data for Summary; always discard stale summary when returning to Claim.
    state.summaryCache = null;
    renderTab();
    // Background API refresh on every tab switch when claims are loaded — keeps both
    // Claim and Summary in sync with the live backend.
    if (state.claimsLoaded && state.billId) {
      backgroundRefreshClaims();
    }
  }

  function backgroundRefreshClaims() {
    if (!state.billId) return;
    SplitifyAPI.getClaimsByBillIdDirect(state.billId)
      .then(function (freshClaims) {
        state.claims = freshClaims || [];
        state.summaryCache = null;
        // Rebuild claimMap: other users' latest claims + current user's pending mySelection.
        var otherMap = SplitifyClaimsState.buildClaimMapExcludingUser(state.claims, state.userName);
        state.claimMap = SplitifyClaimsState.applySelectionToClaimMap(
          otherMap,
          state.mySelection,
          state.userName
        );
        if (state.tab === 'claim') {
          refreshClaimItems();
        } else if (state.tab === 'summary') {
          // Update summary content in-place so the user sees fresh data without a full re-render.
          var freshSummary = buildSummaryFromState();
          state.summaryCache = freshSummary;
          var summaryMount = document.getElementById('summary-mount');
          if (summaryMount) {
            SplitifySummary.render(summaryMount, freshSummary, { viewMode: state.summaryView, onViewBill: openBillImageLightbox });
          }
        }
      })
      .catch(function () { /* silently ignore — fast-read data remains visible */ });
  }

  function backgroundApiRefreshSummary() {
    if (!state.billId) return;
    SplitifyAPI.getBillSummaryByIdDirect(state.billId)
      .then(function (freshSummary) {
        state.summaryCache = freshSummary;
        if (state.tab === 'summary') {
          var summaryMount = document.getElementById('summary-mount');
          if (summaryMount) {
            SplitifySummary.render(summaryMount, freshSummary, { viewMode: state.summaryView, onViewBill: openBillImageLightbox });
          }
        }
      })
      .catch(function () { /* silently ignore — fast-read data remains visible */ });
  }

  function renderTab() {
    var mount = document.getElementById('tab-content');
    if (!mount) return;
    if (state.tab === 'summary') return renderSummaryTab(mount);
    return renderClaimTab(mount);
  }

  function renderClaimTab(mount) {
    var itemsHtml = state.claimsLoaded
      ? '<div id="bill-items"></div>' +
        '<div id="claim-selection-summary" class="card claim-selection-summary"></div>' +
        '<button id="submit-claims-btn" class="btn btn--full">Submit My Claims</button>'
      : '';
    mount.innerHTML =
      '<div class="claim-entry-row">' +
      '<div id="name-mount" class="claim-name-mount"></div>' +
      '<button id="make-claim-btn" class="btn claim-entry-row__action" type="button">Make a Claim</button>' +
      '</div>' +
      '<p id="claim-status" class="status"></p>' +
      itemsHtml;

    SplitifyNameCombobox.mount(document.getElementById('name-mount'), {
      initialValue: state.userName,
      onSelect: function (name) {
        state.userName = name.trim();
        if (state.claimsLoaded) {
          state.claimsLoaded = false;
          state.mySelection = [];
          ['bill-items', 'claim-selection-summary', 'submit-claims-btn'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
          });
        }
        updateMakeClaimBtn();
      }
    });

    updateMakeClaimBtn();
    document.getElementById('make-claim-btn').addEventListener('click', function () {
      if (!state.userName) {
        updateClaimStatus('Enter your name first.', true);
        return;
      }
      var btn = document.getElementById('make-claim-btn');
      if (btn) btn.disabled = true;
      if (global.SplitifyWorking) {
        global.SplitifyWorking.begin(state.claimsLoaded ? 'Refreshing\u2026' : 'Loading bill...');
      }
      var billPromise = state.bill
        ? Promise.resolve(state.bill)
        : SplitifyAPI.getBillById(state.billId);
      Promise.all([
        billPromise,
        SplitifyAPI.getClaimsByBillId(state.billId),
        SplitifyAPI.getProductIcons().catch(function () { return []; })
      ]).then(function (results) {
        if (global.SplitifyWorking) global.SplitifyWorking.end();
        state.bill = results[0];
        state.claims = results[1] || [];
        state.productIcons = results[2] || [];
        updateBillMetaHeader(state.bill.venueName, state.bill.billDate);
        state.claimMap = SplitifyClaimsState.buildClaimMap(state.claims);
        state.mySelection = SplitifyClaimsState.getMySelectionFromClaims(state.claims, state.userName);
        state.mySelectionOriginal = state.mySelection.slice();
        state.consolidatedRowOrder = {};
        state.claimsLoaded = true;
        renderClaimTab(mount);
        backgroundRefreshClaims();
      }).catch(function (err) {
        if (global.SplitifyWorking) global.SplitifyWorking.end();
        if (btn) btn.disabled = false;
        updateClaimStatus(err.message || String(err), true);
      });
    });

    if (state.claimsLoaded) {
      var groups = buildConsolidated(state.bill.items || []);
      var list = document.getElementById('bill-items');
      list.innerHTML = '';
      for (var i = 0; i < groups.length; i++) {
        list.appendChild(renderProductClaimRow(groups[i], i));
      }
      renderClaimSelectionSummary();
      document.getElementById('submit-claims-btn').addEventListener('click', submitClaims);
    }
  }

  function renderProductClaimRow(group, groupIndex) {
    var rowKey = 'g' + groupIndex;
    return SplitifyProductRow.render({
      category: group.category,
      description: group.description,
      slots: getOrderedSlotsForGroup(group, groupIndex),
      productIcons: state.productIcons,
      claimMap: state.claimMap,
      currentUser: state.userName,
      portionClaimMode: !!state.portionClaimModeByGroup[rowKey],
      onSlotClick: onSlotClick,
      onSlotShare: onSlotShare,
      onClaimedByOtherClick: onClaimedByOtherClick,
      onPortionClaimModeChange: function (on) {
        if (on) state.portionClaimModeByGroup[rowKey] = true;
        else delete state.portionClaimModeByGroup[rowKey];
      }
    });
  }

  function updateMakeClaimBtn() {
    var btn = document.getElementById('make-claim-btn');
    if (!btn) return;
    btn.disabled = !state.userName;
    btn.textContent = state.claimsLoaded ? 'Refresh' : 'Make a Claim';
  }

  function showSubmitInfoMessage(text) {
    var btn = document.getElementById('submit-claims-btn');
    if (window.BriefMessage) {
      window.BriefMessage.show(text, btn, { durationMs: 1200, disableElement: btn });
    }
  }

  function onClaimedByOtherClick(rowIndex, unitIndex, triggerEl) {
    var st = SplitifyClaimsState.getSlotState(state.claimMap, state.userName, rowIndex, unitIndex);
    var names = SplitifyClaimsState.getOtherClaimants(state.claimMap, state.userName, rowIndex, unitIndex);
    var label = names.length ? names.join(', ') : 'someone';
    var text = st === 'shared-by-other' ? ('Shared with ' + label) : ('Claimed by ' + label);
    if (window.BriefMessage) {
      window.BriefMessage.show(text, triggerEl || null, { durationMs: 1200 });
    }
  }

  function rebuildClaimMapFromSelection() {
    var otherMap = SplitifyClaimsState.buildClaimMapExcludingUser(state.claims, state.userName);
    state.claimMap = SplitifyClaimsState.applySelectionToClaimMap(
      otherMap,
      state.mySelection,
      state.userName
    );
  }

  function findItemDescription(rowIndex) {
    var items = (state.bill && state.bill.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowIndex === rowIndex) {
        return normalizeDisplayDescription(items[i].description) || 'Item';
      }
    }
    return 'Item';
  }

  function findSelectionIndex(rowIndex, unitIndex) {
    return state.mySelection.findIndex(function (s) {
      return s.rowIndex === rowIndex && s.unitIndex === unitIndex;
    });
  }

  function openShareDialog(rowIndex, unitIndex) {
    if (!state.userName) {
      updateClaimStatus('Enter your name first.', true);
      return;
    }
    var st = SplitifyClaimsState.getSlotState(state.claimMap, state.userName, rowIndex, unitIndex);
    if (st === 'claimed-by-other') return;
    if (!global.SplitifyShareClaimDialog) return;

    var otherMap = SplitifyClaimsState.buildClaimMapExcludingUser(state.claims, state.userName);
    var slotInfo = SplitifyClaimsState.getSlotInfo(otherMap, rowIndex, unitIndex);
    var othersByIndex = {};
    var idxs = Object.keys(slotInfo.byIndex || {});
    for (var i = 0; i < idxs.length; i++) {
      othersByIndex[idxs[i]] = slotInfo.byIndex[idxs[i]];
    }

    var existingIdx = findSelectionIndex(rowIndex, unitIndex);
    var existing = existingIdx >= 0 ? state.mySelection[existingIdx] : null;
    var selectedPortions = [];
    var portionCount = 2;
    var othersLocked = Object.keys(othersByIndex).length > 0;
    var locked = othersLocked;

    if (othersLocked) {
      portionCount = Math.max(2, slotInfo.portionCount || 2);
    }

    if (existing && SplitifyClaimsState.isShareSelection(existing)) {
      selectedPortions = existing.portions.slice();
      portionCount = existing.portionCount;
      // Any claimed portion (including mine, pending or saved) locks the count.
      locked = true;
    } else if (existing && !SplitifyClaimsState.isShareSelection(existing)) {
      // Converting a full claim into a share starts at 2 unless others already locked it.
      selectedPortions = [];
      if (!othersLocked) portionCount = 2;
    }

    global.SplitifyShareClaimDialog.open({
      description: findItemDescription(rowIndex),
      portionCount: portionCount,
      locked: locked,
      currentUser: state.userName,
      othersByIndex: othersByIndex,
      selectedPortions: selectedPortions,
      onConfirm: function (result) {
        var next = state.mySelection.filter(function (s) {
          return !(s.rowIndex === rowIndex && s.unitIndex === unitIndex);
        });
        if (result.portions && result.portions.length) {
          next.push({
            rowIndex: rowIndex,
            unitIndex: unitIndex,
            portionCount: result.portionCount,
            portions: result.portions.slice()
          });
        }
        state.mySelection = next;
        rebuildClaimMapFromSelection();
        refreshClaimItems();
      }
    });
  }

  function onSlotShare(rowIndex, unitIndex, triggerEl) {
    var st = SplitifyClaimsState.getSlotState(state.claimMap, state.userName, rowIndex, unitIndex);
    if (st === 'claimed-by-other') {
      onClaimedByOtherClick(rowIndex, unitIndex, triggerEl || null);
      return;
    }
    openShareDialog(rowIndex, unitIndex);
  }

  function onSlotClick(rowIndex, unitIndex) {
    if (!state.userName) {
      var s = document.getElementById('claim-status');
      s.textContent = 'Enter your name first.';
      s.className = 'status status--error';
      return;
    }
    var st = SplitifyClaimsState.getSlotState(state.claimMap, state.userName, rowIndex, unitIndex);
    if (st === 'claimed-by-other') return;
    if (st === 'shared-by-me' || st === 'shared-by-other') {
      openShareDialog(rowIndex, unitIndex);
      return;
    }
    var idx = findSelectionIndex(rowIndex, unitIndex);
    if (st === 'claimed-by-me' || idx >= 0) {
      state.mySelection = state.mySelection.filter(function (sel) {
        return !(sel.rowIndex === rowIndex && sel.unitIndex === unitIndex);
      });
    } else {
      state.mySelection.push({ rowIndex: rowIndex, unitIndex: unitIndex });
    }
    rebuildClaimMapFromSelection();
    renderTab();
  }

  function refreshClaimItems() {
    var groups = buildConsolidated(state.bill ? state.bill.items || [] : []);
    var list = document.getElementById('bill-items');
    if (list) {
      list.innerHTML = '';
      for (var i = 0; i < groups.length; i++) {
        list.appendChild(renderProductClaimRow(groups[i], i));
      }
    }
    renderClaimSelectionSummary();
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
    // groupKey -> { description, portions, portionCount, value }
    var byGroup = {};
    for (var s = 0; s < state.mySelection.length; s++) {
      var slot = state.mySelection[s];
      var item = itemsByRow[slot.rowIndex];
      if (!item) continue;
      var unit = effectiveUnitForItem(item);
      var frac = SplitifyClaimsState.selectionFraction(slot);
      subtotal += unit * frac;
      var desc = normalizeDisplayDescription(item.description) || 'Item';
      var portionCount = SplitifyClaimsState.isShareSelection(slot) ? slot.portionCount : 1;
      var portions = SplitifyClaimsState.isShareSelection(slot) ? slot.portions.length : 1;
      var groupKey = desc.toLowerCase() + '|p' + portionCount + '|' + Math.round(unit * 100);
      if (!byGroup[groupKey]) {
        byGroup[groupKey] = { description: desc, portions: 0, portionCount: portionCount };
      }
      byGroup[groupKey].portions += portions;
    }

    var billTotal = 0;
    for (var b = 0; b < billItems.length; b++) {
      billTotal += parseFloat(billItems[b].total_price) || 0;
    }
    var totalPaid = state.bill.metadata && state.bill.metadata.totalPaid != null ? (parseFloat(state.bill.metadata.totalPaid) || 0) : billTotal;
    var tipAmount = Math.max(0, totalPaid - billTotal);
    var tipShare = billTotal > 0 ? tipAmount * (subtotal / billTotal) : 0;
    var totalWithTip = subtotal + tipShare;

    var names = Object.keys(byGroup).sort();
    var listHtml = '';
    if (!names.length) {
      listHtml = '<div class="summary-subline">No items selected yet.</div>';
    } else {
      for (var n = 0; n < names.length; n++) {
        var g = byGroup[names[n]];
        var qty = SplitifyClaimsState.formatQuantityLabel(g.portions, g.portionCount);
        var qtyText = qty ? ' ' + qty : '';
        listHtml += '<div class="summary-subline">' + escapeHtml(g.description) + qtyText + '</div>';
      }
    }

    el.innerHTML =
      '<h3>Selection So Far</h3>' +
      listHtml +
      '<ul class="summary-list">' +
      '<li><span>Items subtotal</span><strong>€' + SplitifyFormatters.formatMoney(subtotal) + '</strong></li>' +
      '<li><span>Tip share</span><strong>€' + SplitifyFormatters.formatMoney(tipShare) + '</strong></li>' +
      '<li><span>Total with tip</span><strong>€' + SplitifyFormatters.formatMoney(totalWithTip) + '</strong></li>' +
      '</ul>';
  }

  function accumulateClaimFraction(bucket, userName, portions, portionCount) {
    var key = userName + '\0' + portionCount;
    if (!bucket[key]) bucket[key] = { portions: 0, portionCount: portionCount };
    bucket[key].portions += portions;
  }

  function buildSummaryFromClaims(bill, claims) {
    if (!bill) return null;
    var claimMap = SplitifyClaimsState.buildClaimMap(claims || []);
    var billTotal = 0;
    var items = bill.items || [];
    for (var x = 0; x < items.length; x++) billTotal += items[x].total_price || 0;
    var totalPaid = bill.metadata && bill.metadata.totalPaid != null ? bill.metadata.totalPaid : billTotal;
    if (totalPaid == null) totalPaid = billTotal;
    var tip = Math.max(0, totalPaid - billTotal);
    var tipPercent = billTotal > 0 ? (tip / billTotal) * 100 : 0;
    var byUserSlots = {};
    var byItem = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var claimed = 0;
      var itemClaimBucket = {};
      var unclaimedBucket = {};
      var unitPrice = effectiveUnitForItem(it);
      var q = parseInt(it.quantity, 10) || 0;
      for (var u = 0; u < q; u++) {
        var info = SplitifyClaimsState.getSlotInfo(claimMap, it.rowIndex, u);
        var idxs = Object.keys(info.byIndex || {});
        if (!idxs.length) {
          unclaimedBucket[1] = (unclaimedBucket[1] || 0) + 1;
          continue;
        }
        var portionCount = Math.max(1, info.portionCount || 1);
        var byUserOnSlot = {};
        for (var pi = 0; pi < idxs.length; pi++) {
          var uname = info.byIndex[idxs[pi]];
          byUserOnSlot[uname] = (byUserOnSlot[uname] || 0) + 1;
        }
        claimed += idxs.length / portionCount;
        var freePortions = portionCount - idxs.length;
        if (freePortions > 0) {
          unclaimedBucket[portionCount] = (unclaimedBucket[portionCount] || 0) + freePortions;
        }
        var slotUsers = Object.keys(byUserOnSlot);
        for (var su = 0; su < slotUsers.length; su++) {
          var nm = slotUsers[su];
          var parts = byUserOnSlot[nm];
          accumulateClaimFraction(itemClaimBucket, nm, parts, portionCount);
          if (!byUserSlots[nm]) byUserSlots[nm] = { subtotal: 0 };
          byUserSlots[nm].subtotal += (parts / portionCount) * unitPrice;
        }
      }
      var claimsByUser = [];
      var bucketKeys = Object.keys(itemClaimBucket).sort();
      for (var bk = 0; bk < bucketKeys.length; bk++) {
        var userName = bucketKeys[bk].split('\0')[0];
        var entry = itemClaimBucket[bucketKeys[bk]];
        claimsByUser.push({
          userName: userName,
          count: entry.portions / entry.portionCount,
          portions: entry.portions,
          portionCount: entry.portionCount
        });
      }
      var unclaimedParts = [];
      var unclaimedKeys = Object.keys(unclaimedBucket).sort(function (a, b) {
        return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
      });
      for (var uk = 0; uk < unclaimedKeys.length; uk++) {
        var denom = parseInt(unclaimedKeys[uk], 10) || 1;
        unclaimedParts.push({
          portions: unclaimedBucket[unclaimedKeys[uk]],
          portionCount: denom
        });
      }
      byItem.push({
        description: normalizeDisplayDescription(it.description),
        category: it.category,
        quantity: it.quantity,
        claimed: claimed,
        unclaimed: Math.max(0, q - claimed),
        unclaimedParts: unclaimedParts,
        unitPrice: unitPrice,
        totalPrice: it.total_price || 0,
        claimsByUser: claimsByUser
      });
    }
    var byUser = [];
    var names = Object.keys(byUserSlots).sort();
    for (var n = 0; n < names.length; n++) {
      var name = names[n];
      var sub = byUserSlots[name].subtotal;
      var tipShare = billTotal > 0 ? tip * (sub / billTotal) : 0;
      byUser.push({ userName: name, subtotal: sub, tipShare: tipShare, totalWithTip: sub + tipShare });
    }
    return {
      billId: bill.billId,
      billTotal: billTotal,
      totalPaid: totalPaid,
      tipAmount: tip,
      tipPercent: tipPercent,
      byUser: byUser,
      byItem: byItem
    };
  }

  function computeSummaryFromState() {
    return buildSummaryFromClaims(state.bill, state.claims);
  }

  function selectionUnchanged() {
    return SplitifyClaimsState.selectionUnchanged(state.mySelection, state.mySelectionOriginal);
  }

  function submitClaims() {
    if (!state.userName) {
      return updateClaimStatus('Enter your name first.', true);
    }
    if (selectionUnchanged()) {
      var hasOriginal = state.mySelectionOriginal.length > 0;
      showSubmitInfoMessage(hasOriginal ? 'Already submitted' : 'Nothing claimed');
      return;
    }

    var PROGRESS_MS = 1000;
    var tStart = Date.now();
    var btn = document.getElementById('submit-claims-btn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('submit-btn--progress');
      btn.innerHTML =
        '<span class="submit-btn__label">Submitting\u2026</span>' +
        '<span id="submit-claims-bar" class="submit-btn__bar"></span>';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var bar = document.getElementById('submit-claims-bar');
          if (bar) bar.style.width = '100%';
        });
      });
    }

    SplitifyAPI.submitClaimsByBillId({
      billId: state.billId,
      userName: state.userName,
      claims: SplitifyClaimsState.toSubmitPayload(state.mySelection)
    }).then(function (res) {
      state.claims = res.claims || [];
      state.claimMap = SplitifyClaimsState.buildClaimMap(state.claims);
      // Server may remap fungible slots; align local selection with persisted claims.
      state.mySelection = SplitifyClaimsState.getMySelectionFromClaims(state.claims, state.userName);
      state.mySelectionOriginal = state.mySelection.slice();
      state.summaryCache = null;
      refreshClaimItems();
      var elapsed = Date.now() - tStart;
      var bar = document.getElementById('submit-claims-bar');
      if (bar && elapsed < PROGRESS_MS) {
        bar.style.transition = 'none';
        bar.style.width = '100%';
      }
      requestAnimationFrame(function () {
        resetSubmitProgress();
        updateClaimStatus('');
        showClaimsSuccessOverlay();
      });
    }).catch(function (err) {
      resetSubmitProgress();
      var msg = err.message || String(err);
      if (!state.billId || !state.claimsLoaded) {
        updateClaimStatus(msg, true);
        return;
      }
      // Optimistic UI may be out of sync; refresh claims from the API (direct) so ticks match reality.
      SplitifyAPI.getClaimsByBillIdDirect(state.billId)
        .then(function (freshClaims) {
          state.claims = freshClaims || [];
          state.mySelection = SplitifyClaimsState.getMySelectionFromClaims(state.claims, state.userName);
          state.mySelectionOriginal = state.mySelection.slice();
          state.claimMap = SplitifyClaimsState.buildClaimMap(state.claims);
          state.summaryCache = null;
          state.consolidatedRowOrder = {};
          refreshClaimItems();
          updateClaimStatus(msg, true);
        })
        .catch(function () {
          updateClaimStatus(msg, true);
        });
    });
  }

  function resetSubmitProgress() {
    var btn = document.getElementById('submit-claims-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('submit-btn--progress');
    btn.textContent = 'Submit My Claims';
  }

  function showClaimsSuccessOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'claims-success-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = '<span class="claims-success-overlay__text">Claims recorded!</span>';
    document.body.appendChild(overlay);
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 1500);
  }

  function updateClaimStatus(text, isErr) {
    var el = document.getElementById('claim-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'status' + (isErr ? ' status--error' : '');
  }

  function buildSummaryFromState() {
    return buildSummaryFromClaims(state.bill, state.claims);
  }

  function renderSummaryTab(mount) {
    mount.innerHTML =
      '<div class="summary-tab-bar">' +
      '<div class="summary-tab-headings">' +
      '<button id="summary-tab-byuser" class="summary-tab-heading' + (state.summaryView === 'byUser' ? ' summary-tab-heading--active' : '') + '" type="button">By User</button>' +
      '<button id="summary-tab-byitem" class="summary-tab-heading' + (state.summaryView === 'byItem' ? ' summary-tab-heading--active' : '') + '" type="button">By Item</button>' +
      '</div>' +
      '</div>' +
      '<div id="summary-mount" class="summary-grid summary-grid--' + (state.summaryView === 'byUser' ? 'byuser' : 'byitem') + '"></div>';
    document.getElementById('summary-tab-byuser').addEventListener('click', function () {
      state.summaryView = 'byUser';
      renderSummaryTab(mount);
    });
    document.getElementById('summary-tab-byitem').addEventListener('click', function () {
      state.summaryView = 'byItem';
      renderSummaryTab(mount);
    });
    if (state.summaryCache) {
      SplitifySummary.render(document.getElementById('summary-mount'), state.summaryCache, { viewMode: state.summaryView, onViewBill: openBillImageLightbox });
      return;
    }
    // When claims are loaded in state they come from the backend API (authoritative).
    if (state.claimsLoaded && state.bill) {
      var summary = buildSummaryFromState();
      state.summaryCache = summary;
      SplitifySummary.render(document.getElementById('summary-mount'), summary, { viewMode: state.summaryView, onViewBill: openBillImageLightbox });
      return;
    }
    SplitifyAPI.getBillSummaryById(state.billId).then(function (summary) {
      state.summaryCache = summary;
      SplitifySummary.render(document.getElementById('summary-mount'), summary, { viewMode: state.summaryView, onViewBill: openBillImageLightbox });
      backgroundApiRefreshSummary();
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
      var normalizedDesc = normalizeDisplayDescription(it.description) || 'Item';
      var key = consolidatedGroupKey(it, normalizedDesc);
      if (!map[key]) {
        map[key] = { category: it.category || '', description: normalizedDesc, slots: [] };
        out.push(map[key]);
      } else if (!map[key].category && it.category) {
        map[key].category = it.category;
      }
      var qty = parseInt(it.quantity, 10) || 0;
      for (var u = 0; u < qty; u++) {
        map[key].slots.push({ rowIndex: it.rowIndex, unitIndex: u });
      }
    }
    return out;
  }

  /**
   * Keep servings with different unit prices separate (e.g. pint vs glass),
   * even if OCR/model emits the same base description.
   */
  function consolidatedGroupKey(item, normalizedDesc) {
    var descKey = String(normalizedDesc || '').toLowerCase();
    var catKey = String((item && item.category) || '').toLowerCase();
    var cents = Math.round(effectiveUnitForItem(item) * 100);
    return descKey + '|' + catKey + '|' + cents;
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

  function normalizeDisplayDescription(description) {
    if (global.SplitifyFormatters && typeof global.SplitifyFormatters.normalizeItemDescription === 'function') {
      return global.SplitifyFormatters.normalizeItemDescription(description);
    }
    return String(description || '').trim();
  }

  function effectiveUnitForItem(it) {
    if (global.SplitifyFormatters && typeof global.SplitifyFormatters.effectiveUnitPrice === 'function') {
      return global.SplitifyFormatters.effectiveUnitPrice(it.quantity, it.unit_price, it.total_price);
    }
    var u = parseFloat(it.unit_price);
    if (!isNaN(u) && u > 0) return u;
    var q = parseInt(it.quantity, 10) || 0;
    var t = parseFloat(it.total_price);
    if (q > 0 && !isNaN(t)) return t / q;
    return isNaN(u) ? 0 : u;
  }

  global.SplitifyBillPage = { init: init };
})(typeof window !== 'undefined' ? window : this);
