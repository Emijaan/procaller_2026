# ProCaller User Manual

**AP Infotech and Cyber Solution**  
Multi-tenant call center dialer, CRM, and campaign management — with browser WebRTC calling and Asterisk telephony.

Use this guide on your website as an introduction for agencies, managers, admins, and agents.

---

## 1. What is ProCaller?

ProCaller is a cloud-style calling platform for sales and support teams. Agents dial from the browser. Supervisors manage campaigns, leads, live agents, recordings, and reports — with clear separation between agencies (tenants).

**What you get**

- **Manual dialing** — type or click a number and call instantly  
- **Preview Auto-dial** — the system reserves the next lead(s) and dials automatically  
- **Dial ratio (1–32)** — dial several numbers at once; first answer wins  
- **Campaigns & Excel lead import** — upload lists, assign agents, set wrap-up time and ratio  
- **CRM leads & contacts** — statuses, notes, callbacks, dispositions  
- **Call recordings** — stored securely; access limited by role  
- **Live Operations** — see who is Available, On Call, Wrap-up, or Break  
- **Reports** — daily agent and campaign stats; export CSV / Excel  

ProCaller is built for hierarchical teams: Super Admin → Agency → Manager → Admin → Agent.

---

## 2. Who uses ProCaller?

| Role | Who they are | What they do |
|------|----------------|--------------|
| **Super Admin** | Platform owner | Create agencies, set seat limits, full system access including all recordings and audit |
| **Agency** | Tenant / company owner | Manage managers, admins, and users; own campaigns, leads, reports, and agency recordings |
| **Manager** | Team lead under an agency | Manage admins and agents in their tree; campaigns, leads, dialing, reports |
| **Admin** | Campaign / lead operator | Create and edit campaigns, import leads, assign agents, dial, manage dispositions |
| **User (Agent)** | Caller | Manual and Preview Auto dial, own call logs and own recordings |

Each login only sees data allowed for that role and that agency. Agents never see another agent’s recordings or another agency’s campaigns.

---

## 3. Getting started

### 3.1 Sign in

1. Open the ProCaller web app.  
2. Enter your **email** and **password**.  
3. After login you land on the **Dialer** — the main calling screen.

Sessions use secure tokens. Stay signed in on a trusted device; sign out when finished on a shared PC.

### 3.2 Main menu

| Menu item | Purpose |
|-----------|---------|
| **Dashboard** | Snapshot of activity and mode times |
| **Live Operations** | Real-time agent statuses |
| **Dialer** | Place and take calls |
| **Contacts / Leads** | Customer records and campaign leads |
| **Campaigns** | Create campaigns, import Excel, assign agents |
| **Calls** | Call history and outcomes |
| **Recordings** | Play or download authorized recordings |
| **Follow-ups** | Callbacks and scheduled follow-ups |
| **Team** | Create and manage staff (role-gated) |
| **Reports** | Daily and campaign reports; CSV / Excel export |
| **Agencies** | Super Admin tenant management |
| **Settings** | Account and organisation preferences |

> **Note:** Some advanced items (Call Queue, IVR, Integrations, Billing) may appear as placeholders for future releases. Core dialing, campaigns, recordings, live ops, and reports are the production path today.

---

## 4. The Dialer

The Dialer is where agents spend most of their time.

### 4.1 Agent modes

| Mode | Meaning |
|------|---------|
| **Manual** | You choose the number and press Call |
| **Preview Auto** | System feeds leads and dials for you (with dial ratio) |
| **Break** | You are paused; auto-dial stops |

Your online time is tracked by mode (Manual, Preview, Break) for reports and Live Operations.

### 4.2 Manual calling

1. Select **Manual**.  
2. Choose a **campaign** (optional but recommended so lead details appear).  
3. Enter a number on the keypad, or open a lead/contact and use click-to-dial.  
4. Press **Call**.  
5. When the call ends, choose a **disposition**, add notes / callback if needed, and save.

If that mobile number exists in your campaign upload, ProCaller shows the lead’s details on screen during the call.

### 4.3 Preview Auto-dial

1. Select **Preview Auto**.  
2. Select the **campaign** you are working.  
3. Set **Ratio** (1–32) in the header — you can change this anytime without leaving Preview Auto.  
4. The system reserves lead(s) and starts dialing.  
5. Talk to the connected customer.  
6. After hangup, complete **disposition** and wait for **wrap-up** (campaign setting, often 30 seconds).  
7. The next batch starts automatically.

**Dial ratio explained**

| Ratio | Behaviour |
|-------|-----------|
| **1** | One number at a time (classic preview) |
| **2** | Two numbers dialed at the same time |
| **4** | Four numbers at the same time |
| **… up to 32** | Maximum concurrent lines per agent batch |

When several lines ring together, the **first customer who answers** is connected. The other lines are dropped. Campaign default ratio can be set when creating the campaign; agents may override it live on the Dialer.

### 4.4 Wrap-up

After every call, ProCaller can hold a short **wrap-up** window (set per campaign, e.g. 30 seconds). Use this time to finish notes and disposition before the next auto-dial. During wrap-up your status shows as Wrap-up in Live Operations.

### 4.5 Dispositions (outcomes)

Typical outcomes on the dialer:

- Interested  
- Callback Requested  
- Not Interested  
- No Answer  
- Voicemail  
- Wrong Number  
- Busy  
- Converted  

Callbacks store a follow-up time. Outcomes update the lead’s status for the next agent or report.

### 4.6 In-call controls

While connected you can:

- **Mute** / unmute  
- **Hold** (plays campaign hold music if uploaded, otherwise a default tone)  
- **Keypad** for DTMF  
- **End call**  
- **Recording** — calls are recorded for quality and compliance (see Recordings)

---

## 5. Campaigns

Campaigns group leads, agents, dial strategy, wrap-up, and hold music.

### 5.1 Create a campaign (wizard)

1. Open **Campaigns** → **New Campaign**.  
2. **Details** — name, description, optional campaign code.  
3. **Import Leads** — upload Excel; preview valid / invalid / duplicate rows; confirm import.  
   - A **Mobile** column is required.  
   - Extra columns are stored with the lead and can show on the dialer.  
4. **Assign Agents** — select users who may work this list.  
5. **Dialing Strategy** — Manual or Preview Auto; set **wrap-up seconds** and **dial ratio (1–32)**.  
6. **Schedule** — working hours (as configured in your rollout).  
7. **Review & Launch** — activate when ready.

You can pause or resume an active campaign from the campaign card.

### 5.2 Hold music

Upload an **MP3** hold file per campaign (maximum **5 MB**). When an agent puts a caller on hold, that audio plays. If none is uploaded, a default tone is used.

---

## 6. Leads and contacts

- **Leads** — campaign queue records (new, assigned, calling, interested, callback, etc.).  
- **Contacts** — CRM-style people you can search and dial.  

Agents and supervisors can search, filter, and open a record into the Dialer. Lead status changes with every call attempt and disposition so the hopper stays accurate.

---

## 7. Live Operations

Supervisors open **Live Operations** to monitor the floor in near real time (refreshes about every 5 seconds).

**At a glance**

- Available  
- On Call  
- Wrap-up  
- Break  
- Offline  
- Preview vs Manual counts  

Actions such as Listen / Whisper / Barge may be offered depending on your Asterisk trunk configuration. Activity is logged for accountability.

---

## 8. Call recordings

Every call can be recorded and stored securely.

**Who can hear what**

| Role | Access |
|------|--------|
| **Agent** | Only their own recordings |
| **Admin / Manager** | Their team / campaign scope |
| **Agency** | All recordings in their organisation |
| **Super Admin** | All recordings (optionally filtered by agency) |

From **Recordings** you can play, download, or export selected files (ZIP, within system limits). Recordings are never exposed as public links — login and permissions are always required.

---

## 9. Reports

Open **Reports** to review:

- **Daily agent report** — time Online / Manual / Preview / Break; calls, answers, talk and hold times  
- **Campaign report** — performance by campaign  

Export **CSV** or **Excel** for payroll, QA, or client reporting. Agents only see their own rows; agencies and managers see their scoped teams.

---

## 10. Team and agencies

- **Team** — managers and admins create users under their authority, within agency seat limits.  
- **Agencies** — Super Admin creates tenants and sets max managers, admins, and users.  

New staff receive login credentials from their administrator. Default passwords should be changed after first login in production.

---

## 11. Best practices

1. **Always select the correct campaign** before Preview Auto so ratio, wrap-up, hold music, and lead matching are correct.  
2. **Set dial ratio carefully** — higher ratio means more simultaneous rings; match it to your SIM / gateway capacity.  
3. **Complete dispositions** every time so lead status and reports stay trustworthy.  
4. **Use Break** when stepping away instead of leaving Preview Auto running.  
5. **Respect wrap-up** — finish notes before the next lead starts.  
6. **Protect recordings** — only share downloads through authorised staff; they may contain personal data.

---

## 12. Technical summary (for your website “About” / “Technology” section)

| Area | Detail |
|------|--------|
| Agent phone | Browser **WebRTC** softphone |
| Telephony | **Asterisk** (SIP / ARI) |
| Application | Modern web UI + secure API |
| Database | PostgreSQL |
| Security | Role-based access, agency (tenant) isolation, JWT login |
| Calling modes | Manual + Preview Auto with dial ratio 1–32 |

---

## 13. Support

For setup, Asterisk connectivity, agency onboarding, or training:

**AP Infotech and Cyber Solution**  
Product: **ProCaller**

Include your support email, phone, and office hours on the live website.

---

*© 2026 AP Infotech and Cyber Solution. ProCaller user documentation — suitable for website publication. Update screenshots and support contacts before going live.*
