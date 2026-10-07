const { Audit } = require("lighthouse");

class PwaTheme extends Audit {
  static get meta() {
    return {
      id: "pwa-theme-color",
      title: "Sets a theme color",
      failureTitle: "Does not set a theme color",
      description: "theme-color styles the browser chrome.",
      requiredArtifacts: ["MetaElements"],
    };
  }
  static audit(artifacts) {
    const metas = artifacts.MetaElements || [];
    const has = metas.some((m) => m.name === "theme-color" && m.content);
    return { score: has ? 1 : 0 };
  }
}

module.exports = PwaTheme;
