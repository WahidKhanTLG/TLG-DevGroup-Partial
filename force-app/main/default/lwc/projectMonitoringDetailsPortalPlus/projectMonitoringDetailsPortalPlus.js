import { LightningElement, api, wire, track } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import getTaskDetailsById from '@salesforce/apex/ProjectMonitoringNavController.getTaskDetailsById';
import insertProjectAssistantTasks from '@salesforce/apex/ProjectMonitoringNavController.insertProjectAssistantTasks';
import getProjectIds from '@salesforce/apex/ProjectMonitoringNavController.getProjectIds';
import getPicklistValues from '@salesforce/apex/PortalPlusUtils.getPicklistValues';
import getProjectManagers from '@salesforce/apex/ProjectMonitoringNavController.getProjectManagers';
import upsertProjectAssistantTask from '@salesforce/apex/ProjectMonitoringNavController.upsertProjectAssistantTask';
import updatePreviousTaskFulfilled from '@salesforce/apex/ProjectMonitoringNavController.updatePreviousTaskFulfilled';

export default class ProjectMonitoringDetailsPortalPlus extends LightningElement {
    @api portalUserId = '';
    @track currentRecordId = '';
    @track currentTask = null;
    @track previousTask = null;
    @track allTaskIds = [];
    @track currentIndex = 0;

    @track isSelectManager = true;
    @track managerSelected = false;

    @track projectManagers = [];
    @track isLoading = false;
    @track showTaskModal = false;

    resource = { Id: '', Name: '' };

    @track currentNextMeetingScheduled = '';
    @track currentNextMeetingDate = '';
    @track newNextSteps = '';
    @track currentAgenda = '';
    @track currentRiskAndAction = '';
    @track currentReason = '';
    @track currentSupportEndDate = '';
    @track currentSupportPlan = '';

    @track selectedStatusFilter = 'Due Today';

    @track showModeSelectModal = false;
    @track noTasksError = false;
    @track skipSupport = false;
    @track showConfirmNoSupportModal = false;

    @track viewOnlyMode = false;

    // Show support-related fields only when follow-up required
    get showSupportFields() {
        return this.currentNextMeetingScheduled === 'Yes' && !this.skipSupport;
    }
    // Show Go Live specific support fields
    get showGoLiveSupportFields() {
        return this.isGoLiveStatus && this.currentNextMeetingScheduled === 'Yes' && !this.skipSupport;
    }
    
    // Show reason field when Go Live support is not required
    get showGoLiveReasonField() {
        return this.isGoLiveStatus && this.currentNextMeetingScheduled === 'No' && this.skipSupport;
    }
    
    // Show reason field when Closed status and no follow-up required
    get showClosedReasonField() {
        return this.isClosedStatus && this.currentNextMeetingScheduled === 'No';
    }
    
    // Hide Risk & Action field when Go Live support is not required, also hide for Closed No follow-up
    get showRiskAndActionField() {
        if (this.isGoLiveStatus) {
            return this.currentNextMeetingScheduled === 'Yes' && !this.skipSupport;
        } else if (this.isClosedStatus) {
            return this.currentNextMeetingScheduled === 'Yes'; // Show only when follow-up required
        } else if (this.isInDevelopmentStatus) {
            return true; // Show for In Development
        }
        return true; // Show for all other statuses
    }
    
    // Dynamic label for Follow Up Required field
    get followUpRequiredLabel() {
        if (this.isGoLiveStatus) {
            return 'Follow Up Required?';
        } else if (this.isClosedStatus) {
            return 'Next Follow Up Required?';
        }
        return 'Next Meeting Scheduled';
    }
    
    // Show Closed status specific support fields (follow up date and plan)
    get showClosedSupportFields() {
        return this.isClosedStatus && this.currentNextMeetingScheduled === 'Yes';
    }
    
    // Dynamic label for Next Meeting Date field in Closed status
    get nextMeetingDateLabel() {
        return this.isClosedStatus ? 'Next Follow up Date' : 'Next Meeting Date';
    }
    
    // Dynamic label for Next Meeting Agenda field in Closed status  
    get nextMeetingAgendaLabel() {
        return this.isClosedStatus ? 'Follow up Plan' : 'Next Meeting Agenda';
    }
    
    // Show Next Steps field (hidden for Closed status)
    get showNextStepsField() {
        return this.isInDevelopmentStatus && !this.isClosedStatus;
    }
    
    // Show agenda field when support fields visible but not in Go Live follow-up context
    get showNextAgendaField() {
        return this.showSupportFields && !this.isGoLiveStatus;
    }
    // Show In Development support fields when follow-up required
    get showInDevSupportFields() {
        return this.isInDevelopmentStatus && this.showSupportFields;
    }

    @track projectStatusOptions = [];
    meetingScheduledOptions = [
        { label: 'Yes', value: 'Yes' },
        { label: 'No', value: 'No' },
        { label: 'Maybe', value: 'Maybe' },
        { label: 'Call Not Required', value: 'Call Not Required' }
    ];

    meetingScheduledOptionsClosedGoLive = [
        { label: 'Yes', value: 'Yes' },
        { label: 'No', value: 'No' }
    ];

    // Add modal state
    showWarningModal = false;
    showBlockModal = false;
    warningMessage = '';
    blockMessage = '';

    // Add master-detail state
    selectedProjectId = null;
    projectList = [];

    @wire(CurrentPageReference)
    handlePageRef(currentPageReference) {
        if (!currentPageReference) return;
        const params = new URLSearchParams(window.location.search);
        const encodedData = params.get('data');

        if (encodedData) {
            const decoded = atob(encodedData);
            const fullParams = new URLSearchParams(decoded);

            const portalUserId = fullParams.get('portalUserId');
            const record = fullParams.get('record');
            const allRecordIds = fullParams.get('allRecordIds');
            const mode = fullParams.get('mode');

            const statusFilter = fullParams.get('statusFilter') || 'All';
            this.selectedStatusFilter = statusFilter;

            if (portalUserId && record && allRecordIds) {
                this.portalUserId = portalUserId;
                this.allTaskIds = JSON.parse(atob(allRecordIds));
                this.currentRecordId = record;
                this.currentIndex = this.allTaskIds.indexOf(record);
                this.fetchTaskDetails(record);
                this.isSelectManager = false;
                this.managerSelected = true;

                // ✅ Determine if view-only mode
                this.viewOnlyMode = (mode === 'view');
            }
        }
    }

    @wire(getPicklistValues, { fieldPaths: ['Opportunity.Project_Status__c'] })
    handlePicklist({ data, error }) {
        if (data) {
            this.projectStatusOptions = data['Opportunity.Project_Status__c']?.
                filter(opt => opt.value !== 'None' && opt.value !== 'Open') || [];
        } else if (error) {
            this.showError('Failed to load project status options.');
        }
    }

    @wire(getProjectManagers)
    handleProjectManagers({ data, error }) {
        if (data) {
            this.projectManagers = data.map(manager => ({
                label: manager.Name,
                value: manager.Id
            }));
        } else if (error) {
            this.showError('Failed to load project managers.');
        }
    }

    get flatpickrOptions() {
        return {
            enableTime: true,
            altInput: true,
            altFormat: 'M d, Y h:i K',
            dateFormat: 'Y-m-d H:i',
            locale: 'default' // Explicitly set locale to prevent fetcher issues
        };
    }

    get isCallNotRequired() {
        return this.currentNextMeetingScheduled === 'Call Not Required';
    }

    get priorityLineStyle() {
        if (!this.currentTask) {
            return 'border-left: 6px solid #6c757d;'; // Default grey color when no task is loaded
        }
        const color = this.currentTask.isOpportunityPriorityRecord ? '#dc3545' : '#198754';
        return `border-left: 6px solid ${color};`;
    }

    get resourceLookupFilter() {
        return `Designation__c = 'Project Manager'`;
    }

    get previousProjectStatusLabel() {
        const val = this.previousTask?.oppProjectStatus;
        const found = this.projectStatusOptions.find(opt => opt.value === val);
        return found ? found.label : val;
    }

    get mappedProjectStatusOptions() {
        if (!this.previousTask) return [];
        const currentStatus = this.previousTask.oppProjectStatus;
        return this.projectStatusOptions.map(opt => ({
            ...opt,
            selected: opt.value === currentStatus
        }));
    }


    get isClosedStatus() {
        return this.previousProjectStatusLabel === 'Closed';
    }

    get isGoLiveStatus() {
        return this.previousProjectStatusLabel === 'Go Live';
    }

    get isInDevelopmentStatus() {
        return this.previousProjectStatusLabel === 'In Development';
    }

    get isClosedOrGoLive() {
        return this.isClosedStatus || this.isGoLiveStatus;
    }

    // Show Previous Actions only when not in Performance Monitoring filter
    get isPerformanceMonitoring() {
        return this.selectedStatusFilter === 'Open';
    }
    get showPreviousActions() {
        return !this.isPerformanceMonitoring;
    }

    // Use previousTask if exists, otherwise currentTask for display
    get displayTask() {
        return this.previousTask || this.currentTask;
    }
    // Show cards only when tasks exist and not in no-record state
    get showTaskCards() {
        return this.displayTask && !this.noTasksError;
    }

    get statusFilterOptions() {

        if (this.viewOnlyMode) {
            const options = [
                { label: 'All', value: 'All' },
                { label: 'In Development', value: 'In Development' },
                { label: 'Go Live', value: 'Go Live' },
                { label: 'Closed', value: 'Closed' }
            ];
            return options.map(opt => ({
                ...opt,
                selected: opt.value === this.selectedStatusFilter
            }));
        } else {
            const options = [
                { label: 'Due Today', value: 'Due Today' },
                { label: 'Performance Monitoring', value: 'Open' },
                { label: 'In Development', value: 'In Development' },
                { label: 'Go Live', value: 'Go Live' },
                { label: 'Closed', value: 'Closed' }
            ];
            return options.map(opt => ({
                ...opt,
                selected: opt.value === this.selectedStatusFilter
            }));
        }
    }

    get previousDayDate() {
        return this.currentTask ? this.currentTask.dueDate : null;
    }
    // Show the current record's "lastMeetingDate" as the last meeting date
    get lastMeetingDate() {
        return this.currentTask ? this.currentTask.lastMeetingDate : null;
    }
    // Show the current record's "nextSteps" as the previous step for UI display
    get previousStep() {
        return this.currentTask ? this.currentTask.nextSteps || '' : '';
    }
    // Show the current record's "nextAgenda" as the previous agenda for UI display
    get previousAgenda() {
        return this.currentTask ? this.currentTask.nextAgenda || '' : '';
    }

    // Optionally expose other previous fields
    get previousMeetingScheduled() {
        return this.currentTask ? this.currentTask.nextMeetingScheduled : '';
    }
    get previousRiskAndAction() {
        return this.currentTask ? this.currentTask.riskAndAction : '';
    }
    get previousReason() {
        return this.currentTask ? this.currentTask.reason : '';
    }

    get mappedMeetingScheduledOptions() {
        const selectedValue = this.currentNextMeetingScheduled;
        return this.meetingScheduledOptions.map(opt => ({
            ...opt,
            selected: opt.value === selectedValue
        }));
    }

    handleChangeManager() {
        // Reset all state to show project manager selection again
        this.portalUserId = '';
        this.managerSelected = false;
        this.isSelectManager = true;
        this.currentTask = null;
        this.previousTask = null;
        this.allTaskIds = [];
        this.currentIndex = 0;
        this.currentRecordId = '';
        this.noTasksError = false;
        this.isLoading = false;
        
        // Reset all input fields
        this.resetAllInputs();
    }

    resetAllInputs() {
        this.currentNextMeetingScheduled = '';
        this.currentNextMeetingDate = '';
        this.newNextSteps = '';
        this.currentAgenda = '';
        this.currentRiskAndAction = '';
        this.currentReason = '';
        this.currentSupportEndDate = '';
        this.currentSupportPlan = '';
        this.repeatedDetailsWarning = '';
    }

    handleStatusFilterChange(event) {
        const newFilter = event.target.value;
        this.selectedStatusFilter = newFilter;
        
        // If a project manager is already selected, reload data with new filter
        if (this.portalUserId && this.managerSelected) {
            this.isLoading = true;
            this.currentTask = null;
            this.previousTask = null;
            this.allTaskIds = [];
            this.currentIndex = 0;
            this.currentRecordId = '';
            this.noTasksError = false;
            
            // Determine mode based on current view mode
            const mode = this.viewOnlyMode ? 'view' : 'update';
            
            getProjectIds({ 
                portalUserId: this.portalUserId, 
                mode: mode, 
                statusFilter: this.selectedStatusFilter 
            })
            .then(projectIds => {
                if (!projectIds || projectIds.length === 0) {
                    this.noTasksError = true;
                    return;
                }
                this.allTaskIds = projectIds;
                this.currentIndex = 0;
                this.currentRecordId = projectIds[0];
                this.fetchTaskDetails(this.currentRecordId);
            })
            .catch(error => {
                this.showError('Failed to load projects with selected filter.');
                console.error('Filter change error:', error);
            })
            .finally(() => {
                this.isLoading = false;
            });
        }
    }

    fetchTaskDetails(opportunityId) {
        this.isLoading = true;
        getTaskDetailsById({ opportunityId })
            .then(result => {
                console.log('Fetched Task Details:', JSON.stringify(result));
                this.currentTask = result.current;
                this.previousTask = result.previous;
                this.resetInputs(this.currentTask);
            })
            .catch(() => {
                this.showError('Failed to fetch task details.');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    resetInputs(task) {
        // Auto-populate next meeting values from previous task if still in future
        const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
        const prevDateStr = this.previousTask?.nextMeetingDate;
        const prevDate = prevDateStr ? new Date(prevDateStr) : null;
        if (prevDate && prevDate > todayDate) {
            this.currentNextMeetingScheduled = this.previousTask.nextMeetingScheduled || '';
            this.currentNextMeetingDate = this.previousTask.nextMeetingDate || '';
        } else {
            this.currentNextMeetingScheduled = task?.nextMeetingScheduled || '';
            this.currentNextMeetingDate = task?.nextMeetingDate || '';
        }
        // Clear next-day input fields by default
        this.newNextSteps = '';
        this.currentAgenda = '';
        this.currentRiskAndAction = '';
        this.currentReason = '';
        this.currentSupportEndDate = '';
        this.currentSupportPlan = '';
    }

    handleNextMeetingScheduledChange(e) {
        const newVal = e.target.value;
        
        // For Go Live context, confirm when toggling from Yes to No
        if (this.isGoLiveStatus && this.currentNextMeetingScheduled === 'Yes' && newVal === 'No') {
            this.showConfirmNoSupportModal = true;
            return;
        }
        
        this.currentNextMeetingScheduled = newVal;
        
        // Reset support flags when Yes
        if (newVal === 'Yes') {
            this.skipSupport = false;
        }
        
        // For Go Live - if No is selected and confirmed, hide support fields and show reason
        if (this.isGoLiveStatus && newVal === 'No' && this.skipSupport) {
            // Clear support field values when hidden
            this.currentSupportEndDate = '';
            this.currentSupportPlan = '';
        }
    }

    confirmNoSupportYes() {
        // User confirms no post-go-live support is required
        this.currentNextMeetingScheduled = 'No';
        this.skipSupport = true;
        this.showConfirmNoSupportModal = false;
        
        // Clear support fields since they will be hidden
        this.currentSupportEndDate = '';
        this.currentSupportPlan = '';
        this.currentRiskAndAction = '';
    }
    
    confirmNoSupportNo() {
        // User cancels, revert to Yes (support is required)
        this.currentNextMeetingScheduled = 'Yes';
        this.skipSupport = false;
        this.showConfirmNoSupportModal = false;
    }

    handleNextMeetingDateChange(e) {
        const component = this.template.querySelector('c-flat-pickr-input');
        this.currentNextMeetingDate = component?.value || '';
    }
    // Handle Go Live support end date change
    handleSupportEndDateChange(e) {
        const component = this.template.querySelector('c-flat-pickr-input[data-id="supportEnd"]');
        this.currentSupportEndDate = component?.value || '';
    }
    // Handle Go Live support plan change
    handleSupportPlanChange(e) {
        this.currentSupportPlan = e.target.value;
    }

    handleNextStepsChange(e) { this.newNextSteps = e.target.value; }
    handleAgendaChange(e) { this.currentAgenda = e.target.value; }
    handleRiskAndActionChange(e) { this.currentRiskAndAction = e.target.value; }
    handleReasonChange(e) { this.currentReason = e.target.value; }

    handleProjectStatusChange(e) {
        const newStatus = e.target.value;
        const previousStatus = this.previousTask?.oppProjectStatus;
        this.previousTask = { ...this.previousTask, oppProjectStatus: newStatus };

        // Reset Go Live specific flags when changing to any other status
        if (newStatus !== 'Go Live') {
            this.skipSupport = false;
            this.showConfirmNoSupportModal = false;
            // Clear Go Live specific fields
            this.currentSupportEndDate = '';
            this.currentSupportPlan = '';
        }

        // For Go Live status, don't show modal - just set default and let fields appear
        if (newStatus === 'Go Live') {
            // Set default value for Follow Up Required if not already set
            if (!this.currentNextMeetingScheduled) {
                this.currentNextMeetingScheduled = 'Yes';
            }
        }
        // For Closed status, show modal for confirmation
        else if (newStatus === 'Closed') {
            this.showTaskModal = true;
            // For Closed status, clear the Next Meeting Scheduled to force user selection
            this.currentNextMeetingScheduled = '';
        }
        // For In Development status, ensure fields are properly reset
        else if (newStatus === 'In Development') {
            // Reset to default In Development values if not set
            if (!this.currentNextMeetingScheduled) {
                this.currentNextMeetingScheduled = 'Yes';
            }
        }
    }

    closeTaskModal() {
        this.showTaskModal = false;
    }

    @track repeatedDetailsWarning = '';

    handleSaveAndNext() {
        const component = this.template.querySelector('c-flat-pickr-input');
        this.currentNextMeetingDate = component?.value || '';
        this.repeatedDetailsWarning = '';
        const mode = this.viewOnlyMode ? 'view' : 'update';

        if (!this.currentNextMeetingScheduled) {
            this.showError('Please complete all required fields.');
            return;
        }

        // Risk & Action is required for In Development but optional for Closed
        if (!this.currentRiskAndAction && this.isInDevelopmentStatus) {
            this.showError('Please complete all required fields.');
            return;
        }

        if(!this.newNextSteps && !this.isClosedStatus) {
            this.showError('Please complete all required fields.');
            return;
        }

        if (!this.isClosedOrGoLive && !this.currentAgenda) {
            this.showError('Agenda is required.');
            return;
        }

        if (!this.isCallNotRequired && !this.currentNextMeetingDate) {
            this.showError('Next Meeting Date is required.');
            return;
        }

        if (this.isCallNotRequired && !this.currentReason) {
            this.showError('Reason is required.');
            return;
        }

        if (this.isGoLiveStatus && this.currentNextMeetingScheduled === 'Yes') {
            if (!this.currentNextMeetingDate) {
                this.showError('Post Go Live Support Start date is required.');
                return;
            }
            if (!this.currentSupportEndDate) {
                this.showError('Post Go Live Support End date is required.');
                return;
            }
            if (!this.currentSupportPlan) {
                this.showError('Post Go Live Support Plan is required.');
                return;
            }
        }

        // Validate Closed status required fields
        if (this.isClosedStatus && this.currentNextMeetingScheduled === 'Yes') {
            if (!this.currentNextMeetingDate) {
                this.showError('Next Follow up Date is required.');
                return;
            }
            if (!this.currentAgenda) {
                this.showError('Follow up Plan is required.');
                return;
            }
        }

        // Validate Closed status reason when no follow-up required
        if (this.isClosedStatus && this.currentNextMeetingScheduled === 'No') {
            if (!this.currentReason) {
                this.showError('Reason is required.');
                return;
            }
        }

        // Always insert a new task and fulfill the current one
        // Use currentTask for source data as per business logic
        const source = this.currentTask;
        if (!source || !source.opportunityId) {
            this.showError('Cannot save, current task data is missing.');
            return;
        }
        const currentTaskId = this.currentTask?.recordId;

        // Next Meeting validation: only keep scheduled/date if date is in future
        let scheduled = this.currentNextMeetingScheduled;
        let dateVal = this.isCallNotRequired ? null : this.currentNextMeetingDate;
        if (scheduled === 'Yes') {
            const mDate = dateVal ? new Date(dateVal) : null;
            const todayDate = new Date(); todayDate.setHours(0,0,0,0);
            if (!mDate || mDate <= todayDate) {
                scheduled = '';
                dateVal = null;
            }
        }
        const newTask = {
            recordId: null,
            previousTaskId: currentTaskId,
            opportunityId: source.opportunityId,
            oppProjectStatus: source.oppProjectStatus,
            accountId: source.accountId,
            
            // Field mapping from Previous Action card → New Record
            lastMeetingDate: this.currentTask.lastMeetingDate,
            previousStep: this.currentTask.nextSteps,
            previousAgenda: this.currentTask.nextAgenda,
            
            // Field mapping from Goals for Today card → New Record  
            nextAgenda: this.currentAgenda,
            nextSteps: this.newNextSteps,
            riskAndAction: this.currentRiskAndAction,
            nextMeetingScheduled: scheduled,
            nextMeetingDate: dateVal,
            
            // Additional fields
            reason: this.currentReason,
            previousDayDate: new Date().toISOString()
        };

        insertProjectAssistantTasks({ fieldJson: JSON.stringify([newTask]) })
            .then((result) => {
                if (result && result !== 'success') {
                    this.repeatedDetailsWarning = result;
                    return;
                }
                // Mark current task as fulfilled
                const currentId = this.currentTask?.recordId;
                if (currentId) {
                    updatePreviousTaskFulfilled({ taskId: currentId })
                        .catch(error => {
                            console.error('Error updating current task fulfilled status:', error);
                        });
                }

                // Navigate to next record or refresh task list
                this.handleNavigationAfterSave();
            })
            .catch(error => {
                this.showError('Error saving task details: ' + error.body.message);
            });
    }

    handleNavigationAfterSave() {
        // If in view-only mode, simply refresh the view
        if (this.viewOnlyMode) {
            this.fetchTaskDetails(this.currentRecordId);
            return;
        }

        // For edit mode, refresh the task list to get updated "Due Today" records
        // This ensures we get the latest list without fulfilled records and any new due records
        this.isLoading = true;
        
        const mode = this.viewOnlyMode ? 'view' : 'update';
        
        getProjectIds({ 
            portalUserId: this.portalUserId, 
            mode: mode, 
            statusFilter: this.selectedStatusFilter 
        })
        .then(updatedProjectIds => {
            if (!updatedProjectIds || updatedProjectIds.length === 0) {
                // No more records available for this PM with current filter
                this.noTasksError = true;
                this.currentTask = null;
                this.previousTask = null;
                this.allTaskIds = [];
                this.currentIndex = 0;
                this.currentRecordId = '';
                this.showError('No more tasks available for the selected Project Manager and filter.');
                return;
            }
            
            // Update task list with fresh data
            this.allTaskIds = updatedProjectIds;
            this.currentIndex = 0;
            this.currentRecordId = updatedProjectIds[0];
            
            // Navigate to first record in updated list
            const baseUrl = window.location.origin + window.location.pathname;
            const queryParams = `?data=${btoa(JSON.stringify({
                portalUserId: this.portalUserId,
                record: this.currentRecordId,
                allRecordIds: btoa(JSON.stringify(this.allTaskIds)),
                mode: 'edit',
                statusFilter: this.selectedStatusFilter
            }))}`;
            window.location.href = baseUrl + queryParams;
        })
        .catch(error => {
            this.showError('Failed to load next task.');
            console.error('Navigation after save error:', error);
            // Fallback: just refresh current record
            this.fetchTaskDetails(this.currentRecordId);
        })
        .finally(() => {
            this.isLoading = false;
        });
    }

    handleNavigation() {
        // This method is for regular navigation (not after save)
        // If in view-only mode, simply refresh the view
        if (this.viewOnlyMode) {
            this.fetchTaskDetails(this.currentRecordId);
            return;
        }

        // In edit mode, navigate to the next record in the existing list
        const nextIndex = this.currentIndex + 1;
        if (nextIndex < this.allTaskIds.length) {
            const nextRecordId = this.allTaskIds[nextIndex];
            const baseUrl = window.location.origin + window.location.pathname;
            const queryParams = `?data=${btoa(JSON.stringify({
                portalUserId: this.portalUserId,
                record: nextRecordId,
                allRecordIds: btoa(JSON.stringify(this.allTaskIds)),
                mode: 'edit',
                statusFilter: this.selectedStatusFilter
            }))}`;
            window.location.href = baseUrl + queryParams;
        } else {
            // If no more records, refresh task list to check for new due records
            this.handleNavigationAfterSave();
        }
    }

    handlePrevious() {
        // Navigate to previous record without saving
        if (this.currentIndex > 0) {
            const prevIndex = this.currentIndex - 1;
            const prevRecordId = this.allTaskIds[prevIndex];
            const baseUrl = window.location.origin + window.location.pathname;
            const queryParams = `?data=${btoa(JSON.stringify({
                portalUserId: this.portalUserId,
                record: prevRecordId,
                allRecordIds: btoa(JSON.stringify(this.allTaskIds)),
                mode: this.viewOnlyMode ? 'view' : 'edit',
                statusFilter: this.selectedStatusFilter
            }))}`;
            window.location.href = baseUrl + queryParams;
        } else {
            this.showError('This is the first record in the list.');
        }
    }

    handleNext() {
        // Navigate to next record without saving
        if (this.currentIndex < this.allTaskIds.length - 1) {
            const nextIndex = this.currentIndex + 1;
            const nextRecordId = this.allTaskIds[nextIndex];
            const baseUrl = window.location.origin + window.location.pathname;
            const queryParams = `?data=${btoa(JSON.stringify({
                portalUserId: this.portalUserId,
                record: nextRecordId,
                allRecordIds: btoa(JSON.stringify(this.allTaskIds)),
                mode: this.viewOnlyMode ? 'view' : 'edit',
                statusFilter: this.selectedStatusFilter
            }))}`;
            window.location.href = baseUrl + queryParams;
        } else {
            this.showError('This is the last record in the list.');
        }
    }

    // Helper getters for navigation UI
    get isFirstRecord() {
        return this.currentIndex === 0;
    }

    get isLastRecord() {
        return this.currentIndex === this.allTaskIds.length - 1;
    }

    get currentRecordPosition() {
        if (!this.allTaskIds || this.allTaskIds.length === 0) return '';
        return `${this.currentIndex + 1} of ${this.allTaskIds.length}`;
    }

    handleSkip() {
        // Skip current record in view-only mode (navigate to next without saving)
        this.handleNext();
    }

    showError(message) {
        const evt = new ShowToastEvent({
            title: 'Error',
            message,
            variant: 'error',
            mode: 'dismissable'
        });
        this.dispatchEvent(evt);
    }

    handleProjectManagerChange(event) {
        this.portalUserId = event.target.value;
        if (!this.portalUserId) {
            this.showError('Please select a Project Manager');
            return;
        }
        // Hide selection UI
        this.managerSelected = true;
        this.isSelectManager = false;
        // Load first project for selected manager immediately with current filter
        this.isLoading = true;
        
        // Determine mode - default to 'update' unless in view mode
        const mode = this.viewOnlyMode ? 'view' : 'update';
        
        getProjectIds({ 
            portalUserId: this.portalUserId, 
            mode: mode, 
            statusFilter: this.selectedStatusFilter 
        })
        .then(projectIds => {
            if (!projectIds || projectIds.length === 0) {
                this.noTasksError = true;
                return;
            }
            this.allTaskIds = projectIds;
            this.currentIndex = 0;
            this.currentRecordId = projectIds[0];
            this.fetchTaskDetails(this.currentRecordId);
        })
        .catch(error => {
            this.showError('Failed to load projects for the selected manager.');
            console.error('Project manager change error:', error);
        })
        .finally(() => {
            this.isLoading = false;
        });
    }
}