/*
 * Travel Access Policy — the ONLY file that needs editing to change guidance.
 *
 * !! The values below are illustrative defaults, not your organization's policy. !!
 * Have Security, IT, Legal/Trade Compliance and HR review every country tier,
 * lead time and requirement before this tool is used for real decisions.
 */
(function (root) {
  const POLICY = {
    // Order matters: later tiers are more restrictive.
    tierOrder: ["standard", "elevated", "high", "blocked"],

    tiers: {
      standard: {
        label: "Standard",
        leadBusinessDays: 3,
        blurb: "No special restrictions beyond normal remote-access rules.",
      },
      elevated: {
        label: "Elevated",
        leadBusinessDays: 10,
        blurb: "Higher cyber or legal exposure. A conditional-access exception and managed device are required.",
      },
      high: {
        label: "High risk",
        leadBusinessDays: 15,
        blurb: "Significant device-compromise, surveillance or legal risk. Loaner device and Security sign-off required.",
      },
      blocked: {
        label: "Not permitted",
        leadBusinessDays: null,
        blurb: "Comprehensively sanctioned or otherwise prohibited. Access is denied unless Legal / Trade Compliance grants a written exception.",
      },
    },

    // Country -> tier. Anything not listed is "standard".
    countryTiers: {
      blocked: ["Cuba", "Iran", "North Korea", "Syria"],
      high: [
        "China", "Russia", "Belarus", "Venezuela", "Myanmar", "Afghanistan",
        "Sudan", "South Sudan", "Libya", "Yemen", "Somalia", "Iraq",
      ],
      elevated: [
        "United Arab Emirates", "Saudi Arabia", "Turkey", "India", "Vietnam",
        "Egypt", "Pakistan", "Nigeria", "Kazakhstan", "Uzbekistan", "Ukraine",
        "Israel", "Lebanon", "Cambodia", "Ethiopia", "Cameroon", "Mexico",
      ],
    },

    // Length-of-stay thresholds (days spent in a single country).
    duration: {
      reviewDays: 30,   // HR / Legal / Tax review (permanent establishment, payroll, immigration)
      taxDays: 183,     // common tax-residency threshold
    },

    // Guidance for each access type, by worst tier on the itinerary.
    // status: ok | conditional | restricted | denied
    access: {
      vm: {
        label: "Virtual machine(s)",
        tiers: {
          standard: {
            status: "ok",
            summary: "Allowed over the corporate VPN from a managed device with MFA.",
            actions: [
              "Connect only through the corporate VPN or approved VDI gateway.",
              "Use a company-managed laptop with disk encryption and EDR running.",
            ],
          },
          elevated: {
            status: "conditional",
            summary: "Allowed with a geo-fencing exception and a managed device.",
            actions: [
              "Open an IT ticket for a temporary VPN / conditional-access geo exception covering your travel dates.",
              "Use a company-managed laptop only; no personal devices.",
              "Do not leave sessions idle or logged in on shared or hotel networks; use the VPN at all times.",
            ],
          },
          high: {
            status: "restricted",
            summary: "Only from a Security-issued loaner laptop, with prior Security approval.",
            actions: [
              "Request a clean loaner laptop from IT; do not bring your normal laptop or phone.",
              "Obtain written Security approval naming the specific VMs you need.",
              "Production and sensitive-data VMs are off-limits; use a sandbox or jump host where possible.",
              "Re-image or quarantine the loaner device when you return.",
            ],
          },
          blocked: {
            status: "denied",
            summary: "Not permitted. Access from this location is blocked.",
            actions: [
              "Do not attempt to connect; sign-in attempts from this country will be blocked and alerted.",
              "Contact Legal / Trade Compliance if there is a business-critical need.",
            ],
          },
        },
      },

      saas: {
        label: "SaaS & collaboration tools",
        tiers: {
          standard: {
            status: "ok",
            summary: "Allowed with SSO and MFA from a managed device.",
            actions: [
              "Sign in through SSO with MFA; carry your hardware key or authenticator in case of lost-phone scenarios.",
            ],
          },
          elevated: {
            status: "conditional",
            summary: "Allowed from a managed device after a conditional-access exception.",
            actions: [
              "Open an IT ticket for a temporary conditional-access exception for your travel dates.",
              "Use a managed device; personal devices get web-only, no-download access.",
              "Make sure you have a backup MFA method that works without your home mobile number.",
            ],
          },
          high: {
            status: "restricted",
            summary: "Web-only access from a loaner device, with file sync and downloads disabled.",
            actions: [
              "Use a Security-issued loaner device; do not sign in from personal or normal work devices.",
              "Offline sync (OneDrive / Box Drive) and bulk downloads will be disabled.",
              "Assume communications may be monitored; keep sensitive discussions off chat and email.",
              "Sign out and revoke sessions before you return.",
            ],
          },
          blocked: {
            status: "denied",
            summary: "Not permitted. Access from this location is blocked.",
            actions: [
              "Do not attempt to sign in; attempts will be blocked and alerted.",
              "Contact Legal / Trade Compliance if there is a business-critical need.",
            ],
          },
        },
      },

      other: {
        label: "Other systems",
        tiers: {
          standard: { status: "conditional", summary: "Needs a quick IT review to confirm the system's own travel rules.", actions: [] },
          elevated: { status: "conditional", summary: "Needs IT / Security review before travel.", actions: [] },
          high: { status: "restricted", summary: "Needs Security review; assume denied unless explicitly approved.", actions: [] },
          blocked: { status: "denied", summary: "Not permitted from this location.", actions: [] },
        },
        actions: ["Describe the system, its owner and the data it holds in your IT ticket so it can be reviewed."],
      },
    },

    // Extra per-application notes shown when that app is selected, by worst tier.
    apps: {
      outlook: { label: "Outlook / email",       notes: { high: "Mailbox cached offline will be disabled; use web access only." } },
      slack:   { label: "Slack",                 notes: { high: "Avoid sharing files or credentials in Slack from this location." } },
      box:     { label: "Box",                   notes: { elevated: "Download of sensitive folders may be blocked by device-trust rules.", high: "Box Drive sync is disabled; web preview only." } },
      onedrive:{ label: "OneDrive / SharePoint", notes: { elevated: "Known-folder sync may pause outside approved countries.", high: "OneDrive sync is disabled; web access only." } },
      teams:   { label: "Teams / Zoom",          notes: { high: "Do not record or share your screen with sensitive content." } },
      other_saas: { label: "Other SaaS app",     notes: {} },
    },

    // Added when the traveler says they handle sensitive / regulated data.
    sensitiveData: {
      standard: [],
      elevated: ["Because you handle sensitive data, Security must approve the exception (not just IT)."],
      high: ["Sensitive data must not be accessed from this location without a documented Security + Legal exception."],
      blocked: [],
    },

    // Shown for every trip.
    generalActions: [
      "Confirm with HR / Immigration that you are legally permitted to work remotely in each country on your visa or entry status. Tourist status often does not allow it.",
      "Keep your travel dates accurate; extensions need a new request.",
      "Report a lost or stolen device to the Security team immediately.",
    ],

    durationActions: {
      review: "Your stay in {country} is {days} days. HR, Legal and Tax need to review payroll, tax-residency and permanent-establishment impact.",
      tax: "Your stay in {country} is {days} days, which may trigger tax residency. This needs HR / Tax approval before you go.",
    },

    contacts: {
      // Shown in the result. Replace with real queues / links.
      it: "IT Service Desk",
      security: "Security Team",
      legal: "Legal / Trade Compliance",
      hr: "HR / Global Mobility",
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = POLICY;
  else root.TRAVEL_POLICY = POLICY;
})(typeof globalThis !== "undefined" ? globalThis : this);
