# San Francisco Plugins

A family of [bb](https://getbb.app) plugins by
[Yurii Rebryk](https://x.com/rebryk), plus the marketplace catalog that serves
them.

## Use this repository as a marketplace

```sh
bb marketplace add git:https://github.com/rebryk/bb-plugins.git@main
bb plugin install superhuman@sf-plugins
bb plugin install bookmarks@sf-plugins
bb plugin install todo@sf-plugins
bb plugin install canvas@sf-plugins
bb plugin install annotate@sf-plugins
bb plugin install auto-update@sf-plugins
bb plugin install storage-cleaner@sf-plugins
bb plugin install resource-monitor@sf-plugins
bb plugin install san-francisco@sf-plugins
bb plugin install pool-usage@sf-plugins
bb plugin install slack@sf-plugins
bb plugin install voice-input@sf-plugins
```

`bb marketplace refresh sf-plugins` re-reads the catalog; it never installs or
updates a plugin on its own. The catalog tracks `main`, so
`bb plugin update pool-usage` follows this repository's latest commit.

## Plugins

All ten suit any BB setup, except that Annotate needs the desktop app and
Storage Cleaner needs macOS. With Account Pooler, Pool Usage counts every
pooled account.

### [Superhuman](./superhuman)

Superhuman-style speed for BB: hints with the remaining keys of visible
shortcuts, slash to search threads, H to snooze and E to archive, and number
keys that set up a new thread's project, model, machine, and branch, all in any
keyboard layout; search in the command palette and thread search that also finds
what the query means in the other keyboard layout, English or Russian; a moon
that snoozes a thread until a time you pick or until its agent needs you, in its
header and in every thread menu just before Archive, with an Archive button
beside it; archived threads in thread search, where ⌘↵ unsnoozes or unarchives a
thread; a close button on the cards above a thread's message box; BB's bars at
the bottom of a phone's screen, with swipes from its edges and haptics; an
option to drop the macOS app's title bar; one tone for BB's icons, with no
external editor picker in the thread bar; and an option for agents to answer in
few words of plain English.

### [Bookmarks](./bookmarks)

A bookmark button on every chat message and a Bookmarks tab in the thread's
right panel that lists the saved messages across threads; clicking one opens
its thread scrolled to the message.

### [To-do](./todo)

A Notes-style to-do list under the composer on the New thread screen and in a
To-do tab in the right panel. Check to-dos off, drag them into order, snooze
them until later, and start a thread from one with its arrow button. One list
per BB server, the same on desktop and phone.

### [Canvas](./canvas)

A canvas in each thread’s right panel for pasted screenshots, movable images,
text, and drawing. Capture a browser block in desktop BB, annotate it, and let
your agent read the elements or see the entire board as a PNG.

### [Annotate](./annotate)

An Annotate button and shortcut for the desktop app's Browser. Pick an
element of the page, write a note, and send it to your agent as a pill with
the element's details and a screenshot.

### [Auto Update](./auto-update)

A page in Settings that lists your plugins by where they came from, each with
a switch. BB checks the plugins turned on for updates every hour, 6 hours, day,
or week, or when you click Check Now, and installs them the way
`bb plugin update` does.

### [Storage Cleaner](./storage-cleaner)

A page in Settings that shows what fills the Mac's disk: free space, a bar split
into BB & agents, dev caches, apps, the Trash, your files, and the system, and
a treemap explorer. Clean deletes the storage of archived threads, leftover
worktrees, dev caches, or the Trash, and switches do it every night.

### [Resource Monitor](./resource-monitor)

Three live bars, CPU, RAM, and GPU, as the plugin's icon in the sidebar's
navigation rail, updated every 2 seconds. Hover the icon for the numbers.
Click it for the server's processes, to sort, filter, and quit them. On
macOS, Guard keeps BB responsive when the Mac is overloaded: what BB starts
runs at a lower priority, moves to the efficiency cores under load, and
**Pause all** stops it from any device, the phone too.

### [San Francisco](./san-francisco)

A quiet macOS-style theme after the Aside browser: the content as a white card
on the gray window frame, the system font, a round send button, settings laid
out like a document, and your pick of the eight macOS accent colors.

### [Pool Usage](./pool-usage)

One number per provider at the right end of the sidebar footer: how much of
each provider's capacity is in use, across Account Pooler accounts, weighted by
plan. Click it for the next resets.

## Other plugins

The catalog also serves plugins outside the San Francisco family.

### [Slack](./slack)

A Slack button in every thread's header with your unread direct messages and
mentions. In the BB app it opens Slack in the thread's right panel; on a phone,
the Slack app. Needs a Slack session from a browser.

### [Voice Input](./voice-input)

BB's voice input transcribed on the BB server's Mac by the Parakeet Ultra
speech model on the Neural Engine: 25 languages, no hesitations, and the audio
never leaves the Mac. Needs a Mac with Apple silicon and macOS 15 or later, the
Xcode Command Line Tools, and ffmpeg.

## Layout

- `marketplace.json` is the v2 marketplace document bb reads.
- `<plugin-id>/` holds one plugin, with its own `package.json`, tests, and
  `CHANGELOG.md`.
- `screenshots/<plugin-id>/` holds the catalog screenshots.

## Releases

Each plugin has its own version, in `<plugin-id>/package.json`, its own
history, in `<plugin-id>/CHANGELOG.md`, and its own release tags,
`<plugin-id>/v<version>`, so tags never collide between plugins.

1. In every pull request that changes what a plugin ships (its code, styles,
   manifest, or runtime dependencies), raise that plugin's patch version by
   one: 0.1.0, then 0.1.1, then 0.1.2. Run
   `npm version patch --no-git-tag-version` in the plugin's directory, which
   updates `package.json` and `package-lock.json` together. A pull request is
   one step however many commits it has, and a pull request that changes two
   plugins raises both. Tests, docs, and dev tooling alone don't need a new
   version; they ship with the next one.
2. In the same pull request, add the new version at the top of the plugin's
   `CHANGELOG.md`, with the date and what changed for the people who use the
   plugin.
3. When the pull request merges, the
   [Release tags](./.github/workflows/release-tags.yml) workflow tags the new
   commit on `main` as `<plugin-id>/v<version>`. The
   [BB Community marketplace](https://github.com/get-bb/marketplace) entries
   resolve those tags through `subdir` and `tagPrefix`, so their installs see
   the update in Settings → Updates. This repository's own catalog follows
   `main` instead.

Keep the minor and major numbers as they are. A BB Community entry accepts
only versions inside its range (`^0.1.0` covers 0.1.x), so a 0.2.0 reaches no
community install until a pull request to get-bb/marketplace widens the
range. That repository also keeps its own copy of each listing's description,
overview, and screenshots, so changing those takes a pull request there too.

Never move or delete a pushed tag. BB records the commit behind each tag and
reports a moved tag as a failed security check. Fix a bad release with the
next version.
