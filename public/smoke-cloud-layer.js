(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiagaSmokeCloudLayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PADDING = 96;
  var BROAD_BLUR = 30;
  var BODY_BLUR = 9;

  function validCoordinate(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function clampIntensity(value) {
    var intensity = Number(value);
    if (!Number.isFinite(intensity)) return 0;
    return Math.max(0, Math.min(1, intensity));
  }

  function worldWidthAt(map, zoom, tileSize) {
    var bounds = map && typeof map.getPixelWorldBounds === 'function'
      ? map.getPixelWorldBounds(zoom) : null;
    var width = bounds && bounds.min && bounds.max ? bounds.max.x - bounds.min.x : 0;
    if (!(width > 0) || !Number.isFinite(width)) width = tileSize.x * Math.pow(2, zoom);
    return Number.isFinite(width) && width > 0 ? width : 0;
  }

  function projectRing(map, ring, coords, tileSize, padding) {
    if (!map || typeof map.project !== 'function' || !Array.isArray(ring) || ring.length < 3
        || !coords || !tileSize) return null;

    var zoom = Number(coords.z);
    var tileX = Number(coords.x);
    var tileY = Number(coords.y);
    var width = Number(tileSize.x);
    var height = Number(tileSize.y);
    var pad = Number(padding) || 0;
    if (![zoom, tileX, tileY, width, height, pad].every(Number.isFinite)
        || width <= 0 || height <= 0) return null;

    var left = tileX * width;
    var top = tileY * height;
    var centerX = left + width / 2;
    var worldWidth = worldWidthAt(map, zoom, tileSize);
    var points = [];

    for (var i = 0; i < ring.length; i++) {
      var point = ring[i];
      if (!Array.isArray(point) || point.length < 2
          || !validCoordinate(point[0]) || !validCoordinate(point[1])) return null;
      var projected;
      try { projected = map.project([Number(point[0]), Number(point[1])], zoom); }
      catch (_) { return null; }
      if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null;

      var x = projected.x;
      if (worldWidth) x += Math.round((centerX - x) / worldWidth) * worldWidth;
      points.push({ x: x - left + pad, y: projected.y - top + pad });
    }
    return points.length >= 3 ? points : null;
  }

  function drawPath(context, points) {
    if (!context || !Array.isArray(points) || points.length < 3) return false;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    context.closePath();
    return true;
  }

  function sourceAndTip(map, plume, points, coords, tileSize, padding) {
    if (!validCoordinate(plume.lat) || !validCoordinate(plume.lon)) return null;
    var zoom = Number(coords.z);
    var left = Number(coords.x) * Number(tileSize.x);
    var top = Number(coords.y) * Number(tileSize.y);
    var centerX = left + Number(tileSize.x) / 2;
    var worldWidth = worldWidthAt(map, zoom, tileSize);
    var source;
    try { source = map.project([Number(plume.lat), Number(plume.lon)], zoom); }
    catch (_) { return null; }
    if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.y)) return null;

    var sourceX = source.x;
    if (worldWidth) sourceX += Math.round((centerX - sourceX) / worldWidth) * worldWidth;
    sourceX = sourceX - left + padding;
    var sourceY = source.y - top + padding;
    var tip = points[0];
    var greatestDistance = -1;
    for (var i = 0; i < points.length; i++) {
      var dx = points[i].x - sourceX;
      var dy = points[i].y - sourceY;
      var distance = dx * dx + dy * dy;
      if (distance > greatestDistance) {
        greatestDistance = distance;
        tip = points[i];
      }
    }
    if (greatestDistance < 1) return null;
    return { x: sourceX, y: sourceY, tip: tip };
  }

  function drawMask(context, map, coords, tileSize, plumes, padding) {
    if (!context || !Array.isArray(plumes)) return 0;
    var pad = Number(padding) || 0;
    var width = Number(tileSize && tileSize.x);
    var height = Number(tileSize && tileSize.y);
    if (!(width > 0) || !(height > 0)) return 0;
    if (typeof context.clearRect === 'function') context.clearRect(0, 0, width + pad * 2, height + pad * 2);

    var right = width + pad * 2;
    var bottom = height + pad * 2;
    var drawn = 0;
    plumes.forEach(function (plume) {
      if (!plume || !Array.isArray(plume.polygon)) return;
      var points = projectRing(map, plume.polygon, coords, tileSize, pad);
      if (!points) return;

      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      points.forEach(function (point) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      if (maxX < 0 || maxY < 0 || minX > right || minY > bottom) return;
      if (!drawPath(context, points)) return;

      // Gradasi hanya memberi tekstur visual. Nilainya bukan pengukuran asap.
      var regional = plume.kind === 'reported-region';
      var intensity = clampIntensity(plume.intensity);
      var opacity = regional ? 0.24 : 0.38 + intensity * 0.18;
      var source = sourceAndTip(map, plume, points, coords, tileSize, pad);
      if (regional && source && typeof context.createRadialGradient === 'function') {
        var radius = 0;
        points.forEach(function (point) {
          var dx = point.x - source.x;
          var dy = point.y - source.y;
          radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy));
        });
        var cloud = context.createRadialGradient(source.x, source.y, 0, source.x, source.y, radius);
        cloud.addColorStop(0, 'rgba(12,14,13,' + opacity.toFixed(3) + ')');
        cloud.addColorStop(0.68, 'rgba(26,28,26,' + (opacity * 0.56).toFixed(3) + ')');
        cloud.addColorStop(1, 'rgba(48,47,43,0.015)');
        context.fillStyle = cloud;
      } else if (!regional && source && typeof context.createLinearGradient === 'function') {
        var gradient = context.createLinearGradient(source.x, source.y, source.tip.x, source.tip.y);
        gradient.addColorStop(0, 'rgba(8,10,9,' + Math.min(0.68, opacity + 0.14).toFixed(3) + ')');
        gradient.addColorStop(0.52, 'rgba(23,25,23,' + opacity.toFixed(3) + ')');
        gradient.addColorStop(1, 'rgba(46,45,40,' + Math.max(0.24, opacity * 0.64).toFixed(3) + ')');
        context.fillStyle = gradient;
      } else {
        context.fillStyle = 'rgba(23,25,23,' + opacity.toFixed(3) + ')';
      }
      context.fill();
      drawn++;
    });
    return drawn;
  }

  function create(L, plumes, options) {
    if (!L || !L.GridLayer || typeof L.GridLayer.extend !== 'function' || !L.DomUtil
        || typeof L.DomUtil.create !== 'function') {
      throw new Error('Leaflet GridLayer diperlukan untuk menggambar kabut asap.');
    }

    var CloudLayer = L.GridLayer.extend({
      initialize: function (items, layerOptions) {
        L.setOptions(this, layerOptions || {});
        this._plumes = Array.isArray(items) ? items.slice() : [];
      },

      createTile: function (coords, done) {
        var size = this.getTileSize();
        var tile = L.DomUtil.create('canvas', 'leaflet-tile smoke-cloud-tile');
        tile.width = size.x;
        tile.height = size.y;
        tile.style.width = size.x + 'px';
        tile.style.height = size.y + 'px';
        tile.style.pointerEvents = 'none';

        var tileError = null;
        try {
          var context = tile.getContext('2d');
          if (context && this._map && this._plumes.length) {
            var mask = document.createElement('canvas');
            mask.width = size.x + PADDING * 2;
            mask.height = size.y + PADDING * 2;
            var maskContext = mask.getContext('2d');
            if (maskContext) {
              drawMask(maskContext, this._map, coords, size, this._plumes, PADDING);
              var hazeMask = document.createElement('canvas');
              hazeMask.width = mask.width;
              hazeMask.height = mask.height;
              var hazeContext = hazeMask.getContext('2d');
              if (hazeContext) {
                hazeContext.drawImage(mask, 0, 0);
                hazeContext.globalCompositeOperation = 'source-in';
                hazeContext.fillStyle = 'rgba(162,154,136,0.96)';
                hazeContext.fillRect(0, 0, hazeMask.width, hazeMask.height);
                hazeContext.globalCompositeOperation = 'source-over';
              } else {
                hazeMask = mask;
              }

              if ('filter' in context) {
                context.save();
                context.filter = 'blur(' + BROAD_BLUR + 'px)';
                context.globalAlpha = 0.95;
                context.drawImage(hazeMask, -PADDING, -PADDING);
                context.restore();

                context.save();
                context.filter = 'blur(' + BODY_BLUR + 'px)';
                context.globalAlpha = 0.82;
                context.drawImage(mask, -PADDING, -PADDING);
                context.restore();
              } else {
                context.drawImage(hazeMask, -PADDING, -PADDING);
                context.drawImage(mask, -PADDING, -PADDING);
              }
            }
          }
        } catch (error) {
          tileError = error;
        }
        // Leaflet mencatat tile setelah createTile kembali. Defer callback
        // supaya _tileReady menemukan tile dan menandainya visible.
        if (typeof done === 'function') {
          setTimeout(function () { done(tileError, tile); }, 0);
        }
        return tile;
      }
    });

    return new CloudLayer(plumes, Object.assign({
      pane: 'smokeCloudPane',
      tileSize: 256,
      maxZoom: 18,
      keepBuffer: 1,
      updateWhenIdle: true,
      opacity: 1
    }, options || {}));
  }

  return {
    create: create,
    projectRing: projectRing,
    drawMask: drawMask,
    clampIntensity: clampIntensity,
    constants: { padding: PADDING, broadBlur: BROAD_BLUR, bodyBlur: BODY_BLUR }
  };
});
