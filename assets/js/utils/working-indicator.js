/**
 * Working indicator — delayed busy overlay (CursorSites shared pattern).
 * Canonical source: cursor-sites-shared/ui/working-indicator.js
 * Spec: cursor-sites-shared/ui/WORKING_INDICATOR.md
 */
(function (global) {
  'use strict';

  var SHOW_DELAY_MS = 500;
  var pendingCount = 0;
  var overlayEl = null;
  var messageEl = null;
  var showTimer = null;
  var fallbackText = 'Working...';

  function ensureOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'working-indicator working-indicator--hidden';
    overlayEl.setAttribute('aria-live', 'polite');
    overlayEl.setAttribute('aria-busy', 'false');
    overlayEl.innerHTML =
      '<div class="working-indicator__panel">' +
      '<span class="working-indicator__spinner" aria-hidden="true"></span>' +
      '<span class="working-indicator__text">' +
      fallbackText +
      '</span>' +
      '</div>';
    document.body.appendChild(overlayEl);
    messageEl = overlayEl.querySelector('.working-indicator__text');
  }

  function clearShowTimer() {
    if (showTimer != null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  }

  function paintVisible(visible) {
    ensureOverlay();
    overlayEl.classList.toggle('working-indicator--hidden', !visible);
    overlayEl.setAttribute('aria-busy', visible ? 'true' : 'false');
  }

  function scheduleShow() {
    if (showTimer != null || (overlayEl && !overlayEl.classList.contains('working-indicator--hidden'))) {
      return;
    }
    showTimer = setTimeout(function () {
      showTimer = null;
      if (pendingCount > 0) paintVisible(true);
    }, SHOW_DELAY_MS);
  }

  function begin(message) {
    pendingCount += 1;
    ensureOverlay();
    messageEl.textContent = message || fallbackText;
    if (pendingCount === 1) {
      scheduleShow();
    }
    return true;
  }

  function end() {
    pendingCount = Math.max(0, pendingCount - 1);
    if (pendingCount === 0) {
      clearShowTimer();
      paintVisible(false);
    }
  }

  function withWorking(promise, message) {
    begin(message);
    return Promise.resolve(promise).then(
      function (result) {
        end();
        return result;
      },
      function (error) {
        end();
        throw error;
      }
    );
  }

  function setMessage(message) {
    ensureOverlay();
    messageEl.textContent = message || fallbackText;
  }

  var api = {
    SHOW_DELAY_MS: SHOW_DELAY_MS,
    begin: begin,
    end: end,
    withWorking: withWorking,
    setMessage: setMessage
  };

  global.WorkingIndicator = api;
  // Legacy Splitify global until call sites migrate
  global.SplitifyWorking = api;
})(typeof window !== 'undefined' ? window : this);
