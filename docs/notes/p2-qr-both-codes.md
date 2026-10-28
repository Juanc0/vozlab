# P2: QR with both codes for events

Event entry QR encodes both the tenant event code and the workspace code.
Client flow:
1. Scan QR → redeem tenant event code (creates anonymous user + session).
2. Redeem workspace code (auto-approved when workspace.kind === 'EVENT').
Both steps happen in one user interaction. Backend endpoints already exist
(event code consume + join event). No new backend route required.