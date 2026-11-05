import type { BbPluginApi } from "@get-bb/plugin-sdk";
import registerBriefRepliesServer from "./brief-replies/server";
import registerSnoozeServer from "./snooze/server";
import registerUiPolishServer from "./ui-polish/server";

export default async function plugin(bb: BbPluginApi) {
  // The browser reads these: Shortcuts in hotkeys/controller.ts, the rest in
  // their features' app.tsx. The servers of Snooze and Brief Replies read
  // their own.
  const settings = bb.settings.define({
    threadShortcuts: {
      type: "boolean",
      label: "Shortcuts",
      description:
        "Keyboard shortcuts in any layout, with hints while holding a modifier.",
      default: true,
    },
    universalSearch: {
      type: "boolean",
      label: "Universal Search",
      description:
        "Search commands, threads and snoozed threads in both English and Russian keyboard layouts.",
      default: true,
    },
    snooze: {
      type: "boolean",
      label: "Snooze",
      description:
        "Hide a thread until a time you pick or until its agent needs you. Turning it off brings snoozed threads back.",
      default: true,
    },
    archiveButton: {
      type: "boolean",
      label: "Archive Button",
      description: "An Archive button next to Snooze.",
      default: true,
    },
    searchActions: {
      type: "boolean",
      label: "Search Actions",
      description:
        "Ticks Archived in thread search's filter once, so archived threads show there too, and ⌘↵ (Ctrl+↵) unsnoozes a snoozed thread or unarchives an archived one instead of opening it in split.",
      default: true,
    },
    dismissCards: {
      type: "boolean",
      label: "Dismiss Cards",
      description:
        "A close button on the cards above a thread's message box for background work, child threads, and the pull request. A card stays hidden until its words change.",
      default: true,
    },
    phoneLayout: {
      type: "boolean",
      label: "Mobile Layout",
      description:
        "Mobile bars and gestures, haptics, and a fixed interface scale. Images still zoom.",
      default: true,
    },
    hideTitleBar: {
      type: "boolean",
      label: "Hide Title Bar",
      description:
        "In the macOS desktop app, no top row with back, forward, and the sidebar button. Their shortcuts still work.",
      default: false,
    },
    uiPolish: {
      type: "boolean",
      label: "UI Polish",
      description:
        "Icons in one tone, a thread bar without the external editor picker, and fixes for Safari, Tesla, and inline visualizations in BB's iOS app.",
      default: true,
    },
    briefReplies: {
      type: "boolean",
      label: "Brief Replies",
      description:
        "Agents reply in few words of plain English, after Andrej Karpathy's advice. Applies to threads started after the change.",
      default: false,
    },
  });
  await registerSnoozeServer(bb, settings);
  await registerBriefRepliesServer(bb, settings);
  registerUiPolishServer(bb);
}
