'use strict';
(function () {
  var form = document.getElementById('formLogin');
  var password = document.getElementById('password');
  var submit = document.getElementById('submit');
  var status = document.getElementById('status');

  function tujuanAman() {
    var raw = '';
    try { raw = new URLSearchParams(window.location.search).get('returnTo') || '/operations'; }
    catch (_) { raw = '/operations'; }
    try {
      var target = new URL(raw, window.location.origin);
      var path = target.pathname;
      var internal = target.origin === window.location.origin;
      var adminPage = /^\/operations(?:\/|$|\.html$)/.test(path)
        || /^\/insiden(?:\/|$|\.html$)/.test(path);
      return internal && adminPage ? path + target.search + target.hash : '/operations';
    } catch (_) {
      return '/operations';
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    status.textContent = '';
    submit.disabled = true;
    fetch('/api/admin/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value })
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.error || 'Login gagal. Coba lagi.');
        return body;
      });
    }).then(function (body) {
      if (!body.authenticated || !body.csrfToken) throw new Error('Login gagal. Coba lagi.');
      password.value = '';
      window.location.replace(tujuanAman());
    }).catch(function (error) {
      status.textContent = error.message || 'Login gagal. Coba lagi.';
      password.focus();
    }).then(function () {
      submit.disabled = false;
    });
  });
})();
