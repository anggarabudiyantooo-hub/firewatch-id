# Fitur Fullscreen Peta

**Tanggal:** 2026-09-30  
**Status:** tergabung di main  
**Request:** "apakah bisa peta dapat dikeluarkan sehingga bisa full layar jika dibutuhkan?"

## Solusi

Peta sekarang bisa dikeluarkan ke layar penuh (fullscreen) dengan 3 cara:

1. **Tombol ⛶ FULL** di kepala peta (sebelah kanan EPSG:4326)
2. **Shortcut keyboard F** - tekan F untuk toggle fullscreen
3. **ESC** untuk keluar fullscreen

Saat fullscreen aktif:
- Tombol berubah jadi **EXIT** dengan background oranye
- Muncul tombol **✕ KELUAR FULLSCREEN (ESC)** di tengah atas peta
- Peta jadi 100vw x 100vh, menutupi seluruh layar
- Body scroll di-disable agar tidak ikut bergulir
- Leaflet invalidateSize dipanggil otomatis agar ubin tidak berantakan

## Implementasi Teknis

### HTML (`public/index.html`)
```html
<section class="map-card" id="mapCard">
  <div class="panel-head map-head">
    <h2>...</h2>
    <span class="panel-sub">EPSG:4326 ...</span>
    <button id="mapFullscreenBtn" class="btn-fullscreen" type="button" 
            aria-label="Peta layar penuh" title="Layar penuh (F), ESC untuk keluar">
      <span class="fs-ic">⛶</span>
      <span class="fs-txt">FULL</span>
    </button>
  </div>
  <div class="map-wrap">
    <div id="map"></div>
    ...
    <button id="mapFsExit" class="map-fs-exit" hidden>✕ KELUAR FULLSCREEN (ESC)</button>
  </div>
</section>
```

### CSS (`public/app.css`)
```css
/* Tombol terminal style, bukan pill generic */
.btn-fullscreen{
  font-family:var(--mono); font-size:10px; font-weight:700;
  background:var(--surface-2); color:var(--tx-dim);
  border:1px solid var(--line); padding:3px 9px;
}
.btn-fullscreen:hover{ background:rgba(249,115,22,.12); color:var(--accent); border-color:var(--accent); }
.btn-fullscreen.is-active{ background:var(--accent); color:#000; }

/* Native fullscreen */
.map-card:fullscreen{ width:100vw; height:100vh; display:flex; flex-direction:column; }
.map-card:fullscreen #map{ height:100%; }

/* Fallback class */
.map-card.is-fullscreen{ position:fixed; inset:0; z-index:9999; width:100vw; height:100vh; }
body.has-fullscreen-map{ overflow:hidden; }
```

### JS (`public/app.js`)
```js
// Gunakan Fullscreen API native: card.requestFullscreen() / document.exitFullscreen()
// Fallback ke class .is-fullscreen jika API tidak tersedia atau ditolak
- isFullscreen() cek document.fullscreenElement === card || classList.contains('is-fullscreen')
- updateBtn() toggle aria-pressed, text FULL/EXIT, class is-active, hidden exitBtn, body class
- setTimeout invalidateSize 120ms & 400ms setelah toggle
// Shortcut F dan ESC, ignore saat typing di input/textarea/select
- Listener fullscreenchange untuk sync saat ESC native
```

## Aksesibilitas & Gaya Visual

- **Fungsional, bukan dekorasi:** tombol ada karena butuh ruang analisis, bukan karena "keren"
- **Keyboard:** F untuk masuk, ESC untuk keluar, fokus visible 2px biru
- **ARIA:** aria-label, aria-pressed, title, hidden untuk exit button
- **Target sentuh:** min-height 24px
- **Gaya visual:** gaya terminal konsisten (monospace, sudut tajam, border 1px), tidak ada gradient biru-ungu, glow, atau glassmorphism berlebihan
- **Resilience:** fallback class jika Fullscreen API tidak support, double invalidateSize

## Testing

```bash
npm run check # lolos 53 test
# Manual:
# 1. Buka http://localhost:3000
# 2. Klik ⛶ FULL di kepala peta → peta fullscreen
# 3. Tekan ESC → keluar
# 4. Tekan F → fullscreen lagi
# 5. Klik ✕ KELUAR FULLSCREEN → keluar
# 6. Cek di mobile, tablet, desktop
```

## Screenshot / Demo

Fitur sudah tergabung di main dan dapat diuji di https://firewatch-id.vercel.app setelah proses deploy Vercel selesai.
