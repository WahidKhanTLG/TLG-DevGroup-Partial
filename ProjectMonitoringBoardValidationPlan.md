# Project Monitoring Board Validation & Enhancement Plan

## 1. Field Validation & Business Rules

### Previous Day Date (field)
- **Purpose:** Indicates the calendar date on which the last daily status record was created, so anyone can see how recent the previous update was.
- **Population:** Auto filled when a new daily record is saved (typically yesterday’s date).

### Next Step (field)
- **Purpose:** States the primary task you will work on today, ensuring visible daily progress.
- **Population:** Manually entered by the project owner each day; must be a fresh, specific action.
- **Validation Logic:**
  1. Prevent entering the same "Next Step" as the previous day for the same project.
  2. Show a warning if the "Next Step" is too generic (e.g., "Follow up", "Update", "Same as yesterday", "No change", "Continue", "N/A").
  3. If the same "Next Step" is entered two days in a row (three consecutive identical entries), block further updates and require a new, specific action.
  4. Warning modal must be acknowledged before moving to the next project; blocking modal prevents saving until changed.

### Previous Step (field)
- **Purpose:** Displays the Next Step captured in the prior day’s status, providing instant context for what was just completed.
- **Population:** Auto copied from yesterday’s Next Step when today’s record is created (read only).

### Next Meeting Scheduled? (field)
- **Purpose:** Quick answer to “Is the next client meeting on the calendar?” (values — Yes / No / Maybe / Call Not Required).
- **Population:** Manually selected on every daily record; controls visibility/requirements of related fields.

### Next Meeting Date (field)
- **Purpose:** The confirmed or proposed date/time for the upcoming client call.
- **Population:** Manually entered and required when Next Meeting Scheduled? is Yes or No; optional when Maybe.

### Next Meeting Agenda (field)
- **Purpose:** Lists what you intend to demo or discuss in the upcoming client meeting; may repeat on successive days until that meeting occurs.
- **Population:** Manually updated whenever the planned content of the next call changes.

### Previous Meeting Agenda (field)
- **Purpose:** Records what was actually demoed or discussed in the most recent client call, giving the team clear historical reference.
- **Population:** Auto filled with the contents of Next Meeting Agenda after the meeting date passes (read only).

### Last Meeting Date (field)
- **Purpose:** Shows the calendar date on which the most recent client call occurred.
- **Population:** Auto updated from Next Meeting Date once that call is completed (read only).

### Risk & Action (field)
- **Purpose:** Captures any identified project risk along with the planned mitigation steps; completed only when a genuine risk exists.
- **Population:** Manually filled when needed; remains blank on records with no active risk.

### Due Date (field)
- **Purpose:** Internal target for completing the tasks listed in this daily record, supporting SLA tracking; hidden from users.
- **Population:** Automatically defaults to a future date (e.g., Created Date + 7 days) and is not editable.

---

### Special Scenario: Project Status Transition (Go Live / Closed)

When a project's status is updated from "In Development" to "Go Live" or "Closed":

- **Next Meeting Scheduled?**
  - Label changes to **Next Follow Up Required?**.
  - If user selects "Yes", the **Next Follow Up Date** field appears and is required.
  - If "No" or other, field is not required and not appear.

- **Next Step**
  - Remains required on Yes.

- **Risk & Action**
  - Field is present but not required.

- **Other Fields**
  - Standard ongoing project rules do not apply during this transition.

---

## 2. UI/UX Plan
- **Warning Modal:**
  - Appears if a duplicate or generic "Next Step" is detected.
  - User must click "Okay" to proceed.
- **Blocking Modal:**
  - Appears if the same "Next Step" is entered three times in a row.
  - User must change the field before saving.
- **Next Meeting Scheduled? / Next Follow Up Date Transition:**
  - Update field labels and requirements based on project status.
  - Ensure smooth transition and clarity for users.

## 3. Apex Controller Enhancements
- Add logic to compare new "Next Step" to previous entries and detect generic phrases.
- Return warning/blocking flags and messages to LWC.
- Refactor controller to support richer data for master-detail UI (see UI Enhancement Plan).
- Handle special scenario logic for project status transitions (Go Live / Closed).

## 4. LWC Component Enhancements
- Show modal dialogs for warnings and blocks.
- Prevent navigation until user acknowledges modal.
- Require field change if blocked.
- Dynamically update field labels and requirements based on project status.

## 5. Implementation Steps
1. Update Apex controller (`ProjectMonitoringNavController.cls`) with validation logic and new wrapper class for master-detail view.
2. Update LWC JS (`projectMonitoringDetailsPortalPlus.js`) to handle new validation responses and UI state.
3. Overhaul LWC HTML (`projectMonitoringDetailsPortalPlus.html`) for master-detail layout and modal dialogs.
4. Test and iterate based on user feedback and additional field details.

---

**History Tracking:**
- This file will be updated as new business rules and field details are provided.
- All changes and implementation plans will be documented here for reference.

---

*Last updated: July 26, 2025*
