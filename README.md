# Travel Access Check

A small, dependency-free web tool that tells employees what network / SaaS access they can get while working abroad.

It asks:

1. Which country (or countries) are you traveling to, and
2. On what dates will you be working from each?
3. What do you need access to: virtual machines, collaboration/SaaS tools (Outlook, Slack, Box, OneDrive, ...), or something else?

It then returns an overall verdict, per-system guidance, a "before you go" checklist, and a submit-by date based on the destination's lead time.

## Run it

Open `index.html` in a browser, or serve the folder with any static host:

```bash
python3 -m http.server 8000
```

## Customize the rules

All guidance lives in **`policy.js`**: country risk tiers, lead times, per-tier requirements for VMs and SaaS, length-of-stay thresholds and contact names. **The shipped values are illustrative placeholders. Have Security, IT, Legal/Trade Compliance and HR review them before real use.**

| File | Purpose |
| --- | --- |
| `policy.js` | Editable policy data |
| `countries.js` | Country list for the picker |
| `engine.js` | Pure evaluation logic (runs in browser and Node) |
| `app.js`, `index.html`, `styles.css` | UI |

## Ideas for next steps

- Submit the result straight into your ticketing system (ServiceNow / Jira) instead of "Copy summary".
- Per-country overrides for individual apps, and a department/role question.
- Read country tiers from a managed source (e.g. Trade Compliance's sanctions list) rather than hard-coding.
