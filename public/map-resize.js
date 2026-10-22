(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.MapResize = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function createMapResizeController(root) {
  'use strict';

  var map = null;
  var observer = null;
  var timer = null;

  function getVisibleContainer() {
    if (!map || typeof map.getContainer !== 'function') return null;
    var container = map.getContainer();
    if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) return null;
    return container;
  }

  function invalidate(delay) {
    if (!map || typeof map.invalidateSize !== 'function') return false;
    if (timer !== null) root.clearTimeout(timer);

    var wait = Number(delay);
    if (!Number.isFinite(wait) || wait < 0) wait = 0;
    timer = root.setTimeout(function () {
      timer = null;
      if (!getVisibleContainer()) return;
      map.invalidateSize({ pan: false, debounceMoveend: true });
    }, wait);
    return true;
  }

  function attach(instance) {
    if (!instance || typeof instance.getContainer !== 'function'
      || typeof instance.invalidateSize !== 'function') return false;

    var container = instance.getContainer();
    if (!container) return false;
    if (observer && typeof observer.disconnect === 'function') observer.disconnect();
    if (timer !== null) root.clearTimeout(timer);
    timer = null;
    map = instance;
    observer = null;

    if (typeof root.ResizeObserver === 'function') {
      observer = new root.ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (entry.target === container && entry.contentRect
            && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            invalidate(0);
            break;
          }
        }
      });
      observer.observe(container);
    }
    return true;
  }

  return { attach: attach, invalidate: invalidate };
});
