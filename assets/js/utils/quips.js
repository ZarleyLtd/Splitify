(function (global) {
  function applyRandomQuip(elementId) {
    if (typeof SplitifyAPI === "undefined" || !SplitifyAPI.getQuips) return;
    SplitifyAPI.getQuips({ mode: SplitifyAPI.MODE.QUIET })
      .then(function (quips) {
        if (!quips || !quips.length) return;
        var q = quips[Math.floor(Math.random() * quips.length)];
        var el = document.getElementById(elementId);
        if (!el) return;
        function setQuip() {
          el.textContent = q;
        }
        if (document.fonts && document.fonts.load) {
          document.fonts.load("400 1em Caveat").then(setQuip, setQuip);
        } else {
          setQuip();
        }
      })
      .catch(function () {
        /* silently ignore — caption stays empty */
      });
  }

  global.SplitifyQuips = { applyRandomQuip: applyRandomQuip };
})(typeof window !== "undefined" ? window : this);
