// ============================================================
// theme.js — Light / Dark mode toggle with localStorage persistence
// ============================================================

(function () {
  const STORAGE_KEY = 'hd_theme';
  const DARK  = 'dark';
  const LIGHT = 'light';

  // ── Apply theme to <html> ─────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Update every toggle button icon on the page
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = theme === DARK ? '☀️' : '🌙';
      btn.setAttribute('aria-label', theme === DARK ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = theme === DARK ? 'Switch to light mode' : 'Switch to dark mode';
    });
  }

  // ── Get saved or system preference ───────────────────────
  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === DARK || saved === LIGHT) return saved;
    // Fall back to OS preference
    return window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT : DARK;
  }

  // ── Toggle ────────────────────────────────────────────────
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || DARK;
    const next = current === DARK ? LIGHT : DARK;
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  // ── Init: apply saved theme immediately (before paint) ───
  applyTheme(getSavedTheme());

  // ── Wire up all toggle buttons after DOM is ready ────────
  function wireButtons() {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      // Remove any previously attached listener to avoid duplicates
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });
    // Re-apply icon state after re-cloning
    applyTheme(getSavedTheme());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    wireButtons();
  }

  // Expose globally so pages can call toggleTheme() if needed
  window.toggleTheme = toggleTheme;
})();
