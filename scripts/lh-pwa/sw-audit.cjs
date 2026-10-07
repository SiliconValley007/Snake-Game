const { Audit, NetworkRecords } = require("lighthouse");

class PwaServiceWorker extends Audit {
  static get meta() {
    return {
      id: "pwa-service-worker",
      title: "Registers a service worker",
      failureTitle: "Does not register a service worker",
      description: "A service worker enables offline and installability.",
      requiredArtifacts: ["DevtoolsLog"],
    };
  }
  static async audit(artifacts, context) {
    const records = await NetworkRecords.request(
      artifacts.DevtoolsLog,
      context,
    );
    const has = records.some(
      (r) => /\/sw\.js(\?|$)/.test(r.url) && r.statusCode < 400,
    );
    return { score: has ? 1 : 0 };
  }
}

module.exports = PwaServiceWorker;
