import type { PluginAppSetup } from "@get-bb/plugin-sdk/app";

/**
 * One feature as a whole plugin app, for `loadPluginApp` in its tests. The SDK
 * binds its runtime when it first loads, so both imports wait for the call.
 */
export function asPluginApp(load: () => Promise<{ default: PluginAppSetup }>) {
  return async () => {
    const [{ definePluginApp }, feature] = await Promise.all([
      import("@get-bb/plugin-sdk/app"),
      load(),
    ]);
    return definePluginApp(feature.default);
  };
}
