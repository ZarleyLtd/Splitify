(function (global) {
  var pendingCount = 0;
  var overlayEl = null;
  var messageEl = null;
  var fallbackText = 'Working...';

  function ensureOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'working-indicator hidden';
    overlayEl.setAttribute('aria-live', 'polite');
    overlayEl.setAttribute('aria-busy', 'false');
    overlayEl.innerHTML =
      '<div class="working-indicator__panel">' +
      '<span class="working-indicator__spinner" aria-hidden="true"></span>' +
      '<span class="working-indicator__text">' + fallbackText + '</span>' +
      '</div>';
    document.body.appendChild(overlayEl);
    messageEl = overlayEl.querySelector('.working-indicator__text');
  }

  function render() {
    ensureOverlay();
    var isBusy = pendingCount > 0;
    overlayEl.classList.toggle('hidden', !isBusy);
    overlayEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  }

  function begin(message) {
    pendingCount += 1;
    ensureOverlay();
    messageEl.textContent = message || fallbackText;
    render();
    return true;
  }

  function end() {
    pendingCount = Math.max(0, pendingCount - 1);
    render();
  }

  function withWorking(promise, message) {
    begin(message);
    return Promise.resolve(promise).then(function (result) {
      end();
      return result;
    }, function (error) {
      end();
      throw error;
    });
  }

  function setMessage(message) {
    ensureOverlay();
    messageEl.textContent = message || fallbackText;
  }

  global.SplitifyWorking = {
    begin: begin,
    end: end,
    withWorking: withWorking,
    setMessage: setMessage
  };
})(typeof window !== 'undefined' ? window : this);
