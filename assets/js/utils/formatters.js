(function (global) {
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
    normalizeItemDescription: normalizeItemDescription,
    formatMoney: formatMoney,
    formatBillDateDisplay: formatBillDateDisplay,
    formatUploadDateDisplay: formatUploadDateDisplay
  };
})(typeof window !== 'undefined' ? window : this);
