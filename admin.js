/* Admin panel. Real Supabase Auth; every write is checked server-side by RLS policies. */
(() => {
  const C = window.APP_CONFIG, $ = id => document.getElementById(id);
  const db = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  const S = { store: null, cats: [], products: [], tab: "overview" };

  function h(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (k === "class") n.className = v;
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    kids.flat().forEach(x => n.append(x?.nodeType ? x : document.createTextNode(x ?? ""))); return n;
  }
  const toast = (m, bad) => { const t = $("toast"); t.textContent = m; t.className = "toast show" + (bad ? " bad" : ""); setTimeout(() => (t.className = "toast"), 2500); };
  const field = (label, input) => h("label", {}, label, input);
  const fail = e => { console.error(e); toast(e.message || "Something went wrong. Try again.", true); };

  // ---- Auth ----
  async function boot() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { $("login").hidden = false; $("app").hidden = true; return; }
    const { data, error } = await db.from("store_admins").select("stores(*)").eq("user_id", session.user.id).limit(1);
    if (error || !data?.length) { await db.auth.signOut(); $("login").hidden = false; $("loginErr").textContent = "This account is not linked to a store. Contact your developer."; return; }
    S.store = data[0].stores; $("login").hidden = true; $("app").hidden = false; $("storeName").textContent = S.store.name;
    await refresh(); render();
  }
  $("loginForm").onsubmit = async e => {
    e.preventDefault(); $("loginErr").textContent = "";
    const { error } = await db.auth.signInWithPassword({ email: $("email").value, password: $("password").value });
    if (error) $("loginErr").textContent = "Wrong email or password."; else { $("password").value = ""; boot(); }
  };
  $("logout").onclick = async () => { await db.auth.signOut(); location.reload(); };
  async function refresh() {
    const [c, p] = await Promise.all([db.from("categories").select("*").eq("store_id", S.store.id).order("sort").order("name"),
      db.from("products").select("*").eq("store_id", S.store.id).order("created_at", { ascending: false })]);
    if (c.error || p.error) return fail(c.error || p.error);
    S.cats = c.data; S.products = p.data;
  }
  document.querySelector(".tabs").onclick = e => { if (e.target.dataset.tab) { S.tab = e.target.dataset.tab; render(); } };

  function render() {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
    $("view").replaceChildren(...({ overview, products, categories, settings }[S.tab])());
  }
  const catName = id => S.cats.find(c => c.id === id)?.name || "No category";

  // ---- Views ----
  function overview() {
    const off = S.products.filter(p => p.discount_enabled).length, un = S.products.filter(p => !p.available).length;
    return [h("h2", {}, "Overview"), h("div", { class: "stats" },
      ...[["Products", S.products.length], ["Categories", S.cats.length], ["On discount", off], ["Unavailable", un]].map(([t, n]) => h("div", { class: "panel" }, h("b", {}, n), t))),
      h("p", {}, h("a", { href: "index.html", target: "_blank" }, "View your store"))];
  }
  function products() {
    return [h("h2", {}, "Products"), h("button", { class: "btn full", onclick: () => productForm() }, "Add product"),
      ...S.products.map(p => h("div", { class: "item" }, h("img", { src: p.image_url || "", alt: "" }),
        h("div", {}, h("b", {}, p.name), h("small", {}, `${catName(p.category_id)} · ${S.store.currency} ${p.price}${p.available ? "" : " · Unavailable"}`)),
        h("button", { "aria-label": "Edit " + p.name, onclick: () => productForm(p) }, "✎"),
        h("button", { "aria-label": "Delete " + p.name, onclick: () => del("products", p) }, "🗑")))];
  }
  function categories() {
    return [h("h2", {}, "Categories"), h("button", { class: "btn full", onclick: () => categoryForm() }, "Add category"),
      ...S.cats.map(c => h("div", { class: "item" }, h("span", {}, c.icon), h("div", {}, h("b", {}, c.name)),
        h("button", { "aria-label": "Edit " + c.name, onclick: () => categoryForm(c) }, "✎"),
        h("button", { "aria-label": "Delete " + c.name, onclick: () => del("categories", c) }, "🗑")))];
  }
  async function del(table, row) {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    const { error } = await db.from(table).delete().eq("id", row.id).eq("store_id", S.store.id);
    if (error) return fail(error); toast("Deleted"); await refresh(); render();
  }

  // ---- Forms (shared dialog) ----
  function openDialog(title, body, onSave) {
    const f = $("dlgForm"); f.onsubmit = async e => { e.preventDefault(); const b = f.querySelector(".go"); b.disabled = true; b.textContent = "Saving…";
      try { await onSave(new FormData(f)); $("dlg").close(); toast("Saved"); await refresh(); render(); } catch (err) { fail(err); b.disabled = false; b.textContent = "Save changes"; } };
    f.replaceChildren(h("h2", {}, title), ...body, h("button", { class: "btn full go" }, "Save changes"), h("button", { class: "btn alt full", type: "button", onclick: () => $("dlg").close() }, "Cancel"));
    $("dlg").showModal();
  }
  function categoryForm(c = {}) {
    openDialog(c.id ? "Edit category" : "New category", [field("Name", h("input", { name: "name", required: true, value: c.name || "" })),
      field("Icon (emoji)", h("input", { name: "icon", value: c.icon || "🛒", maxlength: 4 }))],
      async fd => { const row = { name: fd.get("name").trim(), icon: fd.get("icon") || "🛒", store_id: S.store.id };
        const { error } = c.id ? await db.from("categories").update(row).eq("id", c.id) : await db.from("categories").insert(row); if (error) throw error; });
  }
  async function upload(file) {
    if (!file || !file.size) return null;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("Choose an image under 5 MB.");
    const path = `${S.store.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`; // folder = store id (enforced by storage RLS)
    const { error } = await db.storage.from(C.BUCKET).upload(path, file, { cacheControl: "31536000" });
    if (error) throw error; return db.storage.from(C.BUCKET).getPublicUrl(path).data.publicUrl;
  }
  function productForm(p = {}) {
    const sel = h("select", { name: "category_id" }, h("option", { value: "" }, "No category"), ...S.cats.map(c => h("option", { value: c.id, selected: c.id === p.category_id }, c.name)));
    const prev = h("img", { class: "prev", src: p.image_url || "", alt: "", hidden: !p.image_url });
    const file = h("input", { type: "file", name: "image", accept: "image/*" }); // on phones this offers camera or gallery
    file.onchange = () => { if (file.files[0]) { prev.src = URL.createObjectURL(file.files[0]); prev.hidden = false; } };
    openDialog(p.id ? "Edit product" : "New product", [field("Name", h("input", { name: "name", required: true, value: p.name || "" })), field("Category", sel),
      field("Price", h("input", { name: "price", type: "number", min: 0, step: "any", required: true, inputmode: "decimal", value: p.price ?? "" })),
      field("Old price (for discounts)", h("input", { name: "old_price", type: "number", min: 0, step: "any", inputmode: "decimal", value: p.old_price ?? "" })),
      h("label", { class: "chk" }, h("input", { type: "checkbox", name: "discount_enabled", checked: !!p.discount_enabled }), "Show as discounted"),
      h("label", { class: "chk" }, h("input", { type: "checkbox", name: "available", checked: p.available !== false }), "Available to order"),
      field("Image", file), prev],
      async fd => {
        const row = { store_id: S.store.id, name: fd.get("name").trim(), category_id: fd.get("category_id") || null, price: +fd.get("price"),
          old_price: fd.get("old_price") ? +fd.get("old_price") : null, discount_enabled: fd.get("discount_enabled") === "on", available: fd.get("available") === "on" };
        const url = await upload(fd.get("image")); if (url) row.image_url = url;
        const { error } = p.id ? await db.from("products").update(row).eq("id", p.id) : await db.from("products").insert(row); if (error) throw error;
      });
  }
  function settings() {
    const s = S.store, inp = (n, l, t = "text") => field(l, h("input", { name: n, type: t, value: s[n] ?? "" })), soc = s.socials || {};
    const logo = h("input", { type: "file", name: "logo", accept: "image/*" });
    const f = h("form", { class: "panel" }, h("h2", {}, "Store settings"), inp("name", "Store name"), inp("tagline", "Headline"), field("Logo", logo),
      inp("phone", "Phone", "tel"), inp("whatsapp", "WhatsApp number (digits with country code, e.g. 923001234567)", "tel"), inp("address", "Address"),
      inp("opening_hours", "Opening hours"), field("Delivery information", h("textarea", { name: "delivery_info" }, s.delivery_info)), inp("delivery_charge", "Delivery charge", "number"),
      inp("currency", "Currency label"), field("About text", h("textarea", { name: "about" }, s.about)), inp("primary_color", "Main colour", "color"), inp("accent_color", "Accent colour", "color"),
      field("Facebook link", h("input", { name: "facebook", type: "url", value: soc.facebook || "" })), field("Instagram link", h("input", { name: "instagram", type: "url", value: soc.instagram || "" })),
      h("button", { class: "btn full" }, "Save settings"));
    f.onsubmit = async e => { e.preventDefault(); const fd = new FormData(f);
      try {
        const row = Object.fromEntries(["name", "tagline", "phone", "address", "opening_hours", "delivery_info", "currency", "about", "primary_color", "accent_color"].map(k => [k, fd.get(k)]));
        row.whatsapp = fd.get("whatsapp").replace(/\D/g, ""); row.delivery_charge = +fd.get("delivery_charge") || 0;
        row.socials = { facebook: fd.get("facebook"), instagram: fd.get("instagram") };
        const url = await upload(fd.get("logo")); if (url) row.logo_url = url;
        const { data, error } = await db.from("stores").update(row).eq("id", s.id).select().single(); if (error) throw error;
        S.store = data; $("storeName").textContent = data.name; toast("Settings saved");
      } catch (err) { fail(err); } };
    return [f];
  }
  boot();
})();
