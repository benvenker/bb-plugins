import { useEffect } from "react";
import {
  definePluginApp,
  experimental_usePluginId as usePluginId,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import { preferBuiltInMicrophone } from "./microphone";
import { streamTakes } from "./stream";

/**
 * Streams each take to the server while it is spoken, and has BB record with
 * the device's own microphone while the setting says so.
 */
function Microphone() {
  const builtIn = useSettings().values?.microphone === "built-in";
  const pluginId = usePluginId();
  useEffect(() => {
    // Outside HTTPS and localhost, browsers offer no microphones.
    const media = navigator.mediaDevices;
    if (!media) return;
    const path = `/api/v1/plugins/${pluginId}/http/stream`;
    const url = new URL(path, location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const unstream = streamTakes(media, url.href);
    const unprefer = builtIn ? preferBuiltInMicrophone(media) : () => {};
    return () => {
      unprefer();
      unstream();
    };
  }, [builtIn, pluginId]);
  return null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "microphone",
    component: Microphone,
  });
});
