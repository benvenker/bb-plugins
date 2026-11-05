# Changelog

Newest version first. [Releases](../README.md#releases) explains when a change
gets a new version. Each version is tagged `superhuman/v<version>`.

## 0.1.32 (2026-11-04)

- On BB 0.48, Universal Search, Search Actions, and snoozed threads in BB's
  thread search work again. They no longer turn themselves off on a BB version
  they weren't checked on. Each checks what it reads of BB's search and leaves
  it alone when a BB update changes it.
- Search Actions ticks **Archived** in thread search's **Filter and sort** menu
  once, so archived threads show there too, unless you changed that menu in
  this browser. Turning it off leaves the menu as it is.
- **⌘↵** unsnoozes or unarchives a thread only where its row shows the hint.
  Elsewhere, such as on a phone, it does what BB does.

## 0.1.31 (2026-10-26)

- On phones with BB 0.47, the navigation rail runs from the bottom again:
  Home lowest, level with New thread, and the plugins above it. BB 0.47 draws
  the rail without the element Mobile Layout turned over.

## 0.1.30 (2026-10-26)

- On BB 0.47, Hide Title Bar shows a page's header and the right panel's tabs
  again. BB 0.47 lifts both into the top row, so hiding the row pushed them
  above the window. Now the frame starts at its lip with the header and the
  tabs at the top of the card, the window drags from the lip, and the rail
  and New thread clear the window's buttons again.
- Needs BB 0.47.0 or later.

## 0.1.29 (2026-10-26)

- On BB 0.47, Universal Search, Search Actions, and snoozed threads in BB's
  thread search work again. They turn themselves off on BB versions they
  weren't checked on, and now run on BB 0.47.0 and 0.47.1 too.

## 0.1.28 (2026-10-22)

- In BB's iOS app, inline visualizations show their content again. The app
  leaves the `srcdoc` frame blank, so UI Polish loads the page from the plugin
  instead. Other platforms are unchanged.

## 0.1.27 (2026-10-16)

- On a phone, Settings, which BB 0.46.1 puts below the navigation rail, sits
  on the sidebar's background like the rail, with the rail's line beside it,
  instead of on a gray patch in the sidebar's bottom left corner.
- On BB 0.46.1, UI Polish again gives the Settings icon the same gray as the
  rail's other icons, on every device.

## 0.1.26 (2026-10-16)

- On BB 0.46.1, BB's thread search finds snoozed threads again, and Universal
  Search works again; both had turned themselves off on a version they hadn't
  been checked on. They now run on BB 0.46.0 and 0.46.1.
- New: Search Actions, on by default. In BB's thread search, **⌘↵** (**Ctrl+↵**
  on Windows and Linux) unsnoozes a snoozed thread or unarchives an archived one
  instead of opening it in split, and the row's hint says which. Archived
  threads show once you tick **Archived** in the search's **Filter and sort**
  menu. On a thread hidden by a parent's snooze, **⌘↵** wakes that snooze, which
  brings the parent back too.

## 0.1.25 (2026-10-14)

- BB's thread search now finds snoozed threads, and the child threads their
  snooze hid, by title. They sit among BB's own results, title matches first,
  highlighted as BB highlights titles. With Universal Search on, a query typed
  in the other keyboard layout finds them too. Like Universal Search, it works
  on BB 0.46.0 and stays off on other versions until checked again.

## 0.1.24 (2026-10-13)

- New: Dismiss Cards, on by default, puts a close button on the cards above a
  thread's message box for background work, child threads, and the pull
  request. A hidden card stays hidden in its thread, in that browser, until
  its words change; a new count or running time doesn't bring it back, and
  the background card comes back only for another kind of work.

## 0.1.23 (2026-10-12)

- On a phone, a thread's bar lays out its buttons as the home page's card
  does: the first and the last sit at the card's padding, and the rest spread
  evenly between them. The right panel's button now sits in the same spot in
  a thread's bar, on the home page, and in the right panel. When the buttons
  don't fit, other plugins' buttons scroll instead of BB's leaving the screen.
- Other plugins' buttons on the home page's card keep their own grouping and
  look as they do in a thread's bar. In both, only a button that holds just an
  icon takes the bar's thumb size; one with more, such as a count beside its
  icon, keeps its plugin's size, and so do buttons in a plugin's drop-down. A
  plugin that shows no button leaves no gap in either.

## 0.1.22 (2026-10-12)

- On a phone, the home page has a card below its message box, as a thread's
  bar is, with the right panel's button. What plugins put below the box, such
  as Thread Sidebar's Running and Shared pages buttons, spreads across the
  card instead of sitting loose below it, and hides with the card while the
  keyboard is open.

## 0.1.21 (2026-10-12)

- New: Brief Replies, off by default, tells agents to answer in few words of
  plain English: short sentences in the active voice, plain words, a small
  diagram where structure matters, and no preamble or recap. It follows Andrej
  Karpathy's advice to ask for ASD-STE100 Simplified Technical English and
  reaches threads started after you turn it on.

## 0.1.20 (2026-10-11)

- Superhuman is rebuilt for BB 0.46 and needs it. It has seven features,
  Shortcuts, Universal Search, Snooze, Archive Button, Mobile Layout, Hide
  Title Bar, and UI Polish, each with a switch in Settings, on by default except
  Hide Title Bar. Thread ETA, Code Copy, Preload Threads, Dia Sidebar, Terminal
  Paste, and Server Switcher are gone, and so are their settings. Snoozed
  threads stay snoozed.
- New: Hide Title Bar removes the macOS desktop app's 48px top row, with back
  and forward and the sidebar and right panel buttons, whose shortcuts still
  work. The window's buttons keep their corner: the rail's Home starts below
  them, and New thread, or a page's title while the sidebar is closed, beside
  them. The window drags by the frame's top edge and the room above Home.
- Archive Button runs BB's own Archive, with its confirmation for a thread with
  children and its Undo, and shows only for threads the sidebar lists.
- Mobile Layout follows BB 0.46's phone header: the thread bar again reads New
  thread, Archive, Snooze, other plugins' buttons, the thread's menu, then the
  right panel's button, without BB's Close pane, and a tap between its buttons
  no longer scrolls the thread to the top. In BB's apps the cards sit as far
  above the home bar as in a browser instead of twice as far.
- On a phone, BB 0.46's navigation rail runs upside down: Home and the rest
  stack up from the bottom, within reach of the thumb, with Home level with the
  footer's buttons, and Settings is at the top, level with the first row of
  Settings' list. The rail takes the thread list's background, with a line
  between them. BB's New thread moves down to the footer, and back and forward
  leave the sidebar.
- On the Terminal tab, BB's row of terminal keys sits just above the right
  panel's card, and alone above the keyboard while it is open. The bars now also
  give way to the keyboard on Android, which BB doesn't report.
- Paging through images in the fullscreen preview starts each one unzoomed.
- Mobile Layout leaves Settings' list of sections and the Paste key to BB 0.46,
  which has its own, and takes UI Polish's taller rows in sheets such as the
  branch picker.
- UI Polish no longer hides Commit, which BB 0.46's **Show Git changes and
  Commit button** setting does. Its one icon tone covers BB 0.46's navigation
  rail and the row above the threads, and the setting turns it off at once.
- Snooze can be turned off. Turning it off brings every snoozed thread back and
  removes the moon, the menu item, its commands, and **H**.
- Universal Search works in BB 0.46.0's command palette and thread search, and
  turns itself off there on other versions.
- Snooze, or Unsnooze with the wake time, is in every thread menu: the header's
  **…**, a sidebar row's menu and right-click menu, and the long-press menu on
  phones, just before Archive. **Customize row actions** can make it a button on
  sidebar rows. It replaces the moon in sidebar rows, which BB 0.46 no longer
  showed.
- **E** archives through BB's own Archive, with its confirmation for threads
  with children and its Undo.
- Shortcuts follow the keys BB 0.46 saves separately for macOS, Windows, and
  Linux, so **/** and the hints use this computer's keys.
- Hints under **⌘** or **⌃** show as soon as the key goes down. A key pressed
  under it, such as the 1 of **⌘1**, hides them until the modifier rests alone
  again, so the thread switch it starts does no hint work. **⇧** and **⌥** still
  wait for the key held alone, so typing capitals shows none.
- While Shortcuts' hints show, and for a moment after, BB's own hints stay
  hidden instead of appearing beside them 700 ms later or flashing when the
  modifier is released. Thread numbers skip rows in collapsed groups, as BB's
  do, and so does the next thread after snoozing the open one.
- Open plugins is gone: BB's navigation has Plugins.
- On phones, the Snooze and Snoozed threads sheets end like BB's own, clear of
  the home bar, without a second strip below the list.

## 0.1.19 (2026-10-05)

- Typing and switching threads no longer slow down. No rule styles an
  element's inside by what the element holds any more, which made Chrome
  restyle much of the page on every change; such rules read a marker through
  a style query instead, with the same look, and a test keeps it that way.
- Shortcut hints wait until a modifier is held alone for a moment, so chords
  such as ⌘1 and capitals typed with Shift do no hint work.
- Inline code gets its keyboard access and tooltip once the page is idle,
  after a thread switch has painted. Preload Threads looks entries up in BB's query cache
  directly, and Snooze, Thread ETA and Universal Search update at most once a
  frame, skipping chat and terminal output. Dia Sidebar sizes its badges only
  after layout.

## 0.1.18 (2026-10-01)

- Use title case for all settings toggle labels.

## 0.1.17 (2026-10-01)

- Match settings section spacing and heading alignment to BB's Interface
  section, removing the extra gap before Experimental.

## 0.1.16 (2026-10-01)

- Remove the divider between Configuration and Experimental in settings.

## 0.1.15 (2026-10-01)

- Experimental is a separate settings section beside Configuration, with
  matching headings and its own card for Thread ETA and Preload threads.

## 0.1.14 (2026-10-01)

- Settings include six switches: Shortcuts, Universal Search, Mobile layout,
  Archive button, and an Experimental section for Thread ETA and Preload
  threads. All six default to on. Shortcuts combines thread shortcuts and
  hints; Mobile layout includes haptics and interface zoom locking.
- Fullscreen images support pinch zoom and panning on phones while the
  interface stays at 100%. Desktop zoom is unchanged. Closing an image leaves
  no page zoom behind.
- Code Copy is always on, and thread titles are always hidden on phones.
  Their individual toggles, Haptics, and Zoom lock have been removed.

## 0.1.13 (2026-10-01)

- Thread shortcuts use physical keys in every keyboard layout: H opens Snooze,
  E archives, / searches threads, and numbers choose new-thread options.
  Modified BB shortcuts also accept their physical key when the typed
  character has no binding. Text inputs, composition, and terminal keys keep
  their normal behavior.
- Universal Search combines the typed query with its English/Russian keyboard
  equivalent in commands, thread search, and snoozed threads. Results keep
  their actions and keyboard navigation, duplicates are removed, and the input
  stays unchanged. The setting is on by default. Built-in search integration
  is verified for BB 0.44.0; unsupported versions keep native search.

## 0.1.12 (2026-09-29)

- Thread ETA gives agents a `set_thread_eta` tool: the time left on a
  background process they started, such as a training run or a long test
  suite, with an optional label. The thread's sidebar row counts it down, as
  `M:SS` or `H:MM:SS`, in place of its usual icon, whether the thread is
  working or not, until the time runs out or the agent clears it with 0
  seconds. Agents are told to set it only when the process's progress allows
  an estimate, never for their own coding, and to keep it current. The setting
  is on by default; turned off, it hides the countdown, and agents that start
  or resume afterwards don't get the tool.

## 0.1.11 (2026-09-28)

- Phone Layout opens the right panel with a swipe from the screen's right edge,
  as a swipe from the left edge opens the sidebar. The page follows the finger;
  a third of the way or a quick flick opens the panel, and a shorter swipe
  springs back.

## 0.1.10 (2026-09-28)

- Haptics plays a light tap as the phone's sidebar or right panel opens or
  closes, by a button, the backdrop, or a swipe. A swipe that springs back
  doesn't tap. BB's app plays it natively; a browser that can vibrate vibrates.
  The setting is on by default.

## 0.1.9 (2026-09-28)

- Phone Layout spreads the buttons of a thread's bar without its title so that
  their icons sit as far from the card's sides as from each other.

## 0.1.8 (2026-09-28)

- Phone Layout stops a thread's messages at their first and last line instead
  of letting them stretch past and spring back.
- Phone Layout opens the sidebar with Settings' list of sections on entering
  Settings, instead of leaving the list closed behind a section.
- Phone Layout adds New thread to a thread's bar, first in the row. It opens the
  new-thread screen as the sidebar's New thread does, with the thread's project
  selected and the prompt focused.
- Phone Layout reverses a thread's buttons, up to the one that shows the right
  panel, which stays last. Without the title the bar reads New thread,
  Archive, Snooze, other plugins' buttons, the thread's menu, then the right
  panel's button.

## 0.1.7 (2026-09-27)

- Preload Threads loads up to four recent dialogue segments before navigation
  and refreshes them when a background thread completes. Older history loads
  normally when scrolling back. It uses BB 0.44.0's existing memory cache,
  without marking threads read or changing BB's source. The setting is on by
  default and pauses with a hidden page, offline connection, or Data Saver.
- Speculative history has a bounded size and count. Foreground loading takes
  priority, and obsolete responses cannot overwrite newer cached data. Newer
  threads stay cached under memory pressure without repeatedly fetching evicted
  history. An already-connected subscription preserves the existing cache.

## 0.1.6 (2026-09-27)

- UI Polish hides BB's git action, such as Commit, and the external editor
  picker from the thread bar on every screen size.

## 0.1.5 (2026-09-27)

- Phone Layout floats a phone's bars as cards in the shape of the thread's
  message box: as far from the screen's sides, as round, as tall as the box
  while it shows one line, and with its border and shadow. Their buttons are
  40px, as the box's own are, and a title starts where the box's text does.
  The right panel's row is a card as well, and the home page's button sits
  where a card's would. With San Francisco 0.1.1 the cards take its corners
  and text inset.
- Phone Layout drops BB's Commit button from a phone's thread bar. With the
  Thread title setting off, the bar's buttons spread evenly across it.
- Fixes for BB 0.44: the Thread title setting hides the title in a phone's
  thread bar again, Phone Layout puts the sidebar's divider above the grid
  again, and UI Polish gives Dia Sidebar's icons the tone of BB's other icons
  again.
- UI Polish leaves the check marks in Customize sidebar in their box's color.

## 0.1.4 (2026-09-27)

- Code Copy copies an agent's code blocks and inline commands with a click or
  tap, with a confirmation after copying. Inline code also supports Enter and
  Space. Selection, scrolling, links, and existing code buttons keep working.
  The Code copy setting is on by default.

## 0.1.3 (2026-09-27)

- Snooze adds a moon button before Archive in the sidebar's thread rows. It
  opens the picker for that row without switching the open thread.

## 0.1.2 (2026-09-27)

- Phone Layout makes the buttons in a phone's bars bigger, for the thumb: 44px
  with 24px icons, in bars 56px tall. Every button there takes that size, BB's
  or a plugin's, and so do the right panel's tabs. Dia Sidebar's icons take the
  same size and narrow, down to BB's size, to stay in one row.
- Phone Layout drops the sidebar button from a phone's bars and home page. The
  sidebar opens with a swipe from the screen's left edge.
- In Phone Layout, Dia Sidebar's **…** button, which opens the rest of the
  navigation, is an arrow.
- In Phone Layout, a swipe down a terminal hides the on-screen keyboard and
  brings the bars back.
- Phone Layout takes less of the browser's work each time a page restyles, as
  when the keyboard opens or a message comes in.
- Snooze's, Archive's, and Paste's buttons take the tone of BB's own icons with
  any theme. Paste's was a shade off.
- UI Polish no longer recolors other plugins' buttons in the thread header.
  Bookmarks 0.1.1 takes BB's tone by itself.

## 0.1.1 (2026-09-26)

- New: Archive Button, an Archive button next to Snooze in the thread header.
- New setting: Thread title, to hide the thread's title in a phone's bar.
- Snooze's button, and other plugins' buttons in the thread header such as
  Bookmarks', take the tone of BB's own icons.

## 0.1.0 (2026-09-26)

- First release. It brings the Super Hotkeys, Snooze, Dia Sidebar, Terminal
  Paste, and Server Switcher plugins together as one plugin, with the same
  features: keyboard hints and shortcuts, snoozed threads, a compact grid of
  navigation icons, a Paste button for the terminal on phones and tablets, and a
  Change Server button in the sidebar footer.
- New: Phone Layout, Zoom Lock (off by default), and UI Polish.
- Settings: Shortcut hints, Thread shortcuts (formerly two settings in Super
  Hotkeys), Phone layout, and Zoom lock.
- Moving from those plugins: unsnooze your threads before you remove Snooze,
  since nothing wakes them after that. Settings and snoozes don't carry over. If
  you picked Dia Sidebar under Settings → Appearance → Navigation, pick it again
  there, and bind again any keys you gave Open plugins, Snooze thread, or Show
  snoozed threads.
