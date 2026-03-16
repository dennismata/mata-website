// Mata Tape — Cart System
const CART_KEY = 'mata_cart';

const PRODUCTS = {
  small:  { id: 'small',  name: 'Mata Gold – Small',  size: '0.94" / 24mm', boxPrice: 165, rolls: 36, img: 'Product Photos/MATA_GOLD_ROL_24MM.jpg' },
  medium: { id: 'medium', name: 'Mata Gold – Medium', size: '1.41" / 36mm', boxPrice: 165, rolls: 24, img: 'Product Photos/MATA_GOLD_ROL_36MM.jpg' },
  large:  { id: 'large',  name: 'Mata Gold – Large',  size: '1.88" / 48mm', boxPrice: 185, rolls: 20, img: 'Product Photos/MATA_GOLD_ROL_48MM.jpg' },
};

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

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

// ── Shipping helpers ────────────────────────────────────────────────────────

function calcShipping(state, subtotal, totalBoxes) {
  if (!state) return null; // unknown until state selected
  if (['IL', 'IN'].includes(state)) {
    return subtotal >= 250 ? 0 : 25;
  }
  if (subtotal >= 500) return 0;
  return totalBoxes === 1 ? 25 : 40;
}

function getShipState() {
  return sessionStorage.getItem('mata_ship_state') || '';
}

function saveShipState(state) {
  sessionStorage.setItem('mata_ship_state', state);
  renderCartDrawer();
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
        <a href="index.html#products" id="cart-close-link" onclick="closeCartDrawer();return false;">← Continue shopping</a>
      </div>
      <div id="cart-body"></div>
      <div id="cart-footer"></div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('cart-overlay').addEventListener('click', closeCartDrawer);
  document.getElementById('cart-close-link').addEventListener('click', closeCartDrawer);
}

function renderCartDrawer() {
  const cart     = getCart();
  const entries  = Object.entries(cart).filter(([, q]) => q > 0);
  const partnerD = getPartnerDiscount();
  const totalB   = getTotalBoxes(cart);
  const bulkD    = getBulkDiscount(totalB);
  const appliedD = Math.max(partnerD, bulkD);
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
          <div class="cart-item-price">${appliedD > 0 ? `<s>$${p.boxPrice.toFixed(2)}</s> ` : ''}$${boxP.toFixed(2)}/box · $${lineTotal}</div>
          <div class="cart-item-qty">
            <button onclick="updateCartQty('${id}', ${qty - 1})">−</button>
            <span>${qty}</span>
            <button onclick="updateCartQty('${id}', ${qty + 1})">+</button>
            <button class="cart-remove" onclick="removeFromCart('${id}')">Remove</button>
          </div>
        </div>
      </div>`;
  }).join('');

  let originalTotal = 0;
  let subtotal = 0;
  entries.forEach(([id, qty]) => {
    const p = PRODUCTS[id];
    originalTotal += p.boxPrice * qty;
    subtotal += calcBoxPrice(p.boxPrice, partnerD, bulkD) * qty;
  });
  const savings = originalTotal - subtotal;

  // Shipping
  const state      = getShipState();
  const shipping   = calcShipping(state, subtotal, totalB);
  const grandTotal = subtotal + (shipping || 0);

  // Summary rows: Subtotal → Discount → Subtotal (after discount)
  let summaryHTML = `<div class="cart-subtotal-row"><span>Subtotal</span><span>$${originalTotal.toFixed(2)}</span></div>`;
  if (appliedD > 0) {
    const label = partnerD >= bulkD ? 'Partner discount' : `Bulk discount (${totalB} boxes)`;
    summaryHTML += `
      <div class="cart-savings-row"><span>${label} (${appliedD}%)</span><span>−$${savings.toFixed(2)}</span></div>
      <div class="cart-subtotal-row"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>`;
  }
  if (!partnerD && !bulkD && totalB === 1) summaryHTML += `<div class="cart-upsell">Add 1 more box for 10% off</div>`;

  // Free shipping hint
  let freeShippingHint = '';
  if (state && shipping > 0) {
    const threshold = ['IL', 'IN'].includes(state) ? 250 : 500;
    const remaining = threshold - subtotal;
    if (remaining > 0) {
      freeShippingHint = `<div class="cart-free-shipping-hint">Add $${remaining.toFixed(2)} more for free shipping</div>`;
    }
  }

  const stateOpts = ['', ...US_STATES].map(s =>
    `<option value="${s}" ${s === state ? 'selected' : ''}>${s || 'Select state…'}</option>`
  ).join('');

  const shippingAmountHTML = !state
    ? '—'
    : shipping === 0
      ? '<span class="cart-shipping-free">Free</span>'
      : `$${shipping.toFixed(2)}`;

  const totalNote = !state ? `<div class="cart-total-note">Select state to include shipping</div>` : '';

  footer.innerHTML = `
    ${summaryHTML}
    ${freeShippingHint}
    <div class="cart-shipping-row">
      <span>Shipping</span>
      <div class="cart-shipping-right">
        <select id="cart-state" onchange="saveShipState(this.value)">${stateOpts}</select>
        <span class="cart-shipping-amount">${shippingAmountHTML}</span>
      </div>
    </div>
    <div class="cart-total"><span>Total</span><span>$${grandTotal.toFixed(2)}</span></div>
    ${totalNote}
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
    </p>`;
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

  const savedZip = sessionStorage.getItem('mata_invoice_zip') || '';

  // Pre-fill email from account session
  form.innerHTML = `
    <input id="invoice-email" type="email" placeholder="Email address for invoice" class="invoice-input" value="${sess.email || ''}" />
    <input id="invoice-company" type="text" placeholder="Company name (optional)" class="invoice-input" />
    <input id="invoice-zip" type="text" placeholder="ZIP code" class="invoice-input" maxlength="10" value="${savedZip}" />
    <button id="invoice-submit-btn" onclick="requestInvoice()">Send Invoice →</button>`;
  form.style.display = 'block';
  btn.textContent = 'Cancel';
}

async function requestInvoice() {
  const email   = document.getElementById('invoice-email')?.value.trim();
  const company = document.getElementById('invoice-company')?.value.trim();
  const state   = getShipState(); // from cart state selector
  const zip     = document.getElementById('invoice-zip')?.value.trim() || '';
  if (zip) sessionStorage.setItem('mata_invoice_zip', zip);
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
      body:    JSON.stringify({ items, partnerCode: getPartnerCode(), email, companyName: company, state, zip }),
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
      body:    JSON.stringify({ items, partnerCode: getPartnerCode(), state: getShipState() }),
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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCartDrawer();
  });
});
