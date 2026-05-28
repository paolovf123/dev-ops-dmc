// theme.js — read theme preference from localStorage and apply to <html>
// Pages include this in <head> before any CSS for SSR-style no-flicker.
(function () {
  try {
    var t = localStorage.getItem('opsgrid-theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
