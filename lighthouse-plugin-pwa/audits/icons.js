const { Audit } = require("lighthouse");

class PwaIcons extends Audit {
  static get meta() {
    return {
      id: "pwa-icons",
      title: "Provides 192 PNG and apple-touch-icon",
      failureTitle: "Missing 192 PNG or apple-touch-icon",
      description: "Installable PWAs need icons and an apple-touch-icon.",
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
