const { Audit } = require("lighthouse");

class PwaServiceWorker extends Audit {
  static get meta() {
    return {
      id: "pwa-service-worker",
      title: "Registers a service worker",
      failureTitle: "Does not register a service worker",
      description: "A service worker enables offline and installability.",
      requiredArtifacts: ["Scripts", "MainDocumentContent"],
    };
  }
  static audit(artifacts) {
    const html = artifacts.MainDocumentContent || "";
    const scripts = artifacts.Scripts || [];
    const fromScript = scripts.some((s) => {
      const src = (s.src || "") + (s.content || "");
      return /sw\.js/.test(src) && /serviceWorker/.test(src);
    });
    const fromHtml = /serviceWorker/.test(html) && /sw\.js/.test(html);
    return { score: fromScript || fromHtml ? 1 : 0 };
  }
}

module.exports = PwaServiceWorker;
