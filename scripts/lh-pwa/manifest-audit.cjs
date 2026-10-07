const { Audit } = require("lighthouse");

class PwaManifest extends Audit {
  static get meta() {
    return {
      id: "pwa-manifest",
      title: "Provides a web app manifest",
      failureTitle: "Does not provide a web app manifest",
      description: "A manifest enables installability and theming.",
      requiredArtifacts: ["LinkElements"],
    };
  }
  static audit(artifacts) {
    const links = artifacts.LinkElements || [];
    const has = links.some((l) => l.rel === "manifest" && l.href);
    return { score: has ? 1 : 0 };
  }
}

module.exports = PwaManifest;
