/**
 * Bump SPLITIFY_ASSET_V whenever client CSS/JS changes ship.
 * Keep the same value on all local ?v= query params in *.html and CSS @imports.
 */
(function (global) {
  global.SPLITIFY_ASSET_V = '20261106c';
})(typeof window !== 'undefined' ? window : this);
