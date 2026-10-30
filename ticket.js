/*
 * Builds a Halo ITSM ticket payload from an engine result. Pure, Node-only.
 * All user-supplied text is HTML-escaped because Halo renders details_html.
 */
const { fmtDate } = require("./engine.js");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

const VERDICT = { ok: "Standard", approval: "Approval needed", denied: "Not permitted (exception request)" };

function buildTicket(result, input, requester, cfg, policy) {
  const countries = [...new Set(result.legs.map((l) => l.country))];
  const first = result.legs.reduce((m, l) => (l.start < m ? l.start : m), result.legs[0].start);
  const last = result.legs.reduce((m, l) => (l.end > m ? l.end : m), result.legs[0].end);
  const wants = result.access.map((a) => a.label);

  const summary = `Travel access: ${countries.join(", ")} (${fmtDate(first)} – ${fmtDate(last)})`.slice(0, 250);

  let html = `<p><strong>Requester:</strong> ${esc(requester.name)} &lt;${esc(requester.email)}&gt;</p>`;
  html += `<p><strong>Assessment:</strong> ${esc(VERDICT[result.overall])} &middot; highest risk tier: ${esc(result.tierInfo.label)}</p>`;
  if (result.lead) {
    html += `<p><strong>Timing:</strong> submit by ${esc(fmtDate(result.lead.submitBy))}; ${result.lead.available} business day(s) until departure, ${result.lead.required} required.${result.lead.tooLate ? " <strong>SHORT NOTICE.</strong>" : ""}</p>`;
  }
  html += `<h3>Itinerary</h3><table border="1" cellpadding="4"><tr><th>Country</th><th>Dates</th><th>Days</th><th>Tier</th></tr>`;
  html += result.legs.map((l) =>
    `<tr><td>${esc(l.country)}</td><td>${esc(fmtDate(l.start))} – ${esc(fmtDate(l.end))}</td><td>${l.days}</td><td>${esc(policy.tiers[l.tier].label)}</td></tr>`).join("");
  html += `</table><h3>Access requested</h3>`;
  result.access.forEach((a) => {
    html += `<p><strong>${esc(a.label)}</strong> – ${esc(a.summary)}</p>`;
    if (a.actions.length) html += list(a.actions);
    a.notes.filter((n) => n.note).forEach((n) => (html += `<p><em>${esc(n.label)}:</em> ${esc(n.note)}</p>`));
  });
  if (input.sensitive) html += `<p><strong>Handles sensitive data:</strong> ${esc(input.sensitive)}</p>`;
  html += `<h3>Before travel</h3>${list(result.actions)}`;
  html += `<p><small>Created by the Travel Access Check tool.</small></p>`;

  const ticket = {
    summary,
    details_html: html,
    tickettype_id: cfg.ticketTypeId,
    client_id: cfg.clientId,
    user_name: requester.name,
    reportedby: requester.name,
    ...(cfg.priorityIds[result.tier] != null && { priority_id: cfg.priorityIds[result.tier] }),
    ...cfg.extraFields,
  };
  return { ticket, wants };
}

module.exports = { buildTicket, esc };
