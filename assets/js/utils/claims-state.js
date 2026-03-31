(function (global) {
  function normalizeName(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, '').trim();
  }

  function slotKey(rowIndex, unitIndex) {
    return String(rowIndex) + '_' + String(unitIndex);
  }

  function buildClaimMap(claims) {
    var map = {};
    var arr = claims || [];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      map[slotKey(c.rowIndex, c.unitIndex)] = c.userName || '';
    }
    return map;
  }

  function getSlotState(claimMap, currentUser, rowIndex, unitIndex) {
    var key = slotKey(rowIndex, unitIndex);
    var claimant = claimMap[key];
    if (!claimant) return 'available';
    if (normalizeName(claimant) === normalizeName(currentUser)) return 'claimed-by-me';
    return 'claimed-by-other';
  }

  function getMySelectionFromClaims(claims, currentUser) {
    var arr = claims || [];
    var out = [];
    var target = normalizeName(currentUser);
    for (var i = 0; i < arr.length; i++) {
      if (normalizeName(arr[i].userName) === target) {
        out.push({ rowIndex: arr[i].rowIndex, unitIndex: arr[i].unitIndex });
      }
    }
    return out;
  }

  global.SplitifyClaimsState = {
    normalizeName: normalizeName,
    slotKey: slotKey,
    buildClaimMap: buildClaimMap,
    getSlotState: getSlotState,
    getMySelectionFromClaims: getMySelectionFromClaims
  };
})(typeof window !== 'undefined' ? window : this);
