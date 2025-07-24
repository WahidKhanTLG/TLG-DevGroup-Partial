import { LightningElement, api, wire, track } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';

import getTaskDetailsById from '@salesforce/apex/ProjectMonitoringNavController.getTaskDetailsById';
import insertProjectAssistantTasks from '@salesforce/apex/ProjectMonitoringNavController.insertProjectAssistantTasks';
import getProjectIds from '@salesforce/apex/ProjectMonitoringNavController.getProjectIds';
import getPicklistValues from '@salesforce/apex/PortalPlusUtils.getPicklistValues';
import getProjectManagers from '@salesforce/apex/ProjectMonitoringNavController.getProjectManagers';

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

    @track selectedStatusFilter = 'All';

    @track showModeSelectModal = false;
    @track noTasksError = false;

    @track viewOnlyMode = false;

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
            dateFormat: 'Y-m-d H:i'
        };
    }

    get isCallNotRequired() {
        return this.currentNextMeetingScheduled === 'Call Not Required';
    }

    get priorityLineStyle() {
        return `border-left: 6px solid ${this.currentTask?.isOpportunityPriorityRecord ? '#dc3545' : '#198754'};`;
    }

    get resourceLookupFilter() {
        return `Designation__c = 'Project Manager'`;
    }

    get previousProjectStatusLabel() {
        const val = this.previousTask?.oppProjectStatus;
        const found = this.projectStatusOptions.find(opt => opt.value === val);
        return found ? found.label : val;
    }


    get isClosedStatus() {
        return this.previousProjectStatusLabel === 'Closed';
    }

    get isGoLiveStatus() {
        return this.previousProjectStatusLabel === 'Go Live';
    }

    get isClosedOrGoLive() {
        return this.isClosedStatus || this.isGoLiveStatus;
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
        return this.previousTask ? this.previousTask.previousDayDate : null;
    }
    get lastMeetingDate() {
        return this.previousTask ? this.previousTask.lastMeetingDate : null;
    }
    get previousStep() {
        return this.previousTask ? this.previousTask.previousStep || '' : '';
    }
    get previousAgenda() {
        return this.previousTask ? this.previousTask.previousAgenda || '' : '';
    }

    get mappedMeetingScheduledOptions() {
        const selectedValue = this.currentNextMeetingScheduled;
        return this.meetingScheduledOptions.map(opt => ({
            ...opt,
            selected: opt.value === selectedValue
        }));
    }

    handleChangeManager() {
        window.location.href = window.location.pathname;
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
        this.currentNextMeetingScheduled = task?.nextMeetingScheduled || '';
        this.currentNextMeetingDate = task?.nextMeetingDate || '';
        this.newNextSteps = task?.nextSteps || '';
        this.currentAgenda = task?.nextAgenda || '';
        this.currentRiskAndAction = task?.riskAndAction || '';
        this.currentReason = task?.reason || '';
    }

    handleNextMeetingScheduledChange(e) { this.currentNextMeetingScheduled = e.target.value; }

    handleNextMeetingDateChange(e) {
        const component = this.template.querySelector('c-flat-pickr-input');
        this.currentNextMeetingDate = component?.value || '';
    }

    handleNextStepsChange(e) { this.newNextSteps = e.target.value; }
    handleAgendaChange(e) { this.currentAgenda = e.target.value; }
    handleRiskAndActionChange(e) { this.currentRiskAndAction = e.target.value; }
    handleReasonChange(e) { this.currentReason = e.target.value; }

    handleProjectStatusChange(e) {
        const newStatus = e.target.value;
        this.previousTask = { ...this.previousTask, oppProjectStatus: newStatus };

        if (['Go Live', 'Closed'].includes(newStatus)) {
            this.showTaskModal = true;

            if (!this.currentNextMeetingScheduled) {
                this.currentNextMeetingScheduled = 'Yes';
            }
        }
    }

    handleSaveAndNext() {
        const component = this.template.querySelector('c-flat-pickr-input');
        this.currentNextMeetingDate = component?.value || '';

        const mode = this.viewOnlyMode ? 'view' : 'update';

        if (!this.currentNextMeetingScheduled || !this.currentRiskAndAction) {
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

        const isUpdatingToday = this.currentTask?.recordId && !this.currentTask?.isVirtual;

        const sourceTask = isUpdatingToday ? this.currentTask : this.previousTask;

        const newTask = {
            recordId: isUpdatingToday ? sourceTask.recordId : null,  // only update if today's task
            opportunityId: sourceTask.opportunityId,
            oppProjectStatus: sourceTask.oppProjectStatus,
            accountId: sourceTask.accountId,
            previousDayDate: new Date().toISOString(),
            lastMeetingDate: sourceTask.nextMeetingDate,
            previousStep: sourceTask.nextSteps,
            nextMeetingScheduled: this.currentNextMeetingScheduled,
            nextMeetingDate: this.isCallNotRequired ? null : this.currentNextMeetingDate,
            nextSteps: this.newNextSteps,
            previousAgenda: sourceTask.nextAgenda,
            nextAgenda: this.currentAgenda,
            riskAndAction: this.currentRiskAndAction,
            reason: this.currentReason
        };

        insertProjectAssistantTasks({ fieldJson: JSON.stringify([newTask]) })
            .then(() => {
                this.showSuccess('Task saved successfully.');
                if (this.currentIndex < this.allTaskIds.length - 1) {
                    const nextId = this.allTaskIds[++this.currentIndex];
                    const encodedAll = btoa(JSON.stringify(this.allTaskIds));
                    const urlParams = btoa(`portalUserId=${this.portalUserId}&record=${nextId}&allRecordIds=${encodedAll}&mode=${mode}&statusFilter=${this.selectedStatusFilter}`);
                    window.location.href = `${window.location.pathname}?data=${urlParams}`;
                } else {
                    this.showSuccess('All tasks completed.');
                    this.currentTask = null;
                    window.location.href = window.location.pathname.split('?')[0];
                }
            })
            .catch(() => this.showError('Task save failed.'));
    }

    handlePrevious() {
        if (this.currentIndex > 0) {
            const mode = this.viewOnlyMode ? 'view' : 'update';
            const prevId = this.allTaskIds[--this.currentIndex];
            const encodedAll = btoa(JSON.stringify(this.allTaskIds));
            const urlParams = btoa(`portalUserId=${this.portalUserId}&record=${prevId}&allRecordIds=${encodedAll}&mode=${mode}&statusFilter=${this.selectedStatusFilter}`);
            window.location.href = `${window.location.pathname}?data=${urlParams}`;
        }
    }

    handleSkip() {
        const mode = this.viewOnlyMode ? 'view' : 'update';
        if (this.currentIndex < this.allTaskIds.length - 1) {
            const nextId = this.allTaskIds[++this.currentIndex];
            console.log('Skipping to next task:', nextId);
            const encodedAll = btoa(JSON.stringify(this.allTaskIds));
            const urlParams = btoa(`portalUserId=${this.portalUserId}&record=${nextId}&allRecordIds=${encodedAll}&mode=${mode}&statusFilter=${this.selectedStatusFilter}`);
            console.log('this.allTaskIds:', this.allTaskIds);
            window.location.href = `${window.location.pathname}?data=${urlParams}`;
        } else {
            this.showSuccess('All tasks completed.');
            this.currentTask = null;
            window.location.href = window.location.pathname.split('?')[0];
        }
    }

    closeTaskModal() {
        this.showTaskModal = false;
    }

    showSuccess(message) {
        this.template.querySelector('c-show-toastr').showSuccess(message, 'Success');
    }

    showError(message) {
        this.template.querySelector('c-show-toastr').showError(message, 'Error');
    }

    closeModeSelectModal() {
        this.showModeSelectModal = false;
    }

    handleViewMode() {
        this.initiateTaskFlow('view');
    }

    handleUpdateMode() {
        this.initiateTaskFlow('update');
    }

    handleProjectManagerChange(event) {
        this.portalUserId = event.target.value;
        if (!this.portalUserId) {
            this.showError('Please select a Project Manager');
            return;
        }
        this.showModeSelectModal = true;
    }

    initiateTaskFlow(mode) {
        this.showModeSelectModal = false;

        getProjectIds({
            portalUserId: this.portalUserId,
            mode: mode,
            statusFilter: this.selectedStatusFilter
        })
        .then(projectIds => {
            if (!projectIds || !projectIds.length) {
                this.noTasksError = true;
                this.currentTask = null;
                this.isSelectManager = false;
                this.managerSelected = true;
                return;
            }

            const firstId = projectIds[0];
            const encodedAll = btoa(JSON.stringify(projectIds));
            const urlParams = btoa(`portalUserId=${this.portalUserId}&record=${firstId}&allRecordIds=${encodedAll}&mode=${mode}&statusFilter=${this.selectedStatusFilter}`);
            window.location.href = `${window.location.pathname}?data=${urlParams}`;
        })
        .catch(() => {
            this.showError('Failed to get project list.');
        });
    }

    handleStatusFilterChange(event) {
        this.selectedStatusFilter = event.target.value;
        const mode = this.viewOnlyMode ? 'view' : 'update';
        if (this.portalUserId && this.managerSelected) {
            this.initiateTaskFlow(mode);
        }
    }

}