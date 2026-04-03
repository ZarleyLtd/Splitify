(function (global) {
  var rootEl;
  var LIGHTNING_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>' +
    '</svg>';

  function renderShell() {
    rootEl.innerHTML =
      '<main class="panel panel--wide">' +
      '<div class="admin-title-row">' +
      '<h1>Splitify</h1>' +
      '<div class="admin-god-mode">' +
      '<span class="admin-god-mode__icon">' +
      LIGHTNING_SVG +
      '</span>' +
      '<p class="admin-god-mode__label">God Mode</p>' +
      '</div>' +
      '</div>' +
      '<p id="admin-status" class="status" style="display:none"></p>' +
      '<div id="admin-list-wrap"></div>' +
      '</main>';
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
    loadList();
  }

  global.SplitifyAdminPage = { init: init };
})(typeof window !== 'undefined' ? window : this);
