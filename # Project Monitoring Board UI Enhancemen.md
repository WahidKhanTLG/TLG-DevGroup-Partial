# Project Monitoring Board UI Enhancement Plan

## 1. User Goal

The primary goal is to improve the user experience for Project Managers by transforming the current project monitoring tool into a more intuitive and dynamic dashboard. This will help them quickly see how many projects they have covered, how many are remaining, and which ones require special attention.

The key requirements are:
-   Use the existing HTML structure and CSS library to maintain a consistent look and feel.
-   Provide a clear overview of all assigned projects.
-   Give immediate visual feedback for projects that have been updated today.
-   Use distinct visual cues (colors, icons) for projects that are "On Hold" or have future-dated follow-ups.

## 2. Proposed Solution: Master-Detail View

We will implement a two-column "master-detail" layout.

-   **Master List (Left Column):** A simple, scrollable list of all projects assigned to the manager. Each project name will be clickable. This list will feature the new visual indicators.
-   **Detail View (Right Column):** This area will contain the existing project detail and update form. It will only be visible after a project is selected from the master list.

### Visual Indicators in Master List:
-   **Green Tick (`✓`):** Will appear next to projects that have been successfully updated during the current session.
-   **Future/On-Hold Icon (`🕒`):** Will appear next to projects that have a `Next_Meeting_Date__c` set in the future, indicating no immediate action is required.

## 3. Technical Implementation Plan

### Step 1: Refactor Apex Controller (`ProjectMonitoringNavController.cls`)

The controller needs to send richer data to the LWC.

-   **Create a New Wrapper Class:** Define a new inner class `ProjectListItem` to hold the necessary data for the list view.
    ```apex
    public class ProjectListItem {
        @AuraEnabled public Id projectId;
        @AuraEnabled public String projectName;
        @AuraEnabled public Boolean isFutureDated; // Flag for on-hold/future projects
    }
    ```
-   **Create a New `@AuraEnabled` Method:** Create a new method, `getProjectList`, that replaces the old `getProjectTaskIds`. This new method will perform the necessary queries and return a `List<ProjectListItem>`.

### Step 2: Update LWC JavaScript (`projectMonitoringDetailsPortalPlus.js`)

The component's JavaScript will manage the state of the new UI.

-   **Add New Tracked Properties:**
    -   `projectList`: To hold the array of `ProjectListItem` objects from Apex.
    -   `selectedProjectId`: To store the ID of the currently selected project.
    -   `completedToday`: A `Set` to store the IDs of projects updated in the current session.
-   **Update Wire Service:** Modify the existing wire service to call the new `getProjectList` Apex method.
-   **Create Event Handlers:**
    -   `handleProjectSelect(event)`: Sets `selectedProjectId` when a user clicks a project.
    -   Update the existing `handleSuccess` method to add the project's ID to the `completedToday` set after a successful save.
-   **Create Getters for Dynamic Styling:**
    -   `get projectItemClasses()`: To dynamically apply CSS classes for selected/unselected states.
    -   `get showCompletedIcon()`: To conditionally render the green tick.
    -   `get showFutureIcon()`: To conditionally render the future/on-hold icon.

### Step 3: Overhaul LWC HTML (`projectMonitoringDetailsPortalPlus.html`)

The template will be restructured to support the two-column layout.

-   **Create a Two-Column Structure:** Use `div` elements with appropriate SLDS grid classes to create the master and detail columns.
-   **Build the Master List:**
    -   Use a `template for:each={projectList}` to iterate over the projects.
    -   Make each list item a clickable element (e.g., an `<a>` or a styled `div`) with an `onclick` handler pointing to `handleProjectSelect`.
    -   Use `lwc:if` directives to conditionally render the green tick and future-dated icons based on the new getters in the JavaScript.
-   **Isolate the Detail View:**
    -   Wrap the entire existing project detail form inside a `<template lwc:if={selectedProjectId}>`. This ensures it only appears when a project is selected.