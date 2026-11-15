import C from "../core.mjs";
import S from "../skyline.mjs";
const cache = new Map();
self.onmessage = async ({ data }) => {
  const { id, dem, observation, bounds, options = {} } = data;
  try {
    C.setDEM(dem);
    // Cached profiles include terrain values; equal coordinates in different sites are not interchangeable.
    cache.clear();
    const result = await S.search(observation, bounds, {
      ...options,
      cache,
      onProgress: (value) => postMessage({ id, type: "progress", value }),
    });
    if (dem.schema === "mars-region-grid-v1") {
      if (result.status === "good") result.status = "uncertain";
      result.reason =
        "Global MOLA has about 3.7 km spacing. Position confidence is uncalibrated, so the tracker shows experimental candidates without applying corrections.";
    }
    postMessage({ id, type: "result", result });
  } catch (error) {
    postMessage({ id, type: "error", message: error.message });
  }
};
