# Travel Access Check

A small, dependency-free web tool that tells employees what network / SaaS access they can get while working abroad.

It asks:

1. Which country (or countries) are you traveling to, and
2. On what dates will you be working from each?
3. What do you need access to: virtual machines, collaboration/SaaS tools (Outlook, Slack, Box, OneDrive, ...), or something else?

It then returns an overall verdict, per-system guidance, a "before you go" checklist, and a submit-by date based on the destination's lead time.

## Run it

Open `index.html` in a browser for the standalone version (guidance only), or run the server to also enable ticket submission:

```bash
node server.js          # Node 18+, no npm install needed
```

## Halo ITSM integration

When the server is configured, results include a **Submit request to IT** panel (name + work email) that creates a Halo ticket containing the full assessment. The browser never sees Halo credentials, and the server re-runs the rules on the raw answers, so ticket content can't be forged from the page. Without these variables the panel is simply hidden.

In Halo, create an API application (Configuration > Integrations > Halo API) using the *Client ID and Secret (Services)* login type with permission to create tickets, then set:

| Variable | Purpose |
| --- | --- |
| `HALO_BASE_URL` | e.g. `https://yourtenant.haloitsm.com` |
| `HALO_CLIENT_ID` / `HALO_CLIENT_SECRET` | API application credentials |
| `HALO_TICKETTYPE_ID` | Ticket type for these requests |
| `HALO_TICKET_CLIENT_ID` | Halo client (customer) the ticket is logged against |
| `HALO_PRIORITY_IDS` | Optional JSON by tier, e.g. `{"standard":4,"elevated":3,"high":2,"blocked":2}` |
| `HALO_EXTRA_FIELDS` | Optional JSON merged into the ticket (category, team, custom fields) |
| `HALO_AUTH_URL` | Optional override; default `${HALO_BASE_URL}/auth/token` |
| `HALO_DRY_RUN=1` | Log the ticket payload instead of calling Halo |

Start with `HALO_DRY_RUN=1` to inspect the payload. Ticket construction is in `ticket.js`.

**Before production:** put the app behind your SSO (the requester name/email are self-entered otherwise), serve it over HTTPS, and verify field names against your tenant. The code was tested against a mock of Halo's token and ticket endpoints, not a live tenant.

## Customize the rules

All guidance lives in **`policy.js`**: country risk tiers, lead times, per-tier requirements for VMs and SaaS, length-of-stay thresholds and contact names. **The shipped values are illustrative placeholders. Have Security, IT, Legal/Trade Compliance and HR review them before real use.**

| File | Purpose |
| --- | --- |
| `policy.js` | Editable policy data |
| `countries.js` | Country list for the picker |
| `engine.js` | Pure evaluation logic (runs in browser and Node) |
| `server.js`, `ticket.js` | Static server + Halo ticket creation |
| `app.js`, `index.html`, `styles.css` | UI |

## Ideas for next steps

- Per-country overrides for individual apps, and a department/role question.
- Read country tiers from a managed source (e.g. Trade Compliance's sanctions list) rather than hard-coding.
