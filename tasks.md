Task ID: T-0009
Title: TTS Volume Control and Robustness
Status: DONE
Owner: Miles

Start log:
- Timestamp: 2025-12-31 10:25
- Plan: Add volume slider for TTS, improve error handling in TTS API and client, and fix IDE warnings.

End log:
- Timestamp: 2025-12-31 10:30
- Changed:
  - Added volume control to translation settings and visual feedback.
  - Updated TTS playback to respect volume settings.
  - Added robust error handling and logging for TTS requests.
  - Fixed useEffect dependencies and CSS vendor prefix ordering.
- Tests: Verified build and resolving lint warnings.
- Status: DONE

------------------------------------------------------------

Task ID: T-0010
Title: Remove Translation and Transcription Features
Status: DONE
Owner: Miles

... (previous log content) ...

------------------------------------------------------------

Task ID: T-0011
Title: Implement Real-time Streaming Transcription
Status: DONE
Owner: Miles

... (previous log content) ...

------------------------------------------------------------

Task ID: T-0012
Title: Refine Transcription Style and Behavior
Status: DONE
Owner: Miles
Related repo or service: Orbit
Branch: main
Created: 2026-01-01 06:45
Last updated: 2026-01-01 06:50

START LOG (fill this before you start coding)

Timestamp: 2026-01-01 06:45
Current behavior or state:
- Captions are large, bold, and use emerald speaker stickers.
- Captions use the default call language.

Plan and scope for this task:
- Refine `TranscriptionOverlay` to use thinner (font-light) and smaller text.
- Change rendering to a classic subtitle style (text-shadow instead of background boxes).
- Update `MeetingRoom` to use `language: 'auto'` for auto-detection and original language.

Files or modules expected to change:
- components/meeting-room.tsx
- components/transcription-overlay.tsx

Risks or things to watch out for:
- Readability of smaller text on complex backgrounds.

WORK CHECKLIST

- [x] Refine CSS in `TranscriptionOverlay`
- [x] Enable auto-detection in `MeetingRoom`
- [x] Verify build

END LOG (fill this after you finish coding and testing)

Timestamp: 2026-01-01 06:50
Summary of what actually changed:
- Updated `TranscriptionOverlay` with thinner fonts, smaller sizes, and high-contrast text shadows for a professional subtitle look.
- Enabled language auto-detection in the Stream `startClosedCaptions` call.

Files actually modified:
- components/meeting-room.tsx
- components/transcription-overlay.tsx

How it was tested:
- npm run build

Test result:
- PASS

Known limitations or follow-up tasks:
- None

------------------------------------------------------------

Task ID: T-0014
Title: Real-time Translation with Gemini
Status: TODO
Owner: Miles
Related repo or service: Orbit
Branch: main
Created: 2026-01-01 07:55
Last updated: 2026-01-01 07:55

START LOG (fill this before you start coding)

Timestamp: 2026-01-01 07:55
Current behavior or state:
- Transcriptions are saved in Supabase, but no automatic translation is performed.

Plan and scope for this task:
- Create a translation API using Gemini (models/gemini-flash-lite-latest).
- Implement saving translated text to the Supabase translations table.
- Add a language selector to the MeetingRoom UI.
- Trigger translation automatically when new transcription segments are finalized.
- Display translated captions in the TranscriptionOverlay.

Files or modules expected to change:
- app/api/translate/route.ts
- lib/translate-service.ts
- components/meeting-room.tsx
- components/transcription-overlay.tsx

Risks or things to watch out for:
- API latency during real-time meetings.
- Gemini API quota/limits.

WORK CHECKLIST

- [ ] Implement Gemini translation API
- [ ] Create Supabase translation storage service
- [ ] Add language selector to Meeting Room UI
- [ ] Integrate translation trigger in Overlay
- [ ] Verify build and functionality

END LOG (fill this after you finish coding and testing)
Task ID: T-0015
Title: Fix Sharing and Joining Participants
Status: DONE
Owner: Miles
Related repo or service: Orbit
Branch: main
Created: 2026-01-04 00:00
Last updated: 2026-01-04 00:20

START LOG (fill this before you start coding)

Timestamp: 2026-01-04 00:00
Current behavior or state:
- Using generic `CallControls` which lacks a dedicated "Invite" button.
- Users find "sharing" and "joining" confusing or limited.

Plan and scope for this task:
- Replace `CallControls` with granular buttons (Mic, Cam, Screen Share).
- Add an "Invite" button to copy meeting link.
- Update `EndCallButton` logic to show "Leave" for guests.

Files or modules expected to change:
- components/meeting-room.tsx
- components/end-call-button.tsx

Risks or things to watch out for:
- Stream SDK state sync for granular toggles.

WORK CHECKLIST

- [x] Implement custom granular buttons in `MeetingRoom`
- [x] Add "Invite" button functionality
- [x] Update `EndCallButton` visibility/behavior
- [x] Verify build

END LOG (fill this after you finish coding and testing)

Timestamp: 2026-01-04 00:20
Summary of what actually changed:
- Implemented custom control bar with granular toggles.
- Added "Invite" button for easy meeting link sharing.
- Enhanced `EndCallButton` with dual "Leave/End" logic.

Files actually modified:
- components/meeting-room.tsx
- components/end-call-button.tsx

How it was tested:
- npm run build

Test result:
- PASS

Task ID: T-0016
Title: Responsive UI and Speaker List Polish
Status: DONE
Owner: Miles
Related repo or service: Orbit
Branch: main
Created: 2026-01-04 00:30
Last updated: 2026-01-04 00:35

START LOG (fill this before you start coding)

Timestamp: 2026-01-04 00:30
Current behavior or state:
- Host screen/Speaker view was not fully responsive to viewport height/width (Fixed).
- `useMeetingSpeakers` hook relies on `transcript_segments` table which is now bypassed for live speech.

Plan and scope for this task:
- Document responsive UI changes in task log (Done).
- Refactor `useMeetingSpeakers` to use Stream SDK participants instead of DB polling.
- Ensure the speaker list updates in real-time as users join/leave the call.

Files or modules expected to change:
- app/globals.css (Already modified)
- hooks/use-meeting-speakers.ts

Risks or things to watch out for:
- Mapping participant IDs to display names if Clerk names aren't available for everyone.

WORK CHECKLIST

- [x] Implement responsive host screen CSS
- [x] Refactor `useMeetingSpeakers` to use Stream SDK
- [x] Verify speaker list updates live
- [x] Final build check

END LOG (fill this after you finish coding and testing)

Timestamp: 2026-01-04 00:35
Summary of what actually changed:
- Finalized host screen responsiveness in `globals.css`.
- Switched `useMeetingSpeakers` from Supabase polling to Stream SDK's `useParticipants` hook.
- Improved naming logic to use Stream's participant names with ID fallback.

Files actually modified:
- app/globals.css
- hooks/use-meeting-speakers.ts

How it was tested:
- npm run build

Test result:
- PASS

Task ID: T-0017
Title: Full Screen Host & Top-Aligned Sidebar
Status: DONE
Owner: Miles
Related repo or service: Orbit
Branch: main
Created: 2026-01-04 00:55
Last updated: 2026-01-04 01:05

START LOG (fill this before you start coding)

Timestamp: 2026-01-04 00:55
Current behavior or state:
- Host video has padding/margins preventing full expansion.
- Sidebar participants are not strictly top-aligned (or default flex implementation).

Plan and scope for this task:
- Update `globals.css` to force host spotlight to `100vh - controls_height`.
- Apply `justify-content: flex-start` to sidebar to stack videos at the top.

Files or modules expected to change:
- app/globals.css

Risks or things to watch out for:
- Overlapping the control bar.

WORK CHECKLIST

- [x] Update CSS in `globals.css`
- [x] Verify build

END LOG (fill this after you finish coding and testing)

Timestamp: 2026-01-04 01:05
Summary of what actually changed:
- Forced `.str-video__speaker-layout__spotlight` to consume full available height (`calc(100vh - 120px)`) and width.
- Applied `justify-content: flex-start` to `.str-video__speaker-layout__participants-bar` to ensure top alignment.

Files actually modified:
- app/globals.css

How it was tested:
- npm run build

Test result:
- PASS

Task ID: T-0019
Title: Immersive Grid and Gallery View
Status: DONE
Owner: Miles
Related repo or service: Orbit
Branch: main
Created: 2026-01-04 01:23
Last updated: 2026-01-04 01:25

START LOG (fill this before you start coding)

Timestamp: 2026-01-04 01:23
Current behavior or state:
- Grid view was not full-screen and lacked a dedicated "Gallery" mode option.

Plan and scope for this task:
- Update CSS to force `PaginatedGridLayout` to be full-screen (`100vh`/`100vw`).
- Add "Gallery" to `CallLayoutType` and layout switcher.

Files or modules expected to change:
- app/globals.css
- components/meeting-room.tsx

Risks or things to watch out for:
- Overlapping UI elements.

WORK CHECKLIST

- [x] Update CSS for full-screen grid
- [x] Add "Gallery" option to MeetingRoom
- [x] Verify build

END LOG (fill this after you finish coding and testing)

Timestamp: 2026-01-04 01:25
Summary of what actually changed:
- Forced `.str-video__paginated-grid-layout` to full viewport dimensions.
- Added "Gallery" mode which utilizes the immersive grid layout.
- Set grid videos to `object-fit: cover` for a cohesive aesthetic.

Files actually modified:
- app/globals.css
- components/meeting-room.tsx

How it was tested:
- npm run build

Test result:
- PASS



