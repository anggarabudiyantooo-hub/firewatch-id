(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiagaSmokeGridLayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLOR_STOPS = [
    { value: 0, color: [0, 0, 0], alpha: 0 },
    { value: 1, color: [105, 116, 55], alpha: 0.16 },
    { value: 5, color: [248, 207, 66], alpha: 0.28 },
    { value: 12, color: [246, 137, 46], alpha: 0.42 },
    { value: 25, color: [255, 58, 43], alpha: 0.56 },
    { value: 50, color: [91, 31, 25], alpha: 0.65 }
  ];
  var AOD_COLOR_STOPS = [
    { value: 0, color: [0, 0, 0], alpha: 0 },
    { value: 0.05, color: [105, 116, 55], alpha: 0.16 },
    { value: 0.2, color: [248, 207, 66], alpha: 0.28 },
    { value: 0.5, color: [246, 137, 46], alpha: 0.42 },
    { value: 1, color: [255, 58, 43], alpha: 0.56 },
    { value: 2, color: [91, 31, 25], alpha: 0.65 }
  ];
  var DUST_COLOR_STOPS = [
    { value: 0, color: [0, 0, 0], alpha: 0 },
    { value: 1, color: [105, 116, 55], alpha: 0.16 },
    { value: 10, color: [248, 207, 66], alpha: 0.28 },
    { value: 25, color: [246, 137, 46], alpha: 0.42 },
    { value: 50, color: [255, 58, 43], alpha: 0.56 },
    { value: 100, color: [91, 31, 25], alpha: 0.65 }
  ];

  function finiteNumber(value) {
    var type = typeof value;
    return (type === 'number' || (type === 'string' && value.trim() !== ''))
      && Number.isFinite(Number(value));
  }

  function buildGrid(points, frameIndex) {
    if (!Array.isArray(points) || points.length < 4) return null;
    var rows = [];
    var latitudes = [];
    var longitudes = [];
    points.forEach(function (point) {
      var lat = Number(point && point.lat);
      var lon = Number(point && point.lon);
      var values = point && point.values;
      var rawValue = Array.isArray(values) ? values[frameIndex] : null;
      var value = finiteNumber(rawValue) ? Number(rawValue) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)
          || lat < -90 || lat > 90 || lon < -180 || lon > 180
          || !Number.isFinite(value) || value < 0) return;
      rows.push({ lat: lat, lon: lon, value: value });
      if (latitudes.indexOf(lat) < 0) latitudes.push(lat);
      if (longitudes.indexOf(lon) < 0) longitudes.push(lon);
    });
    if (rows.length < 4 || latitudes.length < 2 || longitudes.length < 2) return null;
    latitudes.sort(function (a, b) { return a - b; });
    longitudes.sort(function (a, b) { return a - b; });

    var latIndex = Object.create(null);
    var lonIndex = Object.create(null);
    latitudes.forEach(function (value, index) { latIndex[value.toFixed(4)] = index; });
    longitudes.forEach(function (value, index) { lonIndex[value.toFixed(4)] = index; });
    var nx = longitudes.length;
    var ny = latitudes.length;
    var values = new Float32Array(nx * ny);
    var present = new Uint8Array(nx * ny);
    rows.forEach(function (row) {
      var y = latIndex[row.lat.toFixed(4)];
      var x = lonIndex[row.lon.toFixed(4)];
      if (y === undefined || x === undefined) return;
      var index = y * nx + x;
      if (present[index]) return;
      values[index] = row.value;
      present[index] = 1;
    });
    return { latitudes: latitudes, longitudes: longitudes, nx: nx, ny: ny, values: values, present: present };
  }

  function bracket(axis, value) {
    if (!Array.isArray(axis) || axis.length < 2 || value < axis[0] || value > axis[axis.length - 1]) return null;
    var low = 0;
    var high = axis.length - 1;
    while (high - low > 1) {
      var middle = Math.floor((low + high) / 2);
      if (axis[middle] <= value) low = middle;
      else high = middle;
    }
    if (value === axis[axis.length - 1]) {
      low = axis.length - 2;
      high = axis.length - 1;
    }
    var span = axis[high] - axis[low];
    return { low: low, high: high, fraction: span ? (value - axis[low]) / span : 0 };
  }

  function sampleGrid(grid, lat, lon) {
    var y = Number(lat);
    var x = Number(lon);
    if (!grid || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    var bx = bracket(grid.longitudes, x);
    var by = bracket(grid.latitudes, y);
    if (!bx || !by) return null;
    var x0 = bx.low, x1 = bx.high, y0 = by.low, y1 = by.high;
    var i00 = y0 * grid.nx + x0;
    var i10 = y0 * grid.nx + x1;
    var i01 = y1 * grid.nx + x0;
    var i11 = y1 * grid.nx + x1;
    if (!grid.present[i00] || !grid.present[i10] || !grid.present[i01] || !grid.present[i11]) return null;
    var a = (1 - bx.fraction) * (1 - by.fraction);
    var b = bx.fraction * (1 - by.fraction);
    var c = (1 - bx.fraction) * by.fraction;
    var d = bx.fraction * by.fraction;
    return grid.values[i00] * a + grid.values[i10] * b
      + grid.values[i01] * c + grid.values[i11] * d;
  }

  function colorForValue(value, colorStops) {
    var number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return [0, 0, 0, 0];
    var stops = Array.isArray(colorStops) && colorStops.length >= 2 ? colorStops : COLOR_STOPS;
    var low = stops[0];
    var high = stops[stops.length - 1];
    for (var i = 1; i < stops.length; i++) {
      if (number <= stops[i].value) {
        low = stops[i - 1];
        high = stops[i];
        break;
      }
    }
    var fraction = Math.max(0, Math.min(1,
      (number - low.value) / Math.max(1e-9, high.value - low.value)));
    return [
      Math.round(low.color[0] + (high.color[0] - low.color[0]) * fraction),
      Math.round(low.color[1] + (high.color[1] - low.color[1]) * fraction),
      Math.round(low.color[2] + (high.color[2] - low.color[2]) * fraction),
      Math.round((low.alpha + (high.alpha - low.alpha) * fraction) * 255)
    ];
  }

  function create(L, options) {
    if (!L || !L.GridLayer || typeof L.GridLayer.extend !== 'function' || !L.DomUtil
        || typeof L.DomUtil.create !== 'function') {
      throw new Error('Leaflet GridLayer diperlukan untuk raster PM2.5.');
    }

    var RasterLayer = L.GridLayer.extend({
      initialize: function (layerOptions) {
        L.setOptions(this, layerOptions || {});
        this._grid = null;
        this._frameIndex = 0;
      },

      setFrame: function (points, frameIndex) {
        this._frameIndex = Number(frameIndex) || 0;
        this._grid = buildGrid(points, this._frameIndex);
        if (this._map) this.redraw();
        return this;
      },

      clearFrame: function () {
        this._grid = null;
        if (this._map) this.redraw();
        return this;
      },

      clearLayers: function () {
        return this.clearFrame();
      },

      sampleAt: function (lat, lon) {
        return sampleGrid(this._grid, lat, lon);
      },

      createTile: function (coords, done) {
        var size = this.getTileSize();
        var scale = Number(this.options.sampleRate) || 4;
        if (this._map && this._map.getSize && this._map.getSize().x < 600) scale = Math.max(scale, 5);
        var width = Math.max(1, Math.ceil(size.x / scale));
        var height = Math.max(1, Math.ceil(size.y / scale));
        var tile = L.DomUtil.create('canvas', 'pm25-grid-tile');
        tile.width = width;
        tile.height = height;
        tile.style.width = size.x + 'px';
        tile.style.height = size.y + 'px';
        tile.style.pointerEvents = 'none';
        tile.setAttribute('aria-hidden', 'true');
        var tileError = null;

        try {
          var context = tile.getContext('2d');
          var grid = this._grid;
          if (context && grid && this._map && typeof this._map.unproject === 'function') {
            var image = context.createImageData(width, height);
            var tileSize = Number(size.x);
            for (var y = 0; y < height; y++) {
              var worldY = Number(coords.y) * tileSize + (y + 0.5) * scale;
              for (var x = 0; x < width; x++) {
                var worldX = Number(coords.x) * tileSize + (x + 0.5) * scale;
                var latlng = this._map.unproject(L.point(worldX, worldY), Number(coords.z));
                var rgba = colorForValue(sampleGrid(grid, latlng.lat, latlng.lng), this.options.colorStops);
                var offset = (y * width + x) * 4;
                image.data[offset] = rgba[0];
                image.data[offset + 1] = rgba[1];
                image.data[offset + 2] = rgba[2];
                image.data[offset + 3] = rgba[3];
              }
            }
            context.putImageData(image, 0, 0);
          }
        } catch (error) {
          tileError = error;
        }

        if (typeof done === 'function') {
          setTimeout(function () { done(tileError, tile); }, 0);
        }
        return tile;
      }
    });

    return new RasterLayer(Object.assign({
      pane: 'pm25Pane',
      tileSize: 256,
      maxZoom: 12,
      keepBuffer: 1,
      updateWhenIdle: true,
      opacity: 1,
      sampleRate: 4,
      colorStops: COLOR_STOPS
    }, options || {}));
  }

  function cloneStops(stops) {
    return stops.map(function (stop) {
      return { value: stop.value, color: stop.color.slice(), alpha: stop.alpha };
    });
  }

  return {
    create: create,
    buildGrid: buildGrid,
    sampleGrid: sampleGrid,
    colorForValue: colorForValue,
    colorStops: cloneStops(COLOR_STOPS),
    aodColorStops: cloneStops(AOD_COLOR_STOPS),
    dustColorStops: cloneStops(DUST_COLOR_STOPS)
  };
});
