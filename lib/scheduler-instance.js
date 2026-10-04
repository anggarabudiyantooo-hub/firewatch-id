'use strict';
/**
 * Satu instance Scheduler untuk seluruh proses.
 *
 * Sebelumnya server.js membuat `new Scheduler()` sendiri sehingga modul lain
 * (service-health, alert-engine) tidak bisa membaca keadaan yang sama. Modul
 * ini menjadikannya singleton supaya status kesehatan yang ditampilkan
 * benar-benar keadaan penjadwal yang menjalankan tugas — bukan salinan kedua
 * yang selalu kosong.
 */
const { Scheduler } = require('./scheduler');
module.exports = new Scheduler();
