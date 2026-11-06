(function (global) {
  function effectiveUnitForSummaryItem(it) {
    var q = it.quantity;
    var u = it.unitPrice != null ? it.unitPrice : it.unit_price;
    var t = it.totalPrice != null ? it.totalPrice : it.total_price;
    if (global.SplitifyFormatters && typeof global.SplitifyFormatters.effectiveUnitPrice === 'function') {
      return global.SplitifyFormatters.effectiveUnitPrice(q, u, t);
    }
    var pu = parseFloat(u);
    if (!isNaN(pu) && pu > 0) return pu;
    var pq = parseInt(q, 10) || 0;
    var pt = parseFloat(t);
    if (pq > 0 && !isNaN(pt)) return pt / pq;
    return isNaN(pu) ? 0 : pu;
  }

  function claimEntryPortions(cu) {
    if (cu.portions != null && cu.portionCount != null) {
      return {
        portions: parseInt(cu.portions, 10) || 0,
        portionCount: Math.max(1, parseInt(cu.portionCount, 10) || 1)
      };
    }
    var count = parseFloat(cu.count);
    if (isNaN(count)) count = 0;
    if (Math.abs(count - Math.round(count)) < 1e-9) {
      return { portions: Math.round(count), portionCount: 1 };
    }
    // Best-effort: treat non-integer as already fractional value with denom 1 for money only.
    return { portions: count, portionCount: 1 };
  }

  function quantitySuffix(portions, portionCount) {
    if (global.SplitifyClaimsState && typeof global.SplitifyClaimsState.formatQuantityLabel === 'function') {
      var label = global.SplitifyClaimsState.formatQuantityLabel(portions, portionCount);
      return label ? ' ' + label : '';
    }
    if (portionCount > 1) return ' x' + portions + '/' + portionCount;
    if (portions > 1) return ' ×' + portions;
    return '';
  }

  function claimCountLabel(portions, portionCount) {
    if (global.SplitifyClaimsState && typeof global.SplitifyClaimsState.formatClaimCountLabel === 'function') {
      return global.SplitifyClaimsState.formatClaimCountLabel(portions, portionCount);
    }
    if (portionCount > 1) return portions + '/' + portionCount;
    return String(portions);
  }

  function formatUnclaimedLabel(unclaimed) {
    var n = parseFloat(unclaimed);
    if (isNaN(n) || n <= 0) return '';
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    // Show up to 3 decimal places trimmed, but prefer simple fractions for common denominators.
    for (var d = 2; d <= 10; d++) {
      var num = Math.round(n * d);
      if (Math.abs(n - num / d) < 1e-6) return num + '/' + d;
    }
    return String(Math.round(n * 1000) / 1000);
  }

  function render(container, summary, options) {
    if (!container) return;
    options = options || {};
    var viewMode = options.viewMode === 'byItem' ? 'byItem' : 'byUser';
    var onViewBill = typeof options.onViewBill === 'function' ? options.onViewBill : null;
    summary = summary || { byUser: [], byItem: [] };
    var html = '<div class="summary-card">';

    var unclaimedCardHtml = '';
    if (viewMode === 'byUser') {
      if (!summary.byUser.length) {
        html += '<p class="muted">No claims yet.</p>';
      } else {
        var byItem = Array.isArray(summary.byItem) ? summary.byItem : [];
        // Aggregate per-user products by description+unit+portionCount so mixed
        // full claims and shares stay on separate sublines when denominators differ.
        var userProductMap = {};   // { userName: { groupKey: { description, portions, portionCount, totalValue } } }
        var unclaimedMap = {};     // { groupKey: { description, count, totalValue } }
        var unclaimedSubtotal = 0;
        for (var k = 0; k < byItem.length; k++) {
          var it = byItem[k];
          var desc = normalizeDisplayDescription(it.description) || '';
          var unit = effectiveUnitForSummaryItem(it);
          var groupKeyBase = summaryItemGroupKey(desc, unit);
          var claimedBy = Array.isArray(it.claimsByUser) ? it.claimsByUser : [];
          for (var ci = 0; ci < claimedBy.length; ci++) {
            var cu = claimedBy[ci];
            var frac = claimEntryPortions(cu);
            var groupKey = groupKeyBase + '|p' + frac.portionCount;
            if (!userProductMap[cu.userName]) userProductMap[cu.userName] = {};
            if (!userProductMap[cu.userName][groupKey]) {
              userProductMap[cu.userName][groupKey] = {
                description: desc,
                portions: 0,
                portionCount: frac.portionCount,
                totalValue: 0
              };
            }
            userProductMap[cu.userName][groupKey].portions += frac.portions;
            userProductMap[cu.userName][groupKey].totalValue +=
              (frac.portions / frac.portionCount) * unit;
          }
          if ((it.unclaimed || 0) > 0) {
            var uLineVal = it.unclaimed * unit;
            unclaimedSubtotal += uLineVal;
            if (!unclaimedMap[groupKeyBase]) unclaimedMap[groupKeyBase] = { description: desc, count: 0, totalValue: 0 };
            unclaimedMap[groupKeyBase].count += it.unclaimed;
            unclaimedMap[groupKeyBase].totalValue += uLineVal;
          }
        }
        html += '<ul class="summary-list">';
        for (var i = 0; i < summary.byUser.length; i++) {
          var u = summary.byUser[i];
          var prodMap = userProductMap[u.userName] || {};
          var prodDescs = Object.keys(prodMap).sort();
          html += '<li class="summary-user-row">';
          html += '<div class="summary-user-header">' +
            '<div class="summary-item-main">' + escapeHtml(u.userName) + '</div>' +
            '<span class="summary-subline summary-user-header__tip">Tip €' + SplitifyFormatters.formatMoney(u.tipShare || 0) + '</span>' +
            '<strong>€' + SplitifyFormatters.formatMoney(u.totalWithTip || 0) + '</strong>' +
            '</div>';
          for (var pi = 0; pi < prodDescs.length; pi++) {
            var p = prodMap[prodDescs[pi]];
            html += '<div class="summary-user-product">' +
              '<span>' + escapeHtml(p.description) + quantitySuffix(p.portions, p.portionCount) + '</span>' +
              '<span>€' + SplitifyFormatters.formatMoney(p.totalValue) + '</span>' +
              '</div>';
          }
          html += '</li>';
        }
        html += '</ul>';
        var unclaimedDescs = Object.keys(unclaimedMap);
        if (unclaimedDescs.length > 0) {
          var billTotal = summary.billTotal || 0;
          var tipAmount = summary.tipAmount || 0;
          var uTipShare = billTotal > 0 ? tipAmount * (unclaimedSubtotal / billTotal) : 0;
          var uTotal = unclaimedSubtotal + uTipShare;
          unclaimedCardHtml = '<div class="summary-card summary-card--unclaimed"><ul class="summary-list"><li class="summary-user-row">';
          unclaimedCardHtml += '<div class="summary-user-header">' +
            '<div class="summary-item-main summary-item-main--unclaimed">Unclaimed</div>' +
            '<span class="summary-subline summary-user-header__tip">Tip €' + SplitifyFormatters.formatMoney(uTipShare) + '</span>' +
            '<strong>€' + SplitifyFormatters.formatMoney(uTotal) + '</strong>' +
            '</div>';
          unclaimedDescs.sort();
          for (var upi = 0; upi < unclaimedDescs.length; upi++) {
            var up = unclaimedMap[unclaimedDescs[upi]];
            var uLabel = formatUnclaimedLabel(up.count);
            unclaimedCardHtml += '<div class="summary-user-product">' +
              '<span>' + escapeHtml(up.description) + (uLabel && uLabel !== '1' ? ' x' + uLabel : '') + '</span>' +
              '<span>€' + SplitifyFormatters.formatMoney(up.totalValue) + '</span>' +
              '</div>';
          }
          unclaimedCardHtml += '</li></ul></div>';
        }
      }
    } else {
      if (!summary.byItem.length) {
        html += '<p class="muted">No items.</p>';
      } else {
        html += '<ul class="summary-list">';
        for (var j = 0; j < summary.byItem.length; j++) {
          var it2 = summary.byItem[j];
          var descText = normalizeDisplayDescription(it2.description);
          var lineUnit = effectiveUnitForSummaryItem(it2);
          html += '<li class="summary-item-row"><div class="summary-item-row__left">' +
            '<div class="summary-item-main">' + escapeHtml(descText) + ' x' + (it2.quantity || 0) + ' @ €' + SplitifyFormatters.formatMoney(lineUnit) + '</div>';
          var claimsByUser = Array.isArray(it2.claimsByUser) ? it2.claimsByUser : [];
          for (var c = 0; c < claimsByUser.length; c++) {
            var entry = claimEntryPortions(claimsByUser[c]);
            html += '<div class="summary-subline">' + escapeHtml(claimsByUser[c].userName) +
              ' (' + claimCountLabel(entry.portions, entry.portionCount) + ')</div>';
          }
          if ((it2.unclaimed || 0) > 0) {
            html += '<div class="summary-subline summary-subline--unclaimed">Unclaimed (' +
              formatUnclaimedLabel(it2.unclaimed) + ')</div>';
          }
          html += '</div><strong>€' + SplitifyFormatters.formatMoney(it2.totalPrice || 0) + '</strong></li>';
        }
        html += '</ul>';
      }
    }
    html += '</div>';
    html += unclaimedCardHtml;
    html += '<div class="summary-card">';
    html += '<ul class="summary-list">';
    html += '<li><span>Total</span><strong>€' + SplitifyFormatters.formatMoney(summary.billTotal || 0) + '</strong></li>';
    html += '<li><span>' + formatPct(summary.tipPercent || 0) + '% Tip</span><strong>€' + SplitifyFormatters.formatMoney(summary.tipAmount || 0) + '</strong></li>';
    html += '<li><span>Total Paid</span><strong>€' + SplitifyFormatters.formatMoney(summary.totalPaid || 0) + '</strong></li>';
    html += '</ul></div>';
    container.innerHTML = html;
    void onViewBill;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatPct(value) {
    var n = parseFloat(value);
    if (isNaN(n)) n = 0;
    return n.toFixed(1);
  }

  function normalizeDisplayDescription(description) {
    if (global.SplitifyFormatters && typeof global.SplitifyFormatters.normalizeItemDescription === 'function') {
      return global.SplitifyFormatters.normalizeItemDescription(description);
    }
    return String(description || '').trim();
  }

  function summaryItemGroupKey(description, effectiveUnit) {
    var descKey = String(description || '').toLowerCase();
    var unitCents = Math.round((parseFloat(effectiveUnit) || 0) * 100);
    return descKey + '|' + unitCents;
  }

  global.SplitifySummary = { render: render };
})(typeof window !== 'undefined' ? window : this);
