/* js/router.js */

const ROUTES = {
  '/':           'dashboard',
  '/inventory':  'inventory',
  '/shows':      'shows',
  '/investment': 'investment',
  '/reports':    'reports',
  '/designs':    'designs',
};

const PAGES = {};

function registerPage(name, renderFn) {
  PAGES[name] = renderFn;
}

async function navigate(path) {
  const page = ROUTES[path] || 'dashboard';

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const container = document.getElementById('page-content');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Loading…</div>';

  if (PAGES[page]) {
    await PAGES[page](container);
  } else {
    container.innerHTML = '<div style="padding:40px;color:var(--text3)">Page not found</div>';
  }
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const path = el.getAttribute('href');
    history.pushState({}, '', path);
    navigate(path);
  });
});

window.addEventListener('popstate', () => navigate(location.pathname));
