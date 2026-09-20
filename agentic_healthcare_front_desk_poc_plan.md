# Agentic Healthcare Front Desk --- POC Plan

## 1. Executive Summary

This POC is an **AI Healthcare Front Desk / Patient Intake Agent**
rather than an AI doctor.

The agent will:

1.  Talk to patients naturally using realtime voice.
2.  Understand the patient's intent.
3.  Identify the appropriate healthcare domain.
4.  Collect the necessary domain-specific information.
5.  Maintain a structured patient/intake state.
6.  Use tools/actions to interact with seeded hospital data.
7.  Find appropriate doctors.
8.  Check doctor status and schedules.
9.  Find appointment slots based on patient preferences.
10. Present appointment options.
11. Ask the patient for explicit confirmation.
12. Book, cancel, or reschedule appointments only after appropriate
    confirmation.
13. Show the collected information in a live form.
14. Provide a final summary for doctor/receptionist review.

The POC should demonstrate **agentic behavior, tool calling, state
management, scheduling, confirmation, and recovery from changing
constraints**.

It should **not** attempt diagnosis, treatment, or prescription
generation.

------------------------------------------------------------------------

# 2. POC Objective

### Core objective

Build a realtime voice agent that behaves like a **healthcare
receptionist / intake nurse**.

Example:

> Patient: "My tooth has been hurting since yesterday and I want to see
> a dentist tomorrow evening."

The agent should understand:

``` text
Intent:
Book appointment

Domain:
Dental

Complaint:
Tooth pain

Duration:
1 day

Preferred date:
Tomorrow

Preferred time:
Evening
```

Then it should:

``` text
Find doctors
        ↓
Check doctor status
        ↓
Check schedules
        ↓
Find matching slots
        ↓
Offer options
        ↓
Patient chooses
        ↓
Ask explicit confirmation
        ↓
Book appointment
        ↓
Confirm booking
```

------------------------------------------------------------------------

# 3. What Makes This Agentic?

The POC should not be a fixed questionnaire.

Avoid:

``` text
Q1 → Name
Q2 → Age
Q3 → Gender
Q4 → Symptoms
Q5 → Duration
Q6 → Medication
Q7 → Book
```

Instead, the agent maintains state and dynamically decides what
information is still required.

Example:

> "I have had fever for three days and my temperature was around 102
> yesterday."

The agent should extract:

``` json
{
  "symptoms": ["fever"],
  "duration": "3 days",
  "temperature": "102°F"
}
```

It should then ask only the next useful question.

The core loop is:

``` text
Conversation
     ↓
Understand
     ↓
Update state
     ↓
Determine missing information
     ↓
Ask next question OR invoke tool
     ↓
Observe result
     ↓
Update state
     ↓
Continue
```

This is the main agentic behavior.

------------------------------------------------------------------------

# 4. Recommended Technology Stack

## Frontend

-   React
-   Vite
-   Tailwind CSS
-   LiveKit React SDK

## Realtime

-   LiveKit Cloud
-   WebRTC

## Agent

-   Node.js
-   LiveKit Agents
-   Gemini Live via **Vertex AI** (not the public Gemini Developer
    API / AI Studio key) — see §54 for why

## Backend

-   NestJS
-   REST APIs
-   Business-rule validation

## Database

-   MongoDB (Atlas — HIPAA-eligible dedicated tier once real PHI is
    in scope, see §54; standard/shared tier is fine while data stays
    synthetic)

## Initial deployment

``` text
React        → Local
NestJS       → Local
Agent        → Local
MongoDB      → MongoDB Atlas
LiveKit      → LiveKit Cloud
Gemini       → Google API
```

Do not introduce Docker, Kubernetes, Redis, FastAPI, RAG, or additional
infrastructure unless the POC actually needs them.

------------------------------------------------------------------------

# 5. Final Architecture

``` text
                         PATIENT
                            │
                       🎙 Microphone
                            │
                            ▼
                    ┌──────────────┐
                    │    React     │
                    │ Voice Client │
                    │ Intake Form  │
                    └──────┬───────┘
                           │
                         WebRTC
                           │
                           ▼
                    ┌──────────────┐
                    │   LiveKit    │
                    │    Cloud     │
                    └──────┬───────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │      Node.js Agent      │
              │                         │
              │      Gemini Live        │
              │      Agent State        │
              │      Tool Selection     │
              └────────────┬────────────┘
                           │
                       Tool Calls
                           │
                           ▼
              ┌─────────────────────────┐
              │        NestJS API       │
              │                         │
              │ Patients                │
              │ Doctors                 │
              │ Departments             │
              │ Schedules               │
              │ Appointments             │
              │ Business Rules           │
              └────────────┬────────────┘
                           │
                           ▼
                       MongoDB
```

### Critical architectural rule

The LLM should **never directly modify MongoDB**.

Instead:

``` text
Gemini
   ↓
Tool request
   ↓
NestJS
   ↓
Validation
   ↓
Business rules
   ↓
MongoDB
```

The LLM is the conversational/orchestration layer.

NestJS is the authority for actual system changes.

------------------------------------------------------------------------

# 6. Healthcare Domains

Use four domains for the POC.

## 6.1 Dental

Example use cases:

-   Tooth pain
-   Sensitivity
-   Swelling
-   Bleeding
-   Cleaning
-   Cavity consultation
-   Follow-up

Potential intake fields:

``` text
Complaint
Duration
Tooth/area
Pain severity
Sensitivity
Swelling
Bleeding
Previous dental treatment
```

------------------------------------------------------------------------

## 6.2 Cardiology

Keep this strictly as an intake and appointment workflow.

Example use cases:

-   Cardiology consultation
-   Follow-up
-   Existing cardiac condition follow-up
-   Blood-pressure related appointment

Potential intake fields:

``` text
Reason for visit
Duration
Relevant existing history
Current medications
Previous cardiology visit
Preferred doctor
Preferred date/time
```

Do not make the agent diagnose cardiac conditions.

If a patient describes potentially urgent symptoms, the workflow should
escalate rather than casually schedule a routine appointment.

------------------------------------------------------------------------

## 6.3 General Medicine

Example use cases:

-   Fever
-   Cough
-   Weakness
-   Headache
-   General consultation
-   Follow-up

Potential intake fields:

``` text
Primary complaint
Symptoms
Duration
Severity
Existing conditions
Current medications
Allergies
```

------------------------------------------------------------------------

## 6.4 Ophthalmology

Example use cases:

-   Blurred vision
-   Eye discomfort
-   Redness
-   Routine eye consultation
-   Follow-up

Potential intake fields:

``` text
Complaint
Duration
Affected eye
Vision changes
Pain
Redness
Glasses/contact lenses
Previous eye treatment
```

------------------------------------------------------------------------

# 7. Domain Configuration

Do not hardcode all domain logic into the agent prompt.

Use configuration.

``` javascript
const domains = {
  dental: {
    requiredFields: [
      "complaint",
      "duration",
      "location"
    ],
    optionalFields: [
      "swelling",
      "bleeding",
      "sensitivity"
    ]
  },

  cardiology: {
    requiredFields: [
      "reasonForVisit",
      "duration"
    ],
    optionalFields: [
      "medicalHistory",
      "medications"
    ]
  },

  generalMedicine: {
    requiredFields: [
      "complaint",
      "duration"
    ],
    optionalFields: [
      "medicalHistory",
      "medications",
      "allergies"
    ]
  },

  ophthalmology: {
    requiredFields: [
      "complaint",
      "duration",
      "affectedEye"
    ],
    optionalFields: [
      "pain",
      "redness",
      "visionChanges"
    ]
  }
};
```

This allows a fifth domain to be added later without rebuilding the
entire agent.

------------------------------------------------------------------------

# 8. Seed Data

For a POC, use synthetic seed data.

Recommended volume:

``` text
Departments:       4
Doctors:           10–15
Patients:          20–50
Schedules:         ~50
Appointments:      20–30
```

Suggested distribution:

``` text
Dental             3 doctors
Cardiology         3 doctors
General Medicine   3 doctors
Ophthalmology      2–3 doctors
```

Create intentionally interesting states.

For example:

``` text
Dr. Amit Mehta
Department: Dental
Status: ACTIVE

09:00  BOOKED
09:30  BOOKED
10:00  AVAILABLE
10:30  AVAILABLE
11:00  BOOKED
11:30  AVAILABLE
```

And:

``` text
Dr. Priya Shah
Department: Dental
Status: ON_LEAVE
```

This allows the agent to demonstrate that it actually checks current
system state.

------------------------------------------------------------------------

# 9. Database Models

## Department

``` javascript
{
  _id: "DENTAL",
  name: "Dental",
  active: true
}
```

## Doctor

``` javascript
{
  _id: "DOC001",
  name: "Dr. Amit Mehta",
  departmentId: "DENTAL",
  specialization: "General Dentistry",
  status: "ACTIVE"
}
```

Possible statuses:

``` text
ACTIVE
BUSY
ON_LEAVE
OFFLINE
```

## Schedule

``` javascript
{
  doctorId: "DOC001",
  dayOfWeek: "MONDAY",
  startTime: "09:00",
  endTime: "13:00",
  slotDuration: 30
}
```

## Patient

``` javascript
{
  _id: "PAT001",
  name: "Rahul Sharma",
  age: 34,
  gender: "male",
  phone: "synthetic"
}
```

## Appointment

``` javascript
{
  patientId: "PAT001",
  doctorId: "DOC001",
  date: "2026-09-18",
  startTime: "10:30",
  endTime: "11:00",
  status: "CONFIRMED"
}
```

Appointment statuses:

``` text
HELD
PROPOSED
CONFIRMED
CANCELLED
COMPLETED
EXPIRED
```

------------------------------------------------------------------------

# 10. Patient State

The conversation should maintain a structured state.

``` javascript
{
  sessionId: "SESSION001",

  patient: {
    id: "PAT001",
    name: "Rahul Sharma",
    age: 34,
    gender: "male"
  },

  intent: "book_appointment",

  domain: "dental",

  intake: {
    complaint: "tooth pain",
    duration: "1 day",
    location: "upper right",
    severity: "moderate",
    swelling: false,
    bleeding: false
  },

  appointment: {
    preferredDoctor: null,
    preferredDate: "2026-09-18",
    preferredTime: "evening",
    selectedSlot: null,
    confirmationRequired: true,
    confirmed: false
  },

  status: "collecting_information"
}
```

------------------------------------------------------------------------

# 11. Agent State Machine

Use explicit high-level states.

``` text
START
  ↓
IDENTIFY_PATIENT
  ↓
UNDERSTAND_INTENT
  ↓
IDENTIFY_DOMAIN
  ↓
COLLECT_INFORMATION
  ↓
VALIDATE_INFORMATION
  ↓
SEARCH_DOCTORS
  ↓
SEARCH_SLOTS
  ↓
PROPOSE_APPOINTMENT
  ↓
WAIT_FOR_CONFIRMATION
  ↓
BOOK_APPOINTMENT
  ↓
CONFIRM_BOOKING
  ↓
END
```

Possible alternative states:

``` text
CANCEL_APPOINTMENT
RESCHEDULE_APPOINTMENT
ESCALATE
NEEDS_CLARIFICATION
```

The LLM controls the conversation, but the backend should enforce
workflow rules.

------------------------------------------------------------------------

# 12. Agent Tools

Start with a small, deterministic tool set.

## Patient tools

``` text
findPatient()
createPatient()
updatePatient()
```

## Intake tools

``` text
updateIntake()
getIntakeStatus()
```

## Doctor tools

``` text
findDoctors()
getDoctorDetails()
getDoctorStatus()
```

## Scheduling tools

``` text
getDoctorSchedule()
findAvailableSlots()
holdSlot()
```

## Appointment tools

``` text
bookAppointment()
cancelAppointment()
rescheduleAppointment()
getAppointment()
```

------------------------------------------------------------------------

# 13. Tool Permission Model

Divide tools into categories.

## READ

The agent can generally call these:

``` text
findPatient()
findDoctors()
getDoctorDetails()
getDoctorStatus()
getDoctorSchedule()
findAvailableSlots()
getAppointment()
```

## WRITE

Backend validates these:

``` text
createPatient()
updatePatient()
updateIntake()
holdSlot()
```

## COMMIT ACTIONS

Require explicit patient confirmation:

``` text
bookAppointment()
cancelAppointment()
rescheduleAppointment()
```

This distinction is important.

------------------------------------------------------------------------

# 14. Appointment Workflow

Example:

Patient:

> "I want a dentist tomorrow after 6 PM."

Agent extracts:

``` text
department = dental
date = tomorrow
time >= 18:00
```

Agent calls:

``` javascript
findAvailableSlots({
  department: "DENTAL",
  date: "2026-09-18",
  after: "18:00"
});
```

Backend returns:

``` text
Dr. Mehta
18:00 BOOKED
18:30 AVAILABLE

Dr. Shah
18:00 AVAILABLE
18:30 BOOKED

Dr. Patel
ON_LEAVE
```

Agent responds:

> "I found two available appointments: Dr. Shah at 6:00 PM or Dr. Mehta
> at 6:30 PM. Which would you prefer?"

Patient:

> "Dr. Shah."

Agent:

> "Just to confirm, you'd like Dr. Shah tomorrow at 6:00 PM. Shall I
> book that appointment?"

Patient:

> "Yes."

Only now:

``` javascript
bookAppointment({
  patientId: "PAT001",
  doctorId: "DOC002",
  date: "2026-09-18",
  time: "18:00"
});
```

------------------------------------------------------------------------

# 15. Re-check Availability Before Booking

Never assume that a previously discovered slot is still available.

Before committing:

``` text
Patient selects slot
        ↓
Check doctor status
        ↓
Check schedule
        ↓
Check existing appointments
        ↓
Check slot availability again
        ↓
Book
```

If another appointment has taken the slot:

> "That slot is no longer available. I found 6:30 PM with the same
> doctor or 6:00 PM with another available doctor."

This is a strong agentic recovery scenario.

------------------------------------------------------------------------

# 16. Patient Preferences

The scheduling agent should understand natural language preferences.

Examples:

> "Any doctor is fine."

``` json
{
  "preferredDoctor": null
}
```

> "I want Dr. Shah."

``` json
{
  "preferredDoctor": "DOC002"
}
```

> "Any time after 5."

``` json
{
  "timePreference": {
    "after": "17:00"
  }
}
```

> "Saturday would be better."

``` json
{
  "preferredDays": ["Saturday"]
}
```

> "I can't come in the morning."

``` json
{
  "excludedTimeRange": {
    "start": "00:00",
    "end": "12:00"
  }
}
```

------------------------------------------------------------------------

# 17. Confirmation State

Model confirmation explicitly.

``` text
SEARCHING
   ↓
SLOT_FOUND
   ↓
PROPOSED
   ↓
AWAITING_CONFIRMATION
   ↓
CONFIRMED
```

If patient rejects:

``` text
AWAITING_CONFIRMATION
        ↓
SEARCHING
        ↓
NEW SLOT
```

If patient changes the date:

``` text
PROPOSED
   ↓
UPDATE PREFERENCE
   ↓
SEARCH AGAIN
```

------------------------------------------------------------------------

# 18. Conversation Example --- Dental

Patient:

> "My upper right tooth has been hurting since yesterday."

Agent:

> "I'm sorry you're dealing with that. Is the pain constant, or does it
> mainly happen when eating or drinking something hot or cold?"

Patient:

> "Mostly when I drink something cold."

Agent extracts:

``` text
Domain: Dental
Complaint: Tooth pain
Location: Upper right
Duration: 1 day
Trigger: Cold
```

Agent:

> "Have you noticed any swelling or bleeding around the tooth?"

Patient:

> "No."

Agent then searches dental doctors.

------------------------------------------------------------------------

# 19. Conversation Example --- General Medicine

Patient:

> "I need to see a doctor. I've had fever and weakness for three days."

Agent:

``` text
Intent → Appointment
Domain → General Medicine
Symptoms → Fever, weakness
Duration → 3 days
```

Agent asks relevant missing intake questions.

It should not diagnose the patient.

If potentially urgent symptoms appear, it should follow an escalation
path instead of treating the interaction as a routine appointment.

------------------------------------------------------------------------

# 20. Conversation Example --- Cardiology

Patient:

> "I need a cardiology follow-up."

Agent:

``` text
Intent → Appointment
Domain → Cardiology
Type → Follow-up
```

It can ask:

``` text
Which doctor did you previously see?
When was your last visit?
Is there a preferred date/time?
```

Then search appropriate cardiologists and available slots.

Do not provide diagnosis or treatment advice.

------------------------------------------------------------------------

# 21. Live UI

Use three main panels.

``` text
┌──────────────────┬───────────────────┬──────────────────┐
│                  │                   │                  │
│  CONVERSATION    │   PATIENT INTAKE  │  AGENT ACTIVITY  │
│                  │                   │                  │
│ AI: Hello...     │ Name              │ ✓ Intent         │
│                  │ Rahul Sharma      │ ✓ Dental         │
│ Patient:         │                   │ ✓ Symptoms       │
│ My tooth hurts   │ Age               │                  │
│                  │ 34                │ 🔍 Doctors       │
│ AI: Which area?  │                   │ ✓ Slots found    │
│                  │ Complaint         │                  │
│ Patient:         │ Tooth pain        │ → Confirmation   │
│ Upper right      │                   │                  │
│                  │ Duration          │                  │
│ 🎙 Listening     │ 1 day             │                  │
└──────────────────┴───────────────────┴──────────────────┘
```

------------------------------------------------------------------------

# 22. Live Patient Form

The form is a visualization of the current structured patient state.

Example:

``` text
PATIENT INFORMATION

Name
Rahul Sharma ✓

Age
34 ✓

Gender
Male ✓

SYMPTOMS

Fever ✓
Weakness ✓

Duration
3 days ✓

Temperature
102°F ✓

Medications
Paracetamol

Allergies
Not provided
```

Do not force the patient to fill this manually.

The conversation should populate it.

------------------------------------------------------------------------

# 23. Agent Activity Panel

Do not display hidden chain-of-thought.

Display safe, high-level action events.

Example:

``` text
AGENT ACTIVITY

✓ Identified intent
  Appointment booking

✓ Identified department
  Dental

✓ Collected intake
  4/5 fields

✓ Searching doctors

✓ Checking schedules

✓ Found 3 available slots

→ Waiting for patient preference

✓ Patient selected 6:00 PM

→ Waiting for confirmation

✓ Appointment confirmed
✓ Appointment booked
```

This makes the agent behavior understandable during a demo.

------------------------------------------------------------------------

# 24. Agent Prompt

Base system instructions:

``` text
You are an AI Healthcare Front Desk and Patient Intake Assistant.

Your purpose is to communicate naturally with patients,
collect relevant information, and help them arrange
healthcare appointments.

You are not a doctor and must not diagnose medical
conditions, prescribe medication, or provide treatment plans.

Your responsibilities are:

1. Understand the patient's request.
2. Identify the appropriate healthcare department.
3. Collect the information required for the selected
   department.
4. Avoid asking for information the patient has already
   provided.
5. Ask one clear question at a time.
6. Maintain the current structured patient state.
7. Use available tools when information from the healthcare
   system is required.
8. Never invent patient, doctor, schedule, or appointment data.
9. Check current doctor status and availability before
   offering appointment slots.
10. Respect patient preferences for doctor, date, and time.
11. Re-check availability before committing an appointment.
12. Do not book, cancel, or reschedule an appointment without
   the required explicit confirmation.
13. Clearly summarize the selected appointment before booking.
14. After a successful action, clearly tell the patient what
   happened.
15. If information is unclear, ask a clarification question.
16. If potentially urgent symptoms are described, follow the
   escalation workflow rather than attempting diagnosis.

Never invent missing information.

If a dosage, diagnosis, allergy, medical history item, or
other clinical detail is not provided, mark it as unknown
or ask the patient rather than guessing.

The patient should remain in control of appointment decisions.
```

------------------------------------------------------------------------

# 25. Backend API

Recommended initial endpoints:

``` text
POST   /patients
GET    /patients/:id
PATCH  /patients/:id

POST   /intake
GET    /intake/:sessionId
PATCH  /intake/:sessionId

GET    /doctors
GET    /doctors/:id
GET    /doctors/:id/schedule

GET    /appointments/availability

POST   /appointments/hold
POST   /appointments
GET    /appointments/:id

POST   /appointments/:id/cancel
POST   /appointments/:id/reschedule
```

------------------------------------------------------------------------

# 26. NestJS Modules

``` text
src/
├── patients/
│   ├── patients.controller.js
│   ├── patients.service.js
│   └── patients.module.js
│
├── departments/
│
├── doctors/
│
├── schedules/
│
├── appointments/
│
├── intake/
│
├── agent/
│
├── audit/
│
└── common/
```

------------------------------------------------------------------------

# 27. LiveKit Agent Structure

**Note (decided during setup — see §55):** the repo uses flat
top-level `frontend/`, `backend/`, `agent/` folders instead of an
`apps/*` monorepo, as independent projects with no shared workspace
for now. The structure below is otherwise unchanged.

``` text
agent/
├── src/
│   ├── agent.js
│   ├── instructions.js
│   │
│   ├── tools/
│   │   ├── patient.js
│   │   ├── intake.js
│   │   ├── doctors.js
│   │   └── appointments.js
│   │
│   ├── state/
│   │   └── patientState.js
│   │
│   └── services/
│       └── apiClient.js
│
└── package.json
```

------------------------------------------------------------------------

# 28. Complete Repository Structure

``` text
medbot/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceAssistant.jsx
│   │   │   ├── Conversation.jsx
│   │   │   ├── PatientForm.jsx
│   │   │   ├── AgentActivity.jsx
│   │   │   ├── AppointmentOptions.jsx
│   │   │   └── DoctorReview.jsx
│   │   │
│   │   ├── hooks/
│   │   ├── services/
│   │   └── App.jsx
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── patients/
│   │   ├── doctors/
│   │   ├── departments/
│   │   ├── schedules/
│   │   ├── appointments/
│   │   ├── intake/
│   │   └── audit/
│   └── package.json
│
├── agent/                       (not yet scaffolded)
│   ├── src/
│   │   ├── agent.js
│   │   ├── instructions.js
│   │   ├── tools/
│   │   ├── state/
│   │   └── services/
│   └── package.json
│
├── seed/                        (not yet built)
│   ├── departments.js
│   ├── doctors.js
│   ├── schedules.js
│   ├── patients.js
│   └── appointments.js
│
├── agentic_healthcare_front_desk_poc_plan.md
├── CLAUDE.md
└── .claude/
```

No root `package.json`/workspace — `frontend/`, `backend/`, and
(later) `agent/` are independent projects with their own lockfiles.
`packages/` (shared types) from the original monorepo idea is deferred
until there's an actual shared piece to justify it — see §55.

------------------------------------------------------------------------

# 29. Environment Variables

Example:

``` env
# LiveKit
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# Google Gemini — via Vertex AI, not the public Gemini Developer API
# (see §54). GOOGLE_API_KEY is intentionally not used.
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=

# Backend
API_BASE_URL=http://localhost:3000

# MongoDB
MONGODB_URI=
```

Never commit real secrets.

------------------------------------------------------------------------

# 30. Implementation Phases

## Phase 1 --- Realtime Voice

Goal:

``` text
Patient
   ↕
LiveKit
   ↕
Gemini Live
```

The agent should be able to hold a natural voice conversation.

Do not build scheduling yet.

### Success criteria

-   Microphone works.
-   Agent hears patient.
-   Agent responds with voice.
-   Conversation feels realtime.

------------------------------------------------------------------------

# 31. Phase 2 --- Backend + Database

Create NestJS and MongoDB.

Seed:

``` text
4 departments
10–15 doctors
20–50 patients
Schedules
Existing appointments
```

### Success criteria

You can query:

``` text
findDoctors()
findAvailableSlots()
getDoctorStatus()
```

from the backend.

------------------------------------------------------------------------

# 32. Phase 3 --- Agent Tools

Connect the Node.js agent to NestJS.

Start with:

``` text
findDoctors()
findAvailableSlots()
updateIntake()
```

Then add booking.

### Success criteria

Agent can use tools based on conversation context.

------------------------------------------------------------------------

# 33. Phase 4 --- Live Intake

Patient speaks:

> "I've had tooth pain since yesterday."

Agent extracts the information.

React form updates:

``` text
Complaint → Tooth pain
Duration  → 1 day
```

### Success criteria

The form changes automatically while the conversation happens.

------------------------------------------------------------------------

# 34. Phase 5 --- Dynamic Domain Workflows

Add:

``` text
Dental
Cardiology
General Medicine
Ophthalmology
```

The agent should identify the domain and use the appropriate
required-field configuration.

### Success criteria

The same agent can handle all four domains.

------------------------------------------------------------------------

# 35. Phase 6 --- Scheduling

Implement:

``` text
Patient preferences
       ↓
Doctor status
       ↓
Doctor schedule
       ↓
Existing appointments
       ↓
Available slots
```

### Success criteria

Agent never offers an occupied or unavailable slot.

------------------------------------------------------------------------

# 36. Phase 7 --- Confirmation

Implement:

``` text
Find slot
   ↓
Offer slot
   ↓
Patient chooses
   ↓
Explicit confirmation
   ↓
Re-check slot
   ↓
Book
```

### Success criteria

No appointment is committed before confirmation.

------------------------------------------------------------------------

# 37. Phase 8 --- Recovery Scenarios

Implement and test:

### Scenario A --- Doctor unavailable

``` text
Requested doctor → ON_LEAVE
             ↓
Find alternatives
             ↓
Offer alternatives
```

### Scenario B --- Slot taken

``` text
Slot selected
     ↓
Re-check
     ↓
No longer available
     ↓
Find new slot
```

### Scenario C --- Patient rejects

``` text
Patient: "No, that time doesn't work."
             ↓
Search again
```

### Scenario D --- Patient changes date

``` text
Tomorrow
   ↓
Saturday
   ↓
Search again
```

### Scenario E --- Patient changes doctor

``` text
Any doctor
   ↓
"I want Dr. Shah"
   ↓
Search Dr. Shah
```

------------------------------------------------------------------------

# 38. Patient Simulator

Add a demo mode with predefined synthetic scenarios.

``` text
Scenario

1. Dental — Tooth Pain
2. Cardiology — Follow-up
3. General Medicine — Fever
4. Ophthalmology — Blurred Vision
5. Doctor Unavailable
6. Requested Slot Already Taken
7. Patient Rejects Slot
8. Reschedule Appointment
9. Cancel Appointment
```

This is very useful for demos and repeatable testing.

------------------------------------------------------------------------

# 39. Recommended Demo Script

## Demo 1 --- Happy path

Patient:

> "I have tooth pain since yesterday and want a dentist tomorrow
> evening."

Agent:

``` text
Detect Dental
        ↓
Collect required information
        ↓
Find dentists
        ↓
Check schedule
        ↓
Offer slots
        ↓
Patient selects
        ↓
Confirm
        ↓
Book
```

------------------------------------------------------------------------

## Demo 2 --- Preference handling

Patient:

> "I want a dentist after 6 PM, preferably Dr. Shah."

Agent searches accordingly.

------------------------------------------------------------------------

## Demo 3 --- Doctor unavailable

Patient requests Dr. Shah.

Backend:

``` text
Dr. Shah → ON_LEAVE
```

Agent finds alternatives.

------------------------------------------------------------------------

## Demo 4 --- Slot conflict

Patient chooses 6 PM.

Before booking:

``` text
Slot became unavailable
```

Agent searches again and explains the situation.

------------------------------------------------------------------------

## Demo 5 --- Reschedule

Patient:

> "Actually, can we move that to Saturday?"

Agent:

``` text
Cancel/modify existing reservation
        ↓
Find Saturday availability
        ↓
Offer options
        ↓
Confirm
        ↓
Reschedule
```

------------------------------------------------------------------------

# 40. Safety Boundary

This POC should be positioned as:

> **AI Healthcare Front Desk & Patient Intake Agent**

Not:

> AI Doctor

Capabilities:

``` text
✓ Patient conversation
✓ Intake
✓ Information extraction
✓ Domain identification
✓ Doctor search
✓ Availability checking
✓ Appointment scheduling
✓ Rescheduling
✓ Cancellation
✓ Patient confirmation
✓ Doctor/receptionist review
```

Not included:

``` text
✗ Diagnosis
✗ Prescription
✗ Treatment recommendation
✗ Autonomous clinical decision making
```

For potentially urgent symptoms, create an escalation path rather than
allowing the agent to make a clinical judgment.

Use only synthetic patient data during the POC.

------------------------------------------------------------------------

# 41. Audit Trail

For every meaningful action, record:

``` text
timestamp
sessionId
speaker
eventType
toolName
toolArguments
result
fieldChanged
previousValue
newValue
```

Example:

``` text
10:31:22 Patient
"I've had fever for 3 days."

10:31:23 Agent
updateIntake()

10:31:23 System
symptom = fever

10:31:25 Agent
findAvailableSlots()

10:31:26 System
3 slots returned

10:31:40 Patient
"10:30 works."

10:31:42 Agent
confirmation requested

10:31:48 Patient
"Yes."

10:31:49 Agent
bookAppointment()

10:31:49 System
Appointment APT-10291 confirmed
```

This makes the system much easier to debug and demonstrate.

------------------------------------------------------------------------

# 42. Important Engineering Principles

## LLM is not the database

The LLM proposes actions.

NestJS executes validated actions.

------------------------------------------------------------------------

## LLM is not the business-rule engine

Do not rely solely on prompts to enforce:

``` text
Doctor status
Slot availability
Duplicate appointments
Booking conflicts
```

The backend must enforce these.

------------------------------------------------------------------------

## Never trust extracted information blindly

Validate tool arguments before writing them.

------------------------------------------------------------------------

## Never invent information

If the patient doesn't provide:

``` text
dosage
allergy
medical history
age
```

do not guess it.

------------------------------------------------------------------------

## Confirmation before commitment

Appointment booking should have a clear confirmation boundary.

------------------------------------------------------------------------

# 43. Evaluation Metrics

Measure the POC rather than only saying "it works."

## Conversation

``` text
Question repetition rate
Average conversation duration
Successful completion rate
```

## Extraction

``` text
Field extraction accuracy
Missing-field detection
Hallucinated-field rate
```

## Tools

``` text
Correct tool selection
Incorrect tool selection
Tool failure recovery
```

## Scheduling

``` text
Invalid slot offers
Booking conflicts
Preference satisfaction
Confirmation compliance
```

## Voice

``` text
Response latency
Interruption handling
Speech recognition quality
Conversation completion rate
```

------------------------------------------------------------------------

# 44. POC Success Criteria

The POC is successful if:

### Voice

-   Patient can naturally speak to the agent.
-   Agent responds in realtime.

### Agent

-   Correctly identifies intent.
-   Correctly identifies department.
-   Dynamically asks relevant questions.
-   Does not repeatedly ask answered questions.
-   Uses tools when required.

### Form

-   Patient information is extracted into structured fields.
-   Form updates live.
-   Missing values remain missing rather than being invented.

### Scheduling

-   Doctor status is checked.
-   Doctor schedule is checked.
-   Existing appointments are considered.
-   Patient preferences are respected.
-   Availability is re-checked before booking.

### Confirmation

-   Patient explicitly confirms.
-   Booking only occurs after confirmation.

### Recovery

-   Agent handles unavailable doctors.
-   Agent handles occupied slots.
-   Agent handles rejected times.
-   Agent handles changed preferences.

------------------------------------------------------------------------

# 45. 1-Day MVP

If the objective is to get something working extremely quickly:

``` text
React
+
LiveKit
+
Gemini Live
+
Local patient state
+
Basic intake extraction
```

No database.

No appointment booking.

Goal:

``` text
Patient ↔ AI
       ↓
Live form
```

------------------------------------------------------------------------

# 46. 2--3 Day POC

Recommended target:

``` text
React
+
LiveKit
+
Gemini Live
+
Node.js Agent
+
NestJS
+
MongoDB
+
Seed data
+
Tools
+
Appointment booking
+
Confirmation
```

This is the ideal first POC.

------------------------------------------------------------------------

# 47. 1--2 Week Extended POC

After the core works:

``` text
Dynamic domain configuration
+
Audit logs
+
Recovery scenarios
+
Patient simulator
+
Evaluation suite
+
Better scheduling engine
+
Authentication
+
Doctor dashboard
+
Notifications
+
EMR/FHIR integration research
```

------------------------------------------------------------------------

# 48. What NOT to Add Initially

Do not add:

``` text
❌ RAG
❌ Vector database
❌ LangChain
❌ CrewAI
❌ Multi-agent architecture
❌ Python/FastAPI
❌ Local LLM
❌ Whisper server
❌ Custom TTS
❌ FHIR
❌ HL7
❌ Kubernetes
❌ Microservices
❌ Real patient data
❌ Diagnosis
❌ Prescription generation
```

The POC already contains enough complexity.

------------------------------------------------------------------------

# 49. Why Node.js + NestJS

Even if both Node.js and Python are equally familiar, Node.js is a clean
choice here because the core problem is:

``` text
Realtime communication
+
Agent orchestration
+
Tool calling
+
Scheduling
+
CRUD
+
Business rules
```

Python/FastAPI becomes especially useful later if the system adds heavy
ML workloads such as:

``` text
Whisper
PyTorch
Hugging Face models
Medical NLP
Custom ML inference
Document processing
```

If that happens, add FastAPI as a separate service rather than rewriting
the entire system.

------------------------------------------------------------------------

# 50. Final Architecture Decision

Use:

``` text
Frontend
React + Vite + Tailwind
        ↓
Realtime
LiveKit
        ↓
Agent
Node.js + LiveKit Agents
        ↓
Model
Gemini Live
        ↓
Business API
NestJS
        ↓
Database
MongoDB
```

Optional later:

``` text
NestJS
   │
   └── FastAPI
        ↓
      ML/RAG
```

------------------------------------------------------------------------

# 51. Final End-to-End Flow

``` text
                    PATIENT
                       │
                       │ Voice
                       ▼
                 ┌───────────┐
                 │   React   │
                 └─────┬─────┘
                       │
                    WebRTC
                       │
                       ▼
                 ┌───────────┐
                 │  LiveKit  │
                 └─────┬─────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Gemini Live     │
              │                 │
              │ Understand      │
              │ Ask             │
              │ Decide          │
              │ Tool Selection  │
              └────────┬────────┘
                       │
                   Tool Call
                       │
                       ▼
              ┌─────────────────┐
              │     NestJS      │
              │                 │
              │ Validate        │
              │ Business Rules  │
              │ Current State   │
              └────────┬────────┘
                       │
                       ▼
                    MongoDB
                       │
                       ▼
             Current system state
                       │
                       ▼
                 Agent continues
                       │
                       ▼
              Appointment proposal
                       │
                       ▼
             Patient confirmation
                       │
                       ▼
                Booking action
                       │
                       ▼
               Final confirmation
```

------------------------------------------------------------------------

# 52. Recommended Build Order

Build exactly in this order:

``` text
1. LiveKit + Gemini voice
          ↓
2. Basic React conversation UI
          ↓
3. NestJS + MongoDB
          ↓
4. Seed doctors/schedules/appointments
          ↓
5. Agent ↔ NestJS connection
          ↓
6. updateIntake() tool
          ↓
7. Live patient form
          ↓
8. findDoctors()
          ↓
9. findAvailableSlots()
          ↓
10. Patient preferences
          ↓
11. Slot proposal
          ↓
12. Explicit confirmation
          ↓
13. bookAppointment()
          ↓
14. Reschedule/cancel
          ↓
15. Four domains
          ↓
16. Recovery scenarios
          ↓
17. Agent activity panel
          ↓
18. Patient simulator
          ↓
19. Audit log
          ↓
20. Evaluation
```

------------------------------------------------------------------------

# 53. Final POC Definition

The final demo should allow someone to sit in front of the application
and say:

> "I need to see a dentist tomorrow after 6 because I've had pain in my
> upper right tooth since yesterday."

The agent should then independently:

``` text
Understand request
      ↓
Identify Dental
      ↓
Collect missing information
      ↓
Update patient intake
      ↓
Search dentists
      ↓
Check doctor status
      ↓
Check schedules
      ↓
Find matching slots
      ↓
Offer options
      ↓
Patient selects
      ↓
Ask confirmation
      ↓
Re-check availability
      ↓
Book appointment
      ↓
Show confirmation
      ↓
Update final intake
```

That is the core POC.

The objective is not to demonstrate that an LLM can talk.

The objective is to demonstrate that an LLM can **operate a healthcare
front-desk workflow through controlled tools while maintaining state and
keeping the patient in control of consequential actions**.

------------------------------------------------------------------------

# 54. Compliance & Vendor Decisions (HIPAA Track)

This project is not staying a throwaway POC — it is intended to grow
into a real product that will eventually handle real patient data.
That decision changes three vendor choices now, even though the build
continues to use synthetic data until real PHI is actually in scope.

## Why this matters now, not later

Once real PHI flows through any part of the system, every vendor that
touches it (model provider, database, realtime transport) needs a
signed Business Associate Agreement (BAA) under HIPAA. Some of those
vendors have a "consumer" tier that is explicitly **not** covered by
their BAA, alongside an enterprise tier that is. If the code is built
against the consumer tier first, switching later is not just a config
change — it can mean different SDKs, different auth models, different
error handling. Building against the BAA-eligible tier from day one
avoids that rewrite, and costs nothing while data stays synthetic.

## Decisions

**Gemini → Vertex AI, not the public Gemini Developer API / AI
Studio.** The free `GOOGLE_API_KEY` path is not covered by Google's
BAA. Vertex AI is. The good news: `@livekit/agents-plugin-google`
(the same Node.js plugin the plan already uses) supports Vertex AI
natively — `vertexai: true` plus `project`/`location` — so this is a
config decision, not a different integration. Use
`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` /
`GOOGLE_APPLICATION_CREDENTIALS` from the start (§29), never
`GOOGLE_API_KEY`.

**MongoDB → Atlas, HIPAA-eligible dedicated tier before real PHI.**
Shared/free tier Atlas is fine for synthetic seed data during
development. Before any real patient record is written, move to a
dedicated cluster tier with a signed BAA.

**LiveKit → Cloud Scale tier (or Enterprise) with a signed BAA before
real PHI.** LiveKit Cloud is HIPAA-eligible on Scale/Enterprise with a
BAA, requested through their sales contact, and requires picking from
their HIPAA-eligible model list. The free/Standard tier is fine for
development with synthetic voices.

## What this does *not* require right now

- No BAA needs to be signed today — only once real patient data is
  actually going to flow through a given vendor.
- No infrastructure changes today beyond pointing the Gemini client at
  Vertex AI instead of AI Studio.
- Seed data stays synthetic (§8) until this compliance track is
  actually complete.

## One thing to design in now, not retrofit later

The audit trail (§41) will eventually contain real patient
information once PHI is in scope. Design its storage and any
downstream consumers (logs, error trackers, analytics) assuming that
from the start — e.g. don't pipe raw tool arguments/results into a
third-party logging or error-tracking service that hasn't itself
signed a BAA, even during development. It's a much smaller habit to
build now than a migration to do later.

------------------------------------------------------------------------

# 55. Repo Structure Decision

Decided when actual scaffolding started, superseding §27/§28's
original `apps/*` monorepo sketch:

- **Flat top-level folders**: `frontend/`, `backend/`, `agent/`
  (added later) instead of `apps/web`, `apps/api`, `apps/agent`. Same
  content/conventions as originally planned, different top-level
  names.
- **No workspace, independent projects**: no root `package.json` or
  npm/pnpm `workspaces` field. Each folder is scaffolded by its own
  framework CLI and keeps its own `package.json`/lockfile. `packages/`
  (shared types, per the original §28 sketch) is deferred until
  there's an actual piece of code that needs sharing across
  frontend/backend/agent — introducing a workspace before that exists
  would be structure with nothing to justify it.
- Everything else already decided — CLI-only scaffolding, TypeScript
  pinned to 6.x, NestJS/React/LiveKit conventions — carries over
  unchanged; only the folder names and workspace question changed.
  `CLAUDE.md` is the source of truth for current conventions; this
  section just records why the structure differs from §27/§28's
  original diagrams.
