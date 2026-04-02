(function (global) {
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
    formatMoney: formatMoney,
    formatBillDateDisplay: formatBillDateDisplay,
    formatUploadDateDisplay: formatUploadDateDisplay
  };
})(typeof window !== 'undefined' ? window : this);
