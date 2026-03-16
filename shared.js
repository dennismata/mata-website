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
        // Ensure mata_session matches the current Supabase user
        try {
          const stored = JSON.parse(sessionStorage.getItem('mata_session') || 'null');
          if (!stored || stored.email !== session.user.email) {
            const updated = stored || {};
            updated.email = session.user.email;
            sessionStorage.setItem('mata_session', JSON.stringify(updated));
          }
        } catch {}
      } else {
        // No active session — clear any stale mata_session
        sessionStorage.removeItem('mata_session');
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

// ─── Sample Request Modal ───────────────────────────────────────────────────
(function () {
  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    #sample-modal-overlay {
      display: none; position: fixed; inset: 0; z-index: 2000;
      background: rgba(0,32,91,.55); backdrop-filter: blur(4px);
      align-items: center; justify-content: center; padding: 20px;
    }
    #sample-modal-overlay.open { display: flex; }
    #sample-modal {
      background: #fff; border-radius: 20px; width: 100%; max-width: 560px;
      max-height: 90vh; overflow-y: auto; padding: 40px;
      box-shadow: 0 24px 80px rgba(0,32,91,.25);
      animation: modalIn .25s ease;
    }
    @keyframes modalIn {
      from { opacity: 0; transform: translateY(16px) scale(.97); }
      to   { opacity: 1; transform: none; }
    }
    #sample-modal .modal-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 28px;
    }
    #sample-modal .modal-header h3 {
      font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 800;
      color: #00205B; margin: 0; line-height: 1.2;
    }
    #sample-modal .modal-header p {
      margin: 6px 0 0; font-size: 14px; color: #6b6b6b;
    }
    #sample-modal-close {
      background: #EAE5DA; border: none; border-radius: 50%;
      width: 32px; height: 32px; font-size: 20px; cursor: pointer;
      color: #00205B; flex-shrink: 0; display: flex; align-items: center;
      justify-content: center; line-height: 1; margin-left: 16px;
    }
    #sample-modal-close:hover { background: #d8d2c7; }
    #sample-form .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    #sample-form .form-row.full { grid-template-columns: 1fr; }
    #sample-form .form-row.three { grid-template-columns: 1fr 1fr 1fr; }
    #sample-form label { display: block; font-size: 13px; font-weight: 600; color: #00205B; margin-bottom: 5px; }
    #sample-form label .req { color: #CC9933; }
    #sample-form input, #sample-form textarea {
      width: 100%; box-sizing: border-box; padding: 10px 14px; border-radius: 10px;
      border: 1.5px solid rgba(0,32,91,.18); font-size: 14px; color: #00205B;
      font-family: inherit; background: #FAFAF8; outline: none; transition: border-color .2s;
    }
    #sample-form input:focus, #sample-form textarea:focus { border-color: #CC9933; background: #fff; }
    #sample-form textarea { resize: vertical; min-height: 90px; }
    #sample-form .sizes-label { font-size: 13px; font-weight: 600; color: #00205B; margin-bottom: 10px; display: block; }
    #sample-form .sizes-label span { font-weight: 400; color: #6b6b6b; font-size: 12px; margin-left: 4px; }
    #sample-form .size-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    #sample-form .size-option {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      border: 1.5px solid rgba(0,32,91,.15); border-radius: 10px; cursor: pointer;
      transition: border-color .2s, background .2s;
    }
    #sample-form .size-option:hover { border-color: #CC9933; background: #FFFDF7; }
    #sample-form .size-option input[type=checkbox] {
      width: 16px; height: 16px; accent-color: #CC9933; cursor: pointer; flex-shrink: 0;
      padding: 0; border: none; background: none;
    }
    #sample-form .size-option label {
      margin: 0; cursor: pointer; font-size: 14px; color: #00205B;
      font-weight: 500; display: flex; justify-content: space-between; width: 100%;
    }
    #sample-form .size-option label span { font-weight: 400; color: #6b6b6b; font-size: 13px; }
    #sample-form-submit {
      width: 100%; padding: 14px; background: #CC9933; color: #fff;
      border: none; border-radius: 50px; font-size: 15px; font-weight: 700;
      cursor: pointer; transition: background .2s, transform .15s;
    }
    #sample-form-submit:hover:not(:disabled) { background: #b8872a; transform: translateY(-1px); }
    #sample-form-submit:disabled { opacity: .65; cursor: not-allowed; }
    #sample-form-msg { text-align: center; font-size: 14px; margin-top: 10px; min-height: 20px; }
    #sample-form-msg.success { color: #1a7a3a; }
    #sample-form-msg.error   { color: #c0392b; }
    @media (max-width: 560px) {
      #sample-modal { padding: 24px; }
      #sample-form .form-row, #sample-form .form-row.three { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  // Inject HTML
  const overlay = document.createElement('div');
  overlay.id = 'sample-modal-overlay';
  overlay.innerHTML = `
    <div id="sample-modal" role="dialog" aria-modal="true" aria-labelledby="sample-modal-title">
      <div class="modal-header">
        <div>
          <h3 id="sample-modal-title">Request a Free Sample</h3>
          <p>We'll ship a roll directly to you — no strings attached.</p>
        </div>
        <button id="sample-modal-close" aria-label="Close">&times;</button>
      </div>
      <form id="sample-form" novalidate>
        <div class="form-row">
          <div>
            <label for="sf-first">First Name <span class="req">*</span></label>
            <input type="text" id="sf-first" name="firstName" required autocomplete="given-name" />
          </div>
          <div>
            <label for="sf-last">Last Name <span class="req">*</span></label>
            <input type="text" id="sf-last" name="lastName" required autocomplete="family-name" />
          </div>
        </div>
        <div class="form-row full">
          <div>
            <label for="sf-email">Email <span class="req">*</span></label>
            <input type="email" id="sf-email" name="email" required autocomplete="email" />
          </div>
        </div>
        <div class="form-row full">
          <div>
            <label for="sf-company">Company Name</label>
            <input type="text" id="sf-company" name="company" autocomplete="organization" />
          </div>
        </div>
        <div class="form-row three">
          <div>
            <label for="sf-city">City <span class="req">*</span></label>
            <input type="text" id="sf-city" name="city" required autocomplete="address-level2" />
          </div>
          <div>
            <label for="sf-state">State <span class="req">*</span></label>
            <input type="text" id="sf-state" name="state" required maxlength="2" placeholder="e.g. TX" autocomplete="address-level1" />
          </div>
          <div>
            <label for="sf-zip">ZIP Code <span class="req">*</span></label>
            <input type="text" id="sf-zip" name="zip" required maxlength="10" autocomplete="postal-code" />
          </div>
        </div>
        <div class="form-row full">
          <div>
            <label for="sf-phone">Phone <span class="req">*</span></label>
            <input type="tel" id="sf-phone" name="phone" required autocomplete="tel" />
          </div>
        </div>
        <div class="form-row full">
          <div>
            <label for="sf-message">Tell us what you are looking for <span class="req">*</span></label>
            <textarea id="sf-message" name="message" required placeholder="Describe your typical projects, surfaces, or any questions about the product…"></textarea>
          </div>
        </div>

        <span class="sizes-label">I'd like to test a roll <span>(check your desired size)</span></span>
        <div class="size-options">
          <div class="size-option">
            <input type="checkbox" id="sz-24" name="sizes" value="24mm x 50m" />
            <label for="sz-24">0.94 in × 55 yd <span>/ 24mm × 50m</span></label>
          </div>
          <div class="size-option">
            <input type="checkbox" id="sz-36" name="sizes" value="36mm x 50m" />
            <label for="sz-36">1.41 in × 55 yd <span>/ 36mm × 50m</span></label>
          </div>
          <div class="size-option">
            <input type="checkbox" id="sz-48" name="sizes" value="48mm x 50m" />
            <label for="sz-48">1.88 in × 55 yd <span>/ 48mm × 50m</span></label>
          </div>
        </div>

        <button type="submit" id="sample-form-submit">Send Request</button>
        <p id="sample-form-msg"></p>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  // Open / close logic
  window.openSampleModal = function () {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('sf-first').focus();
  };
  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  document.getElementById('sample-modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  // Form submit
  document.getElementById('sample-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const form = e.target;
    const btn = document.getElementById('sample-form-submit');
    const msg = document.getElementById('sample-form-msg');

    const firstName = form.firstName.value.trim();
    const lastName  = form.lastName.value.trim();
    const email     = form.email.value.trim();
    const city      = form.city.value.trim();
    const state     = form.state.value.trim();
    const zip       = form.zip.value.trim();
    const message   = form.message.value.trim();

    const phone = form.phone.value.trim();
    if (!firstName || !lastName || !email || !city || !state || !zip || !phone || !message) {
      msg.textContent = 'Please fill in all required fields.';
      msg.className = 'error';
      return;
    }

    const sizes = Array.from(form.querySelectorAll('input[name="sizes"]:checked')).map(c => c.value);

    btn.disabled = true;
    btn.textContent = 'Sending…';
    msg.textContent = '';

    try {
      const resp = await fetch('/api/sample-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, email,
          company: form.company.value.trim() || '',
          city, state, zip,
          phone,
          message, sizes,
        }),
      });
      if (!resp.ok) throw new Error('Server error');

      // Success — show thank you
      document.getElementById('sample-modal').innerHTML = `
        <div style="text-align:center;padding:20px 0;">
          <div style="width:56px;height:56px;background:#EAE5DA;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#CC9933" stroke-width="2.5" width="26" height="26"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 style="font-family:'Playfair Display',serif;font-size:22px;font-weight:800;color:#00205B;margin:0 0 12px;">Request Received!</h3>
          <p style="color:#6b6b6b;font-size:15px;line-height:1.6;max-width:340px;margin:0 auto 28px;">Thanks, ${firstName}! We'll review your request and be in touch shortly.</p>
          <button onclick="document.getElementById('sample-modal-overlay').classList.remove('open');document.body.style.overflow='';" style="background:#CC9933;color:#fff;border:none;border-radius:50px;padding:12px 32px;font-size:14px;font-weight:700;cursor:pointer;">Close</button>
        </div>
      `;
    } catch (err) {
      msg.textContent = 'Something went wrong. Please try again or email us at sales@mata-tape.com';
      msg.className = 'error';
      btn.disabled = false;
      btn.textContent = 'Send Request';
    }
  });
})();

// ─── Fade-in on scroll
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
