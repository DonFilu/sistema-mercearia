(function () {
  const state = {
    pending: 0,
    hideTimer: null,
    minimumVisibleUntil: 0
  };

  function ensureLoader() {
    let loader = document.getElementById("clanCidioLoader");
    if (loader) return loader;

    loader = document.createElement("div");
    loader.id = "clanCidioLoader";
    loader.className = "clan-cidio-loader-overlay";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    loader.innerHTML = `
      <div class="clan-cidio-loader-card">
        <div class="clan-cidio-loader-sprite" aria-hidden="true"></div>
        <p class="clan-cidio-loader-title">Carregando...</p>
        <p class="clan-cidio-loader-subtitle">assobiando enquanto prepara tudo</p>
      </div>
    `;
    document.body.appendChild(loader);
    return loader;
  }

  function show() {
    if (state.hideTimer) {
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }

    state.pending += 1;
    state.minimumVisibleUntil = Date.now() + 350;
    ensureLoader().classList.add("is-visible");
  }

  function hide() {
    state.pending = Math.max(0, state.pending - 1);
    if (state.pending > 0) return;

    const wait = Math.max(0, state.minimumVisibleUntil - Date.now());
    state.hideTimer = setTimeout(() => {
      if (state.pending === 0) ensureLoader().classList.remove("is-visible");
    }, wait);
  }

  async function withLoading(task) {
    show();
    try {
      return await task();
    } finally {
      hide();
    }
  }

  function pulse(duration = 420) {
    show();
    setTimeout(hide, duration);
  }

  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  if (originalFetch) {
    window.fetch = async function clanCidioFetchWithLoader(...args) {
      return withLoading(() => originalFetch(...args));
    };
  }

  window.ClanCidioLoader = {
    show,
    hide,
    pulse,
    withLoading
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureLoader);
  } else {
    ensureLoader();
  }
})();
