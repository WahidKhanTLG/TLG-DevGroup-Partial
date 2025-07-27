import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';

import portalPlusAssets from '@salesforce/resourceUrl/portalplus';

const defaultOptions = {
    enableTime: false,
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "M d, Y"
};

// defaultDateTimeOptions = {
//     enableTime: true,
//     altInput: true,
//     altFormat: "M d, Y h:i K",
//     dateFormat: "Y-m-d H:i"
// }

export default class FlatPickrInput extends LightningElement {
    @api name;
    @api placeholder;

    @track _options = null;
    @track _disabled = false;
    _required = false;

    defaultDate = null;

    scriptsLoaded = false;
    flatPickrInstance = null;

    @api get options() {
        return this._options || defaultOptions;
    }

    set options(val) {
        if(toString.call(val) !== '[object Object]') return;

        this._options = {
            ...defaultOptions,
            ...val
        };
    }

    @api get disabled() {
        return this._disabled;
    }

    set disabled(val) {
        this._disabled = /^(1|true|y|yes)$/i.test(val);
    }

    @api get required() {
        return this._required;
    }

    set required(val) {
        return this._required = /^(true|1|y|yes)$/i.test(val);
    }

    @api get value() {
        const input = this.input;
        const value = input?.value || '';
        return value ? (new Date(value)).toISOString() : value;
    }

    set value(val) {
        // const input = this.input;
        
        // if(input) input.value = val;

        if(this.flatPickrInstance) {
            this.flatPickrInstance.setDate(val);
        } else {
            this.defaultDate = val;
        }
    }

    get input() {
        return this.template.querySelector('.flatpickr-input');
    }

    async connectedCallback() {
        try {
            await loadScript(this, `${portalPlusAssets}/assets/js/flatpickr.js`);
            this.scriptsLoaded = true;

            this.initializeInput();
        } catch (ex) {
            console.log('Exception while loading flatpickr script', ex.message);
        }
    }

    renderedCallback() {
        this.initializeInput();
    }

    initializeInput() {
        
        const input = this.input;
        if(!input) return;

        input.disabled = this.disabled;

        if(!this.scriptsLoaded || this.flatPickrInstance) return;

        const options = {
            ...(this.options || {}),
            defaultDate: this.defaultDate
        };

        this.flatPickrInstance = flatpickr(input, options);
    }
}