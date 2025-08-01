import { LightningElement, api, wire, track } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import getTaskDetailsById from '@salesforce/apex/ProjectMonitoringNavController.getTaskDetailsById';
import insertProjectAssistantTasks from '@salesforce/apex/ProjectMonitoringNavController.insertProjectAssistantTasks';
import getProjectIds from '@salesforce/apex/ProjectMonitoringNavController.getProjectIds';
import getPicklistValues from '@salesforce/apex/PortalPlusUtils.getPicklistValues';
import getProjectManagers from '@salesforce/apex/ProjectMonitoringNavController.getProjectManagers';
import getProjectManagersWithStats from '@salesforce/apex/ProjectMonitoringNavController.getProjectManagersWithStats';
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

    // Document Modal Properties
    @track showDocumentModal = false;
    @track currentDocumentUrl = '';
    @track modalTitle = '';
    @track modalDocumentIcon = '';
    @track embedUrl = '';

    @track viewOnlyMode = false;
    @track editingField = null; // Track which field is being edited
    @track showSaveButton = false; // Show save button when editing
    @track isSavingField = false; // Track saving state

    // Handle filter suggestion clicks
    handleSuggestionClick(event) {
        const suggestedFilter = event.target.dataset.filter;
        if (suggestedFilter && suggestedFilter !== this.selectedStatusFilter) {
            // Update the filter and reload data
            this.selectedStatusFilter = suggestedFilter;
            
            // Reload projects with the new filter
            this.isLoading = true;
            this.resetTaskState();
            this.noTasksError = false;
            
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
                this.resetAllInputs();
                this.fetchTaskDetails(this.currentRecordId);
                
                // Show success message
                const event = new ShowToastEvent({
                    title: 'Filter Applied',
                    message: `Found ${projectIds.length} project${projectIds.length !== 1 ? 's' : ''} with "${suggestedFilter}" filter.`,
                    variant: 'success',
                    mode: 'dismissable'
                });
                this.dispatchEvent(event);
            })
            .catch(error => {
                this.showError(`Failed to load projects with "${suggestedFilter}" filter. Please try again.`);
                console.error('Suggestion filter error:', error);
            })
            .finally(() => {
                this.isLoading = false;
            });
        }
    }

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

    @wire(getProjectManagersWithStats)
    handleProjectManagers({ data, error }) {
        if (data) {
            this.projectManagers = data.map(manager => {
                const progressPercentage = manager.totalProjects > 0 ? 
                    Math.round((manager.updatedToday / manager.totalProjects) * 100) : 0;
                
                let statusBadgeClass = 'badge-light-secondary';
                if (manager.allUpdated && manager.totalProjects > 0) {
                    statusBadgeClass = 'badge-light-success';
                } else if (manager.updatedToday > 0) {
                    statusBadgeClass = 'badge-light-warning';
                } else if (manager.totalProjects > 0) {
                    statusBadgeClass = 'badge-light-danger';
                }

                const needsAttention = manager.totalProjects > 0 && !manager.allUpdated;

                return {
                    label: manager.Name,
                    value: manager.Id,
                    totalProjects: manager.totalProjects,
                    updatedToday: manager.updatedToday,
                    allUpdated: manager.allUpdated,
                    statusIcon: manager.statusIcon,
                    statusColor: manager.statusColor,
                    statusText: manager.statusText,
                    designation: manager.Designation,
                    progressPercentage: progressPercentage,
                    progressWidth: `width: ${progressPercentage}%`,
                    statusBadgeClass: statusBadgeClass,
                    needsAttention: needsAttention
                };
            });
            
            // Set progress bar widths after data is loaded
            this.setProgressBarWidths();
        } else if (error) {
            this.showError('Failed to load project managers.');
        }
    }

    // Method to set progress bar widths dynamically
    setProgressBarWidths() {
        // Use setTimeout to ensure DOM is rendered
        setTimeout(() => {
            const progressBars = this.template.querySelectorAll('.progress-bar');
            progressBars.forEach((bar, index) => {
                if (this.projectManagers && this.projectManagers[index]) {
                    bar.style.width = `${this.projectManagers[index].progressPercentage}%`;
                }
            });
        }, 100);
    }

    // Lifecycle method to update progress bars after render
    renderedCallback() {
        if (this.projectManagers && this.projectManagers.length > 0) {
            this.setProgressBarWidths();
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

    get priorityCardClass() {
        if (!this.currentTask) {
            return 'card-header bg-light-primary'; // Default when no task is loaded
        }
        const priorityClass = this.currentTask.isOpportunityPriorityRecord ? 'border-danger' : 'border-success';
        return `card-header bg-light-primary ${priorityClass} border-start border-5`;
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
                { label: 'Updated Today', value: 'Updated Today' },
                { label: 'Last 3 Days', value: 'Last 3 Days' },
                { label: 'Last Week', value: 'Last Week' },
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

    // Get filter display information for the status indicator card
    get filterDisplayInfo() {
        const isReviewMode = this.viewOnlyMode;
        
        switch(this.selectedStatusFilter) {
            case 'Updated Today':
                return {
                    icon: 'bi-calendar-check',
                    color: 'success',
                    description: 'Projects with updates made today'
                };
            case 'Last 3 Days':
                return {
                    icon: 'bi-calendar-range',
                    color: 'primary',
                    description: 'Projects updated in the last 3 days'
                };
            case 'Last Week':
                return {
                    icon: 'bi-calendar-week',
                    color: 'info',
                    description: 'Projects updated in the last 7 days'
                };
            case 'Due Today':
                return {
                    icon: 'bi-clock-history',
                    color: 'warning',
                    description: 'Tasks that are due today and need attention'
                };
            case 'Open':
                return {
                    icon: 'bi-play-circle',
                    color: 'primary',
                    description: 'Projects ready to start monitoring'
                };
            case 'In Development':
                return {
                    icon: 'bi-gear-wide-connected',
                    color: 'primary',
                    description: isReviewMode ? 'All In Development projects' : 'Projects currently in development phase'
                };
            case 'Go Live':
                return {
                    icon: 'bi-rocket-takeoff',
                    color: 'success',
                    description: isReviewMode ? 'All Go Live projects' : 'Projects in Go Live phase'
                };
            case 'Closed':
                return {
                    icon: 'bi-check-circle',
                    color: 'secondary',
                    description: isReviewMode ? 'All Closed projects' : 'Completed projects'
                };
            case 'All':
                return {
                    icon: 'bi-list-ul',
                    color: 'dark',
                    description: isReviewMode ? 'All projects regardless of status' : 'All available projects'
                };
            default:
                return {
                    icon: 'bi-funnel',
                    color: 'muted',
                    description: 'Filter results'
                };
        }
    }

    // Get project count display text
    get projectCountDisplay() {
        const count = this.allTaskIds ? this.allTaskIds.length : 0;
        const isReviewMode = this.viewOnlyMode;
        
        if (count === 0) {
            return 'No Projects';
        } else if (count === 1) {
            return isReviewMode ? '1 Project' : '1 Task';
        } else {
            return isReviewMode ? `${count} Projects` : `${count} Tasks`;
        }
    }

    // Enhanced no projects message with helpful guidance
    get noProjectsMessage() {
        const isReviewMode = this.viewOnlyMode;
        const filter = this.selectedStatusFilter;
        
        if (!isReviewMode) {
            // Update mode - standard message
            return 'No Projects currently meet the selected criteria. Please refine your filters or check again later.';
        }
        
        // Review mode - enhanced messages with suggestions
        switch(filter) {
            case 'Updated Today':
                return {
                    title: 'No Projects Updated Today',
                    message: 'No projects have been updated today. Try "Last 3 Days" or "Last Week" to review recent project activity.',
                    suggestions: ['Last 3 Days', 'Last Week', 'All']
                };
            case 'Last 3 Days':
                return {
                    title: 'No Recent Updates',
                    message: 'No projects have been updated in the last 3 days. Try "Last Week" or "All" to review older project activity.',
                    suggestions: ['Last Week', 'All']
                };
            case 'Last Week':
                return {
                    title: 'No Updates This Week',
                    message: 'No projects have been updated in the last week. Try "All" to see all projects regardless of update date.',
                    suggestions: ['All']
                };
            case 'In Development':
                return {
                    title: 'No In Development Projects',
                    message: 'No In Development projects found. Try "All" to see projects in other phases.',
                    suggestions: ['All', 'Go Live', 'Closed']
                };
            case 'Go Live':
                return {
                    title: 'No Go Live Projects',
                    message: 'No Go Live projects found. Try "All" to see projects in other phases.',
                    suggestions: ['All', 'In Development', 'Closed']
                };
            case 'Closed':
                return {
                    title: 'No Closed Projects',
                    message: 'No Closed projects found. Try "All" to see projects in other phases.',
                    suggestions: ['All', 'In Development', 'Go Live']
                };
            case 'All':
                return {
                    title: 'No Projects Available',
                    message: 'No projects are available for review with this Project Manager.',
                    suggestions: []
                };
            default:
                return {
                    title: 'No Projects Found',
                    message: 'No projects match the current filter criteria.',
                    suggestions: ['All']
                };
        }
    }

    get previousDayDate() {
        return this.currentTask ? this.currentTask.previousDayDate : null;
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
        // Reset all form fields
        this.currentNextMeetingScheduled = '';
        this.currentNextMeetingDate = '';
        this.newNextSteps = '';
        this.currentAgenda = '';
        this.currentRiskAndAction = '';
        this.currentReason = '';
        this.currentSupportEndDate = '';
        this.currentSupportPlan = '';
        
        // Reset warnings and state flags
        this.repeatedDetailsWarning = '';
        this.skipSupport = false;
        this.showConfirmNoSupportModal = false;
        this.showTaskModal = false;
        
        // Clear any previous error states
        this.noTasksError = false;
        
        // Reset resource selection if any
        this.resource = { Id: '', Name: '' };
    }

    handleStatusFilterChange(event) {
        const newFilter = event.target.value;
        const previousFilter = this.selectedStatusFilter;
        
        // Don't reload if the same filter is selected
        if (newFilter === previousFilter) {
            return;
        }
        
        this.selectedStatusFilter = newFilter;
        
        // If a project manager is already selected, reload data with new filter
        if (this.portalUserId && this.managerSelected) {
            this.isLoading = true;
            
            // Reset current state
            this.resetTaskState();
            
            // Clear any existing warnings or errors
            this.repeatedDetailsWarning = '';
            this.noTasksError = false;
            
            // Determine mode based on current view mode
            const mode = this.viewOnlyMode ? 'view' : 'update';
            
            // Show filter change notification
            this.showFilterChangeMessage(previousFilter, newFilter);
            
            getProjectIds({ 
                portalUserId: this.portalUserId, 
                mode: mode, 
                statusFilter: this.selectedStatusFilter 
            })
            .then(projectIds => {
                if (!projectIds || projectIds.length === 0) {
                    this.noTasksError = true;
                    this.showNoProjectsMessage(newFilter);
                    return;
                }
                
                this.allTaskIds = projectIds;
                this.currentIndex = 0;
                this.currentRecordId = projectIds[0];
                
                // Reset all input fields when switching filters
                this.resetAllInputs();
                
                // Fetch the first task details
                this.fetchTaskDetails(this.currentRecordId);
                
                // Show success message
                this.showFilterSuccessMessage(newFilter, projectIds.length);
            })
            .catch(error => {
                // Revert filter on error
                this.selectedStatusFilter = previousFilter;
                this.showError(`Failed to load projects with "${newFilter}" filter. Please try again.`);
                console.error('Filter change error:', error);
            })
            .finally(() => {
                this.isLoading = false;
            });
        }
    }
    
    // Helper method to reset task state
    resetTaskState() {
        this.currentTask = null;
        this.previousTask = null;
        this.allTaskIds = [];
        this.currentIndex = 0;
        this.currentRecordId = '';
    }
    
    // Helper method to show filter change notification
    showFilterChangeMessage(previousFilter, newFilter) {
        if (previousFilter && newFilter) {
            const event = new ShowToastEvent({
                title: 'Filter Changed',
                message: `Switching from "${previousFilter}" to "${newFilter}" filter...`,
                variant: 'info',
                mode: 'dismissable'
            });
            this.dispatchEvent(event);
        }
    }
    
    // Helper method to show no projects message
    showNoProjectsMessage(filterName) {
        const event = new ShowToastEvent({
            title: 'No Projects Found',
            message: `No projects match the "${filterName}" filter criteria.`,
            variant: 'warning',
            mode: 'dismissable'
        });
        this.dispatchEvent(event);
    }
    
    // Helper method to show filter success message
    showFilterSuccessMessage(filterName, count) {
        const event = new ShowToastEvent({
            title: 'Filter Applied',
            message: `Found ${count} project${count !== 1 ? 's' : ''} matching "${filterName}" filter.`,
            variant: 'success',
            mode: 'dismissable'
        });
        this.dispatchEvent(event);
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
        
        // If Next Meeting Date is in the future, auto-populate all meeting fields
        if (prevDate && prevDate > todayDate) {
            this.currentNextMeetingScheduled = this.previousTask.nextMeetingScheduled || '';
            this.currentNextMeetingDate = this.previousTask.nextMeetingDate || '';
            this.currentAgenda = this.previousTask.nextAgenda || '';
        } else {
            // If Next Meeting Date is today or in the past, show blank fields
            this.currentNextMeetingScheduled = '';
            this.currentNextMeetingDate = '';
            this.currentAgenda = '';
        }
        
        // Clear next-day input fields by default
        this.newNextSteps = '';
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
        const newDateValue = component?.value || '';
        this.currentNextMeetingDate = newDateValue;
        
        // Check if the selected date is in the future
        if (newDateValue) {
            const selectedDate = new Date(newDateValue);
            const todayDate = new Date(); 
            todayDate.setHours(0, 0, 0, 0);
            
            // If date is today or in the past, clear meeting fields
            if (selectedDate <= todayDate) {
                this.currentNextMeetingScheduled = '';
                this.currentAgenda = '';
            }
            // If date is in the future, auto-populate from previous task if available
            else if (this.previousTask && this.previousTask.nextMeetingDate) {
                const prevDate = new Date(this.previousTask.nextMeetingDate);
                // Only auto-populate if the previous task's date was also in the future
                if (prevDate > todayDate) {
                    this.currentNextMeetingScheduled = this.previousTask.nextMeetingScheduled || '';
                    this.currentAgenda = this.previousTask.nextAgenda || '';
                }
            }
        }
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
        // Show mode selection modal instead of immediately loading
        this.showModeSelectModal = true;
    }

    // Mode Selection Modal Handlers
    closeModeSelectModal() {
        this.showModeSelectModal = false;
        // Reset to allow re-selection
        this.portalUserId = '';
    }

    handleViewMode() {
        this.viewOnlyMode = true;
        this.showModeSelectModal = false;
        // Set a more helpful default filter for Review mode
        this.selectedStatusFilter = 'Updated Today';
        this.loadProjectsForSelectedManager();
    }

    handleUpdateMode() {
        this.viewOnlyMode = false;
        this.showModeSelectModal = false;
        this.loadProjectsForSelectedManager();
    }

    loadProjectsForSelectedManager() {
        // Hide selection UI
        this.managerSelected = true;
        this.isSelectManager = false;
        this.isLoading = true;
        
        // Determine mode
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

    // Inline Editing Methods
    handleFieldClick(event) {
        if (!this.viewOnlyMode) return; // Only in view mode
        
        const fieldName = event.currentTarget.dataset.field;
        this.editingField = fieldName;
        this.showSaveButton = true;
        
        // Focus the field after a short delay to ensure it's rendered
        setTimeout(() => {
            const field = this.template.querySelector(`[data-field="${fieldName}"]`);
            if (field && field.focus) {
                field.focus();
            }
        }, 100);
    }

    handleFieldBlur(event) {
        // Don't immediately exit edit mode - wait for save or explicit cancel
    }

    handleInlineSave() {
        if (!this.editingField) return;

        // Save the current field data
        this.isSavingField = true;
        
        const taskToSave = this.buildTaskForSaving();
        
        upsertProjectAssistantTask({ task: taskToSave })
        .then(() => {
            this.showSuccess('Field updated successfully!');
            this.editingField = null;
            this.showSaveButton = false;
            // Refresh the current task to show updated data
            this.fetchTaskDetails(this.currentRecordId);
        })
        .catch(error => {
            this.showError('Failed to update field: ' + (error.body?.message || error.message));
            console.error('Inline save error:', error);
        })
        .finally(() => {
            this.isSavingField = false;
        });
    }

    handleInlineCancel() {
        this.editingField = null;
        this.showSaveButton = false;
        // Refresh to restore original values
        this.fetchTaskDetails(this.currentRecordId);
    }

    // Helper to get display value for view mode (with fallback for empty values)
    getDisplayValue(fieldName, value) {
        if (!value || value.trim() === '') {
            return 'Click to add...';
        }
        return value;
    }

    // Enhanced getters for display values
    get nextStepsDisplay() {
        return this.getDisplayValue('nextSteps', this.newNextSteps);
    }

    get agendaDisplay() {
        return this.getDisplayValue('agenda', this.currentAgenda);
    }

    get riskActionDisplay() {
        return this.getDisplayValue('riskAction', this.currentRiskAndAction);
    }

    get meetingScheduledDisplay() {
        return this.getDisplayValue('meetingScheduled', this.currentNextMeetingScheduled);
    }

    // CSS class helpers for empty values
    get nextStepsDisplayClass() {
        return this.nextStepsDisplay === 'Click to add...' ? 'text-muted fst-italic' : '';
    }

    get agendaDisplayClass() {
        return this.agendaDisplay === 'Click to add...' ? 'text-muted fst-italic' : '';
    }

    get riskActionDisplayClass() {
        return this.riskActionDisplay === 'Click to add...' ? 'text-muted fst-italic' : '';
    }

    get meetingScheduledDisplayClass() {
        return this.meetingScheduledDisplay === 'Click to add...' ? 'text-muted fst-italic' : '';
    }

    getCurrentFieldValue() {
        switch(this.editingField) {
            case 'nextSteps': return this.newNextSteps;
            case 'nextAgenda': return this.currentAgenda;
            case 'riskAndAction': return this.currentRiskAndAction;
            case 'nextMeetingScheduled': return this.currentNextMeetingScheduled;
            case 'nextMeetingDate': return this.currentNextMeetingDate;
            case 'supportEndDate': return this.currentSupportEndDate;
            case 'supportPlan': return this.currentSupportPlan;
            case 'reason': return this.currentReason;
            default: return '';
        }
    }

    // Check if a field is currently being edited
    isFieldEditing(fieldName) {
        return this.viewOnlyMode && this.editingField === fieldName;
    }

    // Helper method to build the task object for saving
    buildTaskForSaving() {
        const task = { Id: this.currentTask.id };
        
        switch(this.editingField) {
            case 'nextSteps':
                task.Next_Steps__c = this.newNextSteps;
                break;
            case 'nextAgenda':
                task.Next_Agenda__c = this.currentAgenda;
                break;
            case 'riskAndAction':
                task.Risk_Action__c = this.currentRiskAndAction;
                break;
            case 'nextMeetingScheduled':
                task.Next_Meeting_Scheduled__c = this.currentNextMeetingScheduled;
                break;
            case 'nextMeetingDate':
                task.Next_Meeting_Date__c = this.currentNextMeetingDate;
                break;
            case 'supportEndDate':
                task.Support_End_Date__c = this.currentSupportEndDate;
                break;
            case 'supportPlan':
                task.Support_Plan__c = this.currentSupportPlan;
                break;
            case 'reason':
                task.Reason__c = this.currentReason;
                break;
        }
        
        return task;
    }

    // Getters for inline editing states
    get isEditingNextSteps() {
        return this.isFieldEditing('nextSteps');
    }

    get isEditingAgenda() {
        return this.isFieldEditing('nextAgenda');
    }

    get isEditingRiskAndAction() {
        return this.isFieldEditing('riskAndAction');
    }

    get isEditingMeetingScheduled() {
        return this.isFieldEditing('nextMeetingScheduled');
    }

    get isEditingMeetingDate() {
        return this.isFieldEditing('nextMeetingDate');
    }

    get isEditingSupportEndDate() {
        return this.isFieldEditing('supportEndDate');
    }

    get isEditingSupportPlan() {
        return this.isFieldEditing('supportPlan');
    }

    get isEditingReason() {
        return this.isFieldEditing('reason');
    }
}