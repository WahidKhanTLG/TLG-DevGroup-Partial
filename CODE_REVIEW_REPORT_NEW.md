# Project Monitoring Details Portal Plus - Code Review Report

**Date:** January 2025  
**Reviewer:** GitHub Copilot  
**Project:** TLG-DevGroup  
**Focus:** Page Load Logic Only

---

## Summary

The Project Monitoring Details Portal Plus component is a critical PM daily status tracking tool for customer accountability. The component loads a single record where `Due_Date__c = TODAY` and displays various fields with "Previous" labels for UI presentation. 

**Key Business Logic:** 
- Single record display (Due_Date__c = TODAY)
- Field relabeling: nextSteps → Previous Day Action, nextAgenda → Previous Day Agenda, etc.
- PM accountability tracking for customer engagement

**Critical Issues Found:**
1. Getter methods incorrectly use `previousTask` logic instead of `currentTask`
2. UI field mapping broken - prevents proper PM status display
3. Missing ShowToastEvent import causes runtime errors

---

## 🔴 CRITICAL ISSUES (P0) - Must Fix Immediately

### 1. **Field Mapping Logic Error in Page Load**
**File:** `projectMonitoringDetailsPortalPlus.js` (lines 242-275)  
**Severity:** Critical - Broken Functionality  

**Issue:** Getter methods incorrectly use `previousTask` instead of `currentTask` for displaying "Previous" fields.

**Current Code:**
```javascript
get previousStep() {
    return this.previousTask ? this.previousTask.nextSteps : '';
}

get previousAgenda() {
    return this.previousTask ? this.previousTask.nextAgenda : '';
}

get previousRiskAndAction() {
    return this.previousTask ? this.previousTask.riskAndAction : '';
}
```

**Problem:** These getters look for `previousTask` which doesn't exist in the context of a single record display.

**Expected Behavior:** Should use `currentTask` fields for display:
- `currentTask.nextSteps` → Display as "Previous Day Action"
- `currentTask.nextAgenda` → Display as "Previous Day Agenda"  
- `currentTask.riskAndAction` → Display as "Previous Risk & Action"

**Fix Required:**
```javascript
get previousStep() {
    return this.currentTask ? this.currentTask.nextSteps : '';
}

get previousAgenda() {
    return this.currentTask ? this.currentTask.nextAgenda : '';
}

get previousRiskAndAction() {
    return this.currentTask ? this.currentTask.riskAndAction : '';
}
```

### 2. **Incorrect Date Field Mapping**
**File:** `projectMonitoringDetailsPortalPlus.js` (lines 265-267)  
**Severity:** Critical - Data Display Error  

**Issue:** `previousDayDate` getter uses wrong field source.

**Current Code:**
```javascript
get previousDayDate() {
    return this.previousTask ? this.previousTask.previousDayDate : '';
}
```

**Problem:** Should use `currentTask.dueDate` since this is the record for TODAY.

**Fix Required:**
```javascript
get previousDayDate() {
    return this.currentTask ? this.currentTask.dueDate : '';
}
```

### 3. **Missing ShowToastEvent Import**
**File:** `projectMonitoringDetailsPortalPlus.js` (line 7)  
**Severity:** High - Runtime Error  

**Issue:** Component uses `ShowToastEvent` but doesn't import it.

**Fix Required:**
```javascript
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
```

---

## 🟡 HIGH PRIORITY ISSUES (P1) - Fix This Sprint

### 4. **Missing lastMeetingDate Field Mapping**
**File:** `projectMonitoringDetailsPortalPlus.js`  
**Severity:** High - Missing Functionality  

**Issue:** No getter method for `lastMeetingDate` field display.

**Expected Behavior:** Should display `currentTask.lastMeetingDate` in the UI.

**Fix Required:**
```javascript
get lastMeetingDate() {
    return this.currentTask ? this.currentTask.lastMeetingDate : '';
}
```

### 5. **Inconsistent Error Handling in Page Load**
**File:** `projectMonitoringDetailsPortalPlus.js` (lines 65-95)  
**Severity:** High - User Experience  

**Issue:** Page load error handling doesn't provide clear feedback to users when record loading fails.

**Current Behavior:** Silent failures or generic error messages.

**Fix Required:** Add specific error handling for record load failures with user-friendly messages.

---

## 🚀 RECOMMENDATIONS

### Phase 1: Critical Fixes (This Sprint)
1. **Fix page load field mapping** - Use currentTask for all "Previous" field displays 
2. **Fix previousDayDate source** - Use currentTask.dueDate instead of previousTask.previousDayDate
3. **Fix lastMeetingDate source** - Use currentTask.lastMeetingDate instead of previousTask.nextMeetingDate
4. **Add missing ShowToastEvent import** - Fix runtime error
5. **Fix modal button actions** - Ensure correct Yes/No behavior

### Testing Requirements
1. Verify all "Previous" fields display correct data from current record
2. Test page load with record where Due_Date__c = TODAY
3. Validate error handling when no record found for today
4. Confirm field relabeling works correctly in UI

---

## Technical Notes

**Business Logic Confirmation:**
- Component loads single record where `Due_Date__c = TODAY`
- All "Previous" labels are UI presentation only, not actual previous day records
- Field mapping: Database field → UI Label
  - `nextSteps` → "Previous Day Action"
  - `nextAgenda` → "Previous Day Agenda"
  - `riskAndAction` → "Previous Risk & Action"
  - `dueDate` → "Previous Day Date"

**Data Flow:**
1. Load record with Due_Date__c = TODAY
2. Display fields with "Previous" labels for PM accountability
3. Enable PM to track daily status for customer engagement
