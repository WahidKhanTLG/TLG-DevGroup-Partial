@isTest
public class ProjectMonitoringNavControllerTest {

    @testSetup
    static void setupTestData() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Portal_Users__c portalUser = new Portal_Users__c(
            Name = 'Jane Doe',
            Designation__c = 'Project Manager',
            Is_Active__c = true
        );
        insert portalUser;

        Opportunity opp = new Opportunity(
            Name = 'Test Opportunity',
            StageName = 'Qualification',
            CloseDate = Date.today().addDays(10),
            AccountId = acc.Id,
            Portal_User_Owner__c = portalUser.Id,
            Project_Status__c = 'In Development',
            Client_Onboarding_Sheet__c = 'https://example.com/onboard',
            Project_Tracker__c = 'https://example.com/tracker'
        );
        insert opp;

        Opportunity goLiveOpp = new Opportunity(
            Name = 'Go Live Opportunity',
            StageName = 'Proposal',
            CloseDate = Date.today().addDays(5),
            AccountId = acc.Id,
            Portal_User_Owner__c = portalUser.Id,
            Project_Status__c = 'Go Live'
        );
        insert goLiveOpp;

        // Create a test user for System.runAs
        Profile p = [SELECT Id FROM Profile WHERE Name='Standard User'];
        User u = new User(
            Alias = 'standt',
            Email='standarduser@testorg.com',
            EmailEncodingKey='UTF-8',
            LastName='Testing',
            LanguageLocaleKey='en_US',
            LocaleSidKey='en_US',
            ProfileId = p.Id,
            TimeZoneSidKey='America/Los_Angeles',
            UserName='standarduser@testorg.com' + System.currentTimeMillis()
        );
        insert u;

        Project_Assistant_Task__c task1 = new Project_Assistant_Task__c(
            Opportunity__c = opp.Id,
            Fulfilled__c = false,
            Due_Date__c = Date.today(),
            Next_Meeting_Date__c = Date.today().addDays(1),
            Previous_Day_Date__c = DateTime.now().addDays(-1),
            Last_Meeting_Date__c = DateTime.now().addDays(-2),
            Next_Meeting_Scheduled__c = 'Yes',
            Previous_Step__c = 'Step A',
            Next_Steps__c = 'Step B',
            Risk_and_Action__c = 'High risk',
            Previous_Agenda__c = 'Agenda A',
            Next_Agenda__c = 'Agenda B',
            Reason__c = 'Valid'
        );
        insert task1;

        Project_Assistant_Task__c task2 = new Project_Assistant_Task__c(
            Opportunity__c = goLiveOpp.Id,
            Fulfilled__c = false,
            Next_Meeting_Date__c = Date.today().addDays(1),
            Previous_Step__c = 'Prep',
            Next_Steps__c = 'Go Live',
            Risk_and_Action__c = 'Medium',
            Previous_Agenda__c = 'Plan',
            Next_Agenda__c = 'Execution',
            Reason__c = 'Needed'
        );
        insert task2;
    }

    @isTest static void getProjectTaskIdsUpdateAll() {
        Id portalUserId = [SELECT Id FROM Portal_Users__c LIMIT 1].Id;
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];

        System.runAs(testUser) {
            Test.startTest();
            List<Id> result = ProjectMonitoringNavController.getProjectTaskIds(portalUserId, 'update', 'All');
            Test.stopTest();
            System.assert(result != null, 'Result should not be null');
            System.assert(!result.isEmpty(), 'Expected non-empty task list');
        }
    }

    @isTest static void getProjectTaskIdsViewAll() {
        Id portalUserId = [SELECT Id FROM Portal_Users__c LIMIT 1].Id;
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];

        System.runAs(testUser) {
            Test.startTest();
            List<Id> result = ProjectMonitoringNavController.getProjectTaskIds(portalUserId, 'view', 'All');
            Test.stopTest();
            System.assert(result != null, 'Result should not be null');
        }
    }

    @isTest static void getProjectTaskIdsViewFiltered() {
        Id portalUserId = [SELECT Id FROM Portal_Users__c LIMIT 1].Id;
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];

        System.runAs(testUser) {
            Test.startTest();
            List<Id> result = ProjectMonitoringNavController.getProjectTaskIds(portalUserId, 'view', 'Go Live');
            Test.stopTest();
            System.assert(result != null, 'Result should not be null');
        }
    }

    @isTest static void getProjectTaskIdsUpdateFiltered() {
        Id portalUserId = [SELECT Id FROM Portal_Users__c LIMIT 1].Id;
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];

        System.runAs(testUser) {
            Test.startTest();
            List<Id> result = ProjectMonitoringNavController.getProjectTaskIds(portalUserId, 'update', 'In Development');
            Test.stopTest();
            System.assert(result != null, 'Result should not be null');
            System.assertEquals(1, result.size(), 'Expected only one task');
        }
    }

    @isTest static void getProjectTaskIdsFallbackProject() {
        delete [SELECT Id FROM Project_Assistant_Task__c];
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];
        Id portalUserId = [SELECT Id FROM Portal_Users__c LIMIT 1].Id;

        System.runAs(testUser) {
            Test.startTest();
            List<Id> result = ProjectMonitoringNavController.getProjectTaskIds(portalUserId, 'view', 'In Development');
            Test.stopTest();
            System.assert(result != null, 'Result should not be null');
        }
    }

    @isTest static void getProjectTaskIdsBlankUser() {
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];
        System.runAs(testUser) {
            Test.startTest();
            List<Id> result = ProjectMonitoringNavController.getProjectTaskIds(null, 'view', 'All');
            Test.stopTest();
            System.assertEquals(0, result.size(), 'Expected empty list for blank user');
        }
    }

    @isTest static void getTaskDetailsByIdTask() {
        Id oppId = [SELECT Opportunity__c FROM Project_Assistant_Task__c LIMIT 1].Opportunity__c;
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];

        System.runAs(testUser) {
            Test.startTest();
            ProjectMonitoringNavController.ProjectTaskDetailWrapper wrapper = ProjectMonitoringNavController.getTaskDetailsById(oppId);
            Test.stopTest();
            System.assertEquals('Step A', wrapper.current.previousStep, 'Previous step should be correctly retrieved for a task.');
        }
    }

    @isTest static void getTaskDetailsByIdOpportunity() {
        Id oppId = [SELECT Id FROM Opportunity WHERE Name = 'Test Opportunity' LIMIT 1].Id;
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];

        System.runAs(testUser) {
            Test.startTest();
            ProjectMonitoringNavController.ProjectTaskDetailWrapper wrapper = ProjectMonitoringNavController.getTaskDetailsById(oppId);
            Test.stopTest();
            System.assertEquals('Test Opportunity', wrapper.current.opportunityName, 'Opportunity name should be correctly retrieved.');
        }
    }

    @isTest static void getTaskDetailsByIdInvalidId() {
        Boolean thrown = false;
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];

        System.runAs(testUser) {
            Test.startTest();
            try {
                ProjectMonitoringNavController.getTaskDetailsById(UserInfo.getUserId());
            } catch (AuraHandledException e) {
                thrown = true;
            }
            Test.stopTest();
        }
        System.assert(thrown, 'Expected AuraHandledException for unsupported SObjectType');
    }

    @isTest static void getProjectManagers() {
        User testUser = [SELECT Id FROM User WHERE Alias = 'standt' LIMIT 1];
        System.runAs(testUser) {
            Test.startTest();
            List<Portal_Users__c> result = ProjectMonitoringNavController.getProjectManagers();
            Test.stopTest();
            System.assert(!result.isEmpty(), 'Expected at least one manager');
        }
    }
}