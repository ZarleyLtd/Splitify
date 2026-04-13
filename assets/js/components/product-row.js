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

  function render(opts) {
    opts = opts || {};
    var row = document.createElement('div');
    row.className = 'product-row';
    var title = document.createElement('div');
    title.className = 'product-row__title';
    title.textContent = opts.description + ' (' + opts.slots.length + ')';
    row.appendChild(title);

    var stripWrap = document.createElement('div');
    stripWrap.className = 'product-row__strip-wrap';
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
      var otherName = '';
      if (st === 'claimed-by-other' && opts.claimMap) {
        otherName = String(opts.claimMap[SplitifyClaimsState.slotKey(s.rowIndex, s.unitIndex)] || '').trim();
      }
      btn.setAttribute(
        'aria-label',
        st === 'claimed-by-me'
          ? 'Claimed by me'
          : (st === 'claimed-by-other'
            ? ('Claimed by ' + (otherName || 'another user'))
            : 'Available to claim')
      );
      btn.title = st === 'claimed-by-me' ? 'Claimed by me' : (st === 'claimed-by-other' ? ('Claimed by ' + (otherName || 'another user')) : 'Available');
      btn.innerHTML = '<img class="claims-slot-btn__img" src="' + resolveImageSrc(opts.category, opts.description, opts.productIcons) + '" alt="">' +
        (st === 'claimed-by-me' ? '<span class="claims-slot-btn__tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg></span>' : '');
      if (opts.readOnly) btn.disabled = true;
      (function (rowIndex, unitIndex, slotState, buttonEl) {
        buttonEl.addEventListener('click', function () {
          if (slotState === 'claimed-by-other') {
            if (opts.onClaimedByOtherClick) opts.onClaimedByOtherClick(rowIndex, unitIndex, buttonEl);
            return;
          }
          if (opts.onSlotClick) opts.onSlotClick(rowIndex, unitIndex);
        });
      })(s.rowIndex, s.unitIndex, st, btn);
      chips.appendChild(btn);
    }
    stripWrap.appendChild(chips);
    row.appendChild(stripWrap);
    return row;
  }

  global.SplitifyProductRow = { render: render, resolveImageSrc: resolveImageSrc };
})(typeof window !== 'undefined' ? window : this);
