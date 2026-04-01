(function (global) {
  var rootEl;
  var uploadState = { imageData: null, draft: null };

  function roundMoney2(n) {
    return Math.round(n * 100) / 100;
  }

  function parseMoney(str) {
    if (str == null) return NaN;
    var s = String(str).trim().replace(',', '.');
    if (!s) return NaN;
    return parseFloat(s);
  }

  function formatMoney2(n) {
    return (typeof n === 'number' && !isNaN(n) ? n : 0).toFixed(2);
  }

  // Next total paid when pressing + : smallest strictly above P0 among
  // tip-€5, 5/10/15%, and total-€5 milestones.
  function totalPaidNextStepUp(P0, B) {
    var Bc = Math.round(B * 100);
    var P0c = Math.round(P0 * 100);
    if (Bc < 0 || P0c < Bc) P0c = Bc;
    var T0c = P0c - Bc;
    var entries = [];

    var tipNext = Math.floor(T0c / 500) * 500 + 500;
    entries.push({ c: Bc + tipNext, pri: 0, driver: 'tip' });

    var mults = [1.05, 1.1, 1.15];
    for (var i = 0; i < mults.length; i++) {
      var pc = Math.round(B * mults[i] * 100);
      if (pc > P0c) entries.push({ c: pc, pri: 1, driver: 'pct' });
    }

    var totalNext = Math.floor(P0c / 500) * 500;
    if (totalNext <= P0c) totalNext += 500;
    entries.push({ c: totalNext, pri: 2, driver: 'total' });

    var best = null;
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      if (e.c <= P0c || e.c < Bc) continue;
      if (best === null || e.c < best.c || (e.c === best.c && e.pri < best.pri)) best = e;
    }
    if (best === null) return { paid: roundMoney2(P0), driver: 'total' };
    return { paid: best.c / 100, driver: best.driver };
  }

  // Previous total paid when pressing - : largest strictly below P0,
  // never below bill total.
  function totalPaidNextStepDown(P0, B) {
    var Bc = Math.round(B * 100);
    var P0c = Math.round(P0 * 100);
    if (P0c < Bc) P0c = Bc;
    var T0c = P0c - Bc;
    var entries = [];

    if (T0c > 0) {
      var tipPrev;
      if (T0c % 500 === 0) tipPrev = T0c - 500;
      else tipPrev = Math.floor((T0c - 1) / 500) * 500;
      if (tipPrev >= 0) entries.push({ c: Bc + tipPrev, pri: 0, driver: 'tip' });
    }

    var mults = [1.05, 1.1, 1.15];
    for (var i = 0; i < mults.length; i++) {
      var pc = Math.round(B * mults[i] * 100);
      if (pc < P0c && pc >= Bc) entries.push({ c: pc, pri: 1, driver: 'pct' });
    }

    var totalPrev = Math.floor((P0c - 1) / 500) * 500;
    if (totalPrev >= Bc) entries.push({ c: totalPrev, pri: 2, driver: 'total' });

    var best = null;
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      if (e.c >= P0c || e.c < Bc) continue;
      if (best === null || e.c > best.c || (e.c === best.c && e.pri < best.pri)) best = e;
    }
    if (best === null) return { paid: roundMoney2(B), driver: 'tip' };
    return { paid: best.c / 100, driver: best.driver };
  }

  function init(el) {
    rootEl = el;
    render();
  }

  function closeUploaderSourcePicker() {
    var picker = document.getElementById('uploader-source-picker');
    var trigger = document.getElementById('upload-bill-trigger');
    if (picker) picker.setAttribute('hidden', '');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function render() {
    if (!rootEl) return;
    var camSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    var galSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';

    rootEl.innerHTML =
      '<main class="panel">' +
      '<h1>Splitify</h1>' +
      '<p class="muted">Upload a bill image to create a shareable claim link.</p>' +
      '<div class="uploader-upload-actions">' +
      '<button type="button" id="upload-bill-trigger" class="btn" aria-expanded="false" aria-controls="uploader-source-picker">Upload Bill Image</button>' +
      '<div id="uploader-source-picker" class="uploader-source-picker" hidden>' +
      '<p class="uploader-source-picker__hint">Take a photo or choose from gallery or files.</p>' +
      '<div class="uploader-upload-buttons">' +
      '<input type="file" accept="image/*" capture="environment" id="bill-camera" class="uploader-file-input" aria-hidden="true">' +
      '<input type="file" accept="image/*" id="bill-gallery" class="uploader-file-input" aria-hidden="true">' +
      '<label class="uploader-pick-btn uploader-pick-btn--camera" for="bill-camera" title="Take photo with camera">' +
      '<span class="uploader-pick-btn__icon" aria-hidden="true">' + camSvg + '</span>' +
      '<span class="uploader-pick-btn__text">Camera</span></label>' +
      '<label class="uploader-pick-btn uploader-pick-btn--gallery" for="bill-gallery" title="Choose image from gallery or file">' +
      '<span class="uploader-pick-btn__icon" aria-hidden="true">' + galSvg + '</span>' +
      '<span class="uploader-pick-btn__text">Gallery / File</span></label>' +
      '</div></div></div>' +
      '<div id="upload-status" class="status"></div>' +
      '<div id="verify-box"></div>' +
      '</main>' +
      '<p class="uploader-cartoon-caption">Okay, Who had wine, and who only had water?</p>';

    document.getElementById('upload-bill-trigger').addEventListener('click', function () {
      var picker = document.getElementById('uploader-source-picker');
      if (!picker) return;
      var willOpen = picker.hasAttribute('hidden');
      if (willOpen) {
        picker.removeAttribute('hidden');
        this.setAttribute('aria-expanded', 'true');
      } else {
        picker.setAttribute('hidden', '');
        this.setAttribute('aria-expanded', 'false');
      }
    });

    function bindFileInput(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', onFilePicked);
    }
    bindFileInput('bill-camera');
    bindFileInput('bill-gallery');
  }

  function onFilePicked(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    closeUploaderSourcePicker();
    setStatus('Preparing image...');
    var compressPromise = SplitifyImageCompress.compressBillImage(file);
    if (typeof SplitifyWorking !== 'undefined' && SplitifyWorking.withWorking) {
      compressPromise = SplitifyWorking.withWorking(compressPromise, 'Working: preparing image...');
    }
    compressPromise
      .then(function (data) {
        uploadState.imageData = data;
        return SplitifyAPI.getActiveBillModel().catch(function () { return null; }).then(function (info) {
          var modelId = info && info.modelId ? info.modelId : '';
          if (modelId) setStatus('Analyzing bill with AI (' + modelId + ')...');
          else setStatus('Analyzing bill with AI...');
          return SplitifyAPI.analyzeBillImage(data).then(function (draft) {
            if (!draft.modelId && modelId) draft.modelId = modelId;
            return draft;
          });
        });
      })
      .then(function (draft) {
        uploadState.draft = draft;
        renderVerification(draft);
      })
      .catch(function (err) {
        setStatus(err.message || String(err), true);
      });
  }

  function renderVerification(draft) {
    var el = document.getElementById('verify-box');
    if (!el) return;
    var billTotal = parseFloat(draft.billTotal) || 0;
    el.innerHTML =
      '<div class="card">' +
      '<h2>Verify</h2>' +
      '<p>Bill date: <strong>' + SplitifyFormatters.formatBillDateDisplay(draft.billDate) + '</strong></p>' +
      '<p>Detected total: <strong>€ ' + SplitifyFormatters.formatMoney(billTotal) + '</strong></p>' +
      '<div class="tip-stack">' +
      '<label class="field-label" for="tip-amount">Tip (EUR)</label>' +
      '<div class="tip-inline tip-inline--narrow">' +
      '<input id="tip-amount" class="text-input text-input--narrow verify-money-input" value="" inputmode="decimal">' +
      '<span class="tip-pct" id="tip-pct" aria-live="polite">0%</span>' +
      '</div>' +
      '<label class="field-label" for="total-paid">Total paid (incl. tip)</label>' +
      '<div class="total-stepper total-stepper--narrow">' +
      '<button type="button" class="step-btn" id="total-minus" aria-label="Decrease total paid">−</button>' +
      '<input id="total-paid" class="text-input text-input--narrow verify-money-input" inputmode="decimal">' +
      '<button type="button" class="step-btn" id="total-plus" aria-label="Increase total paid">+</button>' +
      '</div>' +
      '</div>' +
      '<button id="finalize-btn" class="btn">Finalize And Create Share Link</button>' +
      '</div>' +
      '<div id="share-box"></div>';

    var tipInput = document.getElementById('tip-amount');
    var totalInput = document.getElementById('total-paid');
    var tipPctEl = document.getElementById('tip-pct');
    var minusBtn = document.getElementById('total-minus');
    var plusBtn = document.getElementById('total-plus');
    var syncLock = false;

    function tipDisplayFromAmount(t) {
      if (t <= 1e-6) return '';
      return formatMoney2(t);
    }

    function currentTotalForStep() {
      var p0 = parseMoney(totalInput.value);
      if (isNaN(p0)) p0 = billTotal;
      return Math.max(roundMoney2(p0), billTotal);
    }

    function refreshMinusEnabled() {
      minusBtn.disabled = currentTotalForStep() <= billTotal + 1e-6;
    }

    function updateTipPctLabel() {
      if (!(billTotal > 0)) {
        tipPctEl.textContent = '—';
        return;
      }
      var tot = parseMoney(totalInput.value);
      if (isNaN(tot)) {
        tipPctEl.textContent = '—';
        return;
      }
      var tipAmt = roundMoney2(tot - billTotal);
      if (tipAmt <= 1e-6) {
        tipPctEl.textContent = '0%';
        return;
      }
      tipPctEl.textContent = ((tipAmt / billTotal) * 100).toFixed(1) + '%';
    }

    function flashStepDriver(driver) {
      var target = driver === 'tip' ? tipInput : (driver === 'pct' ? tipPctEl : totalInput);
      if (!target) return;
      target.classList.add('flash-bold');
      window.setTimeout(function () {
        target.classList.remove('flash-bold');
      }, 900);
    }

    function applyTotalPaid(paid) {
      var p = roundMoney2(paid);
      if (p < billTotal) p = billTotal;
      var tipAmt = roundMoney2(p - billTotal);
      syncLock = true;
      totalInput.value = formatMoney2(p);
      tipInput.value = tipDisplayFromAmount(tipAmt);
      syncLock = false;
      updateTipPctLabel();
      refreshMinusEnabled();
    }

    function onTipInput() {
      if (syncLock) return;
      syncLock = true;
      var s = tipInput.value.trim();
      if (!s) {
        totalInput.value = formatMoney2(billTotal);
      } else {
        var t = parseMoney(s);
        if (!isNaN(t) && t >= 0) totalInput.value = formatMoney2(roundMoney2(billTotal + t));
      }
      syncLock = false;
      updateTipPctLabel();
      refreshMinusEnabled();
    }

    function onTotalInput() {
      if (syncLock) return;
      syncLock = true;
      var s = totalInput.value.trim();
      if (!s) {
        tipInput.value = '';
      } else {
        var tot = parseMoney(s);
        if (!isNaN(tot) && tot >= 0) tipInput.value = tipDisplayFromAmount(roundMoney2(tot - billTotal));
      }
      syncLock = false;
      updateTipPctLabel();
      refreshMinusEnabled();
    }

    applyTotalPaid(roundMoney2(billTotal * 1.1));

    tipInput.addEventListener('input', onTipInput);
    tipInput.addEventListener('blur', function () {
      if (syncLock) return;
      var s = tipInput.value.trim();
      if (!s) {
        applyTotalPaid(billTotal);
        return;
      }
      var t = parseMoney(s);
      if (isNaN(t) || t < 0) {
        applyTotalPaid(billTotal);
        return;
      }
      applyTotalPaid(roundMoney2(billTotal + t));
    });

    totalInput.addEventListener('input', onTotalInput);
    totalInput.addEventListener('blur', function () {
      if (syncLock) return;
      var raw = totalInput.value.trim();
      if (!raw) {
        applyTotalPaid(billTotal);
        return;
      }
      var tot = parseMoney(raw);
      if (isNaN(tot) || tot < billTotal) {
        applyTotalPaid(billTotal);
        return;
      }
      applyTotalPaid(tot);
    });

    minusBtn.addEventListener('click', function () {
      var step = totalPaidNextStepDown(currentTotalForStep(), billTotal);
      applyTotalPaid(step.paid);
      flashStepDriver(step.driver);
    });
    plusBtn.addEventListener('click', function () {
      var step = totalPaidNextStepUp(currentTotalForStep(), billTotal);
      applyTotalPaid(step.paid);
      flashStepDriver(step.driver);
    });

    document.getElementById('finalize-btn').addEventListener('click', onFinalize);
    setStatus('Review total paid, then finalize.');
  }

  function onFinalize() {
    var input = document.getElementById('total-paid');
    var paid = parseFloat(String(input.value || '').replace(',', '.'));
    if (isNaN(paid) || paid < 0) {
      setStatus('Enter a valid total paid amount.', true);
      return;
    }
    setStatus('Saving bill...');
    SplitifyAPI.completeBillUpload({
      jobId: uploadState.draft.jobId,
      base64: uploadState.imageData.base64,
      mimeType: uploadState.imageData.mimeType
    })
      .then(function (res) {
        return SplitifyAPI.updateBillTotalPaid({ billId: res.billId, totalPaid: paid }).then(function () { return res; });
      })
      .then(showShareLink)
      .catch(function (err) {
        setStatus(err.message || String(err), true);
      });
  }

  function showShareLink(res) {
    var shareUrl = window.location.origin + window.location.pathname.replace(/index\.html$/i, '') + 'bill.html?billId=' + encodeURIComponent(res.billId);
    var box = document.getElementById('share-box');
    box.innerHTML =
      '<div class="card">' +
      '<h2>Bill Created</h2>' +
      '<p>Share this link with friends to claim items.</p>' +
      '<a href="' + shareUrl + '" class="share-link">' + shareUrl + '</a>' +
      '<div class="button-row">' +
      '<button id="copy-link-btn" class="btn btn--secondary">Copy Link</button>' +
      '<a href="' + shareUrl + '" class="btn">Open Link</a>' +
      '</div>' +
      '</div>';
    var copyBtn = document.getElementById('copy-link-btn');
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(shareUrl).then(function () {
        copyBtn.textContent = 'Copied';
      }).catch(function () {
        copyBtn.textContent = 'Copy failed';
      });
    });
    navigator.clipboard.writeText(shareUrl).catch(function () {});
    setStatus('Bill saved and share link ready.');
  }

  function setStatus(text, isError) {
    var el = document.getElementById('upload-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (isError ? ' status--error' : '');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.SplitifyUploaderPage = { init: init };
})(typeof window !== 'undefined' ? window : this);
