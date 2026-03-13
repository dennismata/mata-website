// Auth nav button: Sign In / My Account
(async function () {
  try {
    if (window.sb) {
      const { data: { session } } = await window.sb.auth.getSession();
      if (session) {
        document.querySelectorAll('.nav-auth-btn').forEach(btn => {
          btn.textContent = 'My Account';
          btn.href = 'account.html';
        });
      }
    }
  } catch(e) {}
})();

// Navbar scroll shadow
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });
}

// Mobile hamburger menu
const hamburger = document.getElementById('nav-hamburger');
const mobileDrawer = document.getElementById('nav-mobile-drawer');
if (hamburger && mobileDrawer) {
  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    mobileDrawer.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  // Close on link click
  mobileDrawer.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileDrawer.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// Fade-in on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll(
  '.icon-card, .product-card, .step, .about-img-wrap, .compare-img, .review-card, .fade-in'
).forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity .5s ease, transform .5s ease';
  observer.observe(el);
});
