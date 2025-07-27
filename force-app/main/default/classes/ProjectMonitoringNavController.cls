public without sharing class ProjectMonitoringNavController {

    /**
     * Fetch task record Ids for a given Project Manager (portalUserId)
     * Ordered by CreatedDate (oldest first)
     */
    @AuraEnabled(cacheable=true)
    public static List<Id> getProjectTaskIds(String portalUserId, String mode, String statusFilter) {
        Set<Id> projectIdSet = new Set<Id>();

        if (String.isBlank(portalUserId)) return new List<Id>();

        Boolean isView = !String.isBlank(mode) && mode.toLowerCase() == 'view';
        Boolean isAll = String.isBlank(statusFilter) || statusFilter == 'All';
        Boolean isDueToday = statusFilter == 'Due Today';
        Boolean isOpen = statusFilter == 'Open';

        // --- Handle Due Today filter ---
        if (isDueToday) {
            List<Project_Assistant_Task__c> dueTodayTasks = [
                SELECT Opportunity__c FROM Project_Assistant_Task__c
                WHERE Fulfilled__c = FALSE
                AND Opportunity__r.Portal_User_Owner__c = :portalUserId
                AND Opportunity__r.StageName = 'Closed Won'
                AND Due_Date__c = :Date.today()
            ];
            for(Project_Assistant_Task__c task : dueTodayTasks) {
                projectIdSet.add(task.Opportunity__c);
            }
            return new List<Id>(projectIdSet);
        }
        // --- Handle Open filter (no tasks created yet) ---
        if (isOpen) {
            List<Opportunity> openOpps = [
                SELECT Id FROM Opportunity
                WHERE Portal_User_Owner__c = :portalUserId
                AND StageName = 'Closed Won'
                AND Id NOT IN (SELECT Opportunity__c FROM Project_Assistant_Task__c WHERE Opportunity__c != null)
            ];
            for (Opportunity opp : openOpps) {
                projectIdSet.add(opp.Id);
            }
            return new List<Id>(projectIdSet);
        }
        
        // --- UPDATE mode with ALL ---
        if (!isView && isAll) {
            Date a_startDate = Date.today();
            Date a_endDate = Date.today();
            // Define today for meeting date queries
            Date today = Date.today();
            // Only show projects with Stage = Closed Won, Status = In Development, and Due Date = today
            List<Project_Assistant_Task__c> dueTodayTasks = [
                SELECT Opportunity__c FROM Project_Assistant_Task__c
                WHERE Fulfilled__c = FALSE
                AND Opportunity__r.Portal_User_Owner__c = :portalUserId
                AND Opportunity__r.StageName = 'Closed Won'
                AND Opportunity__r.Project_Status__c = 'In Development'
                AND Due_Date__c = :Date.today()
            ];
            for(Project_Assistant_Task__c task : dueTodayTasks) {
                projectIdSet.add(task.Opportunity__c);
            }

            // Query 2: Next meeting check for existing projects
            Date nextDay = today.addDays(1);
            List<Project_Assistant_Task__c> meetingTasks = [
                SELECT Opportunity__c FROM Project_Assistant_Task__c
                WHERE Fulfilled__c = FALSE
                AND Opportunity__r.Portal_User_Owner__c = :portalUserId
                AND Opportunity__r.StageName = 'Closed Won'
                AND Opportunity__r.Project_Status__c = 'In Development'
                AND Next_Meeting_Date__c >= :today AND Next_Meeting_Date__c <= :nextDay
            ];
            for(Project_Assistant_Task__c task : meetingTasks) {
                projectIdSet.add(task.Opportunity__c);
            }

            // Get tasks for "Go Live" and "Closed" projects that are not yet fulfilled
            List<Project_Assistant_Task__c> goLiveOrClosedTasks = [
                SELECT Id, Opportunity__c
                FROM Project_Assistant_Task__c
                WHERE Fulfilled__c = FALSE
                AND Opportunity__r.Portal_User_Owner__c = :portalUserId
                AND Opportunity__r.StageName = 'Closed Won'
                AND Opportunity__r.Project_Status__c IN ('Go Live', 'Closed')
            ];
            for (Project_Assistant_Task__c task : goLiveOrClosedTasks) {
                projectIdSet.add(task.Opportunity__c);
            }

            // Query 3: Find new projects (Opportunities without any tasks yet)
            List<Opportunity> newOpps = [
                SELECT Id
                FROM Opportunity
                WHERE Portal_User_Owner__c = :portalUserId
                AND StageName = 'Closed Won'
                AND (Project_Status__c = '' OR Project_Status__c = 'Open' OR Project_Status__c = null)
                AND Id NOT IN (SELECT Opportunity__c FROM Project_Assistant_Task__c WHERE Opportunity__c != null)
            ];
            for (Opportunity opp : newOpps) {
                projectIdSet.add(opp.Id);
            }
            // Exclude opportunities in Prospect stage or In Development status
            List<Opportunity> excludeOpps = [SELECT Id FROM Opportunity WHERE Portal_User_Owner__c = :portalUserId AND (StageName = 'Prospect' OR Project_Status__c = 'In Development')];
            Set<Id> excludeIds = new Set<Id>();
            for (Opportunity opp : excludeOpps) {
                excludeIds.add(opp.Id);
            }
            projectIdSet.removeAll(excludeIds);
            return new List<Id>(projectIdSet);
        }

        // --- View mode or filtered status ---
        List<Opportunity> allOpps = isAll
            ? [SELECT Id FROM Opportunity WHERE Portal_User_Owner__c = :portalUserId AND StageName != 'Prospect' AND Project_Status__c != 'In Development']
            : [SELECT Id FROM Opportunity WHERE Portal_User_Owner__c = :portalUserId AND Project_Status__c = :statusFilter AND StageName != 'Prospect' AND Project_Status__c != 'In Development'];

        for (Opportunity opp : allOpps) {
            projectIdSet.add(opp.Id);
        }

        return new List<Id>(projectIdSet);
    }

    /**
     * Return wrapped task details using the shared wrapper from ProjectMonitoringController
     */
    @AuraEnabled(cacheable=false)
    public static ProjectTaskDetailWrapper getTaskDetailsById(Id opportunityId) {
        if (opportunityId == null) {
            throw new AuraHandledException('Opportunity Id is required.');
        }

        List<Project_Assistant_Task__c> recentTasks = [
            SELECT Id,
                Due_Date__c,
                Opportunity__c,
                Previous_Day_Date__c,
                Next_Meeting_Scheduled__c,
                Last_Meeting_Date__c,
                Next_Meeting_Date__c,
                Previous_Step__c,
                Next_Steps__c,
                Risk_and_Action__c,
                Previous_Agenda__c,
                Next_Agenda__c,
                Reason__c,
                Opportunity__r.Name,
                Opportunity__r.AccountId,
                Opportunity__r.Account.Name,
                Opportunity__r.IsPriorityRecord,
                Opportunity__r.Project_Status__c,
                Opportunity__r.Client_Onboarding_Sheet__c,
                Opportunity__r.Project_Tracker__c
            FROM Project_Assistant_Task__c
            WHERE Opportunity__c = :opportunityId
            ORDER BY Due_Date__c DESC
            LIMIT 2
        ];

        Date today = Date.today();
        Project_Assistant_Task__c todayTask;
        Project_Assistant_Task__c previousTask;

        for (Project_Assistant_Task__c t : recentTasks) {
            if (t.Due_Date__c == today && todayTask == null) {
                todayTask = t;
            } else if (previousTask == null) {
                previousTask = t;
            }
        }

        ProjectAssistantTaskWrapper currentWrapper;
        if (todayTask != null) {
            currentWrapper = new ProjectAssistantTaskWrapper(todayTask);
        } else {
            Opportunity opp = [
                SELECT Id, Name, AccountId, Account.Name,
                    IsPriorityRecord, Project_Status__c,
                    Client_Onboarding_Sheet__c, Project_Tracker__c
                FROM Opportunity
                WHERE Id = :opportunityId
                LIMIT 1
            ];
            currentWrapper = new ProjectAssistantTaskWrapper(opp);
        }

        ProjectAssistantTaskWrapper previousWrapper = previousTask != null ? new ProjectAssistantTaskWrapper(previousTask) : null;

        return new ProjectTaskDetailWrapper(currentWrapper, previousWrapper);
    }

    @AuraEnabled(cacheable=true)
    public static List<Portal_Users__c> getProjectManagers(){
        try {
            return [SELECT Id, Name, Designation__c FROM Portal_Users__c WHERE Is_Project_Manager__c = TRUE AND Is_Active__c = TRUE];
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static String insertProjectAssistantTasks(String fieldJson) {
        List<ProjectMonitoringNavController.ProjectAssistantTaskWrapper> wrappers =
            (List<ProjectMonitoringNavController.ProjectAssistantTaskWrapper>) JSON.deserialize(
                fieldJson, List<ProjectMonitoringNavController.ProjectAssistantTaskWrapper>.class
            );

        Map<Id, Project_Assistant_Task__c> oppToTodayTask = new Map<Id, Project_Assistant_Task__c>();
        Set<Id> oppIds = new Set<Id>();
        List<String> tasksToFulfillIds = new List<String>();
        Map<Id, String> oppIdToNewStatus = new Map<Id, String>();
        Map<Id, Boolean> repeatedDetailsWarning = new Map<Id, Boolean>();
        Map<Id, String> repeatedDetailsMessage = new Map<Id, String>();
        Boolean blockUpdate = false;
        String blockMessage = '';

        // Step 1: Collect Opportunity IDs and IDs of tasks to fulfill
        for (ProjectAssistantTaskWrapper w : wrappers) {
            if (w.opportunityId != null) {
                oppIds.add(w.opportunityId);
                if (String.isNotBlank(w.previousTaskId)) {
                    tasksToFulfillIds.add(w.previousTaskId);
                }
                oppIdToNewStatus.put(w.opportunityId, w.oppProjectStatus);
            }
        }

        // Step 1.5: Check for repeated details on consecutive days (existing logic)
        for (ProjectAssistantTaskWrapper w : wrappers) {
            if (w.opportunityId != null) {
                List<Project_Assistant_Task__c> lastTasks = [
                    SELECT Id, Due_Date__c, Next_Steps__c, Risk_and_Action__c, Reason__c, Previous_Step__c, Previous_Agenda__c, Next_Agenda__c, Last_Meeting_Date__c, Next_Meeting_Scheduled__c, Next_Meeting_Date__c, Repeated_Details_Warning__c
                    FROM Project_Assistant_Task__c
                    WHERE Opportunity__c = :w.opportunityId
                    ORDER BY Due_Date__c DESC
                    LIMIT 1
                ];
                if (lastTasks.size() > 0) {
                    Project_Assistant_Task__c lastTask = lastTasks[0];
                    Integer repeatedCount = 0;
                    if (lastTask.Next_Steps__c == w.nextSteps) repeatedCount++;
                    if (lastTask.Risk_and_Action__c == w.riskAndAction) repeatedCount++;
                    if (lastTask.Next_Agenda__c == w.nextAgenda) repeatedCount++;
                    
                    Boolean warningAlreadySet = lastTask.Repeated_Details_Warning__c == true;
                    
                    if (repeatedCount >= 2 && !warningAlreadySet) {
                        repeatedDetailsWarning.put(w.opportunityId, true);
                        repeatedDetailsMessage.put(w.opportunityId, 'Warning: Details repeated for consecutive days. Please update project details.');
                    } else if (repeatedCount >= 2 && warningAlreadySet) {
                        blockUpdate = true;
                        blockMessage = 'Error: Details have already been repeated and flagged. Please change details before proceeding.';
                    }
                }
            }
        }

        if (blockUpdate) {
            return blockMessage;
        }

        // Step 2: Find tasks created today for these opportunities
        DateTime startOfToday = DateTime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        DateTime endOfToday = DateTime.newInstance(Date.today().addDays(1), Time.newInstance(0, 0, 0, 0));

        if (!oppIds.isEmpty()) {
            for (Project_Assistant_Task__c task : [
                SELECT Id, Opportunity__c
                FROM Project_Assistant_Task__c
                WHERE Opportunity__c IN :oppIds
                AND CreatedDate >= :startOfToday AND CreatedDate < :endOfToday
            ]) {
                oppToTodayTask.put(task.Opportunity__c, task);
            }
        }

        // Step 3: Create or update tasks
        List<Project_Assistant_Task__c> tasksToInsert = new List<Project_Assistant_Task__c>();
        List<Project_Assistant_Task__c> tasksToUpdate = new List<Project_Assistant_Task__c>();

        for (ProjectAssistantTaskWrapper w : wrappers) {
            Project_Assistant_Task__c taskRecord;
            Boolean isUpdate = oppToTodayTask.containsKey(w.opportunityId);

            if (isUpdate) {
                // Update only Fulfilled__c on existing tasks
                taskRecord = new Project_Assistant_Task__c(Id = oppToTodayTask.get(w.opportunityId).Id);
                taskRecord.Fulfilled__c = true;
                tasksToUpdate.add(taskRecord);
            } else {
                // Insert new task for today
                taskRecord = new Project_Assistant_Task__c(Opportunity__c = w.opportunityId);
                Date tomorrow = Date.today().addDays(1);
                Integer dayOfWeek = Integer.valueOf(DateTime.newInstance(tomorrow, Time.newInstance(0,0,0,0)).format('u'));
                if (dayOfWeek == 6) {
                    taskRecord.Due_Date__c = tomorrow.addDays(2);
                } else if (dayOfWeek == 7) {
                    taskRecord.Due_Date__c = tomorrow.addDays(1);
                } else {
                    taskRecord.Due_Date__c = tomorrow;
                }

                // Map fields for new record
                taskRecord.Previous_Day_Date__c = w.previousDayDate;
                taskRecord.Last_Meeting_Date__c = w.lastMeetingDate;
                taskRecord.Previous_Step__c = stringOrNull(w.previousStep);
                taskRecord.Previous_Agenda__c = stringOrNull(w.previousAgenda);
                taskRecord.Next_Agenda__c = stringOrNull(w.nextAgenda);
                taskRecord.Next_Meeting_Scheduled__c = stringOrNull(w.nextMeetingScheduled);
                taskRecord.Next_Meeting_Date__c = w.nextMeetingDate;
                taskRecord.Next_Steps__c = stringOrNull(w.nextSteps);
                taskRecord.Risk_and_Action__c = stringOrNull(w.riskAndAction);
                taskRecord.Reason__c = stringOrNull(w.reason);
                tasksToInsert.add(taskRecord);
            }
        }

        // Step 4: DML Operations
        if (!tasksToInsert.isEmpty()) {
            insert tasksToInsert;
        }
        if (!tasksToUpdate.isEmpty()) {
            update tasksToUpdate;
        }

        // Step 5: Fulfill previous tasks using the new explicit list
        List<Project_Assistant_Task__c> tasksToFulfill = new List<Project_Assistant_Task__c>();
        Set<Id> updatedTaskIds = new Set<Id>();
        for(Project_Assistant_Task__c t : tasksToUpdate) {
            updatedTaskIds.add(t.Id);
        }

        for (String taskId : tasksToFulfillIds) {
            if (!updatedTaskIds.contains(taskId)) {
                tasksToFulfill.add(new Project_Assistant_Task__c(Id = taskId, Fulfilled__c = true));
            }
        }
        if (!tasksToFulfill.isEmpty()) {
            update tasksToFulfill;
        }

        // Step 6: Update Opportunity Status
        if (!oppIdToNewStatus.isEmpty()) {
            List<Opportunity> oppsToUpdate = new List<Opportunity>();
            for (Id oppId : oppIdToNewStatus.keySet()) {
                oppsToUpdate.add(new Opportunity(Id = oppId, Project_Status__c = oppIdToNewStatus.get(oppId)));
            }
            update oppsToUpdate;
        }

        if (!repeatedDetailsMessage.isEmpty()) {
            return repeatedDetailsMessage.values()[0];
        }

        return 'success';
    }

    /**
     * Fetch Opportunity Ids for a given Project Manager (portalUserId)
     * Used by LWC for task flow
     */
    @AuraEnabled(cacheable=true)
    public static List<Id> getProjectIds(String portalUserId, String mode, String statusFilter) {
        return getProjectTaskIds(portalUserId, mode, statusFilter);
    }

    /**
     * Enhanced: Return project list items for master-detail UI
     */
    @AuraEnabled(cacheable=true)
    public static List<ProjectListItem> getProjectList(String portalUserId) {
        List<ProjectListItem> result = new List<ProjectListItem>();
        if (String.isBlank(portalUserId)) return result;
        List<Opportunity> opps = [
            SELECT Id, Name, Project_Status__c
            FROM Opportunity
            WHERE Portal_User_Owner__c = :portalUserId
        ];
        for (Opportunity opp : opps) {
            // Remove Next_Meeting_Date__c reference, set isFutureDated to false or use another valid field if needed
            Boolean isFutureDated = false;
            result.add(new ProjectListItem(opp.Id, opp.Name, isFutureDated));
        }
        return result;
    }

    public class ProjectListItem {
        @AuraEnabled public Id projectId;
        @AuraEnabled public String projectName;
        @AuraEnabled public Boolean isFutureDated;
        public ProjectListItem(Id id, String name, Boolean future) {
            this.projectId = id;
            this.projectName = name;
            this.isFutureDated = future;
        }
    }

    /**
     * Enhanced: Insert/Update Project Assistant Tasks with validation for ongoing and transition scenarios
     */
    @AuraEnabled
    public static Map<String, Object> upsertProjectAssistantTask(String fieldJson, String projectStatus) {
        Map<String, Object> response = new Map<String, Object>();
        List<ProjectAssistantTaskWrapper> wrappers =
            (List<ProjectAssistantTaskWrapper>) JSON.deserialize(fieldJson, List<ProjectAssistantTaskWrapper>.class);

        // Declare missing variables
        Set<Id> oppIds = new Set<Id>();
        Map<Id, Project_Assistant_Task__c> oppToTodayTask = new Map<Id, Project_Assistant_Task__c>();
        List<String> oldTaskIds = new List<String>();
        Map<Id, String> oppIdToNewStatus = new Map<Id, String>();
        Map<Id, Boolean> repeatedDetailsWarning = new Map<Id, Boolean>();
        Map<Id, String> repeatedDetailsMessage = new Map<Id, String>();
        Boolean blockUpdate = false;
        String blockMessage = '';

        // Step 1: Collect Opportunity IDs
        for (ProjectAssistantTaskWrapper w : wrappers) {
            if (w.opportunityId != null) {
                oppIds.add(w.opportunityId);
                if (String.isNotBlank((String)w.recordId)) oldTaskIds.add((String)w.recordId);
                oppIdToNewStatus.put(w.opportunityId, w.oppProjectStatus);
            }
        }

        // Step 1.5: Check for repeated details on consecutive days
        for (ProjectAssistantTaskWrapper w : wrappers) {
            if (w.opportunityId != null) {
                List<Project_Assistant_Task__c> lastTasks = [
                    SELECT Id, Due_Date__c, Next_Steps__c, Risk_and_Action__c, Reason__c, Previous_Step__c, Previous_Agenda__c, Next_Agenda__c, Last_Meeting_Date__c, Next_Meeting_Scheduled__c, Next_Meeting_Date__c, Repeated_Details_Warning__c
                    FROM Project_Assistant_Task__c
                    WHERE Opportunity__c = :w.opportunityId
                    ORDER BY Due_Date__c DESC
                    LIMIT 1
                ];
                if (lastTasks.size() > 0) {
                    Project_Assistant_Task__c lastTask = lastTasks[0];
                    Integer repeatedCount = 0;
                    Integer totalFields = 0;
                    // Compare key fields
                    if (lastTask.Next_Steps__c == w.nextSteps) { repeatedCount++; } totalFields++;
                    if (lastTask.Risk_and_Action__c == w.riskAndAction) { repeatedCount++; } totalFields++;
                    if (lastTask.Reason__c == w.reason) { repeatedCount++; } totalFields++;
                    if (lastTask.Previous_Step__c == w.previousStep) { repeatedCount++; } totalFields++;
                    if (lastTask.Previous_Agenda__c == w.previousAgenda) { repeatedCount++; } totalFields++;
                    if (lastTask.Next_Agenda__c == w.nextAgenda) { repeatedCount++; } totalFields++;
                    if (lastTask.Last_Meeting_Date__c == w.lastMeetingDate) { repeatedCount++; } totalFields++;
                    if (lastTask.Next_Meeting_Scheduled__c == w.nextMeetingScheduled) { repeatedCount++; } totalFields++;
                    if (lastTask.Next_Meeting_Date__c == w.nextMeetingDate) { repeatedCount++; } totalFields++;
                    Boolean warningAlreadySet = lastTask.Repeated_Details_Warning__c == true;
                    // If most fields are repeated, set warning
                    if (repeatedCount >= 3 && !warningAlreadySet) {
                        repeatedDetailsWarning.put(w.opportunityId, true);
                        repeatedDetailsMessage.put(w.opportunityId, 'Warning: Details repeated for consecutive days. Please update project details.');
                    } else if (repeatedCount >= 3 && warningAlreadySet) {
                        blockUpdate = true;
                        blockMessage = 'Error: Details have already been repeated and flagged. Please change details before proceeding.';
                    }
                }
            }
        }

        // Block DML if error
        if (blockUpdate) {
            response.put('block', blockMessage);
            return response;
        }

        // Step 2: Find tasks created today for these opportunities
        DateTime startOfToday = DateTime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        DateTime endOfToday = DateTime.newInstance(Date.today().addDays(1), Time.newInstance(0, 0, 0, 0));

        if (!oppIds.isEmpty()) {
            for (Project_Assistant_Task__c task : [
                SELECT Id, Opportunity__c
                FROM Project_Assistant_Task__c
                WHERE Opportunity__c IN :oppIds
                AND CreatedDate >= :startOfToday AND CreatedDate < :endOfToday
            ]) {
                oppToTodayTask.put(task.Opportunity__c, task);
            }
        }

        // Step 3: Create or update tasks
        List<Project_Assistant_Task__c> tasksToInsert = new List<Project_Assistant_Task__c>();
        List<Project_Assistant_Task__c> tasksToUpdate = new List<Project_Assistant_Task__c>();

        for (ProjectAssistantTaskWrapper w : wrappers) {
            Project_Assistant_Task__c taskRecord;
            Boolean isUpdate = oppToTodayTask.containsKey(w.opportunityId);

            if (isUpdate) {
                taskRecord = new Project_Assistant_Task__c(Id = oppToTodayTask.get(w.opportunityId).Id);
                taskRecord.Fulfilled__c = true; // Ensure Fulfilled__c is set to true when updating old record
                // Copy previous record details for traceability
                List<Project_Assistant_Task__c> prevTasks = [
                    SELECT Previous_Day_Date__c, Last_Meeting_Date__c, Previous_Step__c, Previous_Agenda__c, Next_Agenda__c, Next_Meeting_Scheduled__c, Next_Meeting_Date__c, Next_Steps__c, Risk_and_Action__c, Reason__c
                    FROM Project_Assistant_Task__c
                    WHERE Opportunity__c = :w.opportunityId
                    ORDER BY CreatedDate DESC
                    LIMIT 1
                ];
                if (!prevTasks.isEmpty()) {
                    Project_Assistant_Task__c prev = prevTasks[0];
                    taskRecord.Previous_Day_Date__c = prev.Previous_Day_Date__c;
                    taskRecord.Last_Meeting_Date__c = prev.Last_Meeting_Date__c;
                    taskRecord.Previous_Step__c = prev.Previous_Step__c;
                    taskRecord.Previous_Agenda__c = prev.Previous_Agenda__c;
                    taskRecord.Next_Agenda__c = prev.Next_Agenda__c;
                    taskRecord.Next_Meeting_Scheduled__c = prev.Next_Meeting_Scheduled__c;
                    taskRecord.Next_Meeting_Date__c = prev.Next_Meeting_Date__c;
                    taskRecord.Next_Steps__c = prev.Next_Steps__c;
                    taskRecord.Risk_and_Action__c = prev.Risk_and_Action__c;
                    taskRecord.Reason__c = prev.Reason__c;
                }
            } else {
                taskRecord = new Project_Assistant_Task__c(Opportunity__c = w.opportunityId);
                Date tomorrow = Date.today().addDays(1);
                Integer dayOfWeek = Integer.valueOf(DateTime.newInstance(tomorrow, Time.newInstance(0,0,0,0)).format('u'));
                if (dayOfWeek == 6) {
                    // If tomorrow is Saturday, set Due Date to Monday
                    taskRecord.Due_Date__c = tomorrow.addDays(2);
                } else if (dayOfWeek == 7) {
                    // If tomorrow is Sunday, set Due Date to Monday
                    taskRecord.Due_Date__c = tomorrow.addDays(1);
                } else {
                    taskRecord.Due_Date__c = tomorrow;
                }
                // Copy previous record details for traceability
                List<Project_Assistant_Task__c> prevTasks = [
                    SELECT Previous_Day_Date__c, Last_Meeting_Date__c, Previous_Step__c, Previous_Agenda__c, Next_Agenda__c, Next_Meeting_Scheduled__c, Next_Meeting_Date__c, Next_Steps__c, Risk_and_Action__c, Reason__c
                    FROM Project_Assistant_Task__c
                    WHERE Opportunity__c = :w.opportunityId
                    ORDER BY CreatedDate DESC
                    LIMIT 1
                ];
                if (!prevTasks.isEmpty()) {
                    Project_Assistant_Task__c prev = prevTasks[0];
                    taskRecord.Previous_Day_Date__c = prev.Previous_Day_Date__c;
                    taskRecord.Last_Meeting_Date__c = prev.Last_Meeting_Date__c;
                    taskRecord.Previous_Step__c = prev.Previous_Step__c;
                    taskRecord.Previous_Agenda__c = prev.Previous_Agenda__c;
                    taskRecord.Next_Agenda__c = prev.Next_Agenda__c;
                    taskRecord.Next_Meeting_Scheduled__c = prev.Next_Meeting_Scheduled__c;
                    taskRecord.Next_Meeting_Date__c = prev.Next_Meeting_Date__c;
                    taskRecord.Next_Steps__c = prev.Next_Steps__c;
                    taskRecord.Risk_and_Action__c = prev.Risk_and_Action__c;
                    taskRecord.Reason__c = prev.Reason__c;
                }
            }

            taskRecord.Previous_Day_Date__c = w.previousDayDate;
            taskRecord.Last_Meeting_Date__c = w.lastMeetingDate;
            taskRecord.Previous_Step__c = stringOrNull(w.previousStep);
            taskRecord.Previous_Agenda__c = stringOrNull(w.previousAgenda);
            taskRecord.Next_Agenda__c = stringOrNull(w.nextAgenda);
            taskRecord.Next_Meeting_Scheduled__c = stringOrNull(w.nextMeetingScheduled);
            taskRecord.Next_Meeting_Date__c = w.nextMeetingDate;
            taskRecord.Next_Steps__c = stringOrNull(w.nextSteps);
            taskRecord.Risk_and_Action__c = stringOrNull(w.riskAndAction);
            taskRecord.Reason__c = stringOrNull(w.reason);
            // Set warning flag if repeated details detected
            if (repeatedDetailsWarning.containsKey(w.opportunityId) && repeatedDetailsWarning.get(w.opportunityId)) {
                taskRecord.Repeated_Details_Warning__c = true;
            }

            if (isUpdate) {
                tasksToUpdate.add(taskRecord);
            } else {
                tasksToInsert.add(taskRecord);
            }
        }

        // Step 4: DML Operations
        if (!tasksToInsert.isEmpty()) {
            insert tasksToInsert;
        }
        if (!tasksToUpdate.isEmpty()) {
            update tasksToUpdate;
        }

        // Step 5: Fulfill previous tasks
        List<Project_Assistant_Task__c> tasksToFulfill = new List<Project_Assistant_Task__c>();
        for (String taskId : oldTaskIds) {
            // Update only previous records, not the new one
            tasksToFulfill.add(new Project_Assistant_Task__c(Id = taskId, Fulfilled__c = true));
        }
        if (!tasksToFulfill.isEmpty()) {
            update tasksToFulfill;
        }

        // Step 6: Update Opportunity Status
        if (!oppIdToNewStatus.isEmpty()) {
            List<Opportunity> oppsToUpdate = new List<Opportunity>();
            for (Id oppId : oppIdToNewStatus.keySet()) {
                oppsToUpdate.add(new Opportunity(Id = oppId, Project_Status__c = oppIdToNewStatus.get(oppId)));
            }
            update oppsToUpdate;
        }

        response.put('success', true);
        return response;
    }

    @TestVisible
    private static Date today = Date.today();

    // Utility method
    private static String stringOrNull(String s) {
        return String.isNotBlank(s) ? s : null;
    }

    // 1) Define a public wrapper class to hold all fields you want to expose
    public class ProjectAssistantTaskWrapper {
        @AuraEnabled public Id recordId;
        @AuraEnabled public Id previousTaskId;
        @AuraEnabled public Id opportunityId;
        @AuraEnabled public String opportunityName;
        @AuraEnabled public Id accountId;
        @AuraEnabled public String accountName;
        @AuraEnabled public Boolean isOpportunityPriorityRecord;
        @AuraEnabled public String oppProjectStatus;
        
        @AuraEnabled public Datetime previousDayDate;
        @AuraEnabled public String nextMeetingScheduled;
        @AuraEnabled public Datetime lastMeetingDate;
        @AuraEnabled public Datetime nextMeetingDate;
        @AuraEnabled public String previousStep;
        @AuraEnabled public String nextSteps;
        @AuraEnabled public String previousAgenda;
        @AuraEnabled public String nextAgenda;
        @AuraEnabled public String riskAndAction;
        @AuraEnabled public String reason;

        @AuraEnabled public String clientOnboardingSheet;
        @AuraEnabled public String projectTracker;

        public ProjectAssistantTaskWrapper(Opportunity opp) {
            this.recordId = null;
            this.opportunityId = opp.Id;
            this.opportunityName = opp.Name;
            this.accountId = opp.AccountId;
            this.accountName = opp.Account != null ? opp.Account.Name : null;
            this.isOpportunityPriorityRecord = opp.IsPriorityRecord;
            this.oppProjectStatus = opp.Project_Status__c;
            this.clientOnboardingSheet = opp.Client_Onboarding_Sheet__c;
            this.projectTracker = opp.Project_Tracker__c;

            // Task-specific fields set to null
            this.previousDayDate = null;
            this.nextMeetingScheduled = null;
            this.lastMeetingDate = null;
            this.nextMeetingDate = null;
            this.previousStep = null;
            this.nextSteps = null;
            this.previousAgenda = null;
            this.nextAgenda = null;
            this.riskAndAction = null;
            this.reason = null;
        }
        
        // Constructor builds the wrapper from a Project_Assistant_Task__c record
        public ProjectAssistantTaskWrapper(Project_Assistant_Task__c pat) {
            this.recordId = pat.Id;
            
            // Opportunity fields
            this.opportunityId = pat.Opportunity__c;
            if (pat.Opportunity__r != null) {
                this.opportunityName = pat.Opportunity__r.Name;
                this.accountId = pat.Opportunity__r.AccountId;
                this.isOpportunityPriorityRecord = pat.Opportunity__r.IsPriorityRecord;
                this.oppProjectStatus = pat.Opportunity__r.Project_Status__c;
                if (pat.Opportunity__r.Account != null) {
                    this.accountName = pat.Opportunity__r.Account.Name;
                }
            }
            
            // Fields on Project_Assistant_Task__c
            this.previousDayDate      = pat.Previous_Day_Date__c;
            this.nextMeetingScheduled = pat.Next_Meeting_Scheduled__c;
            this.lastMeetingDate      = pat.Last_Meeting_Date__c;
            this.nextMeetingDate      = pat.Next_Meeting_Date__c;
            this.previousStep         = pat.Previous_Step__c;
            this.nextSteps            = pat.Next_Steps__c;
            this.previousAgenda         = pat.Previous_Agenda__c;
            this.nextAgenda            = pat.Next_Agenda__c;
            this.riskAndAction        = pat.Risk_and_Action__c;
            this.reason = pat.Reason__c;

            this.clientOnboardingSheet = pat.Opportunity__r.Client_Onboarding_Sheet__c;
            this.projectTracker = pat.Opportunity__r.Project_Tracker__c;

        }
    }

    public class ProjectTaskDetailWrapper {
        @AuraEnabled public ProjectAssistantTaskWrapper current { get; set; }
        @AuraEnabled public ProjectAssistantTaskWrapper previous { get; set; }

        public ProjectTaskDetailWrapper(ProjectAssistantTaskWrapper current, ProjectAssistantTaskWrapper previous) {
            this.current = current;
            this.previous = previous;
        }
    }

}