(function (global) {
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
        // Aggregate per-user products by description so repeated bill lines for the
        // same product collapse into one row (count summed, value summed).
        var userProductMap = {};   // { userName: { description: { count, totalValue } } }
        var unclaimedMap = {};     // { description: { count, totalValue } }
        var unclaimedSubtotal = 0;
        for (var k = 0; k < byItem.length; k++) {
          var it = byItem[k];
          var desc = normalizeDisplayDescription(it.description) || '';
          var claimedBy = Array.isArray(it.claimsByUser) ? it.claimsByUser : [];
          for (var ci = 0; ci < claimedBy.length; ci++) {
            var cu = claimedBy[ci];
            if (!userProductMap[cu.userName]) userProductMap[cu.userName] = {};
            if (!userProductMap[cu.userName][desc]) {
              userProductMap[cu.userName][desc] = { description: desc, count: 0, totalValue: 0 };
            }
            userProductMap[cu.userName][desc].count += cu.count || 0;
            userProductMap[cu.userName][desc].totalValue += (cu.count || 0) * (it.unitPrice || 0);
          }
          if ((it.unclaimed || 0) > 0) {
            var uLineVal = it.unclaimed * (it.unitPrice || 0);
            unclaimedSubtotal += uLineVal;
            if (!unclaimedMap[desc]) unclaimedMap[desc] = { description: desc, count: 0, totalValue: 0 };
            unclaimedMap[desc].count += it.unclaimed;
            unclaimedMap[desc].totalValue += uLineVal;
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
              '<span>' + escapeHtml(p.description) + (p.count > 1 ? ' \xd7' + p.count : '') + '</span>' +
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
            unclaimedCardHtml += '<div class="summary-user-product">' +
              '<span>' + escapeHtml(up.description) + (up.count > 1 ? ' \xd7' + up.count : '') + '</span>' +
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
          var it = summary.byItem[j];
          var descText = normalizeDisplayDescription(it.description);
          html += '<li class="summary-item-row"><div class="summary-item-row__left">' +
            '<div class="summary-item-main">' + escapeHtml(descText) + ' x' + (it.quantity || 0) + ' @ €' + SplitifyFormatters.formatMoney(it.unitPrice || 0) + '</div>';
          var claimsByUser = Array.isArray(it.claimsByUser) ? it.claimsByUser : [];
          for (var c = 0; c < claimsByUser.length; c++) {
            html += '<div class="summary-subline">' + escapeHtml(claimsByUser[c].userName) + ' (' + (claimsByUser[c].count || 0) + ')</div>';
          }
          if ((it.unclaimed || 0) > 0) {
            html += '<div class="summary-subline summary-subline--unclaimed">Unclaimed (' + (it.unclaimed || 0) + ')</div>';
          }
          html += '</div><strong>€' + SplitifyFormatters.formatMoney(it.totalPrice || 0) + '</strong></li>';
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

  global.SplitifySummary = { render: render };
})(typeof window !== 'undefined' ? window : this);
