BRD for Atlético Intelligence — AI-Powered Soccer Incident Review Platform

Executive Summary
Atlético Intelligence is an AI-powered web platform designed to bring affordable video review technology to small and semi-professional soccer leagues. Most grassroots leagues operate with a single fixed camera — enough to stream a match, but not enough to make accurate offside or goal-line decisions. Today, those leagues have no alternative to the naked eye.
This platform closes that gap. By analyzing video from a single camera, the system will automatically detect player positions and ball location at critical moments, generate a short incident clip, produce an AI verdict, and display a 3D positional visual — all within seconds of the official pressing a review button.
The MVP targets two incident types: Offside Calls (the primary and most complex feature) and Goal / No-Goal Decisions (simpler, potentially fully automated). Foul review has been explicitly excluded from the MVP scope. The platform is designed first for individual teams testing the product, with a league-wide enterprise model deferred 6–12 months post-launch.

1. High-Level Business Objectives
   1.1 Project Overview
   Atlético Intelligence aims to democratize video review technology by providing a low-cost VAR alternative that works with single-camera setups already in use by small leagues. The platform will:
   ● Enable match officials and teams to trigger instant video review of key incidents
   ● Use AI to analyze clips and produce an automated verdict with visual evidence
   ● Store only short incident clips — not full match footage — to keep costs low and avoid IP issues
   ● Provide a clean, role-based web interface accessible during and after matches

1.2 Problem Statement
Small soccer leagues face the following challenges:

● Cannot afford professional multi-camera VAR systems (costs run into the hundreds of thousands of dollars)
● Existing single-camera setups (e.g., Veo) provide live streaming only — no analytical overlay, no replay logic, no AI
● Referees must make offside and goal-line decisions in real time with no technological support
● Post-match disputes have no reliable video evidence to reference

1.3 Target Users

Role Description
League Admin Creates and manages leagues, teams, matches, and user accounts
Match Official (Video Ref) Runs the live match console; triggers incident review during the game
Team Viewer Views approved incident clips after the match — read-only, no editing

For the MVP, the primary user is the individual team running their own account. The referee-led model (where a neutral league official controls review) is planned for the enterprise phase.

2. Core Functionality Requirements
   2.1 Video Ingestion & Processing
   2.1.1 Supported Video Modes

● Live stream ingestion from a connected single camera feed
● Uploaded match video (MP4 or equivalent) for post-match or POC testing
● POC phase will use uploaded video only; live stream support is part of the full MVP

2.1.2 Clip Generation

● When an official presses a review button, the system captures a 5–15 second clip centered on the incident
● Clip length accounts for "wait and see" referee calls where the whistle is delayed

● Only the generated clip is stored — the full match video is never saved to the platform
● Each clip is saved to cloud storage linked to the team's account

2.2 Incident Review Flow
2.2.1 Offside Review (Primary Feature)

Offside is the most complex and highest-priority feature. The flow is:

1. Official presses the Offside Check button during the match
2. System generates a 5–15 second clip from the live buffer or uploaded video
3. Official scrubs the clip timeline to find the exact moment the ball was played
4. Official presses a secondary "Review This Frame" button
5. AI analyzes the frozen frame: identifies defenders, attackers, and ball position
6. AI determines whether the attacking player was in an offside position at the moment of the pass
7. System generates a verdict ("Offside" / "Onside") and a 3D positional diagram of the two players in question
8. Incident is logged to the Incident List with clip, verdict, snapshot, and optional referee note
   2.2.2 Goal / No-Goal Review

Goal detection is simpler and may be fully automated. The flow is:

1. Official presses the Goal Check button, or system auto-detects a potential goal event
2. System generates a clip around the event
3. AI applies a virtual goal-line barrier to determine whether the ball crossed the line completely
4. System returns verdict ("Goal" / "No Goal") and saves clip with snapshot

Note: Foul review has been removed from MVP scope at the client's direction. Referees will continue to make foul decisions independently.

2.3 AI Verdicts & Visual Aids
● The system must produce an AI verdict for both incident types — not just clip storage
● For offside: a 3D player position diagram showing the last defender and the attacking player at the moment of the pass
● For goal: a virtual goal-line overlay confirming full ball crossing
● If AI confidence is low, the system flags the incident for human review rather than forcing a verdict
● AI verdict scope may be narrowed if it significantly increases development time — this is a noted risk

2.4 User Experience
2.4.1 Match Console

● Two clearly labelled review buttons: Offside Check, Goal Check (Foul Check removed)
● Live video preview panel with timeline scrub control
● One review flow at a time — system does not process concurrent incidents

2.4.2 Incident List

● Chronological log of all incidents from a given match
● Each entry shows: incident type, timestamp, AI verdict
● Clicking an entry opens the Incident Detail page

2.4.3 Incident Detail Page

● Full clip playback
● AI verdict and 3D visual aid
● Optional referee note field (maximum 300 characters)
● No editing of the clip or AI output — read-only for all users except the note field
● Option to download clip locally or delete from cloud storage

3. Technical Requirements
   3.1 Security & Data Compliance
   ● Each team owns their clips — stored in isolated, private cloud storage per account
   ● No public access to clips; no cross-team visibility
   ● No full match video is stored on the platform — only generated clips (5–15 seconds)
   ● This approach avoids IP infringement on footage owned by camera providers (e.g., Veo)
   ● No profanity permitted in referee notes or any user-generated content
   ● Standard authentication and access control — role-based permissions enforced server-side

3.2 Performance Requirements
● Clip generation must complete within a few seconds of the review button being pressed
● AI verdict and 3D visual must be returned before the official needs to make a field decision
● Live stream ingestion must handle common camera formats without buffering issues
● System must gracefully handle camera disconnects and reconnection during a match

3.3 Data Management
● Teams can delete clips they no longer need to manage storage
● Teams can download clips locally for offline archiving
● Full match video is never retained on the platform
● Incident records (metadata, verdicts, notes) are retained even if the clip is deleted

4. Accessibility & Localization
   ● Initial release in English only
   ● Interface must be usable by non-technical users — referees and team managers with no software background
   ● Large, clearly labelled buttons for the match console (critical for fast in-game use)
   ● Accessibility enhancements (WCAG compliance, screen reader support) deferred to future phases

5. Success Criteria
   5.1 Functional
   ● Offside review correctly identifies player positions in a given test clip
   ● Goal review correctly determines ball crossing on test footage
   ● Clip generation completes within an acceptable timeframe after review button press
   ● Referee note is saved and displayed correctly on the incident detail page
   ● Team can delete and re-access clips as expected

5.2 Performance
● AI verdict returned fast enough for practical in-match use
● Live stream mode handles a full 90-minute match without errors or data loss
● System recovers correctly from camera disconnects

5.3 Business
● Successfully used by at least one team in a real or simulated match scenario during the pilot
● Positive feedback from the client on accuracy and ease of use
● Clip storage cost per team remains minimal
● Foundation in place to onboard league-level accounts within 6–12 months

6. Integration Touchpoints

Integration Detail
Camera / Stream RTMP or HLS live stream ingest from the team's existing camera (e.g., Veo compatible formats)
Cloud Storage AWS S3 (or equivalent) for clip and thumbnail storage, per-team isolated buckets
AI / CV Models Computer vision pipeline for player detection, offside line calculation, goal-line crossing logic
Frontend (React) Match console UI, incident list, incident detail page
Backend (Python) Clip extraction, AI job orchestration, REST API for frontend
Authentication Role-based login: Admin, Match Official, Team Viewer

7. User Flow Diagram
