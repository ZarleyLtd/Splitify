(function (global) {
  var IMAGE_BASE = 'assets/images/';

  /** Exact category slug (lowercase) -> SVG filename in assets/images */
  var SLUG_TO_FILE = {
    'drink.beer': 'drink-beer.svg',
    'drink.wine': 'drink-wine.svg',
    'drink.spirit': 'drink-spirit.svg',
    'drink.cold_soft': 'drink-cold-soft.svg',
    'drink.hot': 'drink-hot.svg',
    'drink.other': 'drink-other.svg',
    'food.sandwich': 'food-sandwich.svg',
    'food.wrap': 'food-wrap.svg',
    'food.burger': 'food-burger.svg',
    'food.pizza': 'food-pizza.svg',
    'food.rice': 'food-rice.svg',
    'food.curry': 'food-curry.svg',
    'food.noodles': 'food-noodles.svg',
    'food.plate': 'food-plate.svg',
    'food.salad': 'food-salad.svg',
    'food.soup': 'food-soup.svg',
    'food.fried_side': 'food-fried-side.svg',
    'food.pastry': 'food-pastry.svg',
    'food.dessert': 'food-dessert.svg',
    'food.other': 'food-other.svg'
  };

  /** Optional description hints when category slug is missing or wrong (most specific first). */
  var KEYWORD_RULES = [
    { keys: ['guinness', 'stout', 'porter'], file: 'drink-beer.svg' },
    { keys: ['prosecco', 'champagne', 'cava', 'sparkling'], file: 'drink-wine.svg' },
    { keys: ['wine', '175ml', '125ml', '250ml'], file: 'drink-wine.svg' },
    { keys: ['vodka', 'gin', 'whisk', 'whiskey', 'rum', 'brandy', 'shot', 'spirit'], file: 'drink-spirit.svg' },
    { keys: ['cocktail', 'mojito', 'martini'], file: 'drink-spirit.svg' },
    { keys: ['coffee', 'latte', 'cappuccino', 'espresso', 'americano', 'tea ', 'tea-', 'chai'], file: 'drink-hot.svg' },
    { keys: ['coke', 'cola', 'pepsi', 'lemonade', 'juice', 'water', 'tonic', 'soda', 'fanta', 'sprite'], file: 'drink-cold-soft.svg' },
    { keys: ['lager', 'ale', 'beer', 'pint', 'cider', 'ipa'], file: 'drink-beer.svg' },
    { keys: ['burrito', 'wrap', 'fajita', 'gyro', 'kebab'], file: 'food-wrap.svg' },
    { keys: ['burger', 'slider'], file: 'food-burger.svg' },
    { keys: ['pizza'], file: 'food-pizza.svg' },
    { keys: ['ramen', 'noodle', 'pasta', 'spaghetti', 'pad thai', 'udon'], file: 'food-noodles.svg' },
    { keys: ['curry', 'korma', 'masala', 'daal', 'dahl', 'tagine', 'chili', 'chilli'], file: 'food-curry.svg' },
    { keys: ['biryani', 'fried rice', 'risotto', 'pilaf', 'paella'], file: 'food-rice.svg' },
    { keys: ['rice'], file: 'food-rice.svg' },
    { keys: ['salad'], file: 'food-salad.svg' },
    { keys: ['soup', 'broth', 'bisque'], file: 'food-soup.svg' },
    { keys: ['fries', 'chips', 'wings', 'nuggets', 'goujon', 'onion ring'], file: 'food-fried-side.svg' },
    { keys: ['sandwich', 'panini', 'toastie', 'sub ', 'blt'], file: 'food-sandwich.svg' },
    { keys: ['pie', 'pasty', 'sausage roll', 'quiche'], file: 'food-pastry.svg' },
    { keys: ['cake', 'ice cream', 'dessert', 'pudding', 'cheesecake', 'brownie'], file: 'food-dessert.svg' }
  ];

  function resolveIconPath(image) {
    var im = String(image || '').trim();
    if (!im) return null;
    if (im.indexOf('http://') === 0 || im.indexOf('https://') === 0) return im;
    if (im.indexOf('assets/') === 0) return im;
    return IMAGE_BASE + im;
  }

  function getImageFromConfig(productIcons, description, category) {
    if (!productIcons || !productIcons.length) return null;
    var cat = String(category || '').trim().toLowerCase();
    var d = String(description || '').toLowerCase();
    var i;
    for (i = 0; i < productIcons.length; i++) {
      var p = productIcons[i];
      if ((p.kind || 'description') === 'category' && p.product && cat && String(p.product).toLowerCase() === cat) {
        return resolveIconPath(p.image);
      }
    }
    var best = null;
    var bestLen = 0;
    for (i = 0; i < productIcons.length; i++) {
      p = productIcons[i];
      if ((p.kind || 'description') !== 'description' || !d) continue;
      var key = String(p.product || '').toLowerCase().trim();
      var image = String(p.image || '').trim();
      if (!key || !image) continue;
      if (d.indexOf(key) >= 0 && key.length > bestLen) {
        best = image;
        bestLen = key.length;
      }
    }
    return best ? resolveIconPath(best) : null;
  }

  function slugToAssetFile(category) {
    var k = String(category || '').trim().toLowerCase();
    return SLUG_TO_FILE[k] || null;
  }

  function keywordAssetFile(description) {
    var d = String(description || '').toLowerCase();
    var r;
    var ki;
    for (r = 0; r < KEYWORD_RULES.length; r++) {
      var rule = KEYWORD_RULES[r];
      for (ki = 0; ki < rule.keys.length; ki++) {
        if (d.indexOf(rule.keys[ki]) >= 0) return rule.file;
      }
    }
    return null;
  }

  function defaultAssetFile(category) {
    var k = String(category || '').trim().toLowerCase();
    if (!k) return 'default-other.svg';
    if (k === 'other') return 'default-other.svg';
    if (k === 'food' || k.indexOf('food.') === 0) return 'default-food.svg';
    if (k === 'drink' || k.indexOf('drink.') === 0) return 'default-drink.svg';
    return 'default-other.svg';
  }

  function resolveImageSrc(category, description, productIcons) {
    var configSrc = getImageFromConfig(productIcons, description, category);
    if (configSrc) return configSrc;
    var slugFile = slugToAssetFile(category);
    if (slugFile) return IMAGE_BASE + slugFile;
    var kwFile = keywordAssetFile(description);
    if (kwFile) return IMAGE_BASE + kwFile;
    return IMAGE_BASE + defaultAssetFile(category);
  }

  function badgeHtml(st, claimMap, currentUser, rowIndex, unitIndex) {
    if (st === 'claimed-by-me') {
      return '<span class="claims-slot-btn__tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg></span>';
    }
    if (st === 'shared-by-me' || st === 'shared-by-other') {
      var info = SplitifyClaimsState.getSlotInfo(claimMap, rowIndex, unitIndex);
      var filled;
      if (st === 'shared-by-me') {
        filled = SplitifyClaimsState.getMyPortions(claimMap, currentUser, rowIndex, unitIndex);
      } else {
        filled = Object.keys(info.byIndex || {}).map(function (k) { return parseInt(k, 10); });
      }
      if (global.SplitifyShareClaimDialog && typeof global.SplitifyShareClaimDialog.buildMiniPieBadge === 'function') {
        return global.SplitifyShareClaimDialog.buildMiniPieBadge(info.portionCount, filled);
      }
      return '<span class="claims-slot-btn__pie claims-slot-btn__pie--fallback" aria-hidden="true"></span>';
    }
    return '';
  }

  function ariaForState(st, otherNames) {
    if (st === 'claimed-by-me') return 'Claimed by me';
    if (st === 'shared-by-me') return 'Shared claim — tap to edit portions';
    if (st === 'claimed-by-other') return 'Claimed by ' + (otherNames[0] || 'another user');
    if (st === 'shared-by-other') {
      return otherNames.length
        ? ('Partially shared with ' + otherNames.join(', ') + ' — tap to claim a portion')
        : 'Partially shared — tap to claim a portion';
    }
    return 'Available to claim';
  }

  function portionToggleSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>' +
      '<path d="M12 3v9l6.5 3.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>';
  }

  function canShare(st) {
    return st === 'available' || st === 'claimed-by-me' || st === 'shared-by-me' || st === 'shared-by-other';
  }

  function setPortionModeUi(row, toggle, on) {
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.classList.toggle('product-row__portion-toggle--on', on);
    row.classList.toggle('product-row--portion-claim', on);
    toggle.title = on ? 'Portion claim mode on' : 'Portion claim mode';
  }

  function render(opts) {
    opts = opts || {};
    var row = document.createElement('div');
    row.className = 'product-row';
    var portionMode = !!opts.portionClaimMode;

    var header = document.createElement('div');
    header.className = 'product-row__header';

    if (!opts.readOnly) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'product-row__portion-toggle';
      toggle.setAttribute('aria-label', 'Portion claim mode');
      toggle.innerHTML = portionToggleSvg();
      setPortionModeUi(row, toggle, portionMode);
      toggle.addEventListener('click', function () {
        portionMode = !portionMode;
        setPortionModeUi(row, toggle, portionMode);
        if (opts.onPortionClaimModeChange) opts.onPortionClaimModeChange(portionMode);
      });
      toggle.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      header.appendChild(toggle);
    } else if (portionMode) {
      row.classList.add('product-row--portion-claim');
    }

    var title = document.createElement('div');
    title.className = 'product-row__title';
    title.textContent = opts.description + ' (' + opts.slots.length + ')';
    header.appendChild(title);
    row.appendChild(header);

    var stripWrap = document.createElement('div');
    stripWrap.className = 'product-row__strip-wrap';
    var chips = document.createElement('div');
    chips.className = 'product-row__chips';
    var slots = opts.slots || [];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var wrap = document.createElement('div');
      wrap.className = 'claims-slot';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'claims-slot-btn';
      var st = SplitifyClaimsState.getSlotState(opts.claimMap, opts.currentUser, s.rowIndex, s.unitIndex);
      btn.className += ' ' + st;
      wrap.className += ' ' + st;
      var otherNames = SplitifyClaimsState.getOtherClaimants(opts.claimMap, opts.currentUser, s.rowIndex, s.unitIndex);
      btn.setAttribute('aria-label', ariaForState(st, otherNames));
      btn.title = ariaForState(st, otherNames);
      btn.innerHTML = '<img class="claims-slot-btn__img" src="' + resolveImageSrc(opts.category, opts.description, opts.productIcons) + '" alt="" draggable="false">' +
        badgeHtml(st, opts.claimMap, opts.currentUser, s.rowIndex, s.unitIndex);
      if (opts.readOnly) btn.disabled = true;
      wrap.appendChild(btn);

      (function (rowIndex, unitIndex, slotState, buttonEl) {
        if (opts.readOnly) return;
        buttonEl.addEventListener('click', function () {
          if (slotState === 'claimed-by-other') {
            if (opts.onClaimedByOtherClick) opts.onClaimedByOtherClick(rowIndex, unitIndex, buttonEl);
            return;
          }
          if (portionMode && canShare(slotState) && opts.onSlotShare) {
            opts.onSlotShare(rowIndex, unitIndex, buttonEl);
            return;
          }
          if (opts.onSlotClick) opts.onSlotClick(rowIndex, unitIndex);
        });
        buttonEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      })(s.rowIndex, s.unitIndex, st, btn);
      chips.appendChild(wrap);
    }
    stripWrap.appendChild(chips);
    row.appendChild(stripWrap);
    return row;
  }

  global.SplitifyProductRow = { render: render, resolveImageSrc: resolveImageSrc };
})(typeof window !== 'undefined' ? window : this);
