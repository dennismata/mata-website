// Mata Tape — Cart System
const CART_KEY = 'mata_cart';

const PRODUCTS = {
  small:  { id: 'small',  name: 'Mata Gold – Small',  size: '0.94" / 24mm', boxPrice: 165, rolls: 36, img: 'Product Photos/MATA_GOLD_ROL_24MM.jpg' },
  medium: { id: 'medium', name: 'Mata Gold – Medium', size: '1.41" / 36mm', boxPrice: 165, rolls: 24, img: 'Product Photos/MATA_GOLD_ROL_36MM.jpg' },
  large:  { id: 'large',  name: 'Mata Gold – Large',  size: '1.88" / 48mm', boxPrice: 185, rolls: 20, img: 'Product Photos/MATA_GOLD_ROL_48MM.jpg' },
};

// ── Cart state ──────────────────────────────────────────────────────────────

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  if (document.getElementById('cart-drawer')?.classList.contains('open')) renderCartDrawer();
}

function addToCart(productId, boxes) {
  boxes = parseInt(boxes) || 1;
  const cart = getCart();
  cart[productId] = (cart[productId] || 0) + boxes;
  saveCart(cart);
  openCartDrawer();
}

function removeFromCart(productId) {
  const cart = getCart();
  delete cart[productId];
  saveCart(cart);
}

function updateCartQty(productId, qty) {
  qty = parseInt(qty);
  const cart = getCart();
  if (qty <= 0) delete cart[productId];
  else cart[productId] = qty;
  saveCart(cart);
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}

// ── Discount helpers ────────────────────────────────────────────────────────

function getTotalBoxes(cart) {
  return Object.values(cart).reduce((s, q) => s + q, 0);
}

function getBulkDiscount(totalBoxes) {
  if (totalBoxes >= 10) return 25;
  if (totalBoxes >= 5)  return 20;
  if (totalBoxes >= 2)  return 10;
  return 0;
}

function getPartnerDiscount() {
  try {
    const sess = JSON.parse(sessionStorage.getItem('mata_session') || 'null');
    return sess?.partnerInfo?.discount || 0;
  } catch { return 0; }
}

function getPartnerCode() {
  try {
    const sess = JSON.parse(sessionStorage.getItem('mata_session') || 'null');
    return sess?.partnerCode || null;
  } catch { return null; }
}

function calcBoxPrice(boxPrice, partnerDiscount, bulkDiscount) {
  const discount = Math.max(partnerDiscount, bulkDiscount);
  return discount > 0 ? boxPrice * (1 - discount / 100) : boxPrice;
}

// ── Badge ───────────────────────────────────────────────────────────────────

function updateCartBadge() {
  const total = getTotalBoxes(getCart());
  document.querySelectorAll('.nav-cart-badge').forEach(badge => {
    badge.textContent = total;
    badge.classList.toggle('visible', total > 0);
  });
}

// ── Cart drawer ─────────────────────────────────────────────────────────────

function injectCartDrawer() {
  if (document.getElementById('cart-drawer')) return;
  const el = document.createElement('div');
  el.id = 'cart-drawer';
  el.innerHTML = `
    <div id="cart-overlay"></div>
    <div id="cart-panel">
      <div id="cart-header">
        <h2>Your Order</h2>
        <button id="cart-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div id="cart-body"></div>
      <div id="cart-footer"></div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('cart-overlay').addEventListener('click', closeCartDrawer);
  document.getElementById('cart-close').addEventListener('click', closeCartDrawer);
}

function renderCartDrawer() {
  const cart     = getCart();
  const entries  = Object.entries(cart).filter(([, q]) => q > 0);
  const partnerD = getPartnerDiscount();
  const totalB   = getTotalBoxes(cart);
  const bulkD    = getBulkDiscount(totalB);
  const body     = document.getElementById('cart-body');
  const footer   = document.getElementById('cart-footer');
  if (!body || !footer) return;

  if (!entries.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p>Your cart is empty</p>
        <a href="index.html#products" onclick="closeCartDrawer()" class="cart-continue-link">Browse products →</a>
      </div>`;
    footer.innerHTML = '';
    return;
  }

  body.innerHTML = entries.map(([id, qty]) => {
    const p         = PRODUCTS[id];
    const boxP      = calcBoxPrice(p.boxPrice, partnerD, bulkD);
    const lineTotal = (boxP * qty).toFixed(2);
    return `
      <div class="cart-item">
        <img src="${p.img}" alt="${p.name}" />
        <div class="cart-item-info">
          <div class="cart-item-name">${p.name}</div>
          <div class="cart-item-meta">${p.size} · ${p.rolls} rolls/box</div>
          <div class="cart-item-price">$${boxP.toFixed(2)}/box · $${lineTotal}</div>
          <div class="cart-item-qty">
            <button onclick="updateCartQty('${id}', ${qty - 1})">−</button>
            <span>${qty}</span>
            <button onclick="updateCartQty('${id}', ${qty + 1})">+</button>
            <button class="cart-remove" onclick="removeFromCart('${id}')">Remove</button>
          </div>
        </div>
      </div>`;
  }).join('');

  let subtotal = 0;
  entries.forEach(([id, qty]) => {
    const p = PRODUCTS[id];
    subtotal += calcBoxPrice(p.boxPrice, partnerD, bulkD) * qty;
  });

  let discountHTML = '';
  const appliedD = Math.max(partnerD, bulkD);
  if (appliedD > 0) {
    const label = partnerD >= bulkD ? 'Partner discount' : `Bulk discount (${totalB} boxes)`;
    discountHTML += `<div class="cart-discount-row"><span>${label}</span><span>−${appliedD}%</span></div>`;
  }
  if (!partnerD && !bulkD && totalB === 1) discountHTML += `<div class="cart-upsell">Add 1 more box for 10% off</div>`;

  footer.innerHTML = `
    ${discountHTML}
    <div class="cart-total"><span>Total</span><span>$${subtotal.toFixed(2)}</span></div>
    <button id="checkout-btn" onclick="proceedToCheckout()">Pay Now →</button>
    ${partnerD > 0 ? `<button id="invoice-btn" onclick="showInvoiceForm()">Request Invoice (Net-15)</button>` : ''}
    <div id="invoice-form" style="display:none;">
      <input id="invoice-email" type="email" placeholder="Email address for invoice" class="invoice-input" />
      <input id="invoice-company" type="text" placeholder="Company name (optional)" class="invoice-input" />
      <button id="invoice-submit-btn" onclick="requestInvoice()">Send Invoice →</button>
    </div>
    <p class="cart-stripe-note">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Secure payments via Stripe
    </p>
    <a href="index.html#products" onclick="closeCartDrawer()" class="cart-continue-link">← Continue shopping</a>`;
}

function openCartDrawer() {
  injectCartDrawer();
  renderCartDrawer();
  document.getElementById('cart-drawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Invoice ─────────────────────────────────────────────────────────────────

function showInvoiceForm() {
  const form = document.getElementById('invoice-form');
  const btn  = document.getElementById('invoice-btn');
  if (!form) return;

  const visible = form.style.display !== 'none';
  if (visible) {
    form.style.display = 'none';
    btn.textContent = 'Request Invoice (Net-15)';
    return;
  }

  // Require account
  let sess = null;
  try { sess = JSON.parse(sessionStorage.getItem('mata_session')); } catch {}

  if (!sess) {
    form.innerHTML = `
      <div class="invoice-signin-required">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        <div>
          <strong>Account required</strong>
          <p>Please <a href="account.html">sign in or create a free account</a> to request a Net-15 invoice. Your cart will be saved.</p>
        </div>
      </div>`;
    form.style.display = 'block';
    btn.textContent = 'Cancel';
    return;
  }

  // Pre-fill email from account session
  form.innerHTML = `
    <input id="invoice-email" type="email" placeholder="Email address for invoice" class="invoice-input" value="${sess.email || ''}" />
    <input id="invoice-company" type="text" placeholder="Company name (optional)" class="invoice-input" />
    <button id="invoice-submit-btn" onclick="requestInvoice()">Send Invoice →</button>`;
  form.style.display = 'block';
  btn.textContent = 'Cancel';
}

async function requestInvoice() {
  const email   = document.getElementById('invoice-email')?.value.trim();
  const company = document.getElementById('invoice-company')?.value.trim();
  if (!email) {
    document.getElementById('invoice-email').focus();
    return;
  }

  const cart  = getCart();
  const items = Object.entries(cart).filter(([, q]) => q > 0).map(([id, boxes]) => ({ id, boxes }));
  if (!items.length) return;

  const btn = document.getElementById('invoice-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const res  = await fetch('/api/invoice', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items, partnerCode: getPartnerCode(), email, companyName: company }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('cart-footer').innerHTML = `
        <div class="invoice-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <div>
            <strong>Invoice sent!</strong>
            <p>Check ${email} for your Net-15 invoice. Payment is due within 15 days.</p>
          </div>
        </div>`;
      clearCart();
    } else {
      alert('Invoice error: ' + (data.error || 'Please try again.'));
      if (btn) { btn.disabled = false; btn.textContent = 'Send Invoice →'; }
    }
  } catch (err) {
    alert('Network error. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Send Invoice →'; }
  }
}

// ── Checkout ────────────────────────────────────────────────────────────────

async function proceedToCheckout() {
  const cart  = getCart();
  const items = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, boxes]) => ({ id, boxes }));

  if (!items.length) return;

  const btn = document.getElementById('checkout-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Redirecting to Stripe…'; }

  try {
    const res  = await fetch('/api/checkout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items, partnerCode: getPartnerCode() }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Checkout error: ' + (data.error || 'Please try again.'));
      if (btn) { btn.disabled = false; btn.textContent = 'Proceed to Checkout →'; }
    }
  } catch (err) {
    alert('Network error. Please check your connection and try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Proceed to Checkout →'; }
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  document.querySelectorAll('.nav-cart').forEach(btn => {
    btn.removeAttribute('onclick');
    btn.addEventListener('click', openCartDrawer);
  });
});
