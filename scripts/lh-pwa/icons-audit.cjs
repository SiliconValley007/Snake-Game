const { Audit } = require("lighthouse");

class PwaIcons extends Audit {
  static get meta() {
    return {
      id: "pwa-icons",
      title: "Provides 192 and 512 PNG icons",
      failureTitle: "Missing 192/512 PNG icons",
      description: "Installable PWAs need 192 and 512 icons.",
      requiredArtifacts: ["MainDocumentContent"],
    };
  }
  static audit(artifacts) {
    const html = artifacts.MainDocumentContent || "";
    const has192 = /icon-192\.png/.test(html);
    const hasApple = /rel=["']apple-touch-icon["']/.test(html);
    return { score: has192 && hasApple ? 1 : 0 };
  }
}

module.exports = PwaIcons;
