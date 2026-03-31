(function (global) {
  function mount(root, opts) {
    if (!root) return;
    opts = opts || {};
    root.innerHTML =
      '<label class="field-label" for="splitify-name-input">Your name</label>' +
      '<input id="splitify-name-input" class="text-input" placeholder="Type your name">';

    var input = root.querySelector('#splitify-name-input');
    input.value = opts.initialValue || '';

    input.addEventListener('input', function () {
      if (opts.onSelect) opts.onSelect(input.value.trim());
    });
  }

  global.SplitifyNameCombobox = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
