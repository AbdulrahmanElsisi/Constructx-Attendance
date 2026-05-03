/**
 * ConstructX — Daily Attendance Check-In
 * -----------------------------------------------
 * Flow:
 *   1. Generate a device fingerprint (user_guid).
 *   2. Get today's local date in YYYY-MM-DD.
 *   3. Call the Power Automate webhook to check if
 *      a record already exists for (user_guid + date).
 *   4. If yes  → show "already checked in" message.
 *      If no   → show the name input form.
 *   5. On submit → POST name + user_guid + date.
 *   6. On success → hide form, show confirmation.
 */

(function () {
    'use strict';

    // =============================================
    //  CONFIG — Update these URLs to match your
    //  Power Automate webhook endpoints.
    // =============================================
    const CONFIG = {
        /** Webhook URL to CHECK if a record exists (GET or POST) */
        CHECK_URL: 'https://prod-XX.westus.logic.azure.com:443/workflows/YOUR_CHECK_WORKFLOW_ID/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=YOUR_SIG',

        /** Webhook URL to SUBMIT a new attendance record (POST) */
        SUBMIT_URL: 'https://prod-XX.westus.logic.azure.com:443/workflows/YOUR_SUBMIT_WORKFLOW_ID/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=YOUR_SIG',
    };

    // =============================================
    //  DOM References
    // =============================================
    const $loading      = document.getElementById('state-loading');
    const $checkedIn    = document.getElementById('state-checked-in');
    const $form         = document.getElementById('state-form');
    const $success      = document.getElementById('state-success');
    const $error        = document.getElementById('state-error');

    const $checkedMsg   = document.getElementById('already-checked-message');
    const $checkedDate  = document.getElementById('checked-date-badge');
    const $dateDisplay  = document.getElementById('current-date-display');
    const $nameInput    = document.getElementById('attendee-name');
    const $submitBtn    = document.getElementById('submit-btn');
    const $btnText      = $submitBtn.querySelector('.btn-text');
    const $btnLoading   = $submitBtn.querySelector('.btn-loading');
    const $successName  = document.getElementById('success-name-message');
    const $successDate  = document.getElementById('success-date-badge');
    const $errorMsg     = document.getElementById('error-message');
    const $footerDate   = document.getElementById('footer-date');

    // =============================================
    //  Helpers
    // =============================================

    /** Get today's local date as YYYY-MM-DD */
    function getTodayDate() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /** Format date for display: "May 3, 2026" */
    function formatDateDisplay(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    /** Switch visible state section */
    function showState(section) {
        [$loading, $checkedIn, $form, $success, $error].forEach(el => {
            el.classList.add('hidden');
        });
        section.classList.remove('hidden');
    }

    /** Show button loading state */
    function setButtonLoading(loading) {
        $submitBtn.disabled = loading;
        $btnText.classList.toggle('hidden', loading);
        $btnLoading.classList.toggle('hidden', !loading);
    }

    // =============================================
    //  Core Logic
    // =============================================

    async function init() {
        const todayDate = getTodayDate();
        const prettyDate = formatDateDisplay(todayDate);

        // Set dates in footer & form
        $footerDate.textContent = prettyDate;
        $dateDisplay.textContent = prettyDate;

        try {
            // 1) Generate device fingerprint
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            const userGuid = result.visitorId;

            // 2) Check if already checked in for today
            const alreadyChecked = await checkExistingRecord(userGuid, todayDate);

            if (alreadyChecked) {
                // Show "already checked in" state
                $checkedMsg.textContent = `You have already checked in for today (${prettyDate})`;
                $checkedDate.textContent = todayDate;
                showState($checkedIn);
            } else {
                // Show the form
                showState($form);
                $nameInput.focus();

                // Attach form submit handler
                document.getElementById('attendance-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await handleSubmit(userGuid, todayDate, prettyDate);
                });
            }
        } catch (err) {
            console.error('Initialization error:', err);
            $errorMsg.textContent = 'Could not verify your device. Please check your connection and try again.';
            showState($error);
        }
    }

    /**
     * Check if a record exists for this user_guid + date.
     * Sends a POST to the CHECK_URL webhook.
     * Expected response: { "exists": true/false }
     */
    async function checkExistingRecord(userGuid, date) {
        try {
            const response = await fetch(CONFIG.CHECK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_guid: userGuid,
                    date: date,
                }),
            });

            if (!response.ok) {
                throw new Error(`Check API responded with status ${response.status}`);
            }

            const data = await response.json();
            // Power Automate should return { "exists": true } or { "exists": false }
            return data.exists === true;
        } catch (err) {
            console.warn('Check API error (treating as not checked in):', err);
            // If the check fails, allow the user to proceed with check-in
            return false;
        }
    }

    /**
     * Submit the attendance record.
     */
    async function handleSubmit(userGuid, todayDate, prettyDate) {
        const name = $nameInput.value.trim();

        if (!name) {
            $nameInput.focus();
            return;
        }

        setButtonLoading(true);

        try {
            const response = await fetch(CONFIG.SUBMIT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_guid: userGuid,
                    date: todayDate,
                    name: name,
                }),
            });

            if (!response.ok) {
                throw new Error(`Submit API responded with status ${response.status}`);
            }

            // Show success state
            $successName.textContent = `Welcome, ${name}! Your attendance has been recorded.`;
            $successDate.textContent = todayDate;
            showState($success);
        } catch (err) {
            console.error('Submission error:', err);
            $errorMsg.textContent = 'Failed to submit your attendance. Please try again.';
            showState($error);
        } finally {
            setButtonLoading(false);
        }
    }

    // =============================================
    //  Boot
    // =============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
