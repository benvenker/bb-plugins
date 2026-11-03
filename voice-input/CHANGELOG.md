# Changelog

Newest version first. [Releases](../README.md#releases) explains when a change
gets a new version. Each version is tagged `voice-input/v<version>`.

## 0.1.2 (2026-11-02)

- Faster: the plugin streams each take of BB's voice input to the server while
  you speak, and decodes it as it comes in. The text is in the composer about
  as soon as you stop, however long the take: 0.05 seconds after Stop when
  you pause before it, 0.14 seconds mid-word, instead of 0.66. BB's composer
  no longer plays its transition before the text goes in.
- Fixed: the plugin downloads the speech model from its new address. The old
  one stopped working, so new installs could not get ready.

## 0.1.1 (2026-10-14)

- New: a **Microphone** setting for BB's voice input. With **Built-in**, BB
  records with your Mac's, iPhone's, or iPad's own microphone, even with AirPods
  or other headphones connected. **Automatic**, the default, leaves the choice
  to BB. The setting works with any service that transcribes the voice input.

## 0.1.0 (2026-10-13)

- First release: an AI service for BB's voice input that transcribes takes on
  the BB server's Mac with Parakeet Ultra on the Neural Engine, and removes
  hesitations. The plugin downloads the model and builds its recognizer on its
  first load.
