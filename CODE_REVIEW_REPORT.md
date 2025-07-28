# Project Monitoring Details Portal Plus - Code Review Report

**Date:** January 2025  
**Reviewer:** GitHub Copilot  
**Project:** TLG-DevGroup  
**Focus:** Page Load Logic & Save & New Record Creation

---

## Summary

The Project Monitoring Details Portal Plus component is a critical PM daily status tracking tool for customer accountability. The component loads a single record where `Due_Date__c = TODAY` and displays various fields with "Previous" labels for UI presentation. 

**Key Business Logic:** 
- **Page Load**: Single record display (Due_Date__c = TODAY)
- **Field Display**: nextSteps → Previous Day Action, nextAgenda → Previous Day Agenda, etc.
- **Save & New**: Create new record with field mapping + update current record's Fulfilled = true
- PM accountability tracking for customer engagement

**Critical Issues Found:**
1. Getter methods incorrectly use `previousTask` logic instead of `currentTask` (Page Load)
2. UI field mapping broken - prevents proper PM status display (Page Load)
3. Missing ShowToastEvent import causes runtime errors
4. Save & New record creation logic needs implementation

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

### 4. **Missing Save & New Record Creation Logic**
**File:** `projectMonitoringDetailsPortalPlus.js`  
**Severity:** Critical - Missing Core Functionality  

**Issue:** Save & New functionality needs complete implementation for field mapping and record creation.

**Required Field Mapping for New Record Creation:**

**From "Previous Action" Card → New Record Fields:**
- `lastMeetingDate` → `lastMeetingDate` 
- `previousDayAction` → `previousDayAction`
- `previousDayAgenda` → `previousDayAgenda`

**From "Goals for Today" Card → New Record Fields:**
- `nextMeetingAgenda` → `nextMeetingAgenda`
- `nextSteps` → `nextSteps` 
- `riskAndAction` → `riskAndAction`
- `nextMeetingScheduled` → `nextMeetingScheduled`
- `nextMeetingDate` → `nextMeetingDate`

**Additional Actions Required:**
1. Update current record: `Fulfilled__c = true`
2. Create new record with mapped field values
3. Set new record's `Due_Date__c = TODAY + 1` (or next business day)

**Implementation Needed:**
```javascript
handleSaveAndNew() {
    // 1. Create new record with field mapping
    const newRecord = {
        // Previous Action card mappings
        lastMeetingDate: this.currentTask.lastMeetingDate,
        previousDayAction: this.currentTask.previousDayAction, 
        previousDayAgenda: this.currentTask.previousDayAgenda,
        
        // Goals for Today card mappings
        nextMeetingAgenda: this.currentTask.nextMeetingAgenda,
        nextSteps: this.currentTask.nextSteps,
        riskAndAction: this.currentTask.riskAndAction,
        nextMeetingScheduled: this.currentTask.nextMeetingScheduled,
        nextMeetingDate: this.currentTask.nextMeetingDate,
        
        // Set due date for new record
        Due_Date__c: this.calculateNextBusinessDay(),
        // Copy project reference
        Opportunity__c: this.currentTask.Opportunity__c
    };
    
    // 2. Update current record fulfilled status
    const currentRecordUpdate = {
        Id: this.currentTask.Id,
        Fulfilled__c: true
    };
    
    // 3. Execute both operations
    this.executeRecordOperations(newRecord, currentRecordUpdate);
}
```

---

## 🟡 HIGH PRIORITY ISSUES (P1) - Fix This Sprint

### 5. **Missing lastMeetingDate Field Mapping**
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

### 6. **Inconsistent Error Handling in Page Load**
**File:** `projectMonitoringDetailsPortalPlus.js` (lines 65-95)  
**Severity:** High - User Experience  

**Issue:** Page load error handling doesn't provide clear feedback to users when record loading fails.

**Current Behavior:** Silent failures or generic error messages.

**Fix Required:** Add specific error handling for record load failures with user-friendly messages.

---

## 🚀 RECOMMENDATIONS

### Phase 1: Critical Fixes (This Sprint)

**Page Load Fixes:**
1. **Fix page load field mapping** - Use currentTask for all "Previous" field displays 
2. **Fix previousDayDate source** - Use currentTask.dueDate instead of previousTask.previousDayDate
3. **Add missing ShowToastEvent import** - Fix runtime error
4. **Add lastMeetingDate getter** - Complete field mapping for UI display

**Save & New Functionality Implementation:**
5. **Implement Save & New record creation** - Complete field mapping logic
6. **Add current record Fulfilled update** - Set Fulfilled__c = true on current record
7. **Add next business day calculation** - Proper Due_Date__c for new record
8. **Add error handling** - For both record creation and update operations

### Testing Requirements

**Page Load Testing:**
1. Verify all "Previous" fields display correct data from current record
2. Test page load with record where Due_Date__c = TODAY
3. Validate error handling when no record found for today
4. Confirm field relabeling works correctly in UI

**Save & New Testing:**
5. Test new record creation with proper field mapping
6. Verify current record Fulfilled__c updates to true
7. Confirm new record Due_Date__c set to next business day
8. Test error scenarios (creation failures, update failures)
9. Validate all field mappings from Previous Action and Goals for Today cards

---

## Technical Notes

**Page Load Business Logic:**
- Component loads single record where `Due_Date__c = TODAY`
- All "Previous" labels are UI presentation only, not actual previous day records
- Field mapping: Database field → UI Label
  - `nextSteps` → "Previous Day Action"
  - `nextAgenda` → "Previous Day Agenda"
  - `riskAndAction` → "Previous Risk & Action"
  - `dueDate` → "Previous Day Date"

**Save & New Business Logic:**
- Creates new record with field mapping from current record
- Updates current record: `Fulfilled__c = true`
- Field mapping for new record creation:

**From Previous Action Card:**
  - `lastMeetingDate` → `lastMeetingDate`
  - `previousDayAction` → `previousDayAction` 
  - `previousDayAgenda` → `previousDayAgenda`

**From Goals for Today Card:**
  - `nextMeetingAgenda` → `nextMeetingAgenda`
  - `nextSteps` → `nextSteps`
  - `riskAndAction` → `riskAndAction`
  - `nextMeetingScheduled` → `nextMeetingScheduled`
  - `nextMeetingDate` → `nextMeetingDate`

**Data Flow:**
1. **Page Load**: Load record with Due_Date__c = TODAY, display with "Previous" labels
2. **Save & New**: Map current record fields → new record, set Fulfilled = true on current
3. Enable PM to track daily status for customer engagement
