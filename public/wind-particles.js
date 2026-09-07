'use strict';
/**
 * Lapisan animasi partikel angin bergaya Windy untuk Leaflet.
 *
 * Cara kerja:
 *  - Titik grid angin (dari /api/wind-field) dimasukkan ke kisi teratur.
 *  - Kecepatan pada posisi bebas dihitung dengan interpolasi bilinear.
 *  - Ribuan partikel dihanyutkan mengikuti medan itu, jejaknya memudar
 *    perlahan sehingga membentuk garis arus (streamline) yang mengalir.
 *
 * Tidak memakai pustaka luar; hanya canvas 2D.
 */
(function (global) {
  var L = global.L;

  function WindParticles(map, opts) {
    this.map = map;
    this.opts = opts || {};
    this.grid = null;
    this.particles = [];
    this.anim = null;
    this.running = false;
    this.canvas = null;
    this.ctx = null;
    this._onResize = this._resize.bind(this);
    this._onMoveStart = this._hide.bind(this);
    this._onMoveEnd = this._show.bind(this);
  }

  WindParticles.prototype._ensureCanvas = function () {
    if (this.canvas) return;
    var pane = this.map.getPane('windParticlePane');
    var c = document.createElement('canvas');
    c.className = 'wind-particle-canvas';
    pane.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this._resize();
    this.map.on('resize', this._onResize);
    this.map.on('movestart zoomstart', this._onMoveStart);
    this.map.on('moveend zoomend', this._onMoveEnd);
  };

  WindParticles.prototype._resize = function () {
    if (!this.canvas) return;
    var s = this.map.getSize();
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.canvas.width = s.x * dpr;
    this.canvas.height = s.y * dpr;
    this.canvas.style.width = s.x + 'px';
    this.canvas.style.height = s.y + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = s.x;
    this.h = s.y;
    this._seed();
  };

  // Sembunyikan saat peta digeser: koordinat layar berubah, jejak jadi kacau.
  WindParticles.prototype._hide = function () {
    if (this.canvas) this.canvas.style.opacity = '0';
  };
  WindParticles.prototype._show = function () {
    if (!this.canvas) return;
    this._resetPanePosition();
    this.canvas.style.opacity = this.opts.baseOpacity || '1';
    this._seed();
  };

  WindParticles.prototype._resetPanePosition = function () {
    // Pane ikut bergeser saat pan; kembalikan agar canvas selalu pas layar.
    var pane = this.map.getPane('windParticlePane');
    L.DomUtil.setPosition(pane, this.map.containerPointToLayerPoint([0, 0]));
  };

  /** Bangun kisi teratur dari daftar titik agar interpolasi cepat. */
  WindParticles.prototype.setField = function (field) {
    if (!field || !field.points || !field.points.length) { this.grid = null; return; }
    var pts = field.points;
    var lats = [], lons = [];
    var i;
    for (i = 0; i < pts.length; i++) {
      if (lats.indexOf(pts[i].lat) < 0) lats.push(pts[i].lat);
      if (lons.indexOf(pts[i].lon) < 0) lons.push(pts[i].lon);
    }
    lats.sort(function (a, b) { return a - b; });
    lons.sort(function (a, b) { return a - b; });
    if (lats.length < 2 || lons.length < 2) { this.grid = null; return; }

    var nx = lons.length, ny = lats.length;
    var u = new Float32Array(nx * ny);
    var v = new Float32Array(nx * ny);
    var have = new Uint8Array(nx * ny);
    var li = {}, oi = {};
    for (i = 0; i < ny; i++) li[lats[i]] = i;
    for (i = 0; i < nx; i++) oi[lons[i]] = i;

    for (i = 0; i < pts.length; i++) {
      var p = pts[i];
      var yi = li[p.lat], xi = oi[p.lon];
      if (yi === undefined || xi === undefined) continue;
      // arah "to" = arah tujuan angin, 0 = utara, searah jarum jam
      var rad = (p.to * Math.PI) / 180;
      var k = yi * nx + xi;
      u[k] = Math.sin(rad) * p.speed;   // komponen timur
      v[k] = Math.cos(rad) * p.speed;   // komponen utara
      have[k] = 1;
    }
    this.grid = {
      lats: lats, lons: lons, nx: nx, ny: ny, u: u, v: v, have: have,
      lat0: lats[0], lon0: lons[0],
      dLat: (lats[ny - 1] - lats[0]) / (ny - 1),
      dLon: (lons[nx - 1] - lons[0]) / (nx - 1)
    };
    this._seed();
  };

  /** Interpolasi bilinear; null bila di luar cakupan data. */
  WindParticles.prototype._lookup = function (lat, lon) {
    var g = this.grid;
    if (!g) return null;
    var fx = (lon - g.lon0) / g.dLon;
    var fy = (lat - g.lat0) / g.dLat;
    if (fx < 0 || fy < 0 || fx > g.nx - 1 || fy > g.ny - 1) return null;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = Math.min(x0 + 1, g.nx - 1), y1 = Math.min(y0 + 1, g.ny - 1);
    var tx = fx - x0, ty = fy - y0;
    var k00 = y0 * g.nx + x0, k10 = y0 * g.nx + x1;
    var k01 = y1 * g.nx + x0, k11 = y1 * g.nx + x1;
    if (!g.have[k00] || !g.have[k10] || !g.have[k01] || !g.have[k11]) return null;
    var a = (1 - tx) * (1 - ty), b = tx * (1 - ty), c = (1 - tx) * ty, d = tx * ty;
    return [
      g.u[k00] * a + g.u[k10] * b + g.u[k01] * c + g.u[k11] * d,
      g.v[k00] * a + g.v[k10] * b + g.v[k01] * c + g.v[k11] * d
    ];
  };

  WindParticles.prototype._randomParticle = function (p) {
    p = p || {};
    p.x = Math.random() * this.w;
    p.y = Math.random() * this.h;
    p.age = Math.floor(Math.random() * 90);
    p.px = p.x; p.py = p.y;
    return p;
  };

  WindParticles.prototype._seed = function () {
    if (!this.w || !this.h) return;
    // kepadatan disesuaikan luas layar agar konsisten di ponsel & desktop
    var dens = this.opts.density || 1900;
    var n = Math.round(Math.min(2000, Math.max(350, (this.w * this.h) / dens)));
    var arr = new Array(n);
    for (var i = 0; i < n; i++) arr[i] = this._randomParticle();
    this.particles = arr;
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  };

  // Panjang langkah maksimum per frame (piksel). Menjaga jejak tetap menyambung.
  var MAX_STEP_PX = 4;

  /**
   * Berapa piksel layar yang ditempuh angin 1 m/s dalam satu frame.
   * Dihitung dari skala peta nyata sehingga arus terlihat konsisten:
   * saat diperbesar, wilayah yang terlihat lebih kecil, jadi kecepatan
   * piksel dinaikkan seperlunya saja — tidak digandakan tiap tingkat zoom.
   */
  WindParticles.prototype._updateScale = function () {
    var map = this.map;
    var c = map.getCenter();
    // Jarak meter yang diwakili 1 piksel pada lintang tengah layar.
    var mPerPx = 40075016.686 * Math.cos(c.lat * Math.PI / 180) /
      (256 * Math.pow(2, map.getZoom()));

    // Kecepatan piksel sepenuhnya fisik akan membuat partikel diam saat
    // menjauh dan melesat saat mendekat. Sebagai gantinya kecepatan
    // dinyatakan dalam piksel per detik dan hanya diredam ringan oleh skala
    // peta, sehingga arus terlihat mengalir wajar di semua tingkat zoom.
    var refMPerPx = 2400;                       // acuan ~zoom 6 di khatulistiwa
    var damp = Math.pow(refMPerPx / mPerPx, 0.15);
    var pxPerSec = (this.opts.gain || 9) * damp;  // piksel/detik untuk 1 m/s

    this._pxPerMs = pxPerSec / 30;              // ~30 fps
  };

  WindParticles.prototype._speedColor = function (s) {
    return s >= 8 ? 'rgba(248,113,113,0.95)'
      : s >= 5 ? 'rgba(251,146,60,0.92)'
        : s >= 3 ? 'rgba(251,191,36,0.9)'
          : s >= 1.5 ? 'rgba(94,234,212,0.85)'
            : 'rgba(125,211,252,0.8)';
  };

  WindParticles.prototype._step = function () {
    var ctx = this.ctx;
    if (!ctx || !this.grid) return;

    // jejak memudar: bukan clear penuh, supaya terbentuk garis arus
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,' + (this.opts.fade || 0.16) + ')';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over';

    ctx.lineWidth = this.opts.lineWidth || 1.1;
    ctx.lineCap = 'round';

    var map = this.map;
    var ps = this.particles;
    this._updateScale();

    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.age > 110) { this._randomParticle(p); continue; }

      var ll = map.containerPointToLatLng([p.x, p.y]);
      var uv = this._lookup(ll.lat, ll.lng);
      if (!uv) { this._randomParticle(p); continue; }

      var spd = Math.sqrt(uv[0] * uv[0] + uv[1] * uv[1]);
      // Konversi m/s -> piksel/frame memakai skala peta yang sebenarnya
      // (piksel per derajat pada lintang ini), lalu dibatasi agar panjang
      // langkah tetap wajar di layar. Memakai 2^zoom membuat partikel
      // melompat ratusan piksel per frame saat diperbesar sehingga
      // gerakannya tampak acak, bukan mengalir.
      var k = this._pxPerMs;
      var dx = uv[0] * k;
      var dy = -uv[1] * k;        // layar: y ke bawah
      // Batasi langkah maksimum: jejak harus tersambung, bukan meloncat.
      var stepLen = Math.sqrt(dx * dx + dy * dy);
      if (stepLen > MAX_STEP_PX) {
        dx = (dx / stepLen) * MAX_STEP_PX;
        dy = (dy / stepLen) * MAX_STEP_PX;
      }
      var nx = p.x + dx;
      var ny = p.y + dy;

      if (nx < -20 || nx > this.w + 20 || ny < -20 || ny > this.h + 20) {
        this._randomParticle(p);
        continue;
      }

      ctx.strokeStyle = this._speedColor(spd);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();

      p.px = p.x; p.py = p.y;
      p.x = nx; p.y = ny;
      p.age++;
    }
  };

  WindParticles.prototype.start = function () {
    if (this.running) return;
    this._ensureCanvas();
    this.running = true;
    var self = this;
    var last = 0;
    function frame(ts) {
      if (!self.running) return;
      // batasi ~30 fps: cukup halus, hemat baterai
      if (ts - last > 33) { self._step(); last = ts; }
      self.anim = global.requestAnimationFrame(frame);
    }
    this.anim = global.requestAnimationFrame(frame);
  };

  WindParticles.prototype.stop = function () {
    this.running = false;
    if (this.anim) global.cancelAnimationFrame(this.anim);
    this.anim = null;
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  };

  WindParticles.prototype.destroy = function () {
    this.stop();
    this.map.off('resize', this._onResize);
    this.map.off('movestart zoomstart', this._onMoveStart);
    this.map.off('moveend zoomend', this._onMoveEnd);
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null; this.ctx = null;
  };

  global.WindParticles = WindParticles;
})(window);
