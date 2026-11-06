(function (global) {
  function normalizeName(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, '').trim();
  }

  function slotKey(rowIndex, unitIndex) {
    return String(rowIndex) + '_' + String(unitIndex);
  }

  function emptySlotInfo(portionCount) {
    return {
      portionCount: Math.max(1, portionCount || 1),
      byIndex: {}
    };
  }

  function buildClaimMap(claims) {
    var map = {};
    var arr = claims || [];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      var key = slotKey(c.rowIndex, c.unitIndex);
      var portionCount = Math.max(1, parseInt(c.portionCount, 10) || 1);
      var portionIndex = parseInt(c.portionIndex, 10);
      if (isNaN(portionIndex)) portionIndex = 0;
      if (!map[key]) map[key] = emptySlotInfo(portionCount);
      map[key].portionCount = portionCount;
      map[key].byIndex[portionIndex] = c.userName || '';
    }
    return map;
  }

  function getSlotInfo(claimMap, rowIndex, unitIndex) {
    var info = claimMap && claimMap[slotKey(rowIndex, unitIndex)];
    if (!info) return emptySlotInfo(1);
    return info;
  }

  function getTakenCount(info) {
    return Object.keys(info.byIndex || {}).length;
  }

  function isPortionCountLocked(claimMap, rowIndex, unitIndex) {
    var info = getSlotInfo(claimMap, rowIndex, unitIndex);
    return getTakenCount(info) > 0;
  }

  function getSlotState(claimMap, currentUser, rowIndex, unitIndex) {
    var info = getSlotInfo(claimMap, rowIndex, unitIndex);
    var taken = getTakenCount(info);
    if (!taken) return 'available';

    var me = normalizeName(currentUser);
    var myCount = 0;
    var otherCount = 0;
    var indexes = Object.keys(info.byIndex);
    for (var i = 0; i < indexes.length; i++) {
      if (normalizeName(info.byIndex[indexes[i]]) === me) myCount++;
      else otherCount++;
    }

    var portionCount = info.portionCount || 1;
    if (portionCount === 1 && taken === 1) {
      return myCount ? 'claimed-by-me' : 'claimed-by-other';
    }
    if (myCount && otherCount) return 'shared-by-me';
    if (myCount) {
      return myCount >= portionCount ? 'claimed-by-me' : 'shared-by-me';
    }
    return otherCount >= portionCount ? 'claimed-by-other' : 'shared-by-other';
  }

  function getMyPortions(claimMap, currentUser, rowIndex, unitIndex) {
    var info = getSlotInfo(claimMap, rowIndex, unitIndex);
    var me = normalizeName(currentUser);
    var out = [];
    var indexes = Object.keys(info.byIndex);
    for (var i = 0; i < indexes.length; i++) {
      var idx = parseInt(indexes[i], 10);
      if (normalizeName(info.byIndex[indexes[i]]) === me) out.push(idx);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function getOtherClaimants(claimMap, currentUser, rowIndex, unitIndex) {
    var info = getSlotInfo(claimMap, rowIndex, unitIndex);
    var me = normalizeName(currentUser);
    var names = {};
    var indexes = Object.keys(info.byIndex);
    for (var i = 0; i < indexes.length; i++) {
      var n = String(info.byIndex[indexes[i]] || '').trim();
      if (!n) continue;
      if (normalizeName(n) === me) continue;
      names[n] = true;
    }
    return Object.keys(names).sort();
  }

  function getMySelectionFromClaims(claims, currentUser) {
    var arr = claims || [];
    var target = normalizeName(currentUser);
    var bySlot = {};
    for (var i = 0; i < arr.length; i++) {
      if (normalizeName(arr[i].userName) !== target) continue;
      var key = slotKey(arr[i].rowIndex, arr[i].unitIndex);
      var portionCount = Math.max(1, parseInt(arr[i].portionCount, 10) || 1);
      var portionIndex = parseInt(arr[i].portionIndex, 10);
      if (isNaN(portionIndex)) portionIndex = 0;
      if (!bySlot[key]) {
        bySlot[key] = {
          rowIndex: arr[i].rowIndex,
          unitIndex: arr[i].unitIndex,
          portionCount: portionCount,
          portions: []
        };
      }
      bySlot[key].portionCount = portionCount;
      bySlot[key].portions.push(portionIndex);
    }
    var out = [];
    var keys = Object.keys(bySlot);
    for (var k = 0; k < keys.length; k++) {
      var entry = bySlot[keys[k]];
      entry.portions.sort(function (a, b) { return a - b; });
      if (entry.portionCount === 1) {
        out.push({ rowIndex: entry.rowIndex, unitIndex: entry.unitIndex });
      } else {
        out.push({
          rowIndex: entry.rowIndex,
          unitIndex: entry.unitIndex,
          portionCount: entry.portionCount,
          portions: entry.portions.slice()
        });
      }
    }
    return out;
  }

  function isShareSelection(sel) {
    return !!(sel && Array.isArray(sel.portions) && sel.portions.length && (sel.portionCount || 1) > 1);
  }

  function selectionKey(sel) {
    return slotKey(sel.rowIndex, sel.unitIndex);
  }

  function selectionFraction(sel) {
    if (!sel) return 0;
    if (isShareSelection(sel)) {
      return sel.portions.length / Math.max(1, sel.portionCount);
    }
    return 1;
  }

  function formatQuantityLabel(portions, portionCount) {
    var p = parseInt(portions, 10) || 0;
    var d = Math.max(1, parseInt(portionCount, 10) || 1);
    if (d === 1) {
      if (p <= 1) return '';
      return 'x' + p;
    }
    return 'x' + p + '/' + d;
  }

  function formatClaimCountLabel(portions, portionCount) {
    var p = parseInt(portions, 10) || 0;
    var d = Math.max(1, parseInt(portionCount, 10) || 1);
    if (d === 1) return String(p);
    return p + '/' + d;
  }

  function applySelectionToClaimMap(baseMap, selection, userName) {
    var map = {};
    var base = baseMap || {};
    var baseKeys = Object.keys(base);
    for (var i = 0; i < baseKeys.length; i++) {
      var src = base[baseKeys[i]];
      var copy = emptySlotInfo(src.portionCount);
      copy.portionCount = src.portionCount;
      var idxs = Object.keys(src.byIndex || {});
      for (var j = 0; j < idxs.length; j++) {
        copy.byIndex[idxs[j]] = src.byIndex[idxs[j]];
      }
      map[baseKeys[i]] = copy;
    }
    var arr = selection || [];
    for (var s = 0; s < arr.length; s++) {
      var sel = arr[s];
      var key = selectionKey(sel);
      if (isShareSelection(sel)) {
        if (!map[key]) map[key] = emptySlotInfo(sel.portionCount);
        map[key].portionCount = sel.portionCount;
        for (var p = 0; p < sel.portions.length; p++) {
          map[key].byIndex[sel.portions[p]] = userName;
        }
      } else {
        map[key] = emptySlotInfo(1);
        map[key].byIndex[0] = userName;
      }
    }
    return map;
  }

  function buildClaimMapExcludingUser(claims, userName) {
    var target = normalizeName(userName);
    var filtered = (claims || []).filter(function (c) {
      return normalizeName(c.userName) !== target;
    });
    return buildClaimMap(filtered);
  }

  function toSubmitPayload(selection) {
    var arr = selection || [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var sel = arr[i];
      if (isShareSelection(sel)) {
        out.push({
          rowIndex: sel.rowIndex,
          unitIndex: sel.unitIndex,
          portionCount: sel.portionCount,
          portions: sel.portions.slice()
        });
      } else {
        out.push({ rowIndex: sel.rowIndex, unitIndex: sel.unitIndex });
      }
    }
    return out;
  }

  function selectionUnchanged(cur, orig) {
    var a = toSubmitPayload(cur);
    var b = toSubmitPayload(orig);
    if (a.length !== b.length) return false;
    function makeKey(s) {
      if (s.portions && s.portions.length) {
        return s.rowIndex + '_' + s.unitIndex + ':' + s.portionCount + ':' + s.portions.join(',');
      }
      return s.rowIndex + '_' + s.unitIndex + ':full';
    }
    var origKeys = {};
    for (var i = 0; i < b.length; i++) origKeys[makeKey(b[i])] = true;
    for (var j = 0; j < a.length; j++) {
      if (!origKeys[makeKey(a[j])]) return false;
    }
    return true;
  }

  global.SplitifyClaimsState = {
    normalizeName: normalizeName,
    slotKey: slotKey,
    buildClaimMap: buildClaimMap,
    buildClaimMapExcludingUser: buildClaimMapExcludingUser,
    getSlotInfo: getSlotInfo,
    getSlotState: getSlotState,
    getMyPortions: getMyPortions,
    getOtherClaimants: getOtherClaimants,
    isPortionCountLocked: isPortionCountLocked,
    getMySelectionFromClaims: getMySelectionFromClaims,
    isShareSelection: isShareSelection,
    selectionKey: selectionKey,
    selectionFraction: selectionFraction,
    formatQuantityLabel: formatQuantityLabel,
    formatClaimCountLabel: formatClaimCountLabel,
    applySelectionToClaimMap: applySelectionToClaimMap,
    toSubmitPayload: toSubmitPayload,
    selectionUnchanged: selectionUnchanged
  };
})(typeof window !== 'undefined' ? window : this);
