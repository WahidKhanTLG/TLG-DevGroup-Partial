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

        // --- UPDATE mode with ALL ---
        if (!isView && isAll) {
            List<Project_Assistant_Task__c> tasks = [
                SELECT Id, Opportunity__c
                FROM Project_Assistant_Task__c
                WHERE Fulfilled__c = FALSE
                AND Opportunity__r.Portal_User_Owner__c = :portalUserId
                AND (
                    (Opportunity__r.Project_Status__c = 'In Development' AND Due_Date__c = TODAY)
                    OR (Next_Meeting_Date__c = TOMORROW AND Opportunity__r.Project_Status__c IN ('Go Live', 'Closed'))
                )
                ORDER BY CreatedDate ASC
            ];
            for (Project_Assistant_Task__c task : tasks) {
                if (task.Opportunity__c != null) {
                    projectIdSet.add(task.Opportunity__c);
                }
            }
            return new List<Id>(projectIdSet);
        }

        // --- View mode or filtered status ---
        List<Opportunity> allOpps = isAll
            ? [SELECT Id FROM Opportunity WHERE Portal_User_Owner__c = :portalUserId]
            : [SELECT Id FROM Opportunity WHERE Portal_User_Owner__c = :portalUserId AND Project_Status__c = :statusFilter];

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
                CreatedDate,
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
            ORDER BY CreatedDate DESC
            LIMIT 2
        ];

        DateTime startOfToday = DateTime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        DateTime endOfToday = startOfToday.addDays(1);

        Project_Assistant_Task__c todayTask;
        Project_Assistant_Task__c previousTask;

        for (Project_Assistant_Task__c t : recentTasks) {
            if (t.CreatedDate >= startOfToday && t.CreatedDate < endOfToday && todayTask == null) {
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
        List<String> oldTaskIds = new List<String>();
        Map<Id, String> oppIdToNewStatus = new Map<Id, String>();

        // Step 1: Collect Opportunity IDs
        for (ProjectAssistantTaskWrapper w : wrappers) {
            if (w.opportunityId != null) {
                oppIds.add(w.opportunityId);
                if (String.isNotBlank(w.recordId)) oldTaskIds.add(w.recordId);
                oppIdToNewStatus.put(w.opportunityId, w.oppProjectStatus);
            }
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
            } else {
                taskRecord = new Project_Assistant_Task__c(Opportunity__c = w.opportunityId);
                taskRecord.Due_Date__c = Date.today().addDays(1);
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

        return 'success';
    }

    // Utility method
    private static String stringOrNull(String s) {
        return String.isNotBlank(s) ? s : null;
    }

    // 1) Define a public wrapper class to hold all fields you want to expose
    public class ProjectAssistantTaskWrapper {
        @AuraEnabled public Id recordId;
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
        @AuraEnabled public ProjectAssistantTaskWrapper current;
        @AuraEnabled public ProjectAssistantTaskWrapper previous;

        public ProjectTaskDetailWrapper(ProjectAssistantTaskWrapper current, ProjectAssistantTaskWrapper previous) {
            this.current = current;
            this.previous = previous;
        }
    }

}