// "Recently added to the specs database": shared by compare.html and the
// compatibility checker. Fetches /.netlify/functions/recent-additions and
// renders the latest brand batches into a container.
//
//   RecentAdditions.render(el, { canPick(model) -> bool, onPick(model), pickLabel })
//
// When canPick/onPick are given, matching model names become buttons.
(function () {
  var CSS = '.ra{margin:40px 0 32px;padding:24px 26px;background:var(--cream);border:1px solid var(--border);border-radius:var(--radius-lg,14px);}' +
    '.ra h2{font-size:20px;font-weight:800;color:var(--text);letter-spacing:-.01em;margin:0 0 6px;}' +
    '.ra-sub{font-size:14px;color:var(--text-2);margin:0 0 18px;line-height:1.6;}' +
    '.ra-batch{padding:14px 0;border-top:1px solid var(--border);}' +
    '.ra-batch:first-of-type{border-top:none;padding-top:4px;}' +
    '.ra-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:8px;}' +
    '.ra-brand{font-size:15px;font-weight:800;color:var(--text);}' +
    '.ra-meta{font-size:13px;color:var(--text-3);}' +
    '.ra-models{display:flex;flex-wrap:wrap;gap:6px;}' +
    '.ra-model{font:inherit;font-size:13px;color:var(--text-2);background:var(--white,#fff);border:1px solid var(--border);border-radius:999px;padding:4px 11px;line-height:1.4;}' +
    'button.ra-model{cursor:pointer;color:var(--blue);}' +
    'button.ra-model:hover{border-color:var(--blue);background:var(--blue-lt);}' +
    '.ra-more{font-size:13px;color:var(--text-3);padding:4px 2px;}' +
    '.ra-hint{font-size:12px;color:var(--text-3);margin:14px 0 0;}';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function day(iso) {
    try { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
    catch (e) { return iso; }
  }
  function addStyle() {
    if (document.getElementById('ra-style')) return;
    var st = document.createElement('style');
    st.id = 'ra-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function render(el, opts) {
    if (!el) return;
    opts = opts || {};
    var canPick = typeof opts.canPick === 'function' ? opts.canPick : function () { return false; };
    fetch('/.netlify/functions/recent-additions').then(function (r) {
      if (!r.ok) throw new Error('unavailable');
      return r.json();
    }).then(function (d) {
      if (!d || !Array.isArray(d.batches) || !d.batches.length) return;
      addStyle();
      var models = [], anyPick = false;
      var html = d.batches.map(function (b) {
        var chips = b.models.map(function (m) {
          if (canPick(m)) {
            anyPick = true;
            models.push(m);
            return '<button type="button" class="ra-model" data-ra="' + (models.length - 1) + '" title="' + esc(opts.pickLabel || 'Compare') + ' ' + esc(m.name) + '">' + esc(m.model) + '</button>';
          }
          return '<span class="ra-model">' + esc(m.model) + '</span>';
        }).join('');
        var more = b.count > b.models.length ? '<span class="ra-more">+' + (b.count - b.models.length) + ' more</span>' : '';
        return '<div class="ra-batch"><div class="ra-head"><span class="ra-brand">' + esc(b.brand) + '</span>' +
          '<span class="ra-meta">' + b.count + ' model' + (b.count === 1 ? '' : 's') + ' added ' + esc(day(b.date)) + '</span></div>' +
          '<div class="ra-models">' + chips + more + '</div></div>';
      }).join('');
      el.innerHTML = '<section class="ra" aria-labelledby="ra-title"><h2 id="ra-title">Recently Added to the Specs Database</h2>' +
        '<p class="ra-sub">' + Number(d.total).toLocaleString('en-US') + ' components now have specs taken from the manufacturer, so the analyzer, checker and Compare use published figures instead of AI estimates. New brands are added regularly.</p>' +
        html + (anyPick && opts.hint ? '<p class="ra-hint">' + esc(opts.hint) + '</p>' : '') + '</section>';
      if (anyPick && typeof opts.onPick === 'function') {
        el.addEventListener('click', function (e) {
          var b = e.target.closest('[data-ra]');
          if (b) opts.onPick(models[+b.getAttribute('data-ra')]);
        });
      }
    }).catch(function () { /* section simply stays hidden */ });
  }

  window.RecentAdditions = { render: render };
})();
