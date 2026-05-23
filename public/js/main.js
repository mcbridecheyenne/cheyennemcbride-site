// ─── User Dropdown Menu ───
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('userMenuToggle');
  const menu = toggle?.closest('.user-menu');

  if (toggle && menu) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove('open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        menu.classList.remove('open');
      }
    });
  }

  // ─── Smooth scroll for anchor links ───
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ─── Navbar background on scroll ───
  const nav = document.querySelector('.nav');
  if (nav) {
    const updateNav = () => {
      if (window.scrollY > 20) {
        nav.style.borderBottomColor = 'var(--color-border)';
      } else {
        nav.style.borderBottomColor = 'transparent';
      }
    };
    updateNav();
    window.addEventListener('scroll', updateNav, { passive: true });
  }
});
