const { join } = require("node:path");

module.exports = {
  extends: "lighthouse:default",
  settings: {
    onlyCategories: ["performance", "accessibility", "best-practices", "seo", "pwa"],
  },
  audits: [
    { path: join(__dirname, "scripts/lh-pwa/manifest-audit.cjs") },
    { path: join(__dirname, "scripts/lh-pwa/sw-audit.cjs") },
    { path: join(__dirname, "scripts/lh-pwa/theme-audit.cjs") },
    { path: join(__dirname, "scripts/lh-pwa/icons-audit.cjs") },
  ],
  categories: {
    pwa: {
      title: "PWA",
      description: "Progressive Web App installability signals.",
      auditRefs: [
        { id: "viewport", weight: 2 },
        { id: "is-on-https", weight: 2 },
        { id: "pwa-manifest", weight: 2 },
        { id: "pwa-service-worker", weight: 2 },
        { id: "pwa-theme-color", weight: 1 },
        { id: "pwa-icons", weight: 1 },
      ],
    },
  },
};
