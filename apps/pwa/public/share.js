// Share-target landing: forwards the shared title/text/url to the app's hash route (the app does the saving).
(function () {
  var q = new URLSearchParams(location.search);
  var out = new URLSearchParams();
  ['title', 'text', 'url'].forEach(function (k) { var v = q.get(k); if (v) out.set(k, v.slice(0, 20000)); });
  location.replace('./#/share?' + out.toString());
})();
