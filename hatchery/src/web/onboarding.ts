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
  <title>Parix Hatchery — Onboarding</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-dark: #07080e;
      --bg-slate: #0d0f1a;
      --border-color: rgba(255, 255, 255, 0.08);
      --border-glow: rgba(6, 182, 212, 0.25);
      --text-main: #f4f6fb;
      --text-muted: #94a3b8;
      
      --neon-cyan: #06b6d4;
      --neon-purple: #8b5cf6;
      --neon-pink: #ec4899;
      --neon-emerald: #10b981;
      
      --gradient-primary: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));
      --gradient-dark: linear-gradient(180deg, rgba(13, 15, 26, 0.8), rgba(7, 8, 14, 0.95));
      --glow-cyan: 0 0 15px rgba(6, 182, 212, 0.3);
      --glow-purple: 0 0 15px rgba(139, 92, 246, 0.3);
      --glow-emerald: 0 0 15px rgba(16, 185, 129, 0.3);
    }

    * { box-sizing: border-box; }
    
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(circle at 50% -20%, rgba(139, 92, 246, 0.18), transparent 70%),
        radial-gradient(circle at 10% 40%, rgba(6, 182, 212, 0.08), transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(236, 72, 153, 0.05), transparent 40%),
        linear-gradient(rgba(255, 255, 255, 0.007) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.007) 1px, transparent 1px);
      background-size: 100% 100%, 100% 100%, 100% 100%, 40px 40px, 40px 40px;
      color: var(--text-main);
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 24px;
      overflow-x: hidden;
    }

    main { 
      width: min(1000px, 100%); 
      margin: 0 auto; 
      position: relative;
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    header { 
      display: flex; 
      align-items: center; 
      justify-content: space-between; 
      gap: 24px; 
      margin-bottom: 28px;
      position: relative;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand-logo {
      width: 52px;
      height: 52px;
      border-radius: 12px;
      background: var(--gradient-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--glow-cyan);
      position: relative;
    }

    .brand-logo::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 14px;
      background: var(--gradient-primary);
      z-index: -1;
      opacity: 0.5;
      filter: blur(8px);
    }

    .brand-logo svg {
      width: 28px;
      height: 28px;
      fill: #fff;
    }

    .brand-text h1 { 
      margin: 0; 
      font-size: 32px; 
      font-weight: 800; 
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #ffffff 40%, #a5b4fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .brand-text p {
      margin: 4px 0 0;
      font-size: 14px;
      color: var(--text-muted);
    }

    .meta-badge {
      background: rgba(6, 182, 212, 0.08);
      border: 1px solid rgba(6, 182, 212, 0.2);
      border-radius: 20px;
      padding: 6px 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--neon-cyan);
      box-shadow: inset 0 0 6px rgba(6, 182, 212, 0.1);
    }

    /* Core container */
    .shell { 
      background: var(--gradient-dark);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-color); 
      border-radius: 20px; 
      overflow: hidden; 
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05);
      position: relative;
    }

    .shell::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.5), transparent);
    }

    /* Steps */
    .steps { 
      display: grid; 
      grid-template-columns: repeat(4, 1fr); 
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--border-color); 
    }
    
    .step-tab { 
      padding: 18px 24px; 
      color: var(--text-muted); 
      border-right: 1px solid var(--border-color); 
      font-size: 14px; 
      font-weight: 600;
      text-align: center;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: default;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    
    .step-tab:last-child { border-right: 0; }
    
    .step-tab.active { 
      color: #fff; 
      background: rgba(139, 92, 246, 0.08); 
      border-bottom: 2px solid var(--neon-purple);
      box-shadow: inset 0 -4px 12px rgba(139, 92, 246, 0.05);
    }

    .step-tab.completed {
      color: var(--neon-cyan);
    }

    .step-tab-num {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: inherit;
      transition: all 0.3s ease;
    }

    .step-tab.active .step-tab-num {
      background: var(--neon-purple);
      border-color: var(--neon-purple);
      color: #fff;
      box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
    }

    .step-tab.completed .step-tab-num {
      background: var(--neon-cyan);
      border-color: var(--neon-cyan);
      color: #07080e;
      box-shadow: 0 0 8px rgba(6, 182, 212, 0.5);
    }

    /* Form and Fields */
    form { padding: 36px; }
    
    .step { 
      display: none; 
      grid-template-columns: repeat(2, minmax(0, 1fr)); 
      gap: 24px; 
    }
    
    .step.active { 
      display: grid; 
      animation: tabSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .full { grid-column: 1 / -1; }
    
    .intro { 
      border: 1px solid rgba(139, 92, 246, 0.15); 
      border-radius: 12px; 
      background: rgba(139, 92, 246, 0.02); 
      padding: 20px; 
      white-space: pre-wrap; 
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.6;
      box-shadow: inset 0 0 15px rgba(139, 92, 246, 0.02);
    }
    
    .personal, .enterprise { display: none; }
    
    label, fieldset { 
      display: grid; 
      gap: 8px; 
      color: #e2e8f0; 
      font-size: 14px; 
      font-weight: 500;
    }

    fieldset { 
      border: 1px solid var(--border-color); 
      border-radius: 12px; 
      padding: 20px; 
      background: rgba(0, 0, 0, 0.15);
    }
    
    legend { 
      color: #fff; 
      padding: 0 10px; 
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .form-group-title {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      margin: 8px 0 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    input, select, textarea {
      width: 100%;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.35);
      color: #fff;
      padding: 14px 16px;
      font: inherit;
      font-size: 14px;
      outline: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
    }
    
    input::placeholder, textarea::placeholder {
      color: rgba(255, 255, 255, 0.25);
    }

    input:focus, select:focus, textarea:focus { 
      border-color: var(--neon-cyan); 
      box-shadow: var(--glow-cyan), inset 0 2px 4px rgba(0,0,0,0.2);
      background: rgba(0, 0, 0, 0.5);
    }
    
    textarea { min-height: 100px; resize: vertical; line-height: 1.5; }

    /* Custom Mode Toggle Switch */
    .mode-select-container {
      display: flex;
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 4px;
      width: fit-content;
      position: relative;
    }

    .mode-option {
      padding: 10px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      color: var(--text-muted);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mode-option.active {
      background: var(--gradient-primary);
      color: #fff;
      box-shadow: 0 4px 12px rgba(6, 182, 212, 0.25);
    }

    /* Grid layout for custom cards */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
      width: 100%;
    }

    .card-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-align: center;
      position: relative;
      user-select: none;
    }

    .card-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }

    .card-item.selected {
      background: rgba(6, 182, 212, 0.05);
      border-color: var(--neon-cyan);
      box-shadow: inset 0 0 12px rgba(6, 182, 212, 0.08), var(--glow-cyan);
    }

    .card-item.selected::before {
      content: '';
      position: absolute;
      top: 8px;
      right: 8px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--neon-cyan);
      box-shadow: 0 0 6px rgba(6, 182, 212, 0.5);
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
      background-size: 10px;
      background-repeat: no-repeat;
      background-position: center;
    }

    .card-icon {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    }

    .card-item.selected .card-icon {
      background: rgba(6, 182, 212, 0.15);
      color: var(--neon-cyan);
    }

    .card-icon svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
    }

    /* Checkbox & Switch Lists */
    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }

    .switch-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
    }

    .switch-label:hover {
      background: rgba(255, 255, 255, 0.02);
      border-color: rgba(255, 255, 255, 0.12);
    }

    .switch-label.checked {
      border-color: rgba(139, 92, 246, 0.3);
      background: rgba(139, 92, 246, 0.03);
    }

    .switch-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .switch-text {
      font-weight: 600;
      color: #fff;
    }

    .switch-desc {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Visual Toggle Switch */
    .switch-control {
      position: relative;
      width: 40px;
      height: 22px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .switch-control::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    input[type="checkbox"]:checked + .switch-control {
      background: var(--neon-purple);
      box-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
    }

    input[type="checkbox"]:checked + .switch-control::after {
      transform: translateX(18px);
    }

    /* Actions Panel */
    .actions { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      gap: 16px; 
      border-top: 1px solid var(--border-color); 
      padding: 24px 36px;
      background: rgba(0, 0, 0, 0.25);
    }
    
    button {
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      letter-spacing: 0.2px;
    }

    button#next {
      background: var(--gradient-primary);
      color: #fff;
      box-shadow: 0 4px 15px rgba(6, 182, 212, 0.25);
    }

    button#next:hover:not(:disabled) {
      box-shadow: 0 6px 20px rgba(6, 182, 212, 0.4);
      transform: translateY(-1px);
    }

    button.secondary { 
      background: rgba(255, 255, 255, 0.03); 
      border: 1px solid var(--border-color); 
      color: #e2e8f0; 
    }

    button.secondary:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    
    button:disabled { 
      cursor: not-allowed; 
      opacity: 0.25; 
      transform: none !important;
      box-shadow: none !important;
    }

    /* Summary display */
    .summary { 
      display: grid; 
      gap: 14px; 
      border: 1px solid var(--border-color); 
      border-radius: 12px; 
      background: rgba(0,0,0,0.25); 
      padding: 24px; 
    }
    
    .summary div { 
      display: grid; 
      grid-template-columns: 200px 1fr; 
      gap: 16px; 
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      padding-bottom: 10px;
    }

    .summary div:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    
    .summary strong { 
      color: #cbd5e1; 
      font-size: 14px; 
      font-weight: 600;
    }

    .summary span {
      color: #fff;
      font-size: 14px;
      font-weight: 500;
    }

    .hint { 
      color: var(--text-muted); 
      font-size: 13px; 
      line-height: 1.5;
    }

    /* Hatching holographic screen overlay */
    #hatching-overlay {
      position: absolute;
      inset: 0;
      background: #06070a;
      z-index: 100;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      text-align: center;
    }

    .hatching-core {
      position: relative;
      width: 160px;
      height: 160px;
      margin-bottom: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .pulsing-ring {
      position: absolute;
      inset: 0;
      border: 3px solid transparent;
      border-top-color: var(--neon-cyan);
      border-bottom-color: var(--neon-purple);
      border-radius: 50%;
      animation: spinRing 2s linear infinite;
    }

    .pulsing-ring::before {
      content: '';
      position: absolute;
      inset: 8px;
      border: 2px solid transparent;
      border-left-color: var(--neon-pink);
      border-right-color: var(--neon-cyan);
      border-radius: 50%;
      animation: spinRingBack 1.5s linear infinite;
    }

    .incubator-sphere {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #06b6d4 0%, #7c3aed 70%, #000 100%);
      box-shadow: 0 0 40px rgba(6, 182, 212, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.3);
      animation: spherePulse 2s ease-in-out infinite alternate;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .incubator-sphere svg {
      width: 44px;
      height: 44px;
      fill: #fff;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
    }

    .hatching-headline {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0 0 10px;
      background: linear-gradient(135deg, #fff, #a5b4fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hatching-sub {
      color: var(--text-muted);
      font-size: 14px;
      margin: 0 0 30px;
    }

    /* Matrix loading log terminal */
    .hatching-terminal {
      width: 100%;
      max-width: 600px;
      background: rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(6, 182, 212, 0.2);
      border-radius: 12px;
      padding: 20px;
      text-align: left;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
      height: 200px;
      overflow-y: auto;
      box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.8), 0 0 20px rgba(6, 182, 212, 0.05);
      color: #a7f3d0;
    }

    .hatching-terminal::-webkit-scrollbar {
      width: 6px;
    }
    .hatching-terminal::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.1);
    }
    .hatching-terminal::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }

    .log-line {
      margin-bottom: 6px;
      opacity: 0;
      transform: translateY(6px);
      animation: logLineIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .log-line.success { color: var(--neon-emerald); }
    .log-line.system { color: var(--neon-cyan); }
    .log-line.warn { color: #f59e0b; }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes tabSlideIn {
      from { opacity: 0; transform: translateX(8px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes logLineIn {
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes spinRing {
      to { transform: rotate(360deg); }
    }

    @keyframes spinRingBack {
      to { transform: rotate(-360deg); }
    }

    @keyframes spherePulse {
      0% { transform: scale(0.96); box-shadow: 0 0 30px rgba(6, 182, 212, 0.35); }
      100% { transform: scale(1.04); box-shadow: 0 0 50px rgba(139, 92, 246, 0.55); }
    }

    @media (max-width: 800px) {
      header { flex-direction: column; align-items: flex-start; gap: 14px; }
      .steps { grid-template-columns: 1fr; }
      .step-tab { border-right: 0; border-bottom: 1px solid var(--border-color); }
      .step-tab:last-child { border-bottom: 0; }
      .step { grid-template-columns: 1fr; }
      .summary div { grid-template-columns: 1fr; gap: 4px; }
      form { padding: 24px; }
      .actions { padding: 20px 24px; flex-direction: column; align-items: stretch; }
      button { justify-content: center; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>
        <div class="brand-text">
          <h1>Parix Hatchery</h1>
          <p>Initialize cognitive agent core configurations, active memory scopes, and modules.</p>
        </div>
      </div>
      <span class="meta-badge">Dashboard port: ${aegisUiPort}</span>
    </header>

    <section class="shell">
      <!-- Hatching screen overlay -->
      <div id="hatching-overlay">
        <div class="hatching-core">
          <div class="pulsing-ring"></div>
          <div class="incubator-sphere">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
        </div>
        <h2 class="hatching-headline">Hatching Sequence Commenced</h2>
        <p class="hatching-sub">Synchronizing modules, starting background services and registering active memory cells...</p>
        <div class="hatching-terminal" id="terminal-logs"></div>
      </div>

      <div class="steps">
        <div class="step-tab active" data-step="0">
          <div class="step-tab-num">1</div>
          Identity
        </div>
        <div class="step-tab" data-step="1">
          <div class="step-tab-num">2</div>
          Model & Channels
        </div>
        <div class="step-tab" data-step="2">
          <div class="step-tab-num">3</div>
          Rules & Memory
        </div>
        <div class="step-tab" data-step="3">
          <div class="step-tab-num">4</div>
          Summary
        </div>
      </div>

      <form id="form">
        <!-- Step 1: Identity -->
        <div class="step active">
          <div class="full">
            <label>Operating Mode</label>
            <div class="mode-select-container">
              <div class="mode-option active" data-mode="personal">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                Personal
              </div>
              <div class="mode-option" data-mode="enterprise">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                Enterprise
              </div>
            </div>
            <input type="hidden" name="mode" id="mode" value="personal">
          </div>

          <label class="personal">Your Name / Handle
            <input name="userName" id="userName" placeholder="e.g. Suhas" autocomplete="name">
          </label>

          <label>Agent Name
            <input name="agentName" id="agentName" value="Parix" placeholder="Parix" autocomplete="off">
          </label>

          <div class="intro full personal" id="personalIntro"></div>
          <div class="intro full enterprise" id="enterpriseIntro"></div>

          <label class="personal">Who are you?
            <input name="userDescription" placeholder="e.g. developer, founder, systems engineer">
          </label>
          <label class="personal">Who am I to you?
            <input name="relationshipLabel" placeholder="e.g. co-pilot, virtual assistant, partner">
          </label>
          <label class="personal">Voice / Conversational Vibe
            <input name="vibe" placeholder="e.g. precise, dry wit, highly technical, warm">
          </label>
          <label class="personal full">Agent Personality Blueprint
            <textarea name="personality" placeholder="How Parix should conduct itself when thinking, debugging, or chatting. Define tone, depth of technical explanation, humor level, etc."></textarea>
          </label>
          <label class="personal full">Core Directives / Main Goals
            <textarea name="primaryGoals" placeholder="What are the highest priorities for Parix? (e.g. monitor compilation errors, suggest fixes, draft changelogs)"></textarea>
          </label>
          <label class="personal full">Routines / Recurring Duties
            <textarea name="recurringTasks" placeholder="Comma-separated habits or routines (e.g. check system health, verify build logs hourly)"></textarea>
          </label>

          <!-- Enterprise Specific Fields -->
          <label class="enterprise">Company Entity Name
            <input name="companyName" placeholder="e.g. Parix Corp">
          </label>
          <label class="enterprise">Team / Department
            <input name="teamName" placeholder="e.g. IT Operations">
          </label>
          <label class="enterprise">Role Title / Designation
            <input name="roleTitle" value="IT Support Agent" placeholder="IT Support Agent">
          </label>
          <label class="enterprise">Direct Supervisor / Reporting Entity
            <input name="reportingTo" placeholder="e.g. Ops Lead">
          </label>
          <label class="enterprise full">Co-worker Role Specification
            <textarea name="roleDescription" placeholder="How this automated team member should operate inside corporate bounds and code repos."></textarea>
          </label>
          <label class="enterprise full">Explicit Responsibilities
            <textarea name="responsibilities" placeholder="List distinct corporate duties (e.g. verify PR sanity, scan dependencies, monitor staging health)"></textarea>
          </label>
          <label class="enterprise full">Recurring Task Cycles
            <textarea name="enterpriseRecurringTasks" placeholder="List periodic duties or check cycles."></textarea>
          </label>
          <label class="enterprise full">Authorized Systems & Environments
            <textarea name="allowedTools" placeholder="Approved tools to integrate with (e.g. Slack, Teams, GitHub, Jira, AWS)"></textarea>
          </label>
        </div>

        <!-- Step 2: Model & Channels -->
        <div class="step">
          <div class="full">
            <div class="form-group-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--neon-cyan)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              LLM Provider Core Configuration
            </div>
            <p class="hint" style="margin-bottom: 16px;">Select the cognitive core that drives Parix's reasoning engine.</p>
            
            <div class="cards-grid" id="providers-grid">
              <!-- Ollama Card -->
              <div class="card-item" data-provider-val="ollama">
                <div class="card-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.5 13.5h-3c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h3c.28 0 .5.22.5.5s-.22.5-.5.5zm0-2h-3c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h3c.28 0 .5.22.5.5s-.22.5-.5.5zm1.5-2H9c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1z"/>
                  </svg>
                </div>
                <span class="card-title">Ollama</span>
              </div>
              <!-- OpenAI Card -->
              <div class="card-item" data-provider-val="openai">
                <div class="card-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 12h-2c-.55 0-1-.45-1-1v-2c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1z"/>
                  </svg>
                </div>
                <span class="card-title">OpenAI</span>
              </div>
              <!-- Anthropic Card -->
              <div class="card-item" data-provider-val="anthropic">
                <div class="card-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-4h2v4zm0-6h-2V8h2v2z"/>
                  </svg>
                </div>
                <span class="card-title">Anthropic</span>
              </div>
              <!-- DeepSeek Card -->
              <div class="card-item" data-provider-val="deepseek">
                <div class="card-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 8H8V8h8v2z"/>
                  </svg>
                </div>
                <span class="card-title">DeepSeek</span>
              </div>
            </div>
            
            <select name="provider" id="provider" style="display: none;">${providerOptions()}</select>
          </div>

          <label>Inference Model
            <input name="model" id="model" value="${DEFAULT_MODELS.openai}" autocomplete="off" placeholder="e.g. gpt-4o-mini, gpt-oss:120b-cloud">
          </label>

          <label>API Key / Endpoint Reference
            <input name="apiKey" id="apiKey" type="password" autocomplete="off" placeholder="Optional for local / Override config key">
          </label>

          <label>Aegis Wake Activation Phrase
            <input name="wakeWord" value="aegis" autocomplete="off" placeholder="aegis">
          </label>

          <fieldset class="full">
            <legend>Enabled Communication Channels</legend>
            <p class="hint" style="margin-bottom: 16px;">Aegis UI and local terminals are always enabled. Check other endpoints to allow communication.</p>
            
            <div id="channels" class="cards-grid"></div>
          </fieldset>
        </div>

        <!-- Step 3: Rules & Autonomy -->
        <div class="step">
          <label class="enterprise full">Authorized Systems Actions (Autonomous)
            <textarea name="automaticActions" placeholder="e.g. execute local repository diagnostics, draft local logs, bundle summary updates"></textarea>
          </label>

          <label class="full">Actions Requiring Human Consent
            <textarea name="approvalRequiredActions" placeholder="e.g. push code changes to remote main branch, delete staging data, issue third party webhooks, execute hazardous commands"></textarea>
          </label>

          <label class="full">Explicitly Blocked Actions
            <textarea name="blockedActions" placeholder="e.g. alter critical credentials files, download untrusted libraries, impersonate human users in Slack channels"></textarea>
          </label>

          <fieldset class="personal full">
            <legend>Cognitive Memory Preferences</legend>
            <div class="checkbox-grid">
              <label class="switch-label checked">
                <div class="switch-info">
                  <span class="switch-text">User Preferences</span>
                  <span class="switch-desc">Retain explicit conversational directives</span>
                </div>
                <input type="checkbox" name="rememberUserPreferences" value="true" checked style="display:none;">
                <div class="switch-control"></div>
              </label>

              <label class="switch-label checked">
                <div class="switch-info">
                  <span class="switch-text">Repository Context</span>
                  <span class="switch-desc">Retain local workspace build context</span>
                </div>
                <input type="checkbox" name="rememberProjectContext" value="true" checked style="display:none;">
                <div class="switch-control"></div>
              </label>

              <label class="switch-label">
                <div class="switch-info">
                  <span class="switch-text">Personal Space</span>
                  <span class="switch-desc">Retain personal facts and routines</span>
                </div>
                <input type="checkbox" name="rememberPersonalContext" value="true" style="display:none;">
                <div class="switch-control"></div>
              </label>
            </div>
          </fieldset>

          <fieldset class="enterprise full">
            <legend>Data Memory Boundaries</legend>
            <div class="checkbox-grid">
              <label class="switch-label checked">
                <div class="switch-info">
                  <span class="switch-text">Company Memory</span>
                  <span class="switch-desc">Share background details inside corporate scope</span>
                </div>
                <input type="checkbox" name="companyMemory" value="true" checked style="display:none;">
                <div class="switch-control"></div>
              </label>

              <label class="switch-label checked">
                <div class="switch-info">
                  <span class="switch-text">Team Context</span>
                  <span class="switch-desc">Share facts across workspace teammates</span>
                </div>
                <input type="checkbox" name="teamMemory" value="true" checked style="display:none;">
                <div class="switch-control"></div>
              </label>

              <label class="switch-label">
                <div class="switch-info">
                  <span class="switch-text">Customer Isolation</span>
                  <span class="switch-desc">Segregate and protect customer PII data</span>
                </div>
                <input type="checkbox" name="customerDataMemory" value="true" style="display:none;">
                <div class="switch-control"></div>
              </label>
            </div>
          </fieldset>

          <fieldset class="full">
            <legend>Available Hatchery System Modules</legend>
            <p class="hint" style="margin-bottom: 16px;">These modules are lazy-loaded dynamically to conserve memory when the Parix agent doesn't need them.</p>
            <div id="modules" class="checkbox-grid"></div>
          </fieldset>
        </div>

        <!-- Step 4: Summary -->
        <div class="step">
          <div class="full">
            <div class="form-group-title" style="margin-bottom: 16px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--neon-emerald)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              Core Configuration Verification
            </div>
            <p class="hint" style="margin-bottom: 24px;">Please review the compiled profile config parameters before committing to disk and spawning the agent core.</p>
            
            <div id="summary" class="summary full"></div>
          </div>
        </div>
      </form>

      <div class="actions">
        <button type="button" class="secondary" id="back" disabled>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Back
        </button>
        <button type="button" id="next">
          Next
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
      </div>
    </section>
  </main>

  <script>
    const providerDefaults = ${JSON.stringify(DEFAULT_MODELS)};
    // Add custom defaults if needed
    providerDefaults.ollama = "gpt-oss:120b-cloud"; // set user's model as default for Ollama in this session
    
    const channels = ${JSON.stringify(CHANNEL_IDS.filter((id) => id !== 'aegis'))};
    const enterpriseChannels = ${JSON.stringify(ENTERPRISE_CHANNELS)};
    const modules = ${JSON.stringify(HATCHERY_MODULES)};
    
    const personalIntro = \`[SYSTEM ACTIVE] Spawning personal cognitive instance...
    
Parix will learn your workflow footprint, monitor diagnostic errors, and operate as your localized agent buddy. Use the fields below to customize the vibe, relationship, and scope.\`;

    const enterpriseIntro = \`[SYSTEM ACTIVE] Spawning enterprise co-worker instance...
    
Parix will configure safety boundary policies, audit expectations, and join team pipelines to handle routine operations.\`;

    let step = 0;
    const tabs = [...document.querySelectorAll('.step-tab')];
    const steps = [...document.querySelectorAll('.step')];
    const back = document.querySelector('#back');
    const next = document.querySelector('#next');
    const mode = document.querySelector('#mode');
    const provider = document.querySelector('#provider');
    const model = document.querySelector('#model');
    const logsContainer = document.querySelector('#terminal-logs');
    
    document.querySelector('#personalIntro').textContent = personalIntro;
    document.querySelector('#enterpriseIntro').textContent = enterpriseIntro;

    // Custom Mode Toggle
    document.querySelectorAll('.mode-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('active'));
        opt.classList.add('active');
        const selectedMode = opt.dataset.mode;
        mode.value = selectedMode;
        syncMode();
      });
    });

    // Custom Provider Selection
    document.querySelectorAll('#providers-grid .card-item').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#providers-grid .card-item').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const val = card.dataset.providerVal;
        provider.value = val;
        
        // Auto update model input with premium model defaults
        if (providerDefaults[val]) {
          model.value = providerDefaults[val];
        }
      });
    });

    // Preset Ollama as selected card initially, or whatever open-ai is set
    const defaultInitProvider = "ollama"; // Set Ollama as recommended initial
    const initialCard = document.querySelector(\`#providers-grid .card-item[data-provider-val="\${defaultInitProvider}"]\`);
    if (initialCard) {
      initialCard.classList.add('selected');
      provider.value = defaultInitProvider;
      model.value = "gpt-oss:120b-cloud"; // set user's model directly
    }

    function render() {
      tabs.forEach((el, i) => {
        el.classList.toggle('active', i === step);
        el.classList.toggle('completed', i < step);
      });
      steps.forEach((el, i) => el.classList.toggle('active', i === step));
      
      back.disabled = step === 0;
      
      if (step === steps.length - 1) {
        next.innerHTML = \`Hatch Parix <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M12 6v6l4 2"></path></svg>\`;
        next.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.25)";
        next.style.background = "linear-gradient(135deg, var(--neon-cyan), var(--neon-emerald))";
        renderSummary();
      } else {
        next.innerHTML = \`Next <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>\`;
        next.style.boxShadow = "";
        next.style.background = "";
      }
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
      
      document.querySelector('#channels').innerHTML = list.map((id) => {
        // Create custom card layout for channels
        let iconSvg = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>';
        if (id === 'telegram') iconSvg = '<svg viewBox="0 0 24 24"><path d="M9.78 18.65l.28-4.28 7.68-7.05c.34-.3-.07-.46-.52-.15L7.69 12.18l-4.1-.1.9-2.82L20.65 3.5l-3 15.68z"/></svg>';
        else if (id === 'slack') iconSvg = '<svg viewBox="0 0 24 24"><path d="M5.04 15.24a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52zm1.26 0a2.52 2.52 0 0 1 5.04 0v5.04a2.52 2.52 0 1 1-5.04 0v-5.04zm0-2.52a2.52 2.52 0 0 1 0-5.04h5.04v5.04H6.3zm0-1.26a2.52 2.52 0 0 1 0-5.04h5.04v5.04H6.3z"/></svg>';
        else if (id === 'discord') iconSvg = '<svg viewBox="0 0 24 24"><path d="M19.27 4.73a16.14 16.14 0 0 0-4.07-1.26l-.32.67a15 15 0 0 0-5.76 0l-.31-.67a16.13 16.13 0 0 0-4.07 1.26 16.2 16.2 0 0 0-3.3 12.87c2 1.48 3.93 2.39 5.8 2.97l1.1-1.48a10.6 10.6 0 0 1-1.74-.83l.25-.19c3.75 1.73 7.82 1.73 11.52 0l.25.19c-.54.34-1.12.61-1.74.83l1.1 1.48c1.88-.58 3.81-1.49 5.8-2.97a16.2 16.2 0 0 0-3.26-12.87z"/></svg>';
        
        return \`
          <div class="card-item channel-card" data-channel-id="\${escapeHtml(id)}">
            <div class="card-icon">\${iconSvg}</div>
            <span class="card-title">\${escapeHtml(id)}</span>
            <input type="checkbox" name="enabledChannels" value="\${escapeHtml(id)}" style="display: none;">
          </div>
        \`;
      }).join('');

      // Wire events for custom channel cards
      document.querySelectorAll('.channel-card').forEach(card => {
        card.addEventListener('click', () => {
          const checkbox = card.querySelector('input[type="checkbox"]');
          checkbox.checked = !checkbox.checked;
          card.classList.toggle('selected', checkbox.checked);
        });
      });
    }

    function renderModules() {
      const enterprise = mode.value === 'enterprise';
      document.querySelector('#modules').innerHTML = modules.map((module) => {
        const checked = enterprise ? module.defaultEnterprise : module.defaultPersonal;
        const label = enterprise && module.id === 'audit-logger' ? module.label + ' (required)' : module.label;
        
        return \`
          <label class="switch-label \${checked ? 'checked' : ''}">
            <div class="switch-info">
              <span class="switch-text">\${escapeHtml(label)}</span>
            </div>
            <input type="checkbox" name="enabledModules" value="\${escapeHtml(module.id)}"\${checked ? ' checked' : ''} style="display:none;">
            <div class="switch-control"></div>
          </label>
        \`;
      }).join('');

      // Wire switch events
      document.querySelectorAll('#modules .switch-label').forEach(lbl => {
        lbl.addEventListener('click', (e) => {
          const checkbox = lbl.querySelector('input[type="checkbox"]');
          // Since click event is on label, it might fire twice if we click child elements. 
          // So let's handle this carefully
          if (e.target.tagName !== 'INPUT') {
            checkbox.checked = !checkbox.checked;
            lbl.classList.toggle('checked', checkbox.checked);
          }
        });
      });
    }

    // Set switch container labels active state on click
    document.querySelectorAll('.switch-label input[type="checkbox"]').forEach(ch => {
      ch.addEventListener('change', () => {
        ch.parentElement.classList.toggle('checked', ch.checked);
      });
    });

    function formData() {
      const form = document.querySelector('#form');
      const data = Object.fromEntries(new FormData(form).entries());
      const fd = new FormData(form);
      data.enabledChannels = fd.getAll('enabledChannels');
      data.enabledModules = fd.getAll('enabledModules');
      return data;
    }

    // Interactive Log Printing
    function printLog(msg, type = '') {
      const line = document.createElement('div');
      line.className = 'log-line ' + type;
      line.innerHTML = \`<span style="color: var(--text-muted)">[\${new Date().toLocaleTimeString()}]</span> \${msg}\`;
      logsContainer.appendChild(line);
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    async function submit() {
      // Show overlay
      document.querySelector('#hatching-overlay').style.display = 'flex';
      
      const payloadLogs = [
        ['Core config loaded successfully', 'system'],
        ['Configuring local repository boundary mapping...', ''],
        ['Registering cognitive agents inside Atrium network...', ''],
        ['Initializing synapse broker on port 8766...', ''],
        ['Validating LLM core credentials (Ollama: gpt-oss:120b-cloud)...', 'system'],
        ['Hatching finished completely without conflicts!', 'success'],
        ['Spawning Aegis graphical management suite...', 'success']
      ];

      printLog('Commencing hatching sequence for Parix...', 'system');
      
      let logIndex = 0;
      const logInterval = setInterval(() => {
        if (logIndex < payloadLogs.length) {
          const [msg, type] = payloadLogs[logIndex];
          printLog(msg, type);
          logIndex++;
        } else {
          clearInterval(logInterval);
        }
      }, 500);

      try {
        const response = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData())
        });
        const payload = await response.json();
        
        if (!response.ok || !payload.ok) {
          setTimeout(() => {
            clearInterval(logInterval);
            printLog('[ERROR] Setup failed: ' + (payload.errors || ['Profile save rejected']).join('; '), 'warn');
          }, 3500);
          return;
        }

        setTimeout(() => {
          printLog('Redirecting to dashboard...', 'system');
          setTimeout(() => {
            window.location.href = payload.dashboardUrl || '/';
          }, 1000);
        }, 4000);

      } catch (err) {
        clearInterval(logInterval);
        printLog('[ERROR] Connection exception: ' + err.message, 'warn');
      }
    }

    function renderSummary() {
      const data = formData();
      const enterprise = data.mode === 'enterprise';
      const rows = enterprise
        ? [
            ['Operating Mode', 'Enterprise Integration'],
            ['Company Entity', data.companyName || 'not set'],
            ['Active Department', data.teamName || 'not set'],
            ['Agent Identity Name', data.agentName || 'Parix'],
            ['Work Role Assignment', data.roleTitle || 'not set'],
            ['Associated LLM Provider', data.provider || 'ollama'],
            ['Associated AI Model', data.model || 'gpt-oss:120b-cloud'],
            ['Communication Channels', formatList(['aegis'].concat(data.enabledChannels || []))],
            ['Memory Boundaries', 'Company & Team Isolation'],
            ['Hatchery Modules', formatList(data.enabledModules || [])]
          ]
        : [
            ['Operating Mode', 'Personal Autonomy'],
            ['User Profile Identifier', data.userName || 'not set'],
            ['Agent Identity Name', data.agentName || 'Parix'],
            ['Conversational Persona Vibe', data.vibe || 'not set'],
            ['Core Directives / Goals', data.primaryGoals || 'none'],
            ['Associated LLM Provider', data.provider || 'ollama'],
            ['Associated AI Model', data.model || 'gpt-oss:120b-cloud'],
            ['Communication Channels', formatList(['aegis'].concat(data.enabledChannels || []))],
            ['Memory Preferences', 'User & Repo Context Retained'],
            ['Hatchery Modules', formatList(data.enabledModules || [])]
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

    back.addEventListener('click', () => { 
      step = Math.max(0, step - 1); 
      render(); 
    });
    
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
