const { join } = require("node:path");

module.exports = {
  audits: [
    { path: join(__dirname, "audits/manifest.js") },
    { path: join(__dirname, "audits/sw.js") },
    { path: join(__dirname, "audits/theme.js") },
    { path: join(__dirname, "audits/icons.js") },
  ],
  category: {
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
};
