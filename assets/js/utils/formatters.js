(function (global) {
  /**
   * Per-unit price for display and claim math when the sheet/model has line total
   * and quantity but unit price is missing or zero.
   */
  function effectiveUnitPrice(quantity, unitPrice, totalPrice) {
    var q = parseInt(quantity, 10);
    if (isNaN(q)) q = 0;
    var u = parseFloat(unitPrice);
    var t = parseFloat(totalPrice);
    if (!isNaN(u) && u > 0) return u;
    if (q > 0 && !isNaN(t)) return t / q;
    return !isNaN(u) ? u : 0;
  }

  function normalizeItemDescription(value) {
    var original = String(value || '').replace(/\s+/g, ' ').trim();
    if (!original) return '';
    var text = original;
    text = text.replace(/^\d+\s*(?:x|×)?\s+/i, '');
    text = text.replace(/\s*\(\d+\)\s*$/, '');
    var atIdx = text.search(/\s+@\s*[€$£]?\s*\d/i);
    if (atIdx >= 0) text = text.substring(0, atIdx);
    var xIdx = text.search(/\s+x\s*\d+\b/i);
    if (xIdx >= 0) text = text.substring(0, xIdx);
    text = text.replace(/\s+[€$£]\s*\d+(?:[.,]\d+)?(?:\s+[€$£]\s*\d+(?:[.,]\d+)?)?\s*$/, '');
    text = text.replace(/[-,:;]+$/, '').replace(/\s+/g, ' ').trim();
    return text || original;
  }

  function formatMoney(value) {
    var n = parseFloat(value);
    if (isNaN(n)) n = 0;
    return n.toFixed(2);
  }

  function formatBillDateDisplay(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatUploadDateDisplay(isoOrStr) {
    if (!isoOrStr) return '';
    var d = new Date(isoOrStr);
    if (isNaN(d.getTime())) return String(isoOrStr);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  global.SplitifyFormatters = {
    effectiveUnitPrice: effectiveUnitPrice,
    normalizeItemDescription: normalizeItemDescription,
    formatMoney: formatMoney,
    formatBillDateDisplay: formatBillDateDisplay,
    formatUploadDateDisplay: formatUploadDateDisplay
  };
})(typeof window !== 'undefined' ? window : this);
