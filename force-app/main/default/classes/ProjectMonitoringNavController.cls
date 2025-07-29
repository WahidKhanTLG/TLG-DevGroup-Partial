public without sharing class ProjectMonitoringNavController {
    
    // Constants for better maintainability
    private static final String CLOSED_WON_STAGE = 'Closed Won';
    private static final String PROSPECT_STAGE = 'Prospect';
    private static final String IN_DEVELOPMENT_STATUS = 'In Development';
    private static final String GO_LIVE_STATUS = 'Go Live';
    private static final String CLOSED_STATUS = 'Closed';
    private static final Integer REPEATED_FIELDS_THRESHOLD = 2;
    private static final Integer ENHANCED_REPEATED_FIELDS_THRESHOLD = 3;

    /**
     * Fetch task record Ids for a given Project Manager (portalUserId)
     * Enhanced with status-specific filter logic:
     * - Due Today: Tasks due today for In Development projects
     * - Open: Opportunities without any tasks yet
     * - In Development: Opportunities with any Project Assistant Tasks
     * - Go Live: All Go Live opportunities regardless of task status
     * - Closed: All Closed opportunities regardless of task status
     * - All: Comprehensive filter for update mode
     * 
     * @param portalUserId ID of the Project Manager
     * @param mode 'view' or 'update' mode
     * @param statusFilter Filter criteria (Due Today, Open, In Development, Go Live, Closed, All)
     * @return List of Opportunity IDs matching the filter criteria
     */
    @AuraEnabled(cacheable=true)
    public static List<Id> getProjectTaskIds(String portalUserId, String mode, String statusFilter) {
        Set<Id> projectIdSet = new Set<Id>();

        if (String.isBlank(portalUserId)) return new List<Id>();

        Boolean isView = !String.isBlank(mode) && mode.toLowerCase() == 'view';
        Boolean isAll = String.isBlank(statusFilter) || statusFilter == 'All';
        Boolean isDueToday = statusFilter == 'Due Today';
        Boolean isOpen = statusFilter == 'Open';
        Boolean isInDevelopment = statusFilter == 'In Development';
        Boolean isGoLive = statusFilter == 'Go Live';
        Boolean isClosed = statusFilter == 'Closed';

        // --- Handle Due Today filter ---
        if (isDueToday) {
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
            return new List<Id>(projectIdSet);
        }
        // --- Handle Open filter (no tasks created yet) ---
        if (isOpen) {
            List<Opportunity> openOpps = [
                SELECT Id FROM Opportunity
                WHERE Portal_User_Owner__c = :portalUserId
                AND StageName = 'Closed Won'
                AND Project_Status__c = 'In Development'
                AND Id NOT IN (SELECT Opportunity__c FROM Project_Assistant_Task__c WHERE Opportunity__c != null)
            ];
            for (Opportunity opp : openOpps) {
                projectIdSet.add(opp.Id);
            }
            return new List<Id>(projectIdSet);
        }
        
        // --- Handle In Development filter (show opportunities with any Project Assistant Tasks) ---
        if (isInDevelopment) {
            // Get all opportunities that have Project Assistant Task records (fulfilled or not fulfilled)
            List<Project_Assistant_Task__c> inDevTasks = [
                SELECT Opportunity__c FROM Project_Assistant_Task__c
                WHERE Opportunity__r.Portal_User_Owner__c = :portalUserId
                AND Opportunity__r.StageName = 'Closed Won'
                AND Opportunity__r.Project_Status__c = 'In Development'
            ];
            for(Project_Assistant_Task__c task : inDevTasks) {
                projectIdSet.add(task.Opportunity__c);
            }
            return new List<Id>(projectIdSet);
        }
        
        // --- Handle Go Live filter (all Go Live opportunities) ---
        if (isGoLive) {
            List<Opportunity> goLiveOpps = [
                SELECT Id FROM Opportunity
                WHERE Portal_User_Owner__c = :portalUserId
                AND StageName = 'Closed Won'
                AND Project_Status__c = 'Go Live'
            ];
            for (Opportunity opp : goLiveOpps) {
                projectIdSet.add(opp.Id);
            }
            return new List<Id>(projectIdSet);
        }
        
        // --- Handle Closed filter (all Closed opportunities) ---
        if (isClosed) {
            List<Opportunity> closedOpps = [
                SELECT Id FROM Opportunity
                WHERE Portal_User_Owner__c = :portalUserId
                AND StageName = 'Closed Won'
                AND Project_Status__c = 'Closed'
            ];
            for (Opportunity opp : closedOpps) {
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
                AND Project_Status__c = 'In Development'
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

        try {
            // Get the opportunity details first
            Opportunity opp = [
                SELECT Id, Name, AccountId, Account.Name,
                    IsPriorityRecord, Project_Status__c,
                    Client_Onboarding_Sheet__c, Project_Tracker__c
                FROM Opportunity
                WHERE Id = :opportunityId
                LIMIT 1
            ];

            List<Project_Assistant_Task__c> recentTasks = [
                SELECT Id,
                    Due_Date__c,
                    Opportunity__c,
                    Previous_Day_Date__c,
                    CreatedDate,
                    LastModifiedDate,
                    Next_Meeting_Scheduled__c,
                    Last_Meeting_Date__c,
                    Next_Meeting_Date__c,
                    Previous_Step__c,
                    Next_Steps__c,
                    Risk_and_Action__c,
                    Previous_Agenda__c,
                    Next_Agenda__c,
                    Reason__c,
                    Fulfilled__c,
                    Opportunity__r.Name,
                    Opportunity__r.AccountId,
                    Opportunity__r.Account.Name,
                    Opportunity__r.IsPriorityRecord,
                    Opportunity__r.Project_Status__c,
                    Opportunity__r.Client_Onboarding_Sheet__c,
                    Opportunity__r.Project_Tracker__c
                FROM Project_Assistant_Task__c
                WHERE Opportunity__c = :opportunityId
                ORDER BY Due_Date__c DESC, CreatedDate DESC
                LIMIT 2
            ];

            Date today = Date.today();
            Project_Assistant_Task__c currentTask = null;
            Project_Assistant_Task__c previousTask = null;

            // For In Development projects, show the last Project Assistant Task record regardless of fulfilled status
            if (opp.Project_Status__c == IN_DEVELOPMENT_STATUS && !recentTasks.isEmpty()) {
                currentTask = recentTasks[0]; // Most recent task
                if (recentTasks.size() > 1) {
                    previousTask = recentTasks[1]; // Second most recent task
                }
            } else {
                // For other project statuses, use the existing logic (Due Date = today)
                for (Project_Assistant_Task__c t : recentTasks) {
                    if (t.Due_Date__c == today && currentTask == null) {
                        currentTask = t;
                    } else if (previousTask == null) {
                        previousTask = t;
                    }
                }
            }

            ProjectAssistantTaskWrapper currentWrapper;
            if (currentTask != null) {
                currentWrapper = new ProjectAssistantTaskWrapper(currentTask);
            } else {
                // If no task found, create wrapper from opportunity
                currentWrapper = new ProjectAssistantTaskWrapper(opp);
            }

            ProjectAssistantTaskWrapper previousWrapper = previousTask != null ? new ProjectAssistantTaskWrapper(previousTask) : null;

            return new ProjectTaskDetailWrapper(currentWrapper, previousWrapper);
        } catch (QueryException qe) {
            throw new AuraHandledException('Failed to retrieve task details: ' + qe.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('An unexpected error occurred: ' + e.getMessage());
        }
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

        // Step 2: For In Development projects, check for most recent task regardless of date/fulfilled status
        // For other projects, find tasks created today
        Map<Id, Opportunity> opportunityMap = new Map<Id, Opportunity>();
        if (!oppIds.isEmpty()) {
            for (Opportunity opp : [SELECT Id, Project_Status__c FROM Opportunity WHERE Id IN :oppIds]) {
                opportunityMap.put(opp.Id, opp);
            }
        }

        DateTime startOfToday = DateTime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        DateTime endOfToday = DateTime.newInstance(Date.today().addDays(1), Time.newInstance(0, 0, 0, 0));

        if (!oppIds.isEmpty()) {
            for (ProjectAssistantTaskWrapper w : wrappers) {
                if (w.opportunityId != null && opportunityMap.containsKey(w.opportunityId)) {
                    Opportunity opp = opportunityMap.get(w.opportunityId);
                    
                    if (opp.Project_Status__c == 'In Development') {
                        // For In Development projects, get the most recent task regardless of fulfilled status
                        List<Project_Assistant_Task__c> recentTasks = [
                            SELECT Id, Opportunity__c, Fulfilled__c
                            FROM Project_Assistant_Task__c
                            WHERE Opportunity__c = :w.opportunityId
                            ORDER BY Due_Date__c DESC, CreatedDate DESC
                            LIMIT 1
                        ];
                        if (!recentTasks.isEmpty()) {
                            oppToTodayTask.put(w.opportunityId, recentTasks[0]);
                        }
                    } else {
                        // For other project statuses, use existing logic (tasks created today)
                        List<Project_Assistant_Task__c> todayTasks = [
                            SELECT Id, Opportunity__c
                            FROM Project_Assistant_Task__c
                            WHERE Opportunity__c = :w.opportunityId
                            AND CreatedDate >= :startOfToday AND CreatedDate < :endOfToday
                        ];
                        if (!todayTasks.isEmpty()) {
                            oppToTodayTask.put(w.opportunityId, todayTasks[0]);
                        }
                    }
                }
            }
        }

        // Step 3: Create or update tasks
        List<Project_Assistant_Task__c> tasksToInsert = new List<Project_Assistant_Task__c>();
        List<Project_Assistant_Task__c> tasksToUpdate = new List<Project_Assistant_Task__c>();

        for (ProjectAssistantTaskWrapper w : wrappers) {
            Project_Assistant_Task__c taskRecord;
            Boolean isUpdate = oppToTodayTask.containsKey(w.opportunityId);
            Opportunity opp = opportunityMap.get(w.opportunityId);

            if (isUpdate) {
                // Update existing task (for In Development this will be the most recent task)
                taskRecord = new Project_Assistant_Task__c(Id = oppToTodayTask.get(w.opportunityId).Id);
                
                // For In Development projects, update all fields, not just Fulfilled__c
                if (opp != null && opp.Project_Status__c == 'In Development') {
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
                    // Don't automatically set Fulfilled__c = true for In Development updates
                } else {
                    // For other project statuses, only update Fulfilled__c
                    taskRecord.Fulfilled__c = true;
                }
                tasksToUpdate.add(taskRecord);
            } else {
                // Insert new task
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
     * @deprecated Use insertProjectAssistantTasks instead for consistent In Development logic
     */
    @AuraEnabled
    public static Map<String, Object> upsertProjectAssistantTask(String fieldJson, String projectStatus) {
        // Redirect to the main method to ensure consistent behavior
        String result = insertProjectAssistantTasks(fieldJson);
        Map<String, Object> response = new Map<String, Object>();
        
        if (result == 'success') {
            response.put('success', true);
        } else {
            response.put('block', result);
        }
        
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
            // Set previousDayDate to CreatedDate to show when this record was created (last update)
            this.previousDayDate      = pat.CreatedDate;
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

    @AuraEnabled
    public static void updatePreviousTaskFulfilled(Id taskId) {
        try {
            Project_Assistant_Task__c recordToUpdate = new Project_Assistant_Task__c(
                Id = taskId,
                Fulfilled__c = true
            );
            update recordToUpdate;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to mark task as fulfilled: ' + e.getMessage());
        }
    }

}