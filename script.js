/* Customer storefront. All store data comes from Supabase; cart (not data) persists in localStorage. */
(() => {
  const C = window.APP_CONFIG, $ = id => document.getElementById(id);
  const db = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  const state = { store: null, cats: [], products: [], cat: "all", q: "", cart: [] };
  const CART_KEY = "cart:" + C.STORE_SLUG;
  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#e3eee4"/><text x="150" y="165" font-size="64" text-anchor="middle">🛒</text></svg>');

  // Tiny DOM builder: uses textContent, so database values can never inject HTML.
  function h(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    kids.flat().forEach(x => n.append(x?.nodeType ? x : document.createTextNode(x ?? "")));
    return n;
  }
  const money = n => `${state.store.currency} ${Number(n).toLocaleString()}`;
  const toast = msg => { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); };
  const catName = id => state.cats.find(c => c.id === id)?.name || "General";
  const isOffer = p => p.discount_enabled && p.old_price > p.price;
  const pct = p => Math.round((1 - p.price / p.old_price) * 100);

  async function load() {
    $("status").textContent = "Loading products…";
    $("grid").replaceChildren(...Array.from({ length: 4 }, () => h("div", { class: "skel" })));
    try {
      const { data: s, error } = await db.from("stores").select("*").eq("slug", C.STORE_SLUG).single();
      if (error) throw error;
      state.store = s;
      const [c, p] = await Promise.all([
        db.from("categories").select("*").eq("store_id", s.id).order("sort").order("name"),
        db.from("products").select("*").eq("store_id", s.id).order("created_at", { ascending: false })]);
      if (c.error || p.error) throw (c.error || p.error);
      state.cats = c.data; state.products = p.data;
      state.cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      renderStatic(); renderAll(); $("status").textContent = "";
    } catch (e) {
      console.error(e); $("grid").replaceChildren();
      $("status").className = "status err"; $("status").textContent = "We couldn't load the store. Check your connection and refresh.";
    }
  }

  function renderStatic() {
    const s = state.store;
    document.title = `${s.name} – Online Store`;
    document.documentElement.style.setProperty("--primary", s.primary_color);
    document.documentElement.style.setProperty("--accent", s.accent_color);
    $("brandName").textContent = s.name; $("ftName").textContent = s.name;
    if (s.logo_url) { $("logo").src = s.logo_url; $("logo").alt = ""; $("logo").hidden = false; }
    $("heroTitle").textContent = s.tagline || `Welcome to ${s.name}`;
    $("heroText").textContent = `Order groceries and daily essentials from ${s.name}. We confirm and deliver on WhatsApp.`;
    $("heroWa").href = `https://wa.me/${s.whatsapp}`;
    $("aboutText").textContent = s.about;
    $("copy").textContent = `© ${new Date().getFullYear()} ${s.name}. All rights reserved.`;
    $("why").replaceChildren(...[["Quality products", "Fresh stock, checked daily."], ["Affordable prices", "Fair prices and regular offers."],
      ["Fast delivery", s.delivery_info || "Quick local delivery."], ["Easy ordering", "Pick items, send on WhatsApp."], ["Trusted local store", `Serving our neighbours as ${s.name}.`]]
      .map(([t, d]) => h("li", {}, h("b", {}, t), d)));
    const rows = [["Address", s.address], ["Phone", s.phone], ["WhatsApp", s.whatsapp && "+" + s.whatsapp], ["Opening hours", s.opening_hours],
      ["Delivery", `${s.delivery_info} ${s.delivery_charge ? "Charge: " + money(s.delivery_charge) : ""}`]].filter(r => r[1]);
    $("info").replaceChildren(...rows.map(([t, d]) => h("div", {}, h("dt", {}, t), h("dd", {}, d))));
    $("socials").replaceChildren(...Object.entries(s.socials || {}).filter(([, u]) => /^https?:\/\//.test(u))
      .map(([n, u]) => h("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, n)));
  }

  function card(p) {
    const out = !p.available;
    return h("article", { class: "card" },
      isOffer(p) && h("span", { class: "tag" }, `-${pct(p)}%`),
      h("img", { src: p.image_url || PLACEHOLDER, alt: p.name, loading: "lazy", width: 300, height: 300, onerror: e => (e.target.src = PLACEHOLDER) }),
      h("div", { class: "card-b" }, h("small", {}, catName(p.category_id)), h("h3", {}, p.name),
        h("div", { class: "price" }, money(p.price), isOffer(p) && h("del", {}, money(p.old_price))),
        h("span", { class: "stock" + (out ? " out" : "") }, out ? "Out of stock" : "In stock"),
        h("button", { class: "btn sm", disabled: out, onclick: () => addToCart(p.id) }, out ? "Unavailable" : "Add to cart")));
  }

  function renderAll() {
    $("catGrid").replaceChildren(...state.cats.map(c => h("button", { class: "cat", onclick: () => { setCat(c.id); $("products").scrollIntoView(); } }, h("span", {}, c.icon), c.name)));
    $("chips").replaceChildren(...[{ id: "all", name: "All" }, ...state.cats].map(c =>
      h("button", { class: "chip" + (state.cat === c.id ? " on" : ""), role: "tab", "aria-selected": state.cat === c.id, onclick: () => setCat(c.id) }, c.name)));
    const q = state.q.trim().toLowerCase();
    const list = state.products.filter(p => (state.cat === "all" || p.category_id === state.cat) &&
      (!q || p.name.toLowerCase().includes(q) || catName(p.category_id).toLowerCase().includes(q)));
    $("grid").replaceChildren(...list.map(card));
    $("status").className = "status";
    $("status").textContent = list.length ? "" : "No products found. Try another word or category.";
    const offers = state.products.filter(isOffer);
    $("offerGrid").replaceChildren(...offers.map(card));
    $("offers").hidden = !offers.length;
    renderCart();
  }
  const setCat = id => { state.cat = id; renderAll(); };

  // ---- Cart ----
  const saveCart = () => localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  function addToCart(id) { const l = state.cart.find(x => x.id === id); l ? l.qty++ : state.cart.push({ id, qty: 1 }); saveCart(); renderCart(); toast("Added to cart"); }
  function change(id, d) { const l = state.cart.find(x => x.id === id); l.qty += d; if (l.qty < 1) state.cart = state.cart.filter(x => x !== l); saveCart(); renderCart(); }
  function cartLines() { // drop items deleted/unavailable since they were added; prices always come from the database
    return state.cart.map(l => ({ ...l, p: state.products.find(p => p.id === l.id) })).filter(l => l.p && l.p.available);
  }
  function renderCart() {
    const lines = cartLines(), s = state.store;
    $("cartCount").textContent = lines.reduce((n, l) => n + l.qty, 0);
    const sub = lines.reduce((n, l) => n + l.qty * l.p.price, 0), fee = lines.length ? Number(s.delivery_charge) || 0 : 0;
    $("cartItems").replaceChildren(...(lines.length ? lines.map(({ p, qty }) => h("div", { class: "line" },
      h("img", { src: p.image_url || PLACEHOLDER, alt: "" }),
      h("div", {}, h("b", {}, p.name), h("div", { class: "price" }, money(p.price)),
        h("div", { class: "qty" }, h("button", { "aria-label": "Decrease quantity", onclick: () => change(p.id, -1) }, "−"), h("span", {}, qty),
          h("button", { "aria-label": "Increase quantity", onclick: () => change(p.id, 1) }, "+"))),
      h("button", { class: "rm", onclick: () => { state.cart = state.cart.filter(x => x.id !== p.id); saveCart(); renderCart(); } }, "Remove")))
      : [h("p", { class: "status" }, "Your cart is empty. Add something fresh.")]));
    $("cartFoot").replaceChildren(...(lines.length ? [
      h("div", { class: "tot" }, h("span", {}, "Subtotal"), h("span", {}, money(sub))),
      h("div", { class: "tot" }, h("span", {}, "Delivery"), h("span", {}, fee ? money(fee) : "Free")),
      h("div", { class: "tot big" }, h("span", {}, "Total"), h("span", {}, money(sub + fee))),
      h("button", { class: "btn", onclick: () => checkout(lines, sub, fee) }, "Order on WhatsApp"),
      h("button", { class: "btn ghost", onclick: () => { state.cart = []; saveCart(); renderCart(); } }, "Clear cart")] : []));
  }
  function checkout(lines, sub, fee) {
    const s = state.store;
    const msg = [`*New order – ${s.name}*`, "", ...lines.map(({ p, qty }, i) => `${i + 1}. ${p.name} × ${qty} @ ${money(p.price)} = ${money(p.price * qty)}`),
      "", `Subtotal: ${money(sub)}`, `Delivery: ${fee ? money(fee) : "Free"}`, `*Total: ${money(sub + fee)}*`, "", "Name:", "Delivery address:"].join("\n");
    window.open(`https://wa.me/${s.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  // ---- UI wiring ----
  const drawer = $("drawer"), scrim = $("scrim");
  function cart(open) { drawer.classList.toggle("open", open); drawer.setAttribute("aria-hidden", !open); scrim.hidden = !open; if (open) $("closeCart").focus(); }
  $("cartBtn").onclick = () => cart(true); $("closeCart").onclick = scrim.onclick = () => cart(false);
  document.addEventListener("keydown", e => e.key === "Escape" && cart(false));
  $("menuBtn").onclick = () => { const o = $("nav").classList.toggle("open"); $("menuBtn").setAttribute("aria-expanded", o); };
  $("nav").onclick = e => e.target.tagName === "A" && $("nav").classList.remove("open");
  $("searchBtn").onclick = () => { $("products").scrollIntoView(); $("search").focus(); };
  $("search").oninput = e => { state.q = e.target.value; renderAll(); };
  addEventListener("scroll", () => $("hdr").classList.toggle("stuck", scrollY > 10), { passive: true });
  load();
})();
