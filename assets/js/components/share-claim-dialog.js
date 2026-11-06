(function (global) {
  var COLORS = [
    '#4a90a4', '#c45c4a', '#d4a017', '#5a8f6b', '#7a6a9a',
    '#c47a3a', '#3d7ea6', '#8a5a6a', '#6a8f4a', '#9a6a4a'
  ];

  function polar(cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  }

  function arcPath(cx, cy, r, startAngle, sweep) {
    if (sweep >= 359.99) {
      return 'M ' + cx + ' ' + (cy - r) +
        ' A ' + r + ' ' + r + ' 0 1 1 ' + cx + ' ' + (cy + r) +
        ' A ' + r + ' ' + r + ' 0 1 1 ' + cx + ' ' + (cy - r) + ' Z';
    }
    var start = polar(cx, cy, r, startAngle);
    var end = polar(cx, cy, r, startAngle + sweep);
    var large = sweep > 180 ? 1 : 0;
    return 'M ' + cx + ' ' + cy +
      ' L ' + start.x + ' ' + start.y +
      ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + end.x + ' ' + end.y +
      ' Z';
  }

  function buildPieSvg(opts) {
    opts = opts || {};
    var portionCount = Math.max(2, Math.min(10, opts.portionCount || 2));
    var selected = opts.selected || {};
    var others = opts.others || {};
    var size = opts.size || 220;
    var cx = size / 2;
    var cy = size / 2;
    var r = size * 0.38;
    var sweep = 360 / portionCount;
    var parts = [];
    parts.push('<svg class="share-pie" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="Portion pie">');
    parts.push(
      '<defs>' +
      '<pattern id="share-pie-claimed-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">' +
      '<rect width="8" height="8" fill="#6b7280"></rect>' +
      '<line x1="0" y1="0" x2="0" y2="8" stroke="#374151" stroke-width="3"></line>' +
      '</pattern>' +
      '</defs>'
    );
    for (var i = 0; i < portionCount; i++) {
      var start = i * sweep;
      var isMine = !!selected[i];
      var otherName = others[i] ? String(others[i]) : '';
      var mid = start + sweep / 2;
      var offset = isMine && sweep < 359 ? 8 : 0;
      var ox = offset ? Math.cos((mid - 90) * Math.PI / 180) * offset : 0;
      var oy = offset ? Math.sin((mid - 90) * Math.PI / 180) * offset : 0;
      var fill = otherName
        ? 'url(#share-pie-claimed-hatch)'
        : COLORS[i % COLORS.length];
      var cls = 'share-pie__portion';
      if (isMine) cls += ' share-pie__portion--mine';
      if (otherName) cls += ' share-pie__portion--other';
      if (!isMine && !otherName) cls += ' share-pie__portion--free';
      var labelPoint = polar(cx, cy, r * 0.58, mid);
      var initial = otherName ? escapeXml(otherName.charAt(0).toUpperCase()) : '';
      parts.push(
        '<g class="' + cls + '" data-portion-index="' + i + '" data-claimed-by-other="' + (otherName ? 'true' : 'false') + '" transform="translate(' + ox + ' ' + oy + ')">' +
        '<path d="' + arcPath(cx, cy, r, start, sweep) + '" fill="' + fill + '" stroke="#fff" stroke-width="2"></path>' +
        (otherName
          ? ('<circle class="share-pie__claimed-mark" cx="' + labelPoint.x + '" cy="' + labelPoint.y + '" r="11" fill="#1f2937" stroke="#fff" stroke-width="1.5"></circle>' +
            '<text class="share-pie__claimed-initial" x="' + labelPoint.x + '" y="' + labelPoint.y + '" text-anchor="middle" dominant-baseline="central">' + initial + '</text>')
          : '') +
        '<title>' + (otherName ? ('Claimed by ' + escapeXml(otherName)) : (isMine ? 'Your portion' : 'Available portion')) + '</title>' +
        '</g>'
      );
    }
    parts.push('</svg>');
    return parts.join('');
  }

  function buildMiniPieBadge(portionCount, myIndexes, opts) {
    opts = opts || {};
    var size = opts.size || 18;
    var d = Math.max(1, portionCount || 1);
    var mine = {};
    var arr = myIndexes || [];
    for (var i = 0; i < arr.length; i++) mine[arr[i]] = true;
    var cx = size / 2;
    var cy = size / 2;
    var r = size * 0.42;
    var sweep = 360 / d;
    var html = '<span class="claims-slot-btn__pie" aria-hidden="true"><svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">';
    for (var p = 0; p < d; p++) {
      var fill = mine[p] ? '#2e6d54' : 'rgba(255,255,255,0.35)';
      html += '<path d="' + arcPath(cx, cy, r, p * sweep, sweep) + '" fill="' + fill + '" stroke="#1d3245" stroke-width="0.6"></path>';
    }
    html += '</svg></span>';
    return html;
  }

  function escapeXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeHtml(str) {
    return escapeXml(str).replace(/'/g, '&#39;');
  }

  function open(opts) {
    opts = opts || {};
    var description = opts.description || 'Item';
    var portionCount = Math.max(2, Math.min(10, opts.portionCount || 2));
    var locked = !!opts.locked;
    var currentUser = opts.currentUser || '';
    var othersByIndex = opts.othersByIndex || {};
    var selected = {};
    var initial = opts.selectedPortions || [];
    for (var i = 0; i < initial.length; i++) selected[initial[i]] = true;

    var existing = document.getElementById('share-claim-dialog');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var dialog = document.createElement('dialog');
    dialog.id = 'share-claim-dialog';
    dialog.className = 'share-claim-dialog';
    dialog.setAttribute('aria-labelledby', 'share-claim-title');

    function selectedList() {
      var out = [];
      for (var i = 0; i < portionCount; i++) if (selected[i]) out.push(i);
      return out;
    }

    function hasOtherClaims() {
      var keys = Object.keys(othersByIndex || {});
      for (var i = 0; i < keys.length; i++) {
        if (othersByIndex[keys[i]]) return true;
      }
      return false;
    }

    function renderBody() {
      var mine = selectedList().length;
      var lockNote;
      if (hasOtherClaims()) {
        lockNote = '<p class="share-claim-dialog__note">Hatched portions with initials are already claimed. Tap a free portion to claim it.</p>';
      } else if (locked) {
        lockNote = '<p class="share-claim-dialog__note">Portion count is locked because claims already exist.</p>';
      } else {
        lockNote = '<p class="share-claim-dialog__note">Choose how many equal portions, then tap yours.</p>';
      }
      dialog.innerHTML =
        '<div class="share-claim-dialog__inner">' +
        '<div class="share-claim-dialog__header">' +
        '<h2 id="share-claim-title" class="share-claim-dialog__title">Share ' + escapeHtml(description) + '</h2>' +
        '<button type="button" class="share-claim-dialog__close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="share-claim-dialog__body">' +
        lockNote +
        '<div class="share-claim-dialog__count">' +
        '<button type="button" class="btn share-claim-dialog__count-btn" data-action="dec" ' + (locked || portionCount <= 2 ? 'disabled' : '') + ' aria-label="Fewer portions">−</button>' +
        '<span class="share-claim-dialog__count-label">' + portionCount + ' portions</span>' +
        '<button type="button" class="btn share-claim-dialog__count-btn" data-action="inc" ' + (locked || portionCount >= 10 ? 'disabled' : '') + ' aria-label="More portions">+</button>' +
        '</div>' +
        '<div class="share-claim-dialog__pie-wrap">' + buildPieSvg({
          portionCount: portionCount,
          selected: selected,
          others: othersByIndex,
          size: 220
        }) + '</div>' +
        '<p class="share-claim-dialog__summary">You are claiming <strong>' + mine + '/' + portionCount + '</strong></p>' +
        '</div>' +
        '<div class="share-claim-dialog__footer">' +
        '<button type="button" class="btn share-claim-dialog__clear" data-action="clear">Clear mine</button>' +
        '<button type="button" class="btn share-claim-dialog__cancel" data-action="cancel">Cancel</button>' +
        '<button type="button" class="btn btn--primary share-claim-dialog__confirm" data-action="confirm">Confirm</button>' +
        '</div>' +
        '</div>';
      bind();
    }

    function closeDialog() {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    }

    function bind() {
      var closeBtn = dialog.querySelector('.share-claim-dialog__close');
      if (closeBtn) closeBtn.addEventListener('click', function () {
        closeDialog();
        if (opts.onCancel) opts.onCancel();
      });
      dialog.addEventListener('click', function (e) {
        if (e.target === dialog) {
          closeDialog();
          if (opts.onCancel) opts.onCancel();
        }
      });
      var dec = dialog.querySelector('[data-action="dec"]');
      var inc = dialog.querySelector('[data-action="inc"]');
      if (dec) dec.addEventListener('click', function () {
        if (locked || portionCount <= 2) return;
        portionCount -= 1;
        var next = {};
        for (var i = 0; i < portionCount; i++) if (selected[i]) next[i] = true;
        selected = next;
        renderBody();
      });
      if (inc) inc.addEventListener('click', function () {
        if (locked || portionCount >= 10) return;
        portionCount += 1;
        renderBody();
      });
      var clearBtn = dialog.querySelector('[data-action="clear"]');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        selected = {};
        renderBody();
      });
      var cancelBtn = dialog.querySelector('[data-action="cancel"]');
      if (cancelBtn) cancelBtn.addEventListener('click', function () {
        closeDialog();
        if (opts.onCancel) opts.onCancel();
      });
      var confirmBtn = dialog.querySelector('[data-action="confirm"]');
      if (confirmBtn) confirmBtn.addEventListener('click', function () {
        var portions = selectedList();
        closeDialog();
        if (opts.onConfirm) {
          opts.onConfirm({
            portionCount: portionCount,
            portions: portions
          });
        }
      });
      var pie = dialog.querySelector('.share-pie');
      if (pie) {
        pie.addEventListener('click', function (e) {
          var g = e.target.closest ? e.target.closest('[data-portion-index]') : null;
          if (!g) return;
          var idx = parseInt(g.getAttribute('data-portion-index'), 10);
          if (isNaN(idx)) return;
          if (othersByIndex[idx]) return;
          if (selected[idx]) delete selected[idx];
          else selected[idx] = true;
          renderBody();
        });
      }
    }

    document.body.appendChild(dialog);
    renderBody();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    void currentUser;
  }

  global.SplitifyShareClaimDialog = {
    open: open,
    buildMiniPieBadge: buildMiniPieBadge,
    buildPieSvg: buildPieSvg
  };
})(typeof window !== 'undefined' ? window : this);
