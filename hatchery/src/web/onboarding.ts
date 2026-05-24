import {
  CHANNEL_IDS,
  HATCHERY_MODULES,
} from 'parix-shared';

export function renderOnboardingHtml(aegisUiPort: number): string {
  const modelPresetsJson = JSON.stringify({
    openai: ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o1-preview'],
    anthropic: [
      'claude-3-5-sonnet-20240620',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307',
    ],
    groq: [
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ],
    google: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'],
    ollama: ['llama3.2', 'mistral', 'gemma2', 'phi3'],
    mistral: [
      'mistral-small-latest',
      'mistral-large-latest',
      'codestral-latest',
    ],
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parix Hatchery — Onboarding</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #07080e;
      --bg-slate: #0d0f1a;
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f4f6fb;
      --text-muted: #94a3b8;
      --neon-cyan: #06b6d4;
      --neon-purple: #8b5cf6;
      --neon-emerald: #10b981;
      --accent: var(--neon-cyan);
      --gradient-primary: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));
      --gradient-dark: linear-gradient(180deg, rgba(13, 15, 26, 0.8), rgba(7, 8, 14, 0.95));
      --card-bg: rgba(255, 255, 255, 0.02);
    }

    body.light-theme {
      --bg-dark: #f8fafc;
      --bg-slate: #ffffff;
      --border-color: rgba(0, 0, 0, 0.08);
      --text-main: #0f172a;
      --text-muted: #64748b;
      --card-bg: #f1f5f9;
      --gradient-dark: linear-gradient(180deg, #ffffff, #f8fafc);
    }

    * { box-sizing: border-box; }
    
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg-dark);
      background-image: radial-gradient(circle at 50% -20%, rgba(139, 92, 246, 0.12), transparent 70%);
      color: var(--text-main);
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 24px;
      transition: background-color 0.3s ease, color 0.3s ease;
    }

    main { width: min(1000px, 100%); margin: 0 auto; position: relative; }

    header { 
      display: flex; 
      align-items: center; 
      justify-content: space-between; 
      margin-bottom: 28px; 
    }

    .brand-text h1 { margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px; }

    .theme-toggle {
      display: flex;
      background: var(--bg-slate);
      border: 1px solid var(--border-color);
      border-radius: 30px;
      padding: 4px;
      gap: 4px;
    }

    .theme-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: none;
      background: transparent;
      color: var(--text-muted);
      transition: all 0.2s ease;
    }

    .theme-btn.active {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.3);
    }

    .shell { 
      background: var(--gradient-dark);
      backdrop-filter: blur(20px);
      border: 1px solid var(--border-color); 
      border-radius: 24px; 
      overflow: hidden; 
      box-shadow: 0 40px 80px rgba(0, 0, 0, 0.3);
      position: relative;
    }

    .steps { 
      display: grid; 
      grid-template-columns: repeat(5, 1fr); 
      background: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid var(--border-color); 
    }
    
    .step-tab { 
      padding: 20px; 
      color: var(--text-muted); 
      border-right: 1px solid var(--border-color); 
      font-size: 14px; 
      font-weight: 600; 
      text-align: center;
    }

    .step-tab.active { 
      color: var(--accent); 
      background: rgba(6, 182, 212, 0.05); 
      border-bottom: 2px solid var(--accent); 
    }

    .step-tab.completed {
      color: var(--neon-emerald);
    }

    form { padding: 40px; }
    
    .step { display: none; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
    .step.active { display: grid; animation: fadeIn 0.4s ease forwards; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .full { grid-column: 1 / -1; }
    
    label { display: grid; gap: 8px; color: var(--text-main); font-size: 14px; font-weight: 600; }
    label span.desc { font-weight: 400; color: var(--text-muted); font-size: 12px; margin-top: -2px; }

    input, select, textarea {
      width: 100%;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      background: var(--bg-slate);
      color: var(--text-main);
      padding: 14px;
      font: inherit;
      outline: none;
      transition: border-color 0.2s ease;
    }

    input:focus, select:focus, textarea:focus { border-color: var(--accent); }

    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
    
    .card-item {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px;
      cursor: pointer;
      text-align: center;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      font-weight: 600;
    }

    .card-item:hover { transform: translateY(-2px); border-color: var(--text-muted); }
    .card-item.selected { border-color: var(--accent); background: rgba(6, 182, 212, 0.05); box-shadow: 0 0 20px rgba(6, 182, 212, 0.1); }

    .actions { 
      display: flex; 
      justify-content: space-between; 
      padding: 32px 40px; 
      background: rgba(0, 0, 0, 0.02); 
      border-top: 1px solid var(--border-color); 
    }

    button { 
      border-radius: 14px; 
      padding: 16px 32px; 
      font-weight: 700; 
      cursor: pointer; 
      display: inline-flex; 
      align-items: center; 
      gap: 12px; 
      border: none;
      transition: all 0.2s ease;
    }

    button#next { background: var(--gradient-primary); color: #fff; box-shadow: 0 10px 20px rgba(6, 182, 212, 0.2); }
    button#next:hover { transform: translateY(-1px); box-shadow: 0 12px 24px rgba(6, 182, 212, 0.3); }
    
    button.secondary { background: var(--bg-slate); border: 1px solid var(--border-color); color: var(--text-main); }
    button.secondary:hover { background: var(--bg-dark); }

    #hatching-overlay { 
      position: absolute; 
      inset: 0; 
      background: var(--bg-dark); 
      z-index: 100; 
      display: none; 
      flex-direction: column; 
      align-items: center; 
      justify-content: center; 
    }

    /* Summary Styling */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    .summary-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 20px;
    }
    .summary-box h3 {
      margin-top: 0;
      color: var(--accent);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
      font-size: 16px;
    }
    .summary-box p {
      margin: 8px 0;
      font-size: 14px;
    }
    .summary-box strong {
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand-text">
        <h1 style="background: linear-gradient(to right, var(--neon-cyan), var(--neon-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Parix Hatchery</h1>
        <p style="color: var(--text-muted); margin: 4px 0 0;">Configure your premium proactive workstation agent</p>
      </div>
      <div class="theme-toggle">
        <button type="button" id="theme-dark" class="theme-btn active" title="Dark Mode">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        </button>
        <button type="button" id="theme-light" class="theme-btn" title="Light Mode">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="4.22" x2="19.78" y2="5.64"></line></svg>
        </button>
      </div>
    </header>

    <section class="shell">
      <div id="hatching-overlay">
        <h2 style="color: var(--neon-cyan); font-size: 32px; margin-bottom: 8px;">Hatching...</h2>
        <p style="color: var(--text-muted); font-size: 16px;">Configuring your proactive workspace agent's soul matrix</p>
      </div>

      <div class="steps">
        <div class="step-tab active">1. Identity</div>
        <div class="step-tab">2. Brain Engine</div>
        <div class="step-tab">3. Soul & Vibe</div>
        <div class="step-tab">4. Safety & Focus</div>
        <div class="step-tab">5. Verify & Launch</div>
      </div>

      <form id="form" onsubmit="return false;">
        <!-- Step 1: Identity -->
        <div class="step active">
          <label class="full">Mode
            <span class="desc">Define the operating context for this agent</span>
            <select name="mode" id="mode">
              <option value="personal">Personal Mode</option>
              <option value="enterprise">Enterprise Mode</option>
            </select>
          </label>
          <label>Your Name
            <span class="desc">What should the agent call you?</span>
            <input name="userName" placeholder="e.g. Suhas" value="Suhas">
          </label>
          <label>Agent Name
            <span class="desc">What should the agent call itself?</span>
            <input name="agentName" value="Parix" placeholder="e.g. Parix">
          </label>
          <label class="full">Your Role
            <span class="desc">Who are you? (A short description of your work/background)</span>
            <input name="userDescription" placeholder="e.g. Systems Engineer & Developer" value="Systems engineer & developer">
          </label>
          <label class="full">Relationship Label
            <span class="desc">Who am I to you?</span>
            <input name="relationshipLabel" value="personal agent" placeholder="e.g. personal agent">
          </label>
        </div>

        <!-- Step 2: Engine -->
        <div class="step">
          <div class="full">
            <label>LLM Provider
              <span class="desc">Select the default AI reasoning engine</span>
            </label>
            <div class="cards-grid" id="providers-grid">
              <div class="card-item" data-provider-val="openai">OpenAI</div>
              <div class="card-item" data-provider-val="anthropic">Anthropic</div>
              <div class="card-item" data-provider-val="google">Gemini</div>
              <div class="card-item" data-provider-val="ollama">Ollama</div>
              <div class="card-item" data-provider-val="mock">Mock</div>
            </div>
            <input type="hidden" name="provider" id="provider" value="mock">
          </div>
          <div class="full">
            <label>Model
              <span class="desc">Select or input the primary model</span>
              <input name="model" id="model" list="model-list" placeholder="Clean Slate (pick one)" value="mock">
            </label>
            <datalist id="model-list"></datalist>
            <button type="button" id="btn-cycle-models" class="secondary" style="margin-top: 12px; padding: 8px 16px; font-size: 13px;">✦ Cycle Presets</button>
          </div>
          <div id="auth-area" class="full">
            <div id="local-area" style="display:none;">
              <p id="local-text" style="color: var(--neon-emerald); font-weight: 500;">✓ Local endpoint default active.</p>
            </div>
            <div id="cloud-area" style="display:none; border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; background: rgba(0,0,0,0.1);">
              <label>API Key
                <span class="desc">Required to authenticate calls with cloud providers</span>
                <input name="apiKey" id="apiKey" type="password" placeholder="Paste your API key here (sk-...)">
              </label>
            </div>
          </div>
        </div>

        <!-- Step 3: Soul & Vibe -->
        <div class="step">
          <label>Vibe
            <span class="desc">What core vibe should I project?</span>
            <input name="vibe" value="warm, capable, proactive" placeholder="e.g. warm, capable, proactive">
          </label>
          <label>Personality
            <span class="desc">What personality traits should I exhibit?</span>
            <input name="personality" value="Friendly, direct, and useful without being pushy." placeholder="e.g. Friendly, direct...">
          </label>
          <label>Primary Tech Stack
            <span class="desc">Specify your main development technologies</span>
            <input name="techStack" value="TypeScript, Python, Node.js" placeholder="e.g. TypeScript, React, Python">
          </label>
          <label>Proactivity Level
            <span class="desc">How actively should I suggest improvements or fixes?</span>
            <select name="proactivity">
              <option value="proactive" selected>Proactive (Suggest improvements automatically)</option>
              <option value="balanced">Balanced (Suggest fixes for errors only)</option>
              <option value="reactive">Reactive (Only act when explicitly asked)</option>
            </select>
          </label>
          <label class="full">Communication Tone
            <span class="desc">How should I speak to you?</span>
            <select name="tone">
              <option value="friendly" selected>Friendly & Collaborative</option>
              <option value="professional">Professional & Concise</option>
              <option value="candid">Candid & Direct</option>
              <option value="philosophical">Philosophical & Deep</option>
            </select>
          </label>
        </div>

        <!-- Step 4: Safety & Focus -->
        <div class="step">
          <label class="full">What should I help you with?
            <span class="desc">Directives / core workflows to assist you with (comma separated)</span>
            <textarea name="primaryGoals" rows="2" placeholder="e.g. help with daily computer work, spot errors, suggest safe fixes">help with daily computer work, spot errors, suggest safe fixes</textarea>
          </label>
          <label class="full">Recurring tasks I should remember
            <span class="desc">Routine checks or scripts to run in the background (comma separated)</span>
            <textarea name="recurringTasks" rows="2" placeholder="e.g. check system health, verify build logs hourly">check system health</textarea>
          </label>
          <label class="full">Main Mission Objective
            <span class="desc">Summarize the ultimate high-level purpose of this agent</span>
            <textarea name="mainMission" rows="2" placeholder="e.g. Ensure seamless workstation diagnostics and proactive code compilation assistance">Optimize local development and system health monitoring.</textarea>
          </label>
          <label class="full">What should I never do?
            <span class="desc">Hard boundaries that will block automated execution (comma separated)</span>
            <textarea name="blockedActions" rows="2" placeholder="e.g. impersonate the user, spend money, delete personal data without approval">impersonate the user, spend money, delete personal data without approval</textarea>
          </label>
          <label class="full">What should require approval?
            <span class="desc">Sensory actions that must trigger permission popups (comma separated)</span>
            <textarea name="approvalRequiredActions" rows="2" placeholder="e.g. send external messages, delete data, change credentials, spend money, run destructive commands">send external messages, delete data, change credentials, spend money, run destructive commands</textarea>
          </label>
        </div>

        <!-- Step 5: Verify -->
        <div class="step">
          <div class="full" style="text-align: center; margin-bottom: 20px;">
            <h3 style="color: var(--neon-emerald); margin: 0 0 8px;">✓ Profile Setup Ready</h3>
            <p style="color: var(--text-muted); margin: 0;">Review your agent's operational parameters below before hatching.</p>
          </div>
          <div class="full summary-grid" id="summary-container">
            <!-- Programmatically populated -->
          </div>
        </div>
      </form>

      <div class="actions">
        <button type="button" class="secondary" id="back" disabled>Back</button>
        <button type="button" id="next">Next</button>
      </div>
    </section>
  </main>

  <script>
    const modelPresets = ${modelPresetsJson};
    let step = 0;
    const steps = [...document.querySelectorAll('.step')];
    const tabs = [...document.querySelectorAll('.step-tab')];
    const providerInput = document.getElementById('provider');
    const modelInput = document.getElementById('model');
    const modelList = document.getElementById('model-list');

    // Theme Switcher
    const b = document.body;
    const tL = document.getElementById('theme-light');
    const tD = document.getElementById('theme-dark');
    tL.onclick = () => { b.classList.add('light-theme'); tL.classList.add('active'); tD.classList.remove('active'); };
    tD.onclick = () => { b.classList.remove('light-theme'); tD.classList.add('active'); tL.classList.remove('active'); };

    function populateModelList(provider) {
      modelList.innerHTML = '';
      const list = modelPresets[provider] || [];
      list.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        modelList.appendChild(opt);
      });
      if (list.length > 0) {
        modelInput.value = list[0];
      } else {
        modelInput.value = provider === 'mock' ? 'mock' : '';
      }
    }

    function renderSummary() {
      const fd = new FormData(document.getElementById('form'));
      const html = \`
        <div class="summary-box">
          <h3>👤 Identity Matrix</h3>
          <p><strong>Operator:</strong> \${fd.get('userName') || 'Not Set'}</p>
          <p><strong>Agent Name:</strong> \${fd.get('agentName') || 'Parix'}</p>
          <p><strong>Your Role:</strong> \${fd.get('userDescription') || 'Not Set'}</p>
          <p><strong>Relationship:</strong> \${fd.get('relationshipLabel') || 'Not Set'}</p>
        </div>
        <div class="summary-box">
          <h3>🧠 Reasoning Engine</h3>
          <p><strong>LLM Provider:</strong> \${fd.get('provider').toUpperCase()}</p>
          <p><strong>Model:</strong> \${fd.get('model') || 'Default'}</p>
          <p><strong>Vibe:</strong> \${fd.get('vibe') || 'Not Set'}</p>
          <p><strong>Tone:</strong> \${fd.get('tone') || 'Friendly'}</p>
        </div>
        <div class="summary-box">
          <h3>🎯 Directives & Focus</h3>
          <p><strong>Main Mission:</strong> \${fd.get('mainMission') || 'Not Set'}</p>
          <p><strong>Directives:</strong> \${fd.get('primaryGoals') || 'Not Set'}</p>
          <p><strong>Recurring:</strong> \${fd.get('recurringTasks') || 'None'}</p>
        </div>
        <div class="summary-box">
          <h3>🛡️ Boundaries & Safety</h3>
          <p><strong>Blocked Actions:</strong> \${fd.get('blockedActions') || 'None'}</p>
          <p><strong>Requires Approval:</strong> \${fd.get('approvalRequiredActions') || 'None'}</p>
        </div>
      \`;
      document.getElementById('summary-container').innerHTML = html;
    }

    function render() {
      steps.forEach((s, i) => s.classList.toggle('active', i === step));
      tabs.forEach((t, i) => {
        t.classList.toggle('active', i === step);
        t.classList.toggle('completed', i < step);
      });
      document.getElementById('back').disabled = step === 0;
      document.getElementById('next').textContent = step === steps.length - 1 ? 'Hatch Parix' : 'Next';
      if (step === steps.length - 1) {
        renderSummary();
      }
    }

    document.querySelectorAll('.card-item').forEach(c => c.onclick = () => {
      document.querySelectorAll('.card-item').forEach(el => el.classList.remove('selected'));
      c.classList.add('selected');
      providerInput.value = c.dataset.providerVal;
      const v = providerInput.value;
      
      document.getElementById('cloud-area').style.display = (v === 'ollama' || v === 'mock') ? 'none' : 'block';
      document.getElementById('local-area').style.display = (v === 'ollama') ? 'block' : 'none';
      populateModelList(v);
    });

    document.getElementById('btn-cycle-models').onclick = () => {
      const list = modelPresets[providerInput.value] || [];
      if (list.length > 0) {
        const curIdx = list.indexOf(modelInput.value);
        modelInput.value = list[(curIdx + 1) % list.length];
      }
    };

    document.getElementById('next').onclick = async () => {
      if (step < steps.length - 1) {
        step++;
        render();
      } else {
        document.getElementById('hatching-overlay').style.display = 'flex';
        try {
          const fd = new FormData(document.getElementById('form'));
          const payload = Object.fromEntries(fd.entries());
          
          const res = await fetch('/api/onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (res.ok) {
            setTimeout(() => {
              window.location.href = data.dashboardUrl;
            }, 1800);
          } else {
            document.getElementById('hatching-overlay').style.display = 'none';
            alert('Hatching error: ' + (data.errors ? data.errors.join(', ') : 'Unknown error'));
          }
        } catch (err) {
          document.getElementById('hatching-overlay').style.display = 'none';
          alert('Network or backend error: ' + err);
        }
      }
    };

    document.getElementById('back').onclick = () => {
      step--;
      render();
    };

    // Initialize Card Select State
    document.querySelector('.card-item[data-provider-val="mock"]').click();
    render();
  </script>
</body>
</html>`;
}
