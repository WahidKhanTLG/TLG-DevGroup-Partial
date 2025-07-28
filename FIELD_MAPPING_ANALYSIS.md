# Field Mapping Analysis - PM Daily Status Tracking

## 🎯 Business Logic Understanding

### **Purpose:** 
Project Managers capture daily status to create an audit trail. When customers raise concerns, we can trace back to specific PM commitments and actions.

### **Daily Accountability Chain:**
- **Yesterday:** PM commits to specific actions, agenda items, and risk mitigations
- **Today:** PM should be held accountable for yesterday's commitments
- **Tomorrow:** Today's commitments become tomorrow's accountability

---

## 🔄 Current Field Mapping Issues

### **On Save Operation** (`handleSaveAndNext` method)

**Current INCORRECT mapping:**
```javascript
const newTask = {
    // ❌ WRONG: Previous fields should come from previous task's "Next" fields
    previousStep: this.newNextSteps,        // Should be: this.previousTask?.nextSteps
    previousAgenda: this.currentAgenda,     // Should be: this.previousTask?.nextAgenda
    
    // ✅ CORRECT: Next fields should come from current inputs
    nextSteps: this.newNextSteps,           // ✅ Today's planned actions
    nextAgenda: this.currentAgenda,         // ✅ Today's planned agenda  
    riskAndAction: this.currentRiskAndAction, // ✅ Today's risk assessment
    
    // ❌ MISSING: Previous Risk & Action field mapping
    // Should add: previousRiskAndAction: this.previousTask?.riskAndAction
};
```

**CORRECT mapping should be:**
```javascript
const newTask = {
    // ✅ Previous fields = Yesterday's "Next" commitments (for accountability)
    previousStep: this.previousTask?.nextSteps,      // What PM committed to do yesterday
    previousAgenda: this.previousTask?.nextAgenda,   // What PM planned for yesterday's meeting
    previousRiskAndAction: this.previousTask?.riskAndAction, // What risks PM said they'd address
    
    // ✅ Next fields = Today's new commitments (for tomorrow's accountability)
    nextSteps: this.newNextSteps,                    // What PM commits to do today
    nextAgenda: this.currentAgenda,                  // What PM plans for today's meeting
    riskAndAction: this.currentRiskAndAction,        // What risks PM will address today
    
    // ✅ Other tracking fields
    previousDayDate: new Date().toISOString(),       // Today's date
    lastMeetingDate: this.previousTask?.nextMeetingDate, // When was the last meeting
};
```

---

## 📋 Page Load Field Display

### **Previous Actions Section** (Read-only display)
Shows what the PM committed to yesterday:

```javascript
# PAGE LOAD LOGIC - Field Mapping Analysis

## 🎯 **CORRECT Understanding - Single Record Display**

### **Page Load Process:**
1. **Query:** Find records where `Due_Date__c = TODAY`
2. **Load:** Load ONE record from that result set  
3. **Display:** Show that record's fields with label mapping

---

## 🔍 **CURRENT GETTER IMPLEMENTATION (WRONG)**

```javascript
// ❌ WRONG: Looking for previousTask first, then falling back to currentTask
get previousStep() {
    if (this.previousTask) {
        return this.previousTask.nextSteps || '';  // Looking at previous record
    }
    return this.currentTask ? this.currentTask.nextSteps || '' : '';  // Fallback to current
}

get previousAgenda() {
    if (this.previousTask) {
        return this.previousTask.nextAgenda || '';  // Looking at previous record
    }
    return this.currentTask ? this.currentTask.nextAgenda || '' : '';  // Fallback to current
}

get previousRiskAndAction() {
    if (this.previousTask) {
        return this.previousTask.riskAndAction;  // Looking at previous record
    }
    return this.currentTask ? this.currentTask.riskAndAction : '';  // Fallback to current
}

get previousDayDate() {
    return this.previousTask ? this.previousTask.previousDayDate : null;  // Wrong field
}

get lastMeetingDate() {
    return this.previousTask ? this.previousTask.nextMeetingDate : null;  // Looking at previous record
}
```

---

## ✅ **CORRECT GETTER IMPLEMENTATION (SHOULD BE)**

```javascript
// ✅ CORRECT: Always use currentTask (the record due today)
get previousStep() {
    return this.currentTask?.nextSteps || '';     // "Next Steps" → "Previous Day Action"
}

get previousAgenda() {
    return this.currentTask?.nextAgenda || '';    // "Next Meeting Agenda" → "Previous Day Agenda" 
}

get previousRiskAndAction() {
    return this.currentTask?.riskAndAction || ''; // "Risk & Action" → "Previous Risk & Action"
}

get previousDayDate() {
    return this.currentTask?.dueDate;             // "Due Date" → "Previous Day Date"
}

get lastMeetingDate() {
    return this.currentTask?.lastMeetingDate;     // "Last Meeting Date" → "Last Meeting Date"
}
```

---

## 🚨 **ISSUES IDENTIFIED**

### **1. Wrong Logic - Looking at Previous Record**
Current code tries to find a `previousTask` first, but we should **ONLY** use the `currentTask` (the record due today).

### **2. Wrong Field Mapping for previousDayDate** 
- **Current:** `this.previousTask.previousDayDate`
- **Should be:** `this.currentTask.dueDate`

### **3. Wrong Source for lastMeetingDate**
- **Current:** `this.previousTask.nextMeetingDate`  
- **Should be:** `this.currentTask.lastMeetingDate`

---

## 🎯 **Business Logic Summary**

**Single Record Display:**
- Load the record where `Due_Date__c = TODAY`
- Show that record's "Next" fields as "Previous" labels for display purposes
- No need for actual previous records - it's all about label presentation

**Example:**
```
Record in database (Due_Date__c = July 28, 2025):
- Next_Steps__c: "Review client requirements"
- Next_Agenda__c: "Discuss timeline"  
- Risk_and_Action__c: "Mitigate resource issues"
- Due_Date__c: 2025-07-28
- Last_Meeting_Date__c: 2025-07-25

UI Display:
- Previous Day Action: "Review client requirements"   (from Next_Steps__c)
- Previous Day Agenda: "Discuss timeline"             (from Next_Agenda__c)
- Previous Risk & Action: "Mitigate resource issues"  (from Risk_and_Action__c)
- Previous Day Date: "July 28, 2025"                  (from Due_Date__c)
- Last Meeting Date: "July 25, 2025"                  (from Last_Meeting_Date__c)
```

This is simply **field relabeling** for UI presentation, not actual previous/next record relationships!
```

### **Goals for Today Section** (Input fields)
Where PM enters today's commitments:

```javascript
// ✅ These are input fields bound to current form values
this.newNextSteps         // → becomes nextSteps in save
this.currentAgenda        // → becomes nextAgenda in save
this.currentRiskAndAction // → becomes riskAndAction in save
```

---

## ✅ My Understanding - Please Confirm

### **Scenario: 3-Day PM Workflow**

**Day 1 (Monday):**
- PM enters: "Next Steps: Review client requirements"
- PM enters: "Next Agenda: Discuss timeline" 
- PM enters: "Risk & Action: Mitigate resource constraint"

**Day 2 (Tuesday):**
- **Previous Actions shows:** "Review client requirements" (from Monday's Next Steps)
- **Previous Agenda shows:** "Discuss timeline" (from Monday's Next Agenda)
- **Previous Risk shows:** "Mitigate resource constraint" (from Monday's Risk & Action)
- PM enters NEW: "Next Steps: Complete design review"
- PM enters NEW: "Next Agenda: Present to stakeholders"
- PM enters NEW: "Risk & Action: Address technical debt"

**Day 3 (Wednesday):**
- **Previous Actions shows:** "Complete design review" (from Tuesday's Next Steps)
- **Previous Agenda shows:** "Present to stakeholders" (from Tuesday's Next Agenda)  
- **Previous Risk shows:** "Address technical debt" (from Tuesday's Risk & Action)

### **Customer Concern Scenario:**
Customer calls Wednesday saying "You promised to review our requirements but it didn't happen!"
- We can trace back to Monday's record showing PM committed to "Review client requirements"
- We can see Tuesday's record showing what actually happened vs. the commitment

---

## 🔧 Required Fix

**In `handleSaveAndNext` method, change the field mapping from:**
```javascript
previousStep: this.newNextSteps,        // ❌ WRONG
previousAgenda: this.currentAgenda,     // ❌ WRONG
```

**To:**
```javascript
previousStep: this.previousTask?.nextSteps,      // ✅ CORRECT
previousAgenda: this.previousTask?.nextAgenda,   // ✅ CORRECT
previousRiskAndAction: this.previousTask?.riskAndAction, // ✅ ADD THIS
```

---

## ❓ Questions to Confirm Understanding

1. **Is my 3-day scenario correct?** Yesterday's "Next" becomes today's "Previous"?

2. **Should the "Previous" fields always be read-only?** They show historical commitments for accountability?

3. **Are there any other fields that follow this pattern?** Any other Yesterday→Today mappings I missed?

4. **What happens on the very first day?** When there's no previous task, do we show empty Previous fields or current task data as fallback?

Please confirm if my understanding is correct, and I'll focus the code review specifically on fixing these field mappings!
