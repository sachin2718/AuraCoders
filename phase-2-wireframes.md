# Phase 2: Meeting app wireframes

**Scope:** Three desktop-first, low-fidelity screens for the student startup app. Use simple cards, buttons, and tabs; no animations or advanced settings are required. Keep the meeting room usable at laptop width, with the side panel taking a fixed column.

## 1. Meeting room

```text
+--------------------------------------------------------------------------------+
| Product sync · Oct 5, 2026                         [Copy invite] [Leave meeting]|
+-----------------------------------------------+--------------------------------+
|                                               | [Chat] [Transcript]             |
|  +--------------------+ +------------------+  |--------------------------------|
|  | Priya              | | Arjun            |  | Meera: The beta date is the    |
|  |                    | |                  |  | twelfth.                        |
|  +--------------------+ +------------------+  |                                |
|  +--------------------+ +------------------+  | Priya: Let's keep ads paused   |
|  | Meera              | | Sam              |  | until stability improves.      |
|  |                    | |                  |  |                                |
|  +--------------------+ +------------------+  | [Write a message…] [Send]      |
|  +-----------------------------------------+ |                                |
|  | Meeting assistant     Listening          | |                                |
|  +-----------------------------------------+ |                                |
+-----------------------------------------------+--------------------------------+
| Assistant can hear and transcribe this meeting. [Allow assistant] [Not now]     |
+--------------------------------------------------------------------------------+
| [Mute] [Turn camera off] [Share screen]                         [End meeting]    |
+--------------------------------------------------------------------------------+
```

| Location | Exact copy / behavior |
|---|---|
| Header | `Product sync · Oct 5, 2026` · `Copy invite` · `Leave meeting` |
| Participant tiles | Show each participant's name. If video is off, show initials and `Camera off`. |
| Assistant tile, after consent | `Meeting assistant` · status `Listening` |
| Assistant tile, before consent | `Meeting assistant` · status `Waiting for consent` |
| Consent banner | `The assistant will listen to and transcribe this meeting to create a summary and action items. Everyone in the meeting should agree before it starts.` Buttons: `Allow assistant` and `Not now`. The assistant stays off until `Allow assistant` is selected. |
| Consent accepted | Banner changes to `Assistant is listening and transcribing.` Button: `Stop assistant`. |
| Consent declined | Banner changes to `Assistant is off. No transcript is being created.` Button: `Allow assistant`. |
| Side-panel tabs | `Chat` · `Transcript` |
| Chat composer | Placeholder: `Write a message…` · button: `Send` |
| Chat empty state | `No messages yet. Say hello to the team.` |
| Transcript before consent | `Transcript is off until the meeting agrees to use the assistant.` |
| Transcript empty state | `Nothing transcribed yet. The transcript will appear here as people speak.` |
| Transcript error | `Transcript paused. Check your connection and try again.` Button: `Retry` |
| Microphone error | `Microphone access is blocked. Allow microphone access in your browser settings.` Button: `Try again` |
| Controls | `Mute` · `Turn camera off` · `Share screen` · `End meeting` |
| General connection error | `Connection lost. Reconnecting…` Button when reconnect fails: `Rejoin meeting` |

## 2. Meeting summary

```text
+--------------------------------------------------------------------------------+
| ← Back to meetings                  Product sync · Oct 5, 2026      [Copy summary]|
+--------------------------------------------------------------------------------+
| TL;DR                                                                          |
| Beta is planned for Oct 12, pending QA. Keep paid ads paused until stability is  |
| at least 99.5% crash-free.                                                      |
+--------------------------------------------------------------------------------+
| Decisions                              | Open questions                         |
| • Beta starts Oct 12, pending QA.     | • Is the older Samsung device stable? |
|   “Let's call October twelfth…”        | • Do invite links fall back to store? |
| • Paid ads wait for 99.5% crash-free. |                                        |
|   “Until the crash-free rate…”         |                                        |
+--------------------------------------------------------------------------------+
| Action items                                                                  |
| Priya                                                                          |
| [ ] Confirm launch readiness after QA                   Due: Not set            |
|      “We'll check progress tomorrow.”                                          |
| Arjun                                                                          |
| [ ] Test older Android device and check crash logs       Due: Today, 2 PM        |
|      “I'll check the crash logs and test that older device by two.”             |
| [ ] Test Android invite deep link and store fallback    Due: Today, end of day |
|      “I'll test the Android invite deep link by end of day.”                    |
| Meera                                                                          |
| [ ] Export updated onboarding screens                   Due: Today, noon        |
|      “I'll export the updated onboarding screens by noon.”                     |
| Sam                                                                            |
| [ ] Confirm beta opt-ins and clean the list              Due: Today, 3 PM        |
|      “I'll confirm the beta opt-ins and clean the list by three.”               |
+--------------------------------------------------------------------------------+
```

| Location | Exact copy / behavior |
|---|---|
| Header | `Back to meetings` · `Product sync · Oct 5, 2026` · `Copy summary` |
| TL;DR | `Beta is planned for Oct 12, pending QA. Keep paid ads paused until stability is at least 99.5% crash-free.` |
| Decisions section | Heading: `Decisions`. Each decision shows concise text and a supporting source quote. Example: `Beta starts Oct 12, pending QA.` Quote: `“Let's call October twelfth the beta start, not the public launch.”` |
| Open questions section | Heading: `Open questions`. Show unresolved questions only, such as `Is the older Samsung device stable?` and `Do invite links fall back to the store?` |
| Action items section | Heading: `Action items`. Group by owner name. Each item has an unchecked checkbox, title, due date or `Due: Not set`, and a short source quote. |
| Summary empty state | `No summary yet. It will appear when the meeting ends and the transcript is ready.` |
| No decisions | `No decisions captured for this meeting.` |
| No open questions | `No open questions captured.` |
| No action items | `No action items captured.` |
| Processing state | `Creating your summary…` |
| Summary error | `We couldn't create the summary. Your transcript is still available.` Button: `Try again` |
| Missing source quote | `Source quote unavailable.` |
| Copy confirmation | `Summary copied.` |

## 3. My To-Dos

```text
+--------------------------------------------------------------------------+
| Meeting app                                      My To-Dos       [Avatar]|
+--------------------------------------------------------------------------+
| My To-Dos                                                               |
| Tasks assigned to you from meeting summaries.                           |
|                                                                          |
| To do                                                                    |
| +----------------------------------------------------------------------+ |
| | [ ] Test Android invite deep link and store fallback                  | |
| |     Product sync · Oct 5     Due today, end of day     [Open meeting] | |
| +----------------------------------------------------------------------+ |
| +----------------------------------------------------------------------+ |
| | [ ] Review beta signup list                                          | |
| |     Launch planning · Oct 2     Due date not set       [Open meeting] | |
| +----------------------------------------------------------------------+ |
|                                                                          |
| Completed                                                                |
| +----------------------------------------------------------------------+ |
| | [✓] Share revised onboarding copy                                   | |
| |     Product sync · Oct 1                              [Open meeting] | |
| +----------------------------------------------------------------------+ |
+--------------------------------------------------------------------------+
```

| Location | Exact copy / behavior |
|---|---|
| Page title | `My To-Dos` |
| Helper text | `Tasks assigned to you from meeting summaries.` |
| Sections | `To do` and `Completed`. Keep completed items visible in a simple list. |
| To-do row | Checkbox · action title · meeting name and date · due date or `Due date not set` · `Open meeting` link. |
| Completed row | Checked checkbox · action title · meeting name and date · `Open meeting` link. |
| Empty state | `You're all caught up. New action items assigned to you will show up here.` |
| Loading state | `Loading your to-dos…` |
| Error state | `We couldn't load your to-dos.` Button: `Try again` |
| Mark complete | On checking an item, move it to `Completed`. Brief confirmation: `Marked complete.` |
| Reopen item | On unchecking a completed item, move it back to `To do`. Brief confirmation: `Moved back to To do.` |
| Missing meeting | `Meeting unavailable` in place of the meeting title; keep the task visible. |

## 24-hour build boundary

- Build three static, responsive page layouts with one shared header and basic navigation.
- Use sample meeting data; render decisions, questions, and owner-grouped action items from simple local JSON.
- Make tabs, consent choices, checkboxes, and copy buttons clickable with basic local state.
- Do not depend on live video, real-time transcription, authentication, calendar sync, notifications, or backend task syncing for this prototype.
