(function () {
  const { evaluate, fmtDate } = window.TravelEngine;
  const POLICY = window.TRAVEL_POLICY;
  const COUNTRIES = window.TRAVEL_COUNTRIES;

  const $ = (id) => document.getElementById(id);
  const form = $("form");
  const legsEl = $("legs");
  const resultsEl = $("results");
  const errorsEl = $("errors");

  // Small DOM helper: el("div", {class: "x"}, "text", childNode, ...)
  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => c != null && node.append(c.nodeType ? c : document.createTextNode(c)));
    return node;
  }

  // ---------- Itinerary rows ----------
  let legSeq = 0;

  function addLeg(prefill) {
    const i = legSeq++;
    const country = el("input", { type: "text", id: `country-${i}`, list: "country-list", autocomplete: "off", placeholder: "Start typing a country", value: prefill?.country });
    const start = el("input", { type: "date", id: `start-${i}`, value: prefill?.start });
    const end = el("input", { type: "date", id: `end-${i}`, value: prefill?.end });
    start.addEventListener("change", () => { if (!end.value || end.value < start.value) end.value = start.value; end.min = start.value; });
    const remove = el("button", { type: "button", class: "btn ghost remove", "aria-label": "Remove this country" }, "Remove");
    const row = el("div", { class: "leg", "data-leg": i },
      el("label", { class: "country", for: country.id }, "Country", country),
      el("label", { for: start.id }, "First day working", start),
      el("label", { for: end.id }, "Last day working", end),
      remove);
    remove.addEventListener("click", () => { row.remove(); syncRemove(); });
    legsEl.append(row);
    syncRemove();
  }

  function syncRemove() {
    const rows = legsEl.querySelectorAll(".leg");
    rows.forEach((r) => (r.querySelector(".remove").hidden = rows.length === 1));
  }

  function readLegs() {
    return [...legsEl.querySelectorAll(".leg")].map((row) => {
      const i = row.dataset.leg;
      return { idx: i, country: $(`country-${i}`).value.trim(), start: $(`start-${i}`).value, end: $(`end-${i}`).value };
    });
  }

  // ---------- Access options ----------
  Object.entries(POLICY.apps).forEach(([id, app]) => {
    $("apps").append(el("label", { class: "chip" }, el("input", { type: "checkbox", name: "app", value: id }), app.label));
  });
  COUNTRIES.forEach((c) => $("country-list").append(el("option", { value: c })));

  function syncAccess() {
    $("saas-sub").hidden = !$("acc-saas").checked;
    $("other-sub").hidden = !$("acc-other").checked;
    $("sensitive-wrap").hidden = !($("acc-vm").checked || $("acc-saas").checked);
  }
  ["acc-vm", "acc-saas", "acc-other"].forEach((id) => $(id).addEventListener("change", syncAccess));

  function readInput() {
    const legs = readLegs();
    return {
      legs: legs.map(({ country, start, end }) => ({ country, start, end })),
      legIdx: legs.map((l) => l.idx),
      access: {
        vm: $("acc-vm").checked,
        saas: $("acc-saas").checked,
        apps: [...form.querySelectorAll("input[name=app]:checked")].map((c) => c.value),
        other: $("acc-other").checked,
        otherText: $("other-text").value,
      },
      sensitive: $("sensitive-wrap").hidden ? "" : form.querySelector("input[name=sensitive]:checked").value,
    };
  }

  // ---------- Errors ----------
  function showErrors(errors, legIdx) {
    form.querySelectorAll("[aria-invalid]").forEach((n) => n.removeAttribute("aria-invalid"));
    errorsEl.replaceChildren();
    if (!errors.length) { errorsEl.hidden = true; return; }

    // Engine reports leg fields by position; map them to the real DOM ids.
    const domId = (f) => {
      const m = /^(country|start|end)-(\d+)$/.exec(f);
      if (m) return `${m[1]}-${legIdx[+m[2]]}`;
      return { legs: "add-leg", access: "acc-vm", apps: "apps", otherText: "other-text" }[f] || f;
    };
    const list = el("ul");
    errors.forEach((e) => {
      const id = domId(e.field);
      const target = $(id);
      if (target && target.tagName === "INPUT" || target?.tagName === "TEXTAREA") target.setAttribute("aria-invalid", "true");
      const link = el("a", { href: `#${id}` }, e.message);
      link.addEventListener("click", (ev) => { ev.preventDefault(); target?.focus(); });
      list.append(el("li", {}, link));
    });
    errorsEl.append(el("strong", {}, "Please fix the following:"), list);
    errorsEl.hidden = false;
    errorsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- Results ----------
  const VERDICT = {
    ok:       ["You're good to go", "Standard remote-access rules apply. Review the checklist below before you travel."],
    approval: ["Approval or setup needed before you travel", "Access is possible, but it needs the steps below completed first."],
    denied:   ["Access is not permitted", "At least one destination is on the prohibited list. Do not travel with company devices or attempt to sign in."],
  };
  const STATUS_LABEL = { ok: "Allowed", conditional: "Conditional", restricted: "Restricted", denied: "Denied" };

  function renderResults(r) {
    const [title, body] = VERDICT[r.overall];
    const out = [];

    out.push(el("div", { class: `verdict ${r.overall}` }, el("h2", {}, title), el("p", {}, body)));

    // Itinerary
    const rows = r.legs.map((l) => el("tr", {},
      el("td", {}, l.country),
      el("td", {}, `${fmtDate(l.start)} – ${fmtDate(l.end)}`),
      el("td", {}, `${l.days} day${l.days === 1 ? "" : "s"}`),
      el("td", {}, el("span", { class: `badge ${l.tier}` }, POLICY.tiers[l.tier].label))));
    const itin = el("div", { class: "result-card" },
      el("h3", {}, "Your itinerary"),
      el("table", {},
        el("thead", {}, el("tr", {}, ...["Country", "Dates", "Length", "Risk tier"].map((h) => el("th", {}, h)))),
        el("tbody", {}, rows)));
    if (r.tier !== "standard") {
      itin.append(el("p", { class: "notes" }, el("strong", {}, `${r.tierInfo.label}: `), r.tierInfo.blurb,
        r.drivingCountries.length ? ` (${r.drivingCountries.join(", ")})` : ""));
    }
    out.push(itin);

    // Lead time
    if (r.lead) {
      const l = r.lead;
      const msg = l.tooLate
        ? `Your first trip starts in ${l.available} business day${l.available === 1 ? "" : "s"}, but this risk level normally needs ${l.required}. Submit now and mark the request as urgent; approval is not guaranteed in time.`
        : `Submit your request by ${fmtDate(l.submitBy)} (${l.required} business days before your first departure on ${fmtDate(l.firstDeparture)}).`;
      out.push(el("div", { class: `callout ${l.tooLate ? "late" : ""}` }, el("strong", {}, l.tooLate ? "Short notice. " : "Timing. "), msg));
    }

    // Per-access guidance
    r.access.forEach((a) => {
      const card = el("div", { class: "result-card" },
        el("h3", {}, a.label, el("span", { class: `badge ${a.status}` }, STATUS_LABEL[a.status])),
        el("p", {}, a.summary));
      if (a.actions.length) card.append(el("ul", {}, a.actions.map((t) => el("li", {}, t))));
      const notes = a.notes.filter((n) => n.note);
      if (notes.length) card.append(el("div", { class: "notes" }, notes.map((n) => el("p", { style: "margin:4px 0" }, el("strong", {}, `${n.label}: `), n.note))));
      out.push(card);
    });

    // Trip-level checklist
    out.push(el("div", { class: "result-card" }, el("h3", {}, "Before you go"), el("ul", {}, r.actions.map((t) => el("li", {}, t)))));

    // Contacts + buttons
    const c = r.contacts;
    const contactsLine = el("p", { class: "contacts" },
      `Questions? ${c.it} (access), ${c.security} (devices & risk), ${c.legal} (sanctions & exceptions), ${c.hr} (work authorization & tax).`);
    const copy = el("button", { type: "button", class: "btn secondary" }, "Copy summary");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(textSummary(r)); copy.textContent = "Copied ✓"; }
      catch { copy.textContent = "Copy failed"; }
      setTimeout(() => (copy.textContent = "Copy summary"), 2000);
    });
    const print = el("button", { type: "button", class: "btn ghost" }, "Print");
    print.addEventListener("click", () => window.print());
    out.push(el("div", { class: "result-actions" }, copy, print), contactsLine);

    resultsEl.replaceChildren(...out);
    resultsEl.hidden = false;
    resultsEl.focus();
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function textSummary(r) {
    const lines = ["TRAVEL ACCESS SUMMARY", VERDICT[r.overall][0], ""];
    lines.push("Itinerary:");
    r.legs.forEach((l) => lines.push(`- ${l.country}: ${fmtDate(l.start)} – ${fmtDate(l.end)} (${l.days}d, ${POLICY.tiers[l.tier].label})`));
    if (r.lead) lines.push("", `Submit request by: ${fmtDate(r.lead.submitBy)}${r.lead.tooLate ? " (SHORT NOTICE – urgent)" : ""}`);
    r.access.forEach((a) => {
      lines.push("", `${a.label} — ${STATUS_LABEL[a.status]}`, a.summary, ...a.actions.map((t) => `  * ${t}`));
      a.notes.filter((n) => n.note).forEach((n) => lines.push(`  ${n.label}: ${n.note}`));
    });
    lines.push("", "Before you go:", ...r.actions.map((t) => `  * ${t}`));
    return lines.join("\n");
  }

  // ---------- Wire up ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = readInput();
    const result = evaluate(input, POLICY, COUNTRIES);
    showErrors(result.errors, input.legIdx);
    if (result.errors.length) { resultsEl.hidden = true; return; }
    renderResults(result);
  });

  $("add-leg").addEventListener("click", () => {
    addLeg();
    legsEl.lastElementChild.querySelector("input").focus();
  });

  form.addEventListener("reset", () => {
    legsEl.replaceChildren();
    addLeg();
    resultsEl.hidden = true;
    errorsEl.hidden = true;
    setTimeout(syncAccess, 0); // after native reset has cleared the fields
  });

  addLeg();
  syncAccess();
})();
