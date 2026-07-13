const operatorQueuePageTitle = "HonoWarden operator queue";

export function operatorQueuePageResponse(): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
  ].join("; ");

  return new Response(operatorQueuePage(nonce), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": contentSecurityPolicy,
      "Content-Type": "text/html; charset=utf-8",
      "Permissions-Policy":
        "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function operatorQueuePage(nonce: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${operatorQueuePageTitle}</title>
    <style nonce="${nonce}">
      :root {
        color-scheme: light;
        --ink: #10282f;
        --ink-soft: #385058;
        --paper: #f4f0e6;
        --paper-bright: #fffdf7;
        --paper-deep: #e6dfd0;
        --rule: #9b9b8d;
        --signal: #f3b23c;
        --signal-dark: #885400;
        --danger: #9c2f25;
        --danger-soft: #f8e4df;
        --success: #1f6651;
        --success-soft: #dceee6;
        --info: #285a75;
        --info-soft: #dceaf1;
        --shadow: 0 18px 48px rgba(16, 40, 47, 0.13);
        font-family: "Avenir Next Condensed", "Franklin Gothic Medium",
          "Trebuchet MS", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      [hidden] {
        display: none !important;
      }

      html {
        background: var(--ink);
        min-width: 320px;
      }

      body {
        min-height: 100vh;
        margin: 0;
        overflow-x: hidden;
        color: var(--ink);
        background-color: var(--paper);
        background-image:
          linear-gradient(rgba(16, 40, 47, 0.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(16, 40, 47, 0.045) 1px, transparent 1px);
        background-size: 28px 28px;
      }

      button,
      input {
        font: inherit;
      }

      button,
      a,
      input,
      label {
        -webkit-tap-highlight-color: transparent;
      }

      a {
        color: var(--info);
        text-underline-offset: 0.18em;
        text-decoration-thickness: 0.12em;
      }

      a:hover {
        color: var(--ink);
      }

      :focus-visible {
        outline: 3px solid var(--signal);
        outline-offset: 3px;
      }

      .skip-link {
        position: fixed;
        z-index: 20;
        top: 0.75rem;
        left: 0.75rem;
        padding: 0.7rem 1rem;
        color: var(--paper-bright);
        background: var(--ink);
        border: 2px solid var(--signal);
        transform: translateY(-160%);
      }

      .skip-link:focus {
        transform: translateY(0);
      }

      .masthead {
        position: relative;
        overflow: hidden;
        color: var(--paper-bright);
        background: var(--ink);
        border-bottom: 5px solid var(--signal);
      }

      .masthead::after {
        position: absolute;
        width: 23rem;
        height: 23rem;
        right: -8rem;
        bottom: -15rem;
        content: "";
        border: 1px solid rgba(243, 178, 60, 0.55);
        border-radius: 50%;
        box-shadow:
          0 0 0 2rem rgba(243, 178, 60, 0.07),
          0 0 0 5rem rgba(243, 178, 60, 0.04);
        pointer-events: none;
      }

      .masthead-inner,
      .workspace {
        width: min(92rem, calc(100% - 2rem));
        margin-inline: auto;
      }

      .masthead-inner {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 2rem;
        align-items: end;
        padding: clamp(2rem, 6vw, 5.5rem) 0 2rem;
      }

      .eyebrow,
      .kicker,
      .metadata-label,
      .group-count,
      .version {
        margin: 0;
        font-family: "Courier New", "Nimbus Mono PS", monospace;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .eyebrow {
        color: var(--signal);
      }

      h1 {
        max-width: 15ch;
        margin: 0.3rem 0 0.75rem;
        font-family: Rockwell, "Roboto Slab", "Courier New", serif;
        font-size: clamp(2.65rem, 7vw, 6.8rem);
        font-weight: 700;
        line-height: 0.92;
        letter-spacing: -0.055em;
      }

      .lede {
        max-width: 48rem;
        margin: 0;
        color: #dae3df;
        font-size: clamp(1rem, 2vw, 1.2rem);
        line-height: 1.55;
      }

      .privacy-stamp {
        display: grid;
        max-width: 17rem;
        padding: 1rem;
        gap: 0.25rem;
        border: 1px solid rgba(255, 253, 247, 0.42);
        background: rgba(255, 253, 247, 0.04);
        transform: rotate(-1.5deg);
      }

      .privacy-stamp strong {
        color: var(--signal);
        font-family: "Courier New", "Nimbus Mono PS", monospace;
        font-size: 0.88rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .privacy-stamp span {
        color: #dae3df;
        font-size: 0.88rem;
        line-height: 1.35;
      }

      .workspace {
        padding: clamp(1.25rem, 4vw, 3.5rem) 0 5rem;
      }

      .control-panel {
        position: relative;
        z-index: 2;
        padding: clamp(1rem, 3vw, 1.75rem);
        background: var(--paper-bright);
        border: 1px solid var(--rule);
        box-shadow: var(--shadow);
      }

      .control-heading {
        display: flex;
        gap: 1rem;
        align-items: end;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .control-heading h2,
      .queue-heading h2,
      .status-group h2 {
        margin: 0;
        font-family: Rockwell, "Roboto Slab", "Courier New", serif;
      }

      .control-heading h2 {
        font-size: 1.35rem;
      }

      .control-heading p {
        margin: 0;
        color: var(--ink-soft);
      }

      fieldset {
        min-width: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }

      legend {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      .filter-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(7.5rem, 1fr));
        gap: 0.55rem;
      }

      .filter-option {
        position: relative;
        display: flex;
        min-height: 3rem;
        padding: 0.65rem 0.8rem;
        gap: 0.55rem;
        align-items: center;
        cursor: pointer;
        border: 1px solid var(--rule);
        background: var(--paper);
        transition:
          background 140ms ease,
          border-color 140ms ease,
          transform 140ms ease;
      }

      .filter-option:hover {
        border-color: var(--ink);
        transform: translateY(-1px);
      }

      .filter-option:has(input:checked) {
        color: var(--paper-bright);
        background: var(--ink);
        border-color: var(--ink);
      }

      .filter-option input {
        width: 1.1rem;
        height: 1.1rem;
        margin: 0;
        accent-color: var(--signal);
      }

      .filter-option span {
        font-family: "Courier New", "Nimbus Mono PS", monospace;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .panel-actions,
      .queue-actions,
      .card-actions,
      .flags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
      }

      .panel-actions {
        align-items: center;
        justify-content: space-between;
        margin-top: 1rem;
      }

      .selection-summary {
        margin: 0;
        color: var(--ink-soft);
        font-size: 0.92rem;
      }

      .button {
        display: inline-flex;
        min-height: 2.75rem;
        padding: 0.65rem 1rem;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--ink);
        border-radius: 0;
        color: var(--ink);
        background: transparent;
        font-family: "Courier New", "Nimbus Mono PS", monospace;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        cursor: pointer;
        transition:
          box-shadow 140ms ease,
          transform 140ms ease,
          background 140ms ease;
      }

      .button:hover:not(:disabled) {
        box-shadow: 4px 4px 0 var(--ink);
        transform: translate(-2px, -2px);
      }

      .button:active:not(:disabled) {
        box-shadow: 1px 1px 0 var(--ink);
        transform: translate(0, 0);
      }

      .button:disabled {
        cursor: wait;
        opacity: 0.58;
      }

      .button-primary {
        background: var(--signal);
      }

      .button-quiet {
        background: var(--paper-bright);
      }

      .button-danger {
        color: var(--danger);
        border-color: var(--danger);
        background: var(--danger-soft);
      }

      .button-danger:hover:not(:disabled) {
        box-shadow: 4px 4px 0 var(--danger);
      }

      .message {
        display: none;
        margin: 1.25rem 0 0;
        padding: 0.9rem 1rem;
        border-left: 5px solid var(--info);
        color: var(--ink);
        background: var(--info-soft);
      }

      .message[data-visible="true"] {
        display: block;
      }

      .message[data-tone="error"] {
        border-color: var(--danger);
        background: var(--danger-soft);
      }

      .message[data-tone="success"] {
        border-color: var(--success);
        background: var(--success-soft);
      }

      .message[data-tone="warning"] {
        border-color: var(--signal-dark);
        background: #fff0cf;
      }

      .queue-section {
        margin-top: clamp(2rem, 5vw, 4rem);
      }

      .queue-heading {
        display: flex;
        gap: 1rem;
        align-items: end;
        justify-content: space-between;
        margin-bottom: 1rem;
        padding-bottom: 0.8rem;
        border-bottom: 3px solid var(--ink);
      }

      .queue-heading h2 {
        font-size: clamp(1.7rem, 4vw, 2.6rem);
        line-height: 1;
      }

      .queue-heading p {
        margin: 0;
        color: var(--ink-soft);
        font-family: "Courier New", "Nimbus Mono PS", monospace;
        font-size: 0.78rem;
      }

      #queue-region[aria-busy="true"] {
        opacity: 0.7;
      }

      .status-groups,
      .draft-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .status-groups {
        display: grid;
        gap: 2.25rem;
      }

      .status-group-header {
        display: flex;
        gap: 1rem;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 0.75rem;
      }

      .status-group h2 {
        font-size: 1.15rem;
        text-transform: uppercase;
      }

      .group-count {
        color: var(--ink-soft);
      }

      .draft-list {
        display: grid;
        gap: 0.85rem;
      }

      .draft-card {
        position: relative;
        display: grid;
        grid-template-columns: minmax(11rem, 0.7fr) minmax(18rem, 1.55fr) minmax(14rem, 0.9fr);
        gap: clamp(1rem, 3vw, 2rem);
        padding: clamp(1rem, 2.5vw, 1.5rem);
        overflow: hidden;
        background: var(--paper-bright);
        border: 1px solid var(--rule);
        border-left: 7px solid var(--info);
        box-shadow: 0 5px 0 rgba(16, 40, 47, 0.1);
      }

      .draft-card[data-status="draft"] {
        border-left-color: var(--signal-dark);
      }

      .draft-card[data-status="approved"],
      .draft-card[data-status="sent"] {
        border-left-color: var(--success);
      }

      .draft-card[data-status="rejected"],
      .draft-card[data-status="send_failed"] {
        border-left-color: var(--danger);
      }

      .draft-card[data-status="sending"] {
        border-left-color: var(--signal);
        background-image: repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 12px,
          rgba(243, 178, 60, 0.08) 12px,
          rgba(243, 178, 60, 0.08) 24px
        );
      }

      .card-state,
      .card-content,
      .card-operations {
        min-width: 0;
      }

      .status-label,
      .flag {
        display: inline-flex;
        width: fit-content;
        min-height: 1.8rem;
        padding: 0.3rem 0.55rem;
        align-items: center;
        border: 1px solid currentColor;
        font-family: "Courier New", "Nimbus Mono PS", monospace;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .status-label {
        color: var(--paper-bright);
        background: var(--ink);
      }

      .age {
        margin: 0.8rem 0 0.15rem;
        font-size: 1.25rem;
        font-weight: 700;
      }

      .version {
        color: var(--ink-soft);
      }

      .card-content h3 {
        margin: 0 0 0.7rem;
        overflow-wrap: anywhere;
        font-family: Rockwell, "Roboto Slab", "Courier New", serif;
        font-size: clamp(1.15rem, 2.5vw, 1.55rem);
        line-height: 1.2;
      }

      .hash,
      code {
        font-family: "Courier New", "Nimbus Mono PS", monospace;
        font-size: 0.84rem;
      }

      .hash {
        margin: 0;
        color: var(--ink-soft);
        overflow-wrap: anywhere;
      }

      .operators {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        gap: 0.35rem 0.7rem;
        margin: 1rem 0 0;
        font-size: 0.82rem;
      }

      .operators dt {
        color: var(--ink-soft);
        font-family: "Courier New", "Nimbus Mono PS", monospace;
      }

      .operators dd {
        margin: 0;
        overflow-wrap: anywhere;
      }

      .flags {
        margin-bottom: 0.9rem;
      }

      .flag {
        color: var(--ink-soft);
        background: var(--paper);
      }

      .flag[data-active="true"] {
        color: var(--danger);
        background: var(--danger-soft);
      }

      .error-code,
      .investigation-note,
      .linear-reference {
        margin: 0.7rem 0;
        line-height: 1.4;
      }

      .investigation-note {
        padding: 0.7rem;
        color: #5f3a00;
        background: #fff0cf;
        border: 1px solid var(--signal-dark);
        font-weight: 700;
      }

      .card-actions {
        margin-top: 1rem;
      }

      .empty-state {
        padding: clamp(2rem, 8vw, 6rem) 1.5rem;
        text-align: center;
        background: rgba(255, 253, 247, 0.78);
        border: 1px dashed var(--rule);
      }

      .empty-state strong {
        display: block;
        margin-bottom: 0.5rem;
        font-family: Rockwell, "Roboto Slab", "Courier New", serif;
        font-size: 1.4rem;
      }

      .queue-actions {
        justify-content: center;
        margin-top: 1.5rem;
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media (max-width: 74rem) {
        .filter-grid {
          grid-template-columns: repeat(3, minmax(8rem, 1fr));
        }

        .draft-card {
          grid-template-columns: minmax(9rem, 0.55fr) minmax(16rem, 1.4fr);
        }

        .card-operations {
          grid-column: 1 / -1;
          padding-top: 1rem;
          border-top: 1px solid var(--paper-deep);
        }
      }

      @media (max-width: 47rem) {
        .masthead-inner {
          grid-template-columns: minmax(0, 1fr);
          gap: 1.5rem;
        }

        .privacy-stamp {
          max-width: none;
          transform: none;
        }

        .control-heading,
        .queue-heading,
        .panel-actions {
          align-items: stretch;
          flex-direction: column;
        }

        .filter-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .draft-card {
          grid-template-columns: minmax(0, 1fr);
        }

        .card-operations {
          grid-column: auto;
        }

        .card-state {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 0.25rem 1rem;
          align-items: start;
        }

        .age {
          grid-column: 1;
        }

        .version {
          grid-column: 2;
          grid-row: 1 / span 2;
          align-self: center;
        }
      }

      @media (max-width: 25rem) {
        .masthead-inner,
        .workspace {
          width: min(100% - 1rem, 92rem);
        }

        .filter-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .button {
          width: 100%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#queue-main">Skip to operator queue</a>
    <header class="masthead">
      <div class="masthead-inner">
        <div>
          <p class="eyebrow">Redacted operations surface / inquiry dispatch</p>
          <h1>Operator queue</h1>
          <p class="lede">
            Review state, act with the current version, and escalate ambiguous sends.
            This surface receives only the queue API's redaction-safe projection.
          </p>
        </div>
        <aside class="privacy-stamp" aria-label="Privacy boundary">
          <strong>Metadata only</strong>
          <span>No recipient address, message body, or raw provider response is requested or rendered.</span>
        </aside>
      </div>
    </header>

    <main class="workspace" id="queue-main">
      <nav class="control-panel" aria-labelledby="filters-heading">
        <div class="control-heading">
          <div>
            <p class="kicker">Queue controls</p>
            <h2 id="filters-heading">Filter by status</h2>
          </div>
          <p>Actionable states are selected by default.</p>
        </div>
        <form id="filter-form">
          <fieldset>
            <legend>Draft statuses to display</legend>
            <div class="filter-grid" id="status-filters">
              <label class="filter-option">
                <input type="checkbox" name="status" value="draft" checked>
                <span>Draft</span>
              </label>
              <label class="filter-option">
                <input type="checkbox" name="status" value="approved" checked>
                <span>Approved</span>
              </label>
              <label class="filter-option">
                <input type="checkbox" name="status" value="send_failed" checked>
                <span>Send failed</span>
              </label>
              <label class="filter-option">
                <input type="checkbox" name="status" value="sending" checked>
                <span>Sending</span>
              </label>
              <label class="filter-option">
                <input type="checkbox" name="status" value="rejected">
                <span>Rejected</span>
              </label>
              <label class="filter-option">
                <input type="checkbox" name="status" value="sent">
                <span>Sent</span>
              </label>
            </div>
          </fieldset>
          <div class="panel-actions">
            <p class="selection-summary" id="selection-summary">4 statuses selected</p>
            <div class="queue-actions">
              <button class="button button-quiet" id="actionable-button" type="button">Actionable only</button>
              <button class="button button-quiet" id="all-button" type="button">Select all</button>
              <button class="button button-primary" id="refresh-button" type="button">Refresh queue</button>
            </div>
          </div>
        </form>
        <div class="message" id="operator-message" data-visible="false" data-tone="info" role="alert" tabindex="-1"></div>
      </nav>

      <section class="queue-section" aria-labelledby="queue-heading">
        <div class="queue-heading">
          <div>
            <p class="kicker">Newest first within each status</p>
            <h2 id="queue-heading">Dispatch ledger</h2>
          </div>
          <p id="queue-summary">Loading queue…</p>
        </div>
        <div id="queue-region" aria-busy="true">
          <ul class="status-groups" id="queue-list" aria-label="Drafts grouped by status">
            <li class="empty-state"><strong>Loading queue</strong>Please wait while redacted draft metadata is retrieved.</li>
          </ul>
          <div class="queue-actions">
            <button class="button button-primary" id="load-more-button" type="button" hidden>Load more</button>
          </div>
        </div>
      </section>
    </main>

    <div class="visually-hidden" id="announcer" role="status" aria-live="polite" aria-atomic="true"></div>

    <script nonce="${nonce}">
      (() => {
        "use strict";

        const allStatuses = [
          { value: "draft", label: "Draft" },
          { value: "approved", label: "Approved" },
          { value: "send_failed", label: "Send failed" },
          { value: "sending", label: "Sending" },
          { value: "rejected", label: "Rejected" },
          { value: "sent", label: "Sent" },
        ];
        const actionableStatuses = new Set([
          "draft",
          "approved",
          "send_failed",
          "sending",
        ]);
        const state = {
          drafts: [],
          nextCursor: null,
          selectedStatuses: new Set(actionableStatuses),
          loading: false,
          actionDraftId: null,
          requestSequence: 0,
        };

        const filterForm = document.querySelector("#filter-form");
        const statusFilters = document.querySelector("#status-filters");
        const selectionSummary = document.querySelector("#selection-summary");
        const actionableButton = document.querySelector("#actionable-button");
        const allButton = document.querySelector("#all-button");
        const refreshButton = document.querySelector("#refresh-button");
        const queueRegion = document.querySelector("#queue-region");
        const queueList = document.querySelector("#queue-list");
        const queueSummary = document.querySelector("#queue-summary");
        const loadMoreButton = document.querySelector("#load-more-button");
        const operatorMessage = document.querySelector("#operator-message");
        const announcer = document.querySelector("#announcer");

        if (
          !(filterForm instanceof HTMLFormElement) ||
          !(statusFilters instanceof HTMLElement) ||
          !(selectionSummary instanceof HTMLElement) ||
          !(actionableButton instanceof HTMLButtonElement) ||
          !(allButton instanceof HTMLButtonElement) ||
          !(refreshButton instanceof HTMLButtonElement) ||
          !(queueRegion instanceof HTMLElement) ||
          !(queueList instanceof HTMLUListElement) ||
          !(queueSummary instanceof HTMLElement) ||
          !(loadMoreButton instanceof HTMLButtonElement) ||
          !(operatorMessage instanceof HTMLElement) ||
          !(announcer instanceof HTMLElement)
        ) {
          return;
        }

        filterForm.addEventListener("submit", (event) => event.preventDefault());
        statusFilters.addEventListener("change", () => {
          readSelectedStatuses();
          void fetchQueue(false);
        });
        actionableButton.addEventListener("click", () => {
          setCheckedStatuses(actionableStatuses);
          void fetchQueue(false);
        });
        allButton.addEventListener("click", () => {
          setCheckedStatuses(new Set(allStatuses.map((status) => status.value)));
          void fetchQueue(false);
        });
        refreshButton.addEventListener("click", () => void fetchQueue(false));
        loadMoreButton.addEventListener("click", () => void fetchQueue(true));
        queueList.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }
          const button = target.closest("button[data-action][data-draft-id]");
          if (!(button instanceof HTMLButtonElement)) {
            return;
          }
          const draftId = button.dataset.draftId;
          const action = button.dataset.action;
          if (draftId && action) {
            void performAction(draftId, action);
          }
        });

        function readSelectedStatuses() {
          const values = Array.from(
            statusFilters.querySelectorAll('input[name="status"]:checked'),
          ).map((input) => input.value);
          state.selectedStatuses = new Set(values);
          updateSelectionSummary();
        }

        function setCheckedStatuses(statuses) {
          for (const input of statusFilters.querySelectorAll(
            'input[name="status"]',
          )) {
            input.checked = statuses.has(input.value);
          }
          readSelectedStatuses();
        }

        function updateSelectionSummary() {
          const count = state.selectedStatuses.size;
          selectionSummary.textContent =
            count === 1 ? "1 status selected" : String(count) + " statuses selected";
        }

        function queueUrl(cursor) {
          const url = new URL("/api/drafts", window.location.origin);
          for (const status of allStatuses) {
            if (state.selectedStatuses.has(status.value)) {
              url.searchParams.append("status", status.value);
            }
          }
          url.searchParams.set("limit", "25");
          if (cursor) {
            url.searchParams.set("cursor", cursor);
          }
          return url;
        }

        async function fetchQueue(append) {
          if (state.selectedStatuses.size === 0) {
            state.drafts = [];
            state.nextCursor = null;
            renderQueue();
            setMessage(
              "warning",
              "Select at least one status to retrieve queue metadata.",
            );
            announce("No statuses selected.");
            return;
          }

          const cursor = append ? state.nextCursor : null;
          if (append && !cursor) {
            return;
          }
          const requestSequence = ++state.requestSequence;
          setLoading(true);
          clearMessage();

          try {
            const response = await fetch(queueUrl(cursor), {
              headers: { Accept: "application/json" },
            });
            if (requestSequence !== state.requestSequence) {
              return;
            }
            if (!response.ok) {
              handleApiFailure(response.status, "load the queue");
              return;
            }
            const payload = await response.json();
            const drafts = Array.isArray(payload.drafts)
              ? payload.drafts.filter(isQueueDraft)
              : [];
            state.drafts = append
              ? mergeDrafts(state.drafts, drafts)
              : drafts;
            state.nextCursor =
              typeof payload.nextCursor === "string" ? payload.nextCursor : null;
            renderQueue();
            announce(
              append
                ? "More drafts loaded. " + String(state.drafts.length) + " total."
                : "Queue refreshed. " + String(state.drafts.length) + " drafts loaded.",
            );
          } catch {
            setMessage(
              "error",
              "The queue could not be reached. No draft data was changed.",
            );
            announce("Queue request failed.");
          } finally {
            if (requestSequence === state.requestSequence) {
              setLoading(false);
            }
          }
        }

        function mergeDrafts(currentDrafts, additionalDrafts) {
          const merged = new Map(currentDrafts.map((draft) => [draft.id, draft]));
          for (const draft of additionalDrafts) {
            merged.set(draft.id, draft);
          }
          return Array.from(merged.values());
        }

        function isQueueDraft(value) {
          return (
            value !== null &&
            typeof value === "object" &&
            typeof value.id === "string" &&
            typeof value.status === "string" &&
            typeof value.version === "number" &&
            typeof value.updatedAt === "string" &&
            typeof value.ageSeconds === "number" &&
            typeof value.toAddressHash === "string" &&
            typeof value.subjectPreview === "string"
          );
        }

        function renderQueue() {
          queueList.replaceChildren();
          let visibleCount = 0;

          for (const statusDefinition of allStatuses) {
            if (!state.selectedStatuses.has(statusDefinition.value)) {
              continue;
            }
            const drafts = state.drafts
              .filter((draft) => draft.status === statusDefinition.value)
              .sort(compareNewestFirst);
            if (drafts.length === 0) {
              continue;
            }
            visibleCount += drafts.length;
            queueList.append(createStatusGroup(statusDefinition, drafts));
          }

          if (visibleCount === 0) {
            const emptyItem = element("li", "empty-state");
            const title = element("strong", "", "No drafts in this view");
            emptyItem.append(
              title,
              document.createTextNode(
                state.selectedStatuses.size === 0
                  ? "Select one or more statuses above."
                  : "The selected statuses currently have no queue items.",
              ),
            );
            queueList.append(emptyItem);
          }

          queueSummary.textContent =
            String(visibleCount) +
            (visibleCount === 1 ? " draft loaded" : " drafts loaded") +
            (state.nextCursor ? " · more available" : " · end of results");
          loadMoreButton.hidden = !state.nextCursor;
          loadMoreButton.disabled = state.loading;
        }

        function compareNewestFirst(left, right) {
          if (left.updatedAt !== right.updatedAt) {
            return left.updatedAt < right.updatedAt ? 1 : -1;
          }
          if (left.id === right.id) {
            return 0;
          }
          return left.id < right.id ? 1 : -1;
        }

        function createStatusGroup(statusDefinition, drafts) {
          const item = element("li", "status-group");
          const section = document.createElement("section");
          const headingId = "status-heading-" + statusDefinition.value;
          section.setAttribute("aria-labelledby", headingId);

          const header = element("div", "status-group-header");
          const heading = element("h2", "", statusDefinition.label);
          heading.id = headingId;
          const count = element(
            "span",
            "group-count",
            String(drafts.length) + (drafts.length === 1 ? " item" : " items"),
          );
          header.append(heading, count);

          const list = element("ul", "draft-list");
          list.setAttribute("aria-label", statusDefinition.label + " drafts");
          for (const draft of drafts) {
            const draftItem = document.createElement("li");
            draftItem.append(createDraftCard(draft));
            list.append(draftItem);
          }
          section.append(header, list);
          item.append(section);
          return item;
        }

        function createDraftCard(draft) {
          const card = element("article", "draft-card");
          card.dataset.status = draft.status;
          card.dataset.draftId = draft.id;
          const titleId = "draft-title-" + safeDomId(draft.id);
          card.setAttribute("aria-labelledby", titleId);

          const stateColumn = element("div", "card-state");
          stateColumn.append(
            element("span", "status-label", statusLabel(draft.status)),
            element("p", "age", "Age " + formatAge(draft.ageSeconds)),
            element("p", "version", "Version " + String(draft.version)),
          );

          const contentColumn = element("div", "card-content");
          const title = element(
            "h3",
            "",
            draft.subjectPreview || "(No subject preview)",
          );
          title.id = titleId;
          contentColumn.append(
            title,
            element(
              "p",
              "hash",
              "Recipient hash " + shortHash(draft.toAddressHash),
            ),
            createOperators(draft),
          );

          const operationsColumn = element("div", "card-operations");
          const flags = element("div", "flags");
          flags.append(
            flag("Retry eligible: " + (draft.retryEligible ? "yes" : "no"), draft.retryEligible),
            flag("Stuck: " + (draft.stuck ? "yes" : "no"), draft.stuck),
          );
          operationsColumn.append(flags);

          if (typeof draft.lastErrorCode === "string" && draft.lastErrorCode) {
            const errorCode = element("p", "error-code");
            errorCode.append(
              document.createTextNode("Last error code "),
              element("code", "", draft.lastErrorCode),
            );
            operationsColumn.append(errorCode);
          }

          if (draft.stuck) {
            operationsColumn.append(
              element(
                "p",
                "investigation-note",
                "Needs investigation. Retrying could duplicate an email, so this row has no retry control.",
              ),
            );
          }

          const linearReference = createLinearReference(draft.linearIssue);
          if (linearReference) {
            operationsColumn.append(linearReference);
          }

          const actions = createActions(draft);
          if (actions.childElementCount > 0) {
            operationsColumn.append(actions);
          }

          card.append(stateColumn, contentColumn, operationsColumn);
          return card;
        }

        function createOperators(draft) {
          const list = element("dl", "operators");
          appendOperator(list, "Created", draft.createdBy);
          appendOperator(list, "Approved", draft.approvedBy);
          appendOperator(list, "Rejected", draft.rejectedBy);
          appendOperator(list, "Sent", draft.sentBy);
          return list;
        }

        function appendOperator(list, label, identity) {
          if (typeof identity !== "string" || !identity) {
            return;
          }
          list.append(element("dt", "", label + " by"), element("dd", "", identity));
        }

        function flag(text, active) {
          const value = element("span", "flag", text);
          value.dataset.active = active ? "true" : "false";
          return value;
        }

        function createLinearReference(linearIssue) {
          if (
            linearIssue === null ||
            typeof linearIssue !== "object" ||
            typeof linearIssue.identifier !== "string" ||
            typeof linearIssue.url !== "string"
          ) {
            return null;
          }
          const safeUrl = safeLinearUrl(linearIssue.url);
          if (!safeUrl) {
            return null;
          }
          const paragraph = element("p", "linear-reference");
          const link = element(
            "a",
            "",
            "Open Linear issue " + linearIssue.identifier,
          );
          link.href = safeUrl;
          link.target = "_blank";
          link.rel = "noreferrer noopener";
          paragraph.append(link);
          return paragraph;
        }

        function safeLinearUrl(value) {
          try {
            const url = new URL(value);
            const isLinearHost =
              url.hostname === "linear.app" || url.hostname.endsWith(".linear.app");
            return url.protocol === "https:" && isLinearHost ? url.href : null;
          } catch {
            return null;
          }
        }

        function createActions(draft) {
          const actions = element("div", "card-actions");
          if (draft.status === "draft") {
            actions.append(
              actionButton(draft, "approve", "Approve", "button-primary"),
              actionButton(draft, "reject", "Reject", "button-danger"),
            );
          } else if (draft.status === "approved") {
            actions.append(
              actionButton(draft, "send", "Send email", "button-primary"),
            );
          } else if (draft.status === "send_failed" && draft.retryEligible === true) {
            actions.append(
              actionButton(draft, "retry", "Retry send", "button-primary"),
            );
          }
          return actions;
        }

        function actionButton(draft, action, text, modifier) {
          const button = element("button", "button " + modifier, text);
          button.type = "button";
          button.dataset.action = action;
          button.dataset.draftId = draft.id;
          button.disabled = state.actionDraftId === draft.id;
          button.setAttribute(
            "aria-label",
            text + " draft: " + (draft.subjectPreview || draft.id),
          );
          return button;
        }

        async function performAction(draftId, action) {
          if (state.actionDraftId) {
            return;
          }
          const draft = state.drafts.find((item) => item.id === draftId);
          const path = actionPath(action);
          if (!draft || !path || !isActionAllowed(draft, action)) {
            setMessage(
              "warning",
              "That action is no longer available. Refresh the queue before continuing.",
            );
            announce("Action unavailable.");
            return;
          }

          state.actionDraftId = draftId;
          setDraftActionBusy(draftId);
          clearMessage();

          try {
            const response = await fetch(
              "/api/drafts/" + encodeURIComponent(draftId) + "/" + path,
              {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ version: draft.version }),
              },
            );

            if (response.status === 409) {
              const refreshed = await refreshDraft(draftId);
              hideDraftWhenRefreshFails(draftId, refreshed);
              const detail = refreshed
                ? " It is now " +
                  statusLabel(refreshed.status).toLowerCase() +
                  " at version " +
                  String(refreshed.version) +
                  "."
                : " The row could not be refreshed.";
              setMessage(
                "warning",
                "The draft state changed underneath you. The action was not retried." + detail,
              );
              announce(
                refreshed
                  ? "Draft state changed underneath you. The row was refreshed and the action was not retried."
                  : "Draft state changed underneath you. The row could not be refreshed, was hidden, and the action was not retried.",
              );
              return;
            }

            if (!response.ok) {
              const refreshed = await refreshDraft(draftId);
              hideDraftWhenRefreshFails(draftId, refreshed);
              if (response.status >= 500) {
                const detail = refreshed
                  ? " The row was refreshed and is now " +
                    statusLabel(refreshed.status).toLowerCase() +
                    " at version " +
                    String(refreshed.version) +
                    "."
                  : " The row could not be refreshed and was hidden until the queue is reloaded.";
                setMessage(
                  "error",
                  actionLabel(action) +
                    " returned HTTP " +
                    String(response.status) +
                    ". Its final state was uncertain, so no automatic retry was attempted." +
                    detail,
                );
                announce(
                  refreshed
                    ? "Action result was uncertain. The draft was refreshed and the action was not retried."
                    : "Action result was uncertain. The draft could not be refreshed, was hidden, and the action was not retried.",
                );
              } else {
                handleApiFailure(
                  response.status,
                  actionLabel(action) + " this draft",
                );
              }
              return;
            }

            const refreshed = await refreshDraft(draftId);
            hideDraftWhenRefreshFails(draftId, refreshed);
            if (!refreshed) {
              setMessage(
                "warning",
                actionLabel(action) +
                  " returned successfully, but the final row could not be refreshed. It was hidden until the queue is reloaded; no automatic retry was attempted.",
              );
              announce(
                "Action returned successfully, but the final draft state could not be refreshed.",
              );
              return;
            }
            const resultingStatus = statusLabel(refreshed.status).toLowerCase();
            setMessage(
              "success",
              actionLabel(action) + " completed. The draft is now " + resultingStatus + ".",
            );
            announce(
              actionLabel(action) + " completed. Draft status is " + resultingStatus + ".",
            );
          } catch {
            const refreshed = await refreshDraft(draftId);
            hideDraftWhenRefreshFails(draftId, refreshed);
            const detail = refreshed
              ? " The row was refreshed and is now " +
                statusLabel(refreshed.status).toLowerCase() +
                " at version " +
                String(refreshed.version) +
                "."
              : " The row could not be refreshed and was hidden until the queue is reloaded.";
            setMessage(
              "error",
              "The action request could not be completed. Its final state was uncertain, so no automatic retry was attempted." +
                detail,
            );
            announce(
              refreshed
                ? "Action request failed. The draft was refreshed and the action was not retried."
                : "Action request failed. The draft could not be refreshed, was hidden, and the action was not retried.",
            );
          } finally {
            state.actionDraftId = null;
            renderQueue();
            focusAfterAction(draftId);
          }
        }

        function setDraftActionBusy(draftId) {
          for (const card of queueList.querySelectorAll(
            "article[data-draft-id]",
          )) {
            if (card.dataset.draftId !== draftId) {
              continue;
            }
            card.setAttribute("aria-busy", "true");
            for (const button of card.querySelectorAll("button[data-action]")) {
              button.disabled = true;
            }
            return;
          }
        }

        function hideDraftWhenRefreshFails(draftId, refreshed) {
          if (refreshed) {
            return;
          }
          state.drafts = state.drafts.filter((draft) => draft.id !== draftId);
        }

        function focusAfterAction(draftId) {
          for (const card of queueList.querySelectorAll(
            "article[data-draft-id]",
          )) {
            if (card.dataset.draftId !== draftId) {
              continue;
            }
            const nextAction = card.querySelector(
              "button[data-action]:not(:disabled)",
            );
            if (nextAction instanceof HTMLButtonElement) {
              nextAction.focus();
              return;
            }
          }
          operatorMessage.focus();
        }

        async function refreshDraft(draftId) {
          try {
            const response = await fetch(
              "/api/drafts/" + encodeURIComponent(draftId),
              { headers: { Accept: "application/json" } },
            );
            if (!response.ok) {
              return null;
            }
            const payload = await response.json();
            if (!isQueueDraft(payload.draft)) {
              return null;
            }
            const draft = payload.draft;
            const currentIndex = state.drafts.findIndex((item) => item.id === draft.id);
            if (state.selectedStatuses.has(draft.status)) {
              if (currentIndex >= 0) {
                state.drafts.splice(currentIndex, 1, draft);
              } else {
                state.drafts.unshift(draft);
              }
            } else if (currentIndex >= 0) {
              state.drafts.splice(currentIndex, 1);
            }
            renderQueue();
            return draft;
          } catch {
            return null;
          }
        }

        function actionPath(action) {
          return ["approve", "reject", "send", "retry"].includes(action)
            ? action
            : null;
        }

        function isActionAllowed(draft, action) {
          return (
            (draft.status === "draft" && ["approve", "reject"].includes(action)) ||
            (draft.status === "approved" && action === "send") ||
            (draft.status === "send_failed" &&
              draft.retryEligible === true &&
              action === "retry")
          );
        }

        function actionLabel(action) {
          const labels = {
            approve: "Approval",
            reject: "Rejection",
            send: "Send",
            retry: "Retry",
          };
          return labels[action] || "Action";
        }

        function handleApiFailure(status, operation) {
          if (status === 403) {
            setMessage(
              "error",
              "You are signed in, but this account is not authorized to operate drafts. No message data was changed.",
            );
            announce("Not authorized to operate drafts.");
            return;
          }
          if (status === 401) {
            setMessage(
              "error",
              "Your operator session is unavailable. Re-authenticate before continuing.",
            );
            announce("Operator authentication is required.");
            return;
          }
          setMessage(
            "error",
            "Unable to " + operation + " (HTTP " + String(status) + "). No automatic retry was attempted.",
          );
          announce("Operation failed with HTTP status " + String(status) + ".");
        }

        function setLoading(loading) {
          state.loading = loading;
          queueRegion.setAttribute("aria-busy", loading ? "true" : "false");
          refreshButton.disabled = loading;
          loadMoreButton.disabled = loading;
        }

        function setMessage(tone, text) {
          operatorMessage.dataset.visible = "true";
          operatorMessage.dataset.tone = tone;
          operatorMessage.textContent = text;
        }

        function clearMessage() {
          operatorMessage.dataset.visible = "false";
          operatorMessage.dataset.tone = "info";
          operatorMessage.textContent = "";
        }

        function announce(text) {
          announcer.textContent = "";
          window.setTimeout(() => {
            announcer.textContent = text;
          }, 20);
        }

        function statusLabel(value) {
          return (
            allStatuses.find((status) => status.value === value)?.label ||
            "Unknown status"
          );
        }

        function formatAge(ageSeconds) {
          const seconds = Math.max(0, Math.floor(ageSeconds));
          if (seconds < 60) {
            return String(seconds) + "s";
          }
          const minutes = Math.floor(seconds / 60);
          if (minutes < 60) {
            return String(minutes) + "m";
          }
          const hours = Math.floor(minutes / 60);
          if (hours < 48) {
            return String(hours) + "h";
          }
          return String(Math.floor(hours / 24)) + "d";
        }

        function shortHash(value) {
          return value.length > 16
            ? value.slice(0, 12) + "…" + value.slice(-4)
            : value;
        }

        function safeDomId(value) {
          return value.replace(/[^A-Za-z0-9_-]/g, "-");
        }

        function element(tagName, className, text) {
          const value = document.createElement(tagName);
          if (className) {
            value.className = className;
          }
          if (text !== undefined) {
            value.textContent = text;
          }
          return value;
        }

        readSelectedStatuses();
        void fetchQueue(false);
      })();
    </script>
  </body>
</html>`;
}
