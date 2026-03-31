(function (global) {
  var IMAGE_BASE = 'assets/images/';

  function getImageFromConfig(productIcons, description) {
    if (!productIcons || !productIcons.length || !description) return null;
    var d = String(description || '').toLowerCase();
    var best = null;
    var bestLen = 0;
    for (var i = 0; i < productIcons.length; i++) {
      var key = String(productIcons[i].product || '').toLowerCase().trim();
      var image = String(productIcons[i].image || '').trim();
      if (!key || !image) continue;
      if (d.indexOf(key) >= 0 && key.length > bestLen) {
        best = image;
        bestLen = key.length;
      }
    }
    return best ? (IMAGE_BASE + best) : null;
  }

  function resolveImageSrc(category, description, productIcons) {
    var configSrc = getImageFromConfig(productIcons, description);
    if (configSrc) return configSrc;
    var d = String(description || '').toLowerCase();
    var c = String(category || '').toLowerCase();
    if (d.indexOf('fries') >= 0) return IMAGE_BASE + 'fries.png';
    if (d.indexOf('fish') >= 0) return IMAGE_BASE + 'fishChips.png';
    if (d.indexOf('sausage') >= 0) return IMAGE_BASE + 'SausageChips.png';
    if (d.indexOf('blt') >= 0) return IMAGE_BASE + 'blt.png';
    if (d.indexOf('chicken') >= 0) return IMAGE_BASE + 'chicken.png';
    if (d.indexOf('goujon') >= 0) return IMAGE_BASE + 'goujons.png';
    if (d.indexOf('panko') >= 0) return IMAGE_BASE + 'pankos.png';
    if (d.indexOf('guinness') >= 0) return IMAGE_BASE + 'GuinnessPint.png';
    if (d.indexOf('wine') >= 0) return IMAGE_BASE + 'WineRed.png';
    if (d.indexOf('lager') >= 0 || d.indexOf('beer') >= 0 || d.indexOf('pint') >= 0) return IMAGE_BASE + 'LagerPint.png';
    if (d.indexOf('vodka') >= 0 || d.indexOf('gin') >= 0 || d.indexOf('spirit') >= 0) return IMAGE_BASE + 'vodkaGin.png';
    if (c === 'drink') return IMAGE_BASE + 'LagerPint.png';
    return IMAGE_BASE + 'fries.png';
  }

  function render(opts) {
    opts = opts || {};
    var row = document.createElement('div');
    row.className = 'product-row';
    var title = document.createElement('div');
    title.className = 'product-row__title';
    title.textContent = opts.description + ' (' + opts.slots.length + ')';
    row.appendChild(title);

    var chips = document.createElement('div');
    chips.className = 'product-row__chips';
    var slots = opts.slots || [];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'claims-slot-btn';
      var st = SplitifyClaimsState.getSlotState(opts.claimMap, opts.currentUser, s.rowIndex, s.unitIndex);
      btn.className += ' ' + st;
      btn.setAttribute('aria-label', st === 'claimed-by-me' ? 'Claimed by me' : (st === 'claimed-by-other' ? 'Claimed by another user' : 'Available to claim'));
      btn.title = st === 'claimed-by-me' ? 'Claimed by me' : (st === 'claimed-by-other' ? 'Claimed by another user' : 'Available');
      btn.innerHTML = '<img class="claims-slot-btn__img" src="' + resolveImageSrc(opts.category, opts.description, opts.productIcons) + '" alt="">' +
        (st === 'claimed-by-me' ? '<span class="claims-slot-btn__tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg></span>' : '');
      if (opts.readOnly) btn.disabled = true;
      if (st === 'claimed-by-other') btn.disabled = true;
      (function (rowIndex, unitIndex) {
        btn.addEventListener('click', function () {
          if (opts.onSlotClick) opts.onSlotClick(rowIndex, unitIndex);
        });
      })(s.rowIndex, s.unitIndex);
      chips.appendChild(btn);
    }
    row.appendChild(chips);
    return row;
  }

  global.SplitifyProductRow = { render: render };
})(typeof window !== 'undefined' ? window : this);
