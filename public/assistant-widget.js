(function (window, document) {
  'use strict';
  if (!window || !document || !document.body) return;

  function currentLanguage() {
    return window.SiagaI18n && typeof window.SiagaI18n.getLanguage === 'function'
      ? window.SiagaI18n.getLanguage()
      : (document.documentElement.lang === 'en' ? 'en' : 'id');
  }

  function english() { return currentLanguage() === 'en'; }
  function copy(id, en) { return english() ? en : id; }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function readJson(response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok) {
        var message = data && typeof data.error === 'string' ? data.error : 'HTTP_' + response.status;
        throw new Error(message);
      }
      return data;
    });
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    var requestOptions = Object.assign({}, options || {});
    if (controller) requestOptions.signal = controller.signal;
    return window.fetch(url, requestOptions).then(readJson).finally(function () {
      if (timer !== null) window.clearTimeout(timer);
    });
  }

  function configuredStatusText(configured) {
    return configured
      ? copy('Kunci Meta terdeteksi · belum diuji', 'Meta key detected · not yet tested')
      : copy('Mode lokal · MODEL_API_KEY belum terpasang', 'Local mode · MODEL_API_KEY not configured');
  }

  function refreshStatus(node, setState, shouldApply) {
    if (!node) return;
    function canApply() { return typeof shouldApply !== 'function' || shouldApply(); }
    if (canApply()) node.textContent = copy('Memeriksa konfigurasi Meta…', 'Checking Meta configuration…');
    fetchWithTimeout('/api/ask/status', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }, 8000).then(function (data) {
      if (!canApply()) return;
      if (!data || typeof data.metaApiConfigured !== 'boolean') throw new Error('invalid_status');
      var configured = data.metaApiConfigured;
      node.textContent = configuredStatusText(configured);
      if (typeof setState === 'function') setState(configured ? 'configured' : 'missing', data);
    }).catch(function () {
      if (!canApply()) return;
      node.textContent = copy('Status API belum dapat diperiksa', 'API status could not be checked');
      if (typeof setState === 'function') setState('unverified', null);
    });
  }

  // Dashboard memiliki panel asisten yang lebih kaya. Jangan menambahkan FAB
  // kedua di sana, tetapi ganti label statis lama dengan status runtime yang
  // jujur dari endpoint aman /api/ask/status.
  var dashboardFab = document.getElementById('aiFab');
  if (dashboardFab) {
    var dashboardStatus = document.getElementById('askMeta');
    if (dashboardStatus) {
      var startupStatusLabels = [
        'memeriksa konfigurasi meta…', 'checking meta configuration…',
        'kunci meta terdeteksi · belum diuji', 'meta key detected · not yet tested',
        'mode lokal · model_api_key belum terpasang', 'local mode · model_api_key not configured',
        'status api belum dapat diperiksa', 'api status could not be checked'
      ];
      function dashboardStatusIsUnverified() {
        var outputNode = document.getElementById('askOut');
        var text = String(dashboardStatus.textContent || '').trim().toLowerCase();
        return !!(outputNode && outputNode.querySelector('.empty') && startupStatusLabels.indexOf(text) >= 0);
      }
      refreshStatus(dashboardStatus, null, dashboardStatusIsUnverified);
      window.addEventListener('siaga:languagechange', function () {
        if (dashboardStatusIsUnverified()) refreshStatus(dashboardStatus, null, dashboardStatusIsUnverified);
      });
    }
    return;
  }

  var fab = make('button', 'global-ai-fab');
  fab.id = 'globalAiFab';
  // Menandai halaman yang punya toggle mengambang supaya footer bisa
  // menyisakan ruang dan tautannya tidak tertutup toggle.
  document.body.classList.add('has-global-ai');
  fab.type = 'button';
  fab.setAttribute('aria-controls', 'globalAiPanel');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', copy('Buka asisten AI SIAGA', 'Open SIAGA AI assistant'));
  var fabIcon = make('span', 'global-ai-fab-icon', '✦');
  fabIcon.setAttribute('aria-hidden', 'true');
  var fabLabel = make('span', 'global-ai-fab-label', copy('Tanya AI', 'Ask AI'));
  fab.appendChild(fabIcon);
  fab.appendChild(fabLabel);

  var panel = make('section', 'global-ai-panel');
  panel.id = 'globalAiPanel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'globalAiTitle');

  var header = make('header', 'global-ai-header');
  var headingGroup = make('div', 'global-ai-heading-group');
  var eyebrow = make('p', 'global-ai-eyebrow', 'SIAGA.ID · MUSE SPARK');
  eyebrow.setAttribute('aria-hidden', 'true');
  var title = make('h2', 'global-ai-title', copy('Asisten situasi', 'Situation assistant'));
  title.id = 'globalAiTitle';
  var status = make('p', 'global-ai-status', copy('Memeriksa konfigurasi Meta…', 'Checking Meta configuration…'));
  status.id = 'globalAiStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  headingGroup.appendChild(eyebrow);
  headingGroup.appendChild(title);
  headingGroup.appendChild(status);
  var closeButton = make('button', 'global-ai-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', copy('Tutup asisten', 'Close assistant'));
  header.appendChild(headingGroup);
  header.appendChild(closeButton);

  var panelBody = make('div', 'global-ai-body');
  var intro = make('p', 'global-ai-intro', copy(
    'Tanyakan ringkasan dari data publik SIAGA.ID. Bukti, waktu sumber, dan keterbatasan ditampilkan bila tersedia.',
    'Ask for a summary of SIAGA.ID public data. Evidence, source times, and limitations are shown when available.'
  ));
  var form = make('form', 'global-ai-form');
  form.autocomplete = 'off';
  var input = make('input', 'global-ai-input');
  input.id = 'globalAiQuestion';
  input.name = 'q';
  input.type = 'text';
  input.maxLength = 200;
  input.required = true;
  input.setAttribute('aria-label', copy('Pertanyaan untuk asisten', 'Question for the assistant'));
  input.placeholder = copy('Contoh: ringkas situasi kebakaran terkini', 'Example: summarize the current fire situation');
  var submit = make('button', 'global-ai-submit', copy('TANYA', 'ASK'));
  submit.type = 'submit';
  form.appendChild(input);
  form.appendChild(submit);

  var suggestions = make('div', 'global-ai-suggestions');
  suggestions.setAttribute('aria-label', copy('Pertanyaan cepat', 'Quick questions'));
  var quickQuestions = [
    {
      id: 'Ringkas situasi kebakaran dan batas datanya',
      en: 'Summarize the fire situation and data limitations'
    },
    {
      id: 'Apa yang diketahui dan belum pasti dari sumber resmi?',
      en: 'What is known and uncertain from official sources?'
    }
  ];
  quickQuestions.forEach(function (question) {
    var chip = make('button', 'global-ai-chip', copy(question.id, question.en));
    chip.type = 'button';
    chip.setAttribute('data-question-id', question.id);
    chip.setAttribute('data-question-en', question.en);
    suggestions.appendChild(chip);
  });

  var output = make('div', 'global-ai-output');
  output.id = 'globalAiOutput';
  output.setAttribute('aria-live', 'polite');
  output.setAttribute('aria-atomic', 'false');
  var empty = make('p', 'global-ai-empty', copy(
    'Pilih pertanyaan cepat atau ketik pertanyaan Anda.',
    'Choose a quick question or type your own.'
  ));
  output.appendChild(empty);

  var disclaimer = make('p', 'global-ai-disclaimer', copy(
    'Jika Meta API aktif, pertanyaan dan fakta publik terpilih dikirim ke Meta. Asisten ini bukan peringatan resmi atau nasihat medis; ikuti otoritas setempat.',
    'When the Meta API is active, your question and selected public facts are sent to Meta. This is not an official alert or medical advice; follow local authorities.'
  ));
  panelBody.appendChild(intro);
  panelBody.appendChild(form);
  panelBody.appendChild(suggestions);
  panelBody.appendChild(output);
  panelBody.appendChild(disclaimer);
  panel.appendChild(header);
  panel.appendChild(panelBody);
  document.body.appendChild(panel);
  document.body.appendChild(fab);

  var statusState = 'checking';
  var busy = false;
  var lastQuestion = '';

  function renderStatus() {
    if (statusState === 'checking') status.textContent = copy('Memeriksa konfigurasi Meta…', 'Checking Meta configuration…');
    else if (statusState === 'configured') status.textContent = configuredStatusText(true);
    else if (statusState === 'missing') status.textContent = configuredStatusText(false);
    else if (statusState === 'unverified') status.textContent = copy('Status API belum dapat diperiksa', 'API status could not be checked');
    else if (statusState === 'loading') status.textContent = copy('Meminta jawaban…', 'Requesting an answer…');
    else if (statusState === 'muse') status.textContent = copy('Muse Spark · jawaban berhasil diterima', 'Muse Spark · answer received');
    else if (statusState === 'fallback') status.textContent = copy('Fallback lokal · Muse Spark tidak berhasil menjawab', 'Local fallback · Muse Spark did not answer');
    else if (statusState === 'local') status.textContent = copy('Mode lokal · tidak memakai Meta model', 'Local mode · no Meta model used');
    else if (statusState === 'error') status.textContent = copy('Permintaan gagal · status koneksi belum terverifikasi', 'Request failed · connection status is unverified');
  }

  function setStatusState(state) {
    statusState = state;
    renderStatus();
  }

  function setOpen(open) {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    fab.setAttribute('aria-label', open
      ? copy('Tutup asisten AI SIAGA', 'Close SIAGA AI assistant')
      : copy('Buka asisten AI SIAGA', 'Open SIAGA AI assistant'));
    if (open) {
      input.focus();
    } else {
      fab.focus();
    }
  }

  fab.addEventListener('click', function () { setOpen(panel.hidden); });
  closeButton.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  function safeSourceUrl(value) {
    try {
      var url = new window.URL(String(value || ''), window.location.origin);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (_error) { return ''; }
  }

  function addLabelValue(parent, label, value) {
    if (value === undefined || value === null || value === '') return;
    var row = make('div', 'global-ai-receipt-row');
    row.appendChild(make('b', 'global-ai-receipt-label', label));
    row.appendChild(make('span', 'global-ai-receipt-value', value));
    parent.appendChild(row);
  }

  function addList(parent, label, values) {
    if (!Array.isArray(values) || !values.length) return;
    var section = make('div', 'global-ai-receipt-section');
    section.appendChild(make('b', 'global-ai-receipt-label', label));
    var list = make('ul', 'global-ai-receipt-list');
    values.slice(0, 8).forEach(function (value) {
      if (!value) return;
      if (typeof value === 'object') {
        var result = typeof value.value === 'boolean'
          ? (value.value ? copy('ya', 'yes') : copy('tidak', 'no'))
          : value.value;
        var text = [value.label || value.key, result, value.basis].filter(function (part) {
          return part !== undefined && part !== null && part !== '';
        }).join(' · ');
        if (text) list.appendChild(make('li', '', text));
      } else {
        list.appendChild(make('li', '', value));
      }
    });
    if (list.childNodes.length) {
      section.appendChild(list);
      parent.appendChild(section);
    }
  }

  function appendReceipts(container, records, group) {
    if (!Array.isArray(records) || !records.length) return null;
    var validRecords = records.filter(function (item) {
      return item && typeof item === 'object' && /^[EC][1-8]$/.test(String(item.id || ''));
    }).slice(0, 8);
    if (!validRecords.length) return null;
    var details = make('details', 'global-ai-evidence');
    details.id = 'globalAiEvidencePanel-' + group;
    var summary = make('summary', '', copy('Jejak bukti dan waktu sumber', 'Evidence trace and source times'));
    summary.appendChild(make('span', 'global-ai-evidence-count', ' · ' + validRecords.length));
    details.appendChild(summary);
    details.appendChild(make('p', 'global-ai-evidence-note', copy(
      'Receipt menautkan jawaban ke hasil alat yang digunakan; bukan sertifikasi independen atas klaim.',
      'Receipts link the answer to tool results used; they do not independently certify a claim.'
    )));
    var list = make('div', 'global-ai-evidence-list');
    validRecords.forEach(function (item) {
      var id = String(item.id);
      var card = make('article', 'global-ai-evidence-card');
      card.id = 'globalAiEvidence-' + group + '-' + id;
      var head = make('div', 'global-ai-evidence-card-head');
      head.appendChild(make('strong', '', item.label || id));
      var state = ['available', 'unavailable', 'rejected', 'unknown'].indexOf(item.state) >= 0
        ? item.state : (item.available === true ? 'available' : item.available === false ? 'unavailable' : 'unknown');
      var stateText = {
        available: copy('tersedia', 'available'),
        unavailable: copy('tidak tersedia', 'unavailable'),
        rejected: copy('ditolak', 'rejected'),
        unknown: copy('tidak diketahui', 'unknown')
      }[state];
      head.appendChild(make('span', 'global-ai-badge global-ai-badge-' + state, stateText));
      card.appendChild(head);
      addLabelValue(card, copy('Jenis alat', 'Tool'), item.tool);
      addList(card, copy('Waktu sumber', 'Source times'), item.sourceTimes);
      addList(card, copy('Catatan waktu', 'Time notes'), item.timeNotes);
      addLabelValue(card, copy('Snapshot dirakit', 'Snapshot assembled'), item.snapshotAt);
      addList(card, copy('Cakupan', 'Coverage'), item.coverage);
      addList(card, copy('Kesegaran sumber', 'Source freshness'), (Array.isArray(item.freshness) ? item.freshness : []).map(function (row) {
        if (!row) return '';
        return [row.source, typeof row.healthy === 'boolean' ? (row.healthy ? 'healthy' : 'not healthy') : '', row.lastSuccessfulAt].filter(Boolean).join(' · ');
      }));
      addList(card, copy('Keterbatasan', 'Limitations'), item.limitations);
      var sources = Array.isArray(item.sources) ? item.sources : [];
      if (sources.length) {
        var sourceWrap = make('div', 'global-ai-source-links');
        sources.slice(0, 8).forEach(function (source) {
          var url = source && safeSourceUrl(source.url);
          if (!url) return;
          var link = make('a', '', source.title || source.kind || copy('Sumber', 'Source'));
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          sourceWrap.appendChild(link);
        });
        if (sourceWrap.childNodes.length) card.appendChild(sourceWrap);
      }
      list.appendChild(card);
    });
    details.appendChild(list);
    container.appendChild(details);
    return details;
  }

  function appendAnswerLine(parent, line, receiptIds, group) {
    var node = make('p', 'global-ai-answer-line');
    var text = String(line == null ? '' : line);
    var marker = /\[([EC])([1-8])\]/g;
    var match;
    var start = 0;
    while ((match = marker.exec(text))) {
      node.appendChild(document.createTextNode(text.slice(start, match.index)));
      let id = match[1] + match[2];
      if (receiptIds.indexOf(id) >= 0) {
        var link = make('a', 'global-ai-citation', '[' + id + ']');
        link.href = '#globalAiEvidence-' + group + '-' + id;
        link.setAttribute('aria-label', copy('Buka bukti ', 'Open evidence receipt ') + id);
        link.addEventListener('click', function (event) {
          event.preventDefault();
          var details = document.getElementById('globalAiEvidencePanel-' + group);
          if (details) details.open = true;
          var target = document.getElementById('globalAiEvidence-' + group + '-' + id);
          if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
        node.appendChild(link);
      } else {
        var unmatched = make('span', 'global-ai-citation-invalid', '[' + id + ']');
        unmatched.title = copy('Tidak ada receipt yang cocok.', 'No matching receipt was returned.');
        node.appendChild(unmatched);
      }
      start = marker.lastIndex;
    }
    node.appendChild(document.createTextNode(text.slice(start)));
    parent.appendChild(node);
  }

  function renderAnswer(data, target, options) {
    var settings = options || {};
    while (target.firstChild) target.removeChild(target.firstChild);
    var provider = data && data.provider;
    var answerLines = data && Array.isArray(data.answer)
      ? data.answer.slice(0, 14)
      : (data && typeof data.answer === 'string' ? [data.answer] : []);
    if (provider === 'local-rag') {
      target.appendChild(make('p', 'global-ai-notice', copy(
        'Mode lokal: jawaban ini tidak dihasilkan Muse Spark dan bukan demonstrasi Meta model.',
        'Local mode: this answer was not generated by Muse Spark and does not demonstrate Meta model usage.'
      )));
    } else if (provider === 'local-fallback') {
      // Penolakan kebijakan konten berbeda dari layanan tidak terjangkau:
      // model memang menjawab dengan menolak. Menyebutnya "tidak terjangkau"
      // akan menyesatkan, jadi keduanya dibedakan dan saran ubah kalimat
      // diberikan hanya pada kasus penolakan.
      var refused = data && data.failureDetail === 'content_policy_violation';
      target.appendChild(make('p', 'global-ai-notice', refused
        ? copy(
          'Muse Spark menolak pertanyaan ini karena filter kontennya. Coba ubah susunan kalimatnya. Hasil berikut memakai fallback lokal dan bukan keluaran model.',
          'Muse Spark declined this question because of its content filter. Try rephrasing it. The result below uses the local fallback and is not model output.'
        )
        : copy(
          'Muse Spark tidak berhasil menjawab; hasil berikut memakai fallback lokal.',
          'Muse Spark did not answer; the following result uses the local fallback.'
        )));
    }
    if (!answerLines.length) {
      target.appendChild(make('p', 'global-ai-empty', copy('Tidak ada jawaban yang tersedia.', 'No answer is available.')));
      return;
    }
    var group = settings.challenge ? 'challenge' : 'main';
    var evidence = provider === 'muse-spark' && Array.isArray(data.evidence) ? data.evidence : [];
    var receiptIds = evidence.filter(function (item) {
      return item && /^[EC][1-8]$/.test(String(item.id || ''));
    }).map(function (item) { return String(item.id); });
    answerLines.forEach(function (line) {
      appendAnswerLine(target, line, receiptIds, group);
    });
    if (evidence.length) appendReceipts(target, evidence, group);
    if (provider === 'muse-spark' && !settings.challenge && typeof settings.onChallenge === 'function') {
      var challengeButton = make('button', 'global-ai-challenge', copy('UJI SECARA SKEPTIS', 'CHALLENGE THIS ANSWER'));
      challengeButton.type = 'button';
      challengeButton.addEventListener('click', function () {
        settings.onChallenge(data, challengeButton);
      });
      target.appendChild(challengeButton);
    }
  }

  function runChallenge(primary, button) {
    if (!primary || !primary.answer || busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = copy('Menguji…', 'Testing…');
    var challengeBox = make('section', 'global-ai-challenge-box');
    challengeBox.setAttribute('aria-live', 'polite');
    challengeBox.appendChild(make('p', 'global-ai-challenge-note', copy(
      'Uji skeptis oleh model bukan verifikasi independen; periksa receipt dan sumber asli.',
      'A model-generated challenge is not independent verification; inspect receipts and original sources.'
    )));
    var challengeResult = make('div', 'global-ai-challenge-result');
    challengeResult.appendChild(make('p', 'global-ai-loading', copy('Meminta uji skeptis…', 'Requesting a skeptical challenge…')));
    challengeBox.appendChild(challengeResult);
    output.appendChild(challengeBox);
    setStatusState('loading');
    var claim = (Array.isArray(primary.answer) ? primary.answer.join('\n') : String(primary.answer || '')).slice(0, 1800);
    fetchWithTimeout('/api/ask/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ q: lastQuestion, claim: claim, lang: currentLanguage() })
    }, 55000).then(function (data) {
      var loading = challengeResult.querySelector('.global-ai-loading');
      if (loading) loading.parentNode.removeChild(loading);
      renderAnswer(data, challengeResult, { challenge: true });
      if (data && data.provider === 'muse-spark') setStatusState('muse', data);
      else if (data && data.provider === 'local-rag') setStatusState('local', data);
      else setStatusState('fallback', data);
    }).catch(function () {
      var loading = challengeResult.querySelector('.global-ai-loading');
      if (loading) loading.parentNode.removeChild(loading);
      challengeResult.appendChild(make('p', 'global-ai-error', copy(
        'Uji skeptis tidak dapat dijalankan. Jawaban awal tetap belum diverifikasi.',
        'The skeptical challenge could not be run. The original answer remains unverified.'
      )));
      setStatusState('error');
    }).finally(function () {
      busy = false;
      button.disabled = false;
      button.textContent = copy('UJI SECARA SKEPTIS', 'CHALLENGE THIS ANSWER');
    });
  }

  function runQuestion(question) {
    var q = String(question || '').trim();
    if (!q) return;
    if (q.length > 200) q = q.slice(0, 200);
    if (busy) return;
    lastQuestion = q;
    busy = true;
    submit.disabled = true;
    input.disabled = true;
    while (output.firstChild) output.removeChild(output.firstChild);
    output.appendChild(make('p', 'global-ai-loading', copy('Mengambil bukti dan menyusun jawaban…', 'Collecting evidence and preparing an answer…')));
    setStatusState('loading');
    var query = new window.URLSearchParams({ q: q, lang: currentLanguage() });
    fetchWithTimeout('/api/ask?' + query.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }, 55000).then(function (data) {
      while (output.firstChild) output.removeChild(output.firstChild);
      renderAnswer(data, output, {
        onChallenge: function (answer, button) { runChallenge(answer, button); }
      });
      if (data && data.provider === 'muse-spark') setStatusState('muse', data);
      else if (data && data.provider === 'local-rag') setStatusState('local', data);
      else setStatusState('fallback', data);
    }).catch(function () {
      while (output.firstChild) output.removeChild(output.firstChild);
      output.appendChild(make('p', 'global-ai-error', copy(
        'Permintaan gagal. Periksa koneksi lalu coba lagi; status layanan belum terverifikasi.',
        'Request failed. Check connectivity and try again; service status is unverified.'
      )));
      setStatusState('error');
    }).finally(function () {
      busy = false;
      submit.disabled = false;
      input.disabled = false;
      input.focus();
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    runQuestion(input.value);
  });
  suggestions.addEventListener('click', function (event) {
    var chip = event.target.closest('button[data-question-id]');
    if (!chip) return;
    var question = english() ? chip.getAttribute('data-question-en') : chip.getAttribute('data-question-id');
    input.value = question || '';
    runQuestion(input.value);
  });

  function applyLanguage() {
    fabLabel.textContent = copy('Tanya AI', 'Ask AI');
    fab.setAttribute('aria-label', panel.hidden
      ? copy('Buka asisten AI SIAGA', 'Open SIAGA AI assistant')
      : copy('Tutup asisten AI SIAGA', 'Close SIAGA AI assistant'));
    closeButton.setAttribute('aria-label', copy('Tutup asisten', 'Close assistant'));
    title.textContent = copy('Asisten situasi', 'Situation assistant');
    intro.textContent = copy(
      'Tanyakan ringkasan dari data publik SIAGA.ID. Bukti, waktu sumber, dan keterbatasan ditampilkan bila tersedia.',
      'Ask for a summary of SIAGA.ID public data. Evidence, source times, and limitations are shown when available.'
    );
    input.placeholder = copy('Contoh: ringkas situasi kebakaran terkini', 'Example: summarize the current fire situation');
    input.setAttribute('aria-label', copy('Pertanyaan untuk asisten', 'Question for the assistant'));
    submit.textContent = copy('TANYA', 'ASK');
    suggestions.setAttribute('aria-label', copy('Pertanyaan cepat', 'Quick questions'));
    suggestions.querySelectorAll('button[data-question-id]').forEach(function (chip) {
      chip.textContent = english() ? chip.getAttribute('data-question-en') : chip.getAttribute('data-question-id');
    });
    disclaimer.textContent = copy(
      'Jika Meta API aktif, pertanyaan dan fakta publik terpilih dikirim ke Meta. Asisten ini bukan peringatan resmi atau nasihat medis; ikuti otoritas setempat.',
      'When the Meta API is active, your question and selected public facts are sent to Meta. This is not an official alert or medical advice; follow local authorities.'
    );
    renderStatus();
  }

  window.addEventListener('siaga:languagechange', applyLanguage);
  applyLanguage();
  refreshStatus(status, function (state) { setStatusState(state); }, function () {
    return statusState === 'checking' || statusState === 'unverified';
  });
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
