import { useEffect, useRef } from "react";
import { useSettings, type PluginAppBuilder } from "@get-bb/plugin-sdk/app";
import { installPaletteSearch } from "./palette";
import { installThreadSearch } from "./threads";
import { searchCache } from "./host";

/**
 * While `enabled`, runs `install`, which adds the disposers of what it
 * installs and gets `invalidate`, which refetches BB's thread searches.
 * Refetches them at once, and again whenever `changes` changes. Returns the
 * anchor of a hidden span to render.
 */
export function useSearchAdapter(
  enabled: boolean,
  install: (disposers: (() => void)[], invalidate: () => Promise<void>) => void,
  changes?: unknown,
) {
  const anchor = useRef<HTMLSpanElement>(null);
  const refresh = useRef(() => {});
  // Before the install below, which refetches once itself.
  useEffect(() => { refresh.current(); }, [changes]);
  useEffect(() => {
    if (!enabled || !anchor.current) return;
    const disposers: (() => void)[] = [];
    const stop = () => disposers.splice(0).reverse().forEach((dispose) => dispose());
    // Native search has no SDK extension point. The adapters check what they
    // read of BB and leave BB's search as it is when an update changes that.
    try {
      const invalidate = searchCache(anchor.current);
      if (!invalidate) return;
      disposers.push(invalidate, () => { refresh.current = () => {}; });
      install(disposers, invalidate);
      refresh.current = invalidate;
      void invalidate();
    } catch {
      stop();
      return;
    }
    return stop;
  }, [enabled, install]);
  return anchor;
}

function install(disposers: (() => void)[]) {
  disposers.push(installThreadSearch(window));
  disposers.push(installPaletteSearch(document));
}

function UniversalSearch() {
  const { values, isLoading } = useSettings();
  const anchor = useSearchAdapter(!isLoading && values?.universalSearch !== false, install);
  return <span ref={anchor} hidden aria-hidden="true" />;
}

export default function registerUniversalSearch(app: PluginAppBuilder) {
  app.slots.experimental_appOverlay({
    id: "universal-search",
    component: UniversalSearch,
  });
}
