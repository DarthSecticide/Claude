/*
 * Evaluation engine: turns the traveler's answers + the policy into guidance.
 * Pure functions, no DOM, so it runs in the browser and in Node tests.
 *
 * input = {
 *   legs: [{ country, start: "YYYY-MM-DD", end: "YYYY-MM-DD" }],
 *   access: { vm: bool, saas: bool, apps: ["outlook", ...], other: bool, otherText: string },
 *   sensitive: "yes" | "no" | "unsure" | ""
 * }
 */
(function (root) {
  const DAY = 86400000;

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null; // rejects 2026-02-31 etc.
  }

  function fmtDate(d) {
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function inclusiveDays(a, b) {
    return Math.round((b - a) / DAY) + 1;
  }

  function isWeekday(d) {
    const w = d.getDay();
    return w !== 0 && w !== 6;
  }

  // Weekdays strictly after `from`, up to and including `to` (0 if to <= from).
  function businessDaysBetween(from, to) {
    let n = 0;
    for (let d = new Date(from.getTime() + DAY); d <= to; d = new Date(d.getTime() + DAY)) {
      if (isWeekday(d)) n++;
    }
    return n;
  }

  function subtractBusinessDays(date, count) {
    let d = new Date(date);
    while (count > 0) {
      d = new Date(d.getTime() - DAY);
      if (isWeekday(d)) count--;
    }
    return d;
  }

  function tierOf(country, policy) {
    for (const tier of ["blocked", "high", "elevated"]) {
      if ((policy.countryTiers[tier] || []).includes(country)) return tier;
    }
    return "standard";
  }

  function worstTier(tiers, policy) {
    return tiers.reduce(
      (w, t) => (policy.tierOrder.indexOf(t) > policy.tierOrder.indexOf(w) ? t : w),
      "standard"
    );
  }

  function validate(input, countries, today) {
    const errors = [];
    const legs = input.legs || [];
    if (!legs.length) errors.push({ field: "legs", message: "Add at least one country." });

    legs.forEach((leg, i) => {
      const n = i + 1;
      if (!leg.country) return errors.push({ field: `country-${i}`, message: `Trip ${n}: choose a country.` });
      if (!countries.includes(leg.country))
        errors.push({ field: `country-${i}`, message: `Trip ${n}: “${leg.country}” isn't in the country list. Pick one from the suggestions.` });
      const s = parseDate(leg.start);
      const e = parseDate(leg.end);
      if (!s) errors.push({ field: `start-${i}`, message: `Trip ${n}: enter a valid start date.` });
      if (!e) errors.push({ field: `end-${i}`, message: `Trip ${n}: enter a valid end date.` });
      if (s && e && e < s) errors.push({ field: `end-${i}`, message: `Trip ${n}: the end date is before the start date.` });
      if (e && e < today) errors.push({ field: `end-${i}`, message: `Trip ${n}: this trip has already ended.` });
    });

    const a = input.access || {};
    if (!a.vm && !a.saas && !a.other)
      errors.push({ field: "access", message: "Choose at least one thing you need access to." });
    if (a.saas && !(a.apps || []).length)
      errors.push({ field: "apps", message: "Select which collaboration tools you need." });
    if (a.other && !(a.otherText || "").trim())
      errors.push({ field: "otherText", message: "Describe the other system(s) you need access to." });

    return errors;
  }

  function evaluate(input, policy, countries, today) {
    today = today || new Date(new Date().setHours(0, 0, 0, 0));
    const errors = validate(input, countries, today);
    if (errors.length) return { errors };

    const legs = input.legs.map((l) => {
      const start = parseDate(l.start);
      const end = parseDate(l.end);
      const tier = tierOf(l.country, policy);
      return { country: l.country, start, end, days: inclusiveDays(start, end), tier, alreadyStarted: start <= today };
    });

    const tier = worstTier(legs.map((l) => l.tier), policy);
    const driving = (t) => [...new Set(legs.filter((l) => l.tier === t).map((l) => l.country))];

    // Per-access guidance (based on the worst tier on the whole itinerary).
    const a = input.access;
    const wantsSensitive = input.sensitive === "yes" || input.sensitive === "unsure";
    const access = [];

    const build = (id, extraActions, extraNotes) => {
      const def = policy.access[id];
      const t = def.tiers[tier];
      let status = t.status;
      const actions = [...t.actions, ...(extraActions || [])];
      if (wantsSensitive && id !== "other") {
        actions.push(...(policy.sensitiveData[tier] || []));
        if (tier === "elevated" && status === "conditional" && input.sensitive === "yes") status = "restricted";
      }
      access.push({ id, label: def.label, status, summary: t.summary, actions, notes: extraNotes || [] });
    };

    if (a.vm) build("vm");
    if (a.saas) {
      const notes = (a.apps || []).map((id) => {
        const app = policy.apps[id];
        if (!app) return null;
        // Use the most specific note at or below the worst tier.
        let note = null;
        for (const t of policy.tierOrder) {
          if (policy.tierOrder.indexOf(t) <= policy.tierOrder.indexOf(tier) && app.notes[t]) note = app.notes[t];
        }
        return { label: app.label, note };
      }).filter(Boolean);
      build("saas", [], notes);
    }
    if (a.other) build("other", policy.access.other.actions, [{ label: "Your request", note: a.otherText.trim() }]);

    // Trip-level actions.
    const actions = [];
    const reviews = [];
    const byCountry = {};
    legs.forEach((l) => (byCountry[l.country] = (byCountry[l.country] || 0) + l.days));
    Object.entries(byCountry).forEach(([country, days]) => {
      const tpl = days >= policy.duration.taxDays ? policy.durationActions.tax
                : days >= policy.duration.reviewDays ? policy.durationActions.review : null;
      if (tpl) reviews.push(tpl.replace("{country}", country).replace("{days}", days));
    });
    actions.push(...reviews, ...policy.generalActions);

    // Lead time.
    let lead = null;
    const required = policy.tiers[tier].leadBusinessDays;
    if (required != null) {
      const first = legs.reduce((m, l) => (l.start < m ? l.start : m), legs[0].start);
      const available = businessDaysBetween(today, first);
      lead = {
        required,
        available,
        firstDeparture: first,
        submitBy: subtractBusinessDays(first, required),
        tooLate: available < required,
      };
    }

    // Overall verdict.
    const statuses = access.map((x) => x.status);
    let overall;
    if (tier === "blocked") overall = "denied";
    else if (statuses.every((s) => s === "ok") && reviews.length === 0) overall = "ok";
    else overall = "approval";

    return {
      errors: [],
      legs,
      tier,
      tierInfo: policy.tiers[tier],
      drivingCountries: driving(tier),
      overall,
      access,
      actions,
      lead,
      contacts: policy.contacts,
    };
  }

  const api = { evaluate, validate, parseDate, fmtDate, tierOf, businessDaysBetween, subtractBusinessDays };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TravelEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
