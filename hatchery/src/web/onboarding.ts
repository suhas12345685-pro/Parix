import { CHANNEL_IDS, DEFAULT_MODELS, HATCHERY_MODULES } from 'parix-shared';

const ENTERPRISE_CHANNELS = [
  'desktop',
  'webhook',
  'discord',
  'slack',
  'microsoft-teams',
  'google-chat',
  'whatsapp',
  'matrix',
  'line',
  'feishu',
  'mattermost',
  'nextcloud-talk',
  'synology-chat',
  'webchat',
  'voice-call',
  'wechat',
  'qq-bot',
  'zalo',
];

export function renderOnboardingHtml(aegisUiPort: number): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parix Hatchery</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0d0f14;
      color: #f5f7fb;
    }
    main { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 42px; line-height: 1; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 20px; letter-spacing: 0; }
    p { color: #b8c1d1; line-height: 1.55; }
    .shell { border: 1px solid #283244; border-radius: 8px; background: #141821; overflow: hidden; }
    .steps { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #283244; }
    .step-tab { padding: 14px 16px; color: #8f9aae; border-right: 1px solid #283244; font-size: 14px; }
    .step-tab:last-child { border-right: 0; }
    .step-tab.active { color: #fff; background: #1d2430; }
    form { padding: 22px; }
    .step { display: none; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .step.active { display: grid; }
    label, fieldset { display: grid; gap: 8px; color: #dce3ef; font-size: 14px; }
    fieldset { border: 1px solid #283244; border-radius: 8px; padding: 14px; }
    legend { color: #f5f7fb; padding: 0 6px; }
    input, select, textarea {
      width: 100%;
      border: 1px solid #334056;
      border-radius: 8px;
      background: #0f131b;
      color: #f5f7fb;
      padding: 11px 12px;
      font: inherit;
      outline: none;
    }
    input:focus, select:focus, textarea:focus { border-color: #4fb3d9; }
    textarea { min-height: 86px; resize: vertical; }
    .full { grid-column: 1 / -1; }
    .personal, .enterprise { display: none; }
    .intro { border: 1px solid #2f3c52; border-radius: 8px; background: #10151e; padding: 16px; white-space: pre-wrap; color: #dce3ef; }
    .check-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .check { display: flex; gap: 8px; align-items: center; color: #dce3ef; }
    .check input { width: auto; }
    .actions { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid #283244; padding: 16px 22px; }
    button {
      border: 1px solid #4fb3d9;
      border-radius: 8px;
      background: #2a84a8;
      color: white;
      padding: 11px 16px;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary { background: #10151e; border-color: #334056; color: #dce3ef; }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    #status { min-height: 24px; color: #68d7a7; }
    .hint { color: #8f9aae; font-size: 13px; }
    .summary { display: grid; gap: 10px; border: 1px solid #2f3c52; border-radius: 8px; background: #10151e; padding: 16px; }
    .summary div { display: grid; grid-template-columns: 180px 1fr; gap: 12px; }
    .summary strong { color: #f5f7fb; }
    @media (max-width: 800px) {
      header, .actions { flex-direction: column; align-items: stretch; }
      .steps, .step, .check-grid { grid-template-columns: 1fr; }
      .summary div { grid-template-columns: 1fr; gap: 4px; }
      form { padding: 16px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Parix Hatchery</h1>
        <p>Create the active agent identity, role, memory boundaries, approval rules, channels, and lazy worker modules.</p>
      </div>
      <p class="hint">Dashboard port: ${aegisUiPort}</p>
    </header>
    <section class="shell">
      <div class="steps">
        <div class="step-tab active">1. Identity</div>
        <div class="step-tab">2. Channels</div>
        <div class="step-tab">3. Rules</div>
        <div class="step-tab">4. Summary</div>
      </div>
      <form id="form">
        <div class="step active">
          <label>Mode
            <select name="mode" id="mode">
              <option value="personal">Personal</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label>Agent name
            <input name="agentName" value="Parix" autocomplete="off">
          </label>
          <div class="intro full personal" id="personalIntro"></div>
          <div class="intro full enterprise" id="enterpriseIntro"></div>
          <label class="personal">Who are you?
            <input name="userDescription" placeholder="developer, founder, operator">
          </label>
          <label class="personal">Who am I to you?
            <input name="relationshipLabel" placeholder="personal agent, co-pilot, assistant">
          </label>
          <label class="personal">What should I call you?
            <input name="userName" autocomplete="name">
          </label>
          <label class="personal">Vibe
            <input name="vibe" placeholder="warm, precise, funny, calm">
          </label>
          <label class="personal full">Personality
            <textarea name="personality" placeholder="How Parix should feel when it talks and works with you"></textarea>
          </label>
          <label class="personal full">Main goals
            <textarea name="primaryGoals" placeholder="Comma-separated goals"></textarea>
          </label>
          <label class="personal full">Recurring tasks
            <textarea name="recurringTasks" placeholder="Comma-separated routines"></textarea>
          </label>

          <label class="enterprise">Company name
            <input name="companyName">
          </label>
          <label class="enterprise">Team name
            <input name="teamName">
          </label>
          <label class="enterprise">Agent role
            <input name="roleTitle" value="IT Support Agent">
          </label>
          <label class="enterprise">Reports to
            <input name="reportingTo">
          </label>
          <label class="enterprise full">Role description
            <textarea name="roleDescription" placeholder="How this digital co-worker should operate"></textarea>
          </label>
          <label class="enterprise full">Responsibilities
            <textarea name="responsibilities" placeholder="Comma-separated responsibilities"></textarea>
          </label>
          <label class="enterprise full">Recurring tasks
            <textarea name="enterpriseRecurringTasks" placeholder="Comma-separated recurring tasks"></textarea>
          </label>
          <label class="enterprise full">Channels/tools to join
            <textarea name="allowedTools" placeholder="Slack, Teams, Gmail, GitHub, CRM"></textarea>
          </label>
        </div>

        <div class="step">
          <label>LLM provider
            <select name="provider" id="provider">${providerOptions()}</select>
          </label>
          <label>Model
            <input name="model" id="model" value="${DEFAULT_MODELS.openai}" autocomplete="off">
          </label>
          <label>API key or local endpoint (optional)
            <input name="apiKey" type="password" autocomplete="off">
          </label>
          <label>Aegis wake word
            <input name="wakeWord" value="aegis" autocomplete="off">
          </label>
          <fieldset class="full">
            <legend>Enabled channels</legend>
            <p class="hint">Aegis is always enabled. Enterprise channels are limited to official connected integrations.</p>
            <div id="channels" class="check-grid"></div>
          </fieldset>
        </div>

        <div class="step">
          <label class="enterprise full">What can the agent do automatically?
            <textarea name="automaticActions" placeholder="local diagnostics, draft summaries, monitor logs"></textarea>
          </label>
          <label class="full">What needs human approval?
            <textarea name="approvalRequiredActions" placeholder="send external messages, delete data, spend money, change production systems"></textarea>
          </label>
          <label class="full">What must the agent never do?
            <textarea name="blockedActions" placeholder="impersonate a human, use unofficial access, destructive actions"></textarea>
          </label>
          <fieldset class="personal">
            <legend>Personal memory</legend>
            <label class="check"><input type="checkbox" name="rememberUserPreferences" value="true" checked> Remember preferences</label>
            <label class="check"><input type="checkbox" name="rememberProjectContext" value="true" checked> Remember project context</label>
            <label class="check"><input type="checkbox" name="rememberPersonalContext" value="true"> Remember personal context</label>
          </fieldset>
          <fieldset class="enterprise">
            <legend>Enterprise memory boundaries</legend>
            <label class="check"><input type="checkbox" name="companyMemory" value="true" checked> Company memory</label>
            <label class="check"><input type="checkbox" name="teamMemory" value="true" checked> Team memory</label>
            <label class="check"><input type="checkbox" name="customerDataMemory" value="true"> Customer data memory</label>
          </fieldset>
          <fieldset class="full">
            <legend>Enabled Hatchery modules</legend>
            <p class="hint">Selected modules are enabled but lazy-loaded only when Parix needs them.</p>
            <div id="modules" class="check-grid"></div>
          </fieldset>
        </div>

        <div class="step">
          <div id="summary" class="summary full"></div>
          <p id="status" class="full"></p>
        </div>
      </form>
      <div class="actions">
        <button type="button" class="secondary" id="back" disabled>Back</button>
        <button type="button" id="next">Next</button>
      </div>
    </section>
  </main>
  <script>
    const providerDefaults = ${JSON.stringify(DEFAULT_MODELS)};
    const channels = ${JSON.stringify(CHANNEL_IDS.filter((id) => id !== 'aegis'))};
    const enterpriseChannels = ${JSON.stringify(ENTERPRISE_CHANNELS)};
    const modules = ${JSON.stringify(HATCHERY_MODULES)};
    const personalIntro = \`Hey, I came online.

Set my vibe.

Tell me:
- Who are you?
- Who am I to you?
- What should I call you?
- What personality/vibe should I have?
- What should I help you with?
- What should I never do?
- Which channels can I use?
- What should I remember?\`;
    const enterpriseIntro = \`Hey, I came online.

Tell me my role, my tasks, my channels, company name, team, and approval rules so I can work like a co-worker with your team.\`;
    let step = 0;
    const tabs = [...document.querySelectorAll('.step-tab')];
    const steps = [...document.querySelectorAll('.step')];
    const back = document.querySelector('#back');
    const next = document.querySelector('#next');
    const mode = document.querySelector('#mode');
    const provider = document.querySelector('#provider');
    const model = document.querySelector('#model');
    const status = document.querySelector('#status');
    document.querySelector('#personalIntro').textContent = personalIntro;
    document.querySelector('#enterpriseIntro').textContent = enterpriseIntro;

    function render() {
      tabs.forEach((el, i) => el.classList.toggle('active', i === step));
      steps.forEach((el, i) => el.classList.toggle('active', i === step));
      back.disabled = step === 0;
      next.textContent = step === steps.length - 1 ? 'Save Profile And Start Parix' : 'Next';
      if (step === steps.length - 1) renderSummary();
    }
    function syncMode() {
      const enterprise = mode.value === 'enterprise';
      document.querySelectorAll('.enterprise').forEach((el) => el.style.display = enterprise ? 'grid' : 'none');
      document.querySelectorAll('.personal').forEach((el) => el.style.display = enterprise ? 'none' : 'grid');
      renderChannels();
      renderModules();
    }
    function renderChannels() {
      const enterprise = mode.value === 'enterprise';
      const list = enterprise ? channels.filter((id) => enterpriseChannels.includes(id)) : channels;
      document.querySelector('#channels').innerHTML = list.map((id) => (
        '<label class="check"><input type="checkbox" name="enabledChannels" value="' + escapeHtml(id) + '"> ' + escapeHtml(id) + '</label>'
      )).join('');
    }
    function renderModules() {
      const enterprise = mode.value === 'enterprise';
      document.querySelector('#modules').innerHTML = modules.map((module) => {
        const checked = enterprise ? module.defaultEnterprise : module.defaultPersonal;
        const label = enterprise && module.id === 'audit-logger' ? module.label + ' (required)' : module.label;
        return '<label class="check"><input type="checkbox" name="enabledModules" value="' + escapeHtml(module.id) + '"' + (checked ? ' checked' : '') + '> ' + escapeHtml(label) + '</label>';
      }).join('');
    }
    function formData() {
      const form = document.querySelector('#form');
      const data = Object.fromEntries(new FormData(form).entries());
      const fd = new FormData(form);
      data.enabledChannels = fd.getAll('enabledChannels');
      data.enabledModules = fd.getAll('enabledModules');
      return data;
    }
    async function submit() {
      status.textContent = 'Saving profile and starting Parix...';
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData())
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        status.style.color = '#f2a6b3';
        status.textContent = (payload.errors || ['Setup failed']).join('; ');
        return;
      }
      status.style.color = '#68d7a7';
      status.textContent = 'Profile saved. Starting Parix and opening Aegis...';
      setTimeout(() => { window.location.href = payload.dashboardUrl || '/'; }, 2500);
    }
    function renderSummary() {
      const data = formData();
      const enterprise = data.mode === 'enterprise';
      const rows = enterprise
        ? [
            ['Mode', 'Enterprise'],
            ['Company name', data.companyName || 'not set'],
            ['Team', data.teamName || 'not set'],
            ['Agent name', data.agentName || 'Parix'],
            ['Role', data.roleTitle || 'not set'],
            ['Responsibilities', data.responsibilities || 'none'],
            ['Connected LLM', data.provider || 'openai'],
            ['Connected model', data.model || providerDefaults[data.provider] || 'not set'],
            ['Enabled channels', formatList(['aegis'].concat(data.enabledChannels || []))],
            ['Approval rules', data.approvalRequiredActions || 'none'],
            ['Audit logging status', 'enabled'],
            ['Enabled Hatchery modules', formatList(data.enabledModules || [])]
          ]
        : [
            ['Mode', 'Personal'],
            ['User name', data.userName || 'not set'],
            ['Agent name', data.agentName || 'Parix'],
            ['Vibe', data.vibe || 'not set'],
            ['Main goals', data.primaryGoals || 'none'],
            ['Connected LLM', data.provider || 'openai'],
            ['Connected model', data.model || providerDefaults[data.provider] || 'not set'],
            ['Enabled channels', formatList(['aegis'].concat(data.enabledChannels || []))],
            ['Enabled Hatchery modules', formatList(data.enabledModules || [])],
            ['Approval rules', data.approvalRequiredActions || 'none']
          ];
      document.querySelector('#summary').innerHTML = rows.map(([key, value]) =>
        '<div><strong>' + escapeHtml(key) + '</strong><span>' + escapeHtml(value) + '</span></div>'
      ).join('');
    }
    function formatList(values) {
      const list = Array.isArray(values) ? values.filter(Boolean) : [];
      return list.length ? list.join(', ') : 'none';
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]);
    }
    provider.addEventListener('change', () => {
      model.value = providerDefaults[provider.value] || model.value;
    });
    mode.addEventListener('change', syncMode);
    back.addEventListener('click', () => { step = Math.max(0, step - 1); render(); });
    next.addEventListener('click', () => {
      if (step < steps.length - 1) {
        step += 1;
        render();
        return;
      }
      submit();
    });
    syncMode();
    render();
  </script>
</body>
</html>`;
}

function providerOptions(): string {
  return Object.keys(DEFAULT_MODELS)
    .map((provider) => `<option value="${provider}">${provider}</option>`)
    .join('');
}
