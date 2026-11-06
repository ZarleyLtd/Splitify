(function (global) {
  var rootEl;
  var LIGHTNING_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>' +
    '</svg>';
  /* Hex nut (top view): six flats, round hole; silvery gradient + steel outline */
  var COG_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">' +
    "<defs>" +
    '<linearGradient id="splitify-admin-nut-metal" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0%" stop-color="#e8edf4"/>' +
    '<stop offset="32%" stop-color="#c5ccd6"/>' +
    '<stop offset="55%" stop-color="#9ea8b6"/>' +
    '<stop offset="100%" stop-color="#6f7785"/>' +
    "</linearGradient>" +
    "</defs>" +
    '<path fill="url(#splitify-admin-nut-metal)" fill-rule="evenodd" stroke="#4f5664" stroke-width="0.5" stroke-linejoin="round" d="' +
    "M12 2.85 L19.84 7.43 L19.84 16.57 L12 21.15 L4.16 16.57 L4.16 7.43 Z " +
    "M15.65 12 A3.65 3.65 0 1 0 8.35 12 A3.65 3.65 0 1 0 15.65 12" +
    '"/>' +
    "</svg>";

  function renderShell() {
    rootEl.innerHTML =
      '<main class="panel panel--wide">' +
      '<div class="admin-title-row">' +
      '<h1>Splitify</h1>' +
      '<div class="admin-title-actions">' +
      '<div class="admin-god-mode">' +
      '<span class="admin-god-mode__icon">' +
      LIGHTNING_SVG +
      '</span>' +
      '<p class="admin-god-mode__label">God Mode</p>' +
      '</div>' +
      '<button type="button" id="admin-settings-open" class="admin-settings-btn" aria-label="Settings" title="Settings">' +
      COG_SVG +
      "</button>" +
      "</div>" +
      "</div>" +
      '<p id="admin-status" class="status" style="display:none"></p>' +
      '<div id="admin-list-wrap"></div>' +
      '<dialog id="admin-settings-dialog" class="admin-settings-dialog" aria-labelledby="admin-settings-title">' +
      '<div class="admin-settings-dialog__inner">' +
      '<div class="admin-settings-dialog__header">' +
      '<h2 id="admin-settings-title" class="admin-settings-dialog__title">Settings</h2>' +
      '<button type="button" class="help-strip-close admin-settings-close" aria-label="Close">&times;</button>' +
      "</div>" +
      '<div class="admin-settings-dialog__body">' +
      '<label class="admin-settings-label" for="admin-model-select">Active AI model (bill scan)</label>' +
      '<select id="admin-model-select" class="admin-settings-select"></select>' +
      "</div>" +
      '<div class="admin-settings-dialog__footer">' +
      '<button type="button" class="btn btn--secondary" id="admin-settings-cancel">Cancel</button>' +
      '<button type="button" class="btn" id="admin-settings-save">Save</button>' +
      "</div>" +
      "</div>" +
      "</dialog>" +
      "</main>";
  }

  function bindSettingsDialog() {
    var dialog = document.getElementById("admin-settings-dialog");
    var openBtn = document.getElementById("admin-settings-open");
    var closeBtn = dialog && dialog.querySelector(".admin-settings-close");
    var cancelBtn = document.getElementById("admin-settings-cancel");
    var saveBtn = document.getElementById("admin-settings-save");
    var select = document.getElementById("admin-model-select");
    if (!dialog || !openBtn || !select || !saveBtn) return;

    function closeDialog() {
      if (dialog.open) dialog.close();
    }

    function fillSelect(allowedIds, currentId) {
      select.innerHTML = "";
      for (var i = 0; i < allowedIds.length; i++) {
        var id = allowedIds[i];
        var opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
      }
      if (currentId && allowedIds.indexOf(currentId) >= 0) {
        select.value = currentId;
      } else if (allowedIds.length) {
        select.selectedIndex = 0;
      }
    }

    function openSettings() {
      setStatus("");
      SplitifyAPI.getActiveBillModel({ mode: global.SplitifyAPI.MODE.QUIET })
        .then(function (info) {
          var allowed = info && info.allowedModelIds ? info.allowedModelIds : [];
          var mid = info && info.modelId ? info.modelId : "";
          if (!allowed.length) {
            setStatus("No allowed models returned from the server.", true);
            return;
          }
          fillSelect(allowed, mid);
          if (typeof dialog.showModal === "function") {
            dialog.showModal();
          }
        })
        .catch(function (err) {
          setStatus(err.message || String(err), true);
        });
    }

    openBtn.addEventListener("click", function () {
      openSettings();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeDialog);
    if (cancelBtn) cancelBtn.addEventListener("click", closeDialog);
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) closeDialog();
    });
    saveBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var modelId = select.value;
      if (!modelId) return;
      saveBtn.disabled = true;
      SplitifyAPI.setActiveBillModel({ modelId: modelId }, { mode: global.SplitifyAPI.MODE.QUIET })
        .then(function () {
          setStatus("Saved active AI model: " + modelId);
          closeDialog();
          requestAnimationFrame(function () {
            if (dialog.open) dialog.close();
          });
        })
        .catch(function (err) {
          setStatus(err.message || String(err), true);
        })
        .finally(function () {
          saveBtn.disabled = false;
        });
    });
  }

  function setStatus(message, isError) {
    var el = document.getElementById('admin-status');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'status';
      return;
    }
    el.style.display = '';
    el.textContent = message;
    el.className = 'status' + (isError ? ' status--error' : '');
  }

  function openBill(billId) {
    window.location.href = 'bill.html?billId=' + encodeURIComponent(billId);
  }

  function renderList(bills) {
    var wrap = document.getElementById('admin-list-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!bills || !bills.length) {
      wrap.innerHTML = '<p class="muted">No bills yet.</p>';
      return;
    }
    var ul = document.createElement('ul');
    ul.className = 'admin-bill-list';
    for (var i = 0; i < bills.length; i++) {
      ul.appendChild(buildRow(bills[i]));
    }
    wrap.appendChild(ul);
  }

  function buildRow(bill) {
    var li = document.createElement('li');
    li.className = 'admin-bill-row';
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.dataset.billId = bill.billId;

    var main = document.createElement('div');
    main.className = 'admin-bill-row__main';

    var top = document.createElement('div');
    top.className = 'admin-bill-row__top';
    var venue = document.createElement('span');
    venue.className = 'admin-bill-row__venue';
    venue.textContent = bill.venueName || '(No venue)';
    var billDateEl = document.createElement('span');
    billDateEl.className = 'admin-bill-row__bill-date';
    billDateEl.textContent = SplitifyFormatters.formatBillDateDisplay(bill.billDate) || '—';
    top.appendChild(venue);
    top.appendChild(billDateEl);

    var meta = document.createElement('p');
    meta.className = 'admin-bill-row__meta';
    meta.textContent = 'Uploaded: ' + (SplitifyFormatters.formatUploadDateDisplay(bill.uploadDate) || '—');

    main.appendChild(top);
    main.appendChild(meta);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'admin-bill-row__delete';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', 'Delete bill');

    function goOpen(e) {
      if (e) e.preventDefault();
      openBill(bill.billId);
    }
    li.addEventListener('click', function (e) {
      if (e.target.closest('.admin-bill-row__delete')) return;
      goOpen();
    });
    li.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target === del) return;
        e.preventDefault();
        goOpen();
      }
    });
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (!confirm('Delete this bill, all its line items, claims, and the stored image? This cannot be undone.')) {
        return;
      }
      SplitifyAPI.deleteBillById({ billId: bill.billId })
        .then(function () {
          setStatus('');
          return loadList();
        })
        .catch(function (err) {
          setStatus(err.message || String(err), true);
        });
    });

    li.appendChild(main);
    li.appendChild(del);
    return li;
  }

  function loadList() {
    setStatus('');
    return SplitifyAPI.listBills()
      .then(function (bills) {
        renderList(bills);
      })
      .catch(function (err) {
        renderList([]);
        setStatus(err.message || String(err), true);
      });
  }

  function init(el) {
    rootEl = el;
    renderShell();
    bindSettingsDialog();
    loadList();
  }

  global.SplitifyAdminPage = { init: init };
})(typeof window !== 'undefined' ? window : this);
