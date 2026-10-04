import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { SIRI_ENABLED: "false", TZ: "UTC" },
  },
});
