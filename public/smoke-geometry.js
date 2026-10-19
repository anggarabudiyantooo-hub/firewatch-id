(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiagaSmokeGeometry = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Poligon memakai pasangan [lintang, bujur], seperti Leaflet.
  // Batas poligon dianggap masuk agar titik yang tepat di tepi tidak hilang.
  function containsPoint(ring, lat, lon) {
    if (lat === null || lat === undefined || lat === '' ||
        lon === null || lon === undefined || lon === '') return false;
    var y = Number(lat);
    var x = Number(lon);
    if (!Array.isArray(ring) || ring.length < 3 || !Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }

    var inside = false;
    var epsilon = 1e-10;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var a = ring[i];
      var b = ring[j];
      if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2 ||
          a[0] === null || a[0] === undefined || a[1] === null || a[1] === undefined ||
          b[0] === null || b[0] === undefined || b[1] === null || b[1] === undefined ||
          a[0] === '' || a[1] === '' || b[0] === '' || b[1] === '') return false;
      var yi = Number(a[0]);
      var xi = Number(a[1]);
      var yj = Number(b[0]);
      var xj = Number(b[1]);
      if (!Number.isFinite(yi) || !Number.isFinite(xi) || !Number.isFinite(yj) || !Number.isFinite(xj)) {
        return false;
      }

      var cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
      var tolerance = epsilon * (1 + Math.abs(x) + Math.abs(y) + Math.abs(xi) + Math.abs(yi));
      if (Math.abs(cross) <= tolerance &&
          x >= Math.min(xi, xj) - epsilon && x <= Math.max(xi, xj) + epsilon &&
          y >= Math.min(yi, yj) - epsilon && y <= Math.max(yi, yj) + epsilon) {
        return true;
      }

      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  return { containsPoint: containsPoint };
});
