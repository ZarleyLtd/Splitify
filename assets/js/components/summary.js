(function (global) {
  function render(container, summary, options) {
    if (!container) return;
    options = options || {};
    var viewMode = options.viewMode === 'byItem' ? 'byItem' : 'byUser';
    summary = summary || { byUser: [], byItem: [] };
    var html = '<div class="summary-card">';
    html += '<h3>' + (viewMode === 'byUser' ? 'By User' : 'By Item') + '</h3>';

    if (viewMode === 'byUser') {
      if (!summary.byUser.length) {
        html += '<p class="muted">No claims yet.</p>';
      } else {
        html += '<ul class="summary-list">';
        for (var i = 0; i < summary.byUser.length; i++) {
          var u = summary.byUser[i];
          html += '<li class="summary-user-row">' +
            '<div class="summary-user-row__left">' +
            '<div class="summary-item-main">' + escapeHtml(u.userName) + '</div>' +
            '<div class="summary-subline">Items: EUR ' + SplitifyFormatters.formatMoney(u.subtotal || 0) + '</div>' +
            '<div class="summary-subline">Tip share: EUR ' + SplitifyFormatters.formatMoney(u.tipShare || 0) + '</div>' +
            '</div>' +
            '<strong>EUR ' + SplitifyFormatters.formatMoney(u.totalWithTip || 0) + '</strong>' +
            '</li>';
        }
        html += '</ul>';
      }
    } else {
      if (!summary.byItem.length) {
        html += '<p class="muted">No items.</p>';
      } else {
        html += '<ul class="summary-list">';
        for (var j = 0; j < summary.byItem.length; j++) {
          var it = summary.byItem[j];
          html += '<li class="summary-item-row"><div class="summary-item-row__left">' +
            '<div class="summary-item-main">' + escapeHtml(it.description) + ' x' + (it.quantity || 0) + ' @ EUR ' + SplitifyFormatters.formatMoney(it.unitPrice || 0) + '</div>';
          var claimsByUser = Array.isArray(it.claimsByUser) ? it.claimsByUser : [];
          for (var c = 0; c < claimsByUser.length; c++) {
            html += '<div class="summary-subline">' + escapeHtml(claimsByUser[c].userName) + ' (' + (claimsByUser[c].count || 0) + ')</div>';
          }
          if ((it.unclaimed || 0) > 0) {
            html += '<div class="summary-subline summary-subline--unclaimed">Unclaimed (' + (it.unclaimed || 0) + ')</div>';
          }
          html += '</div><strong>EUR ' + SplitifyFormatters.formatMoney(it.totalPrice || 0) + '</strong></li>';
        }
        html += '</ul>';
      }
    }
    html += '</div>';
    html += '<div class="summary-card">';
    html += '<ul class="summary-list">';
    html += '<li><span class="summary-view-bill"><span class="summary-view-bill__icon" aria-hidden="true">🧾</span>View Bill</span><span></span></li>';
    html += '<li><span>Total</span><strong>EUR ' + SplitifyFormatters.formatMoney(summary.billTotal || 0) + '</strong></li>';
    html += '<li><span>' + formatPct(summary.tipPercent || 0) + '% Tip</span><strong>EUR ' + SplitifyFormatters.formatMoney(summary.tipAmount || 0) + '</strong></li>';
    html += '<li><span>Total Paid</span><strong>EUR ' + SplitifyFormatters.formatMoney(summary.totalPaid || 0) + '</strong></li>';
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

  global.SplitifySummary = { render: render };
})(typeof window !== 'undefined' ? window : this);
