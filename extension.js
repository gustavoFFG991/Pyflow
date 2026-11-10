'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { analyze, langOf } = require('./core');

const LANGS = ['python', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'java', 'c', 'cpp'];
const panels = new Map(); // uri do documento → { panel, doc, mode, timer }

function activate(ctx) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('pyflow.showFlowchart', () => openPanel(ctx, 'flow')),
    vscode.commands.registerCommand('pyflow.showSteps', () => openPanel(ctx, 'steps')),

    vscode.workspace.onDidChangeTextDocument(e => {
      const p = panels.get(e.document.uri.toString());
      if (!p || !vscode.workspace.getConfiguration('pyflow').get('autoUpdate')) return;
      clearTimeout(p.timer);
      p.timer = setTimeout(() => push(p), 400);
    }),

    vscode.languages.registerCodeLensProvider(LANGS.map(language => ({ language })), {
      provideCodeLenses() {
        if (!vscode.workspace.getConfiguration('pyflow').get('codeLens')) return [];
        const r = new vscode.Range(0, 0, 0, 0);
        return [
          new vscode.CodeLens(r, { title: '$(type-hierarchy) Criar fluxograma', command: 'pyflow.showFlowchart' }),
          new vscode.CodeLens(r, { title: '$(list-ordered) Resumo em passos', command: 'pyflow.showSteps' })
        ];
      }
    })
  );
}

function openPanel(ctx, mode) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !langOf(editor.document.languageId)) {
    vscode.window.showWarningMessage('PyFlow: abra um arquivo Python, JavaScript, TypeScript, Java ou C.');
    return;
  }
  const doc = editor.document;
  const key = doc.uri.toString();
  const existing = panels.get(key);
  if (existing) {
    existing.mode = mode;
    existing.panel.reveal(vscode.ViewColumn.Beside, true);
    existing.panel.webview.postMessage({ type: 'mode', mode });
    push(existing);
    return;
  }

  const media = vscode.Uri.joinPath(ctx.extensionUri, 'media');
  const mermaidDir = vscode.Uri.joinPath(ctx.extensionUri, 'node_modules', 'mermaid', 'dist');
  const panel = vscode.window.createWebviewPanel(
    'pyflow',
    'PyFlow — ' + path.basename(doc.fileName),
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media, mermaidDir] }
  );
  const p = { panel, doc, mode, timer: null };
  panels.set(key, p);

  panel.webview.html = html(panel.webview, ctx, media, mermaidDir);
  panel.webview.onDidReceiveMessage(m => onMessage(p, m));
  panel.onDidDispose(() => { clearTimeout(p.timer); panels.delete(key); });
}

function push(p) {
  const r = analyze(p.doc.getText(), langOf(p.doc.languageId));
  p.panel.webview.postMessage({ type: 'update', mode: p.mode, ...r });
}

async function onMessage(p, m) {
  if (m.type === 'ready') return push(p);
  if (m.type === 'copy') {
    await vscode.env.clipboard.writeText(m.text);
    vscode.window.setStatusBarMessage('PyFlow: código Mermaid copiado.', 2500);
  } else if (m.type === 'save') {
    const ext = m.kind === 'png' ? 'png' : 'svg';
    const base = path.basename(p.doc.fileName, path.extname(p.doc.fileName));
    const dir = path.dirname(p.doc.fileName);
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(dir, base + '-fluxograma.' + ext)),
      filters: { [ext.toUpperCase()]: [ext] }
    });
    if (!uri) return;
    const data = ext === 'png' ? Buffer.from(m.data, 'base64') : Buffer.from(m.text, 'utf8');
    await vscode.workspace.fs.writeFile(uri, data);
    vscode.window.showInformationMessage('PyFlow: arquivo salvo em ' + uri.fsPath);
  } else if (m.type === 'error') {
    vscode.window.showErrorMessage('PyFlow: ' + m.text);
  }
}

function html(webview, ctx, media, mermaidDir) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const u = (base, f) => webview.asWebviewUri(vscode.Uri.joinPath(base, f));
  const hasMermaid = fs.existsSync(path.join(ctx.extensionPath, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'));
  const csp = `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${u(media, 'main.css')}"></head>
<body>
<div class="tabs" role="tablist">
  <button role="tab" id="tG" aria-selected="true">Visão Gráfica</button>
  <button role="tab" id="tS" aria-selected="false">Resumo em Passos</button>
</div>
<div id="pG">
  <div class="bar">
    <span class="legend">
      <span><i style="border-color:#d97706;background:#fef3c7"></i>Decisão</span>
      <span><i style="border-color:#2563eb;background:#dbeafe"></i>Ação</span>
      <span><i style="border-color:#7c3aed;background:#ede9fe"></i>Laço</span>
      <span><i style="border-color:#1e293b;background:#1e293b"></i>Início/Fim</span>
    </span>
    <span class="sp"></span>
    <button id="zIn" aria-label="Aumentar zoom">+</button>
    <button id="zOut" aria-label="Diminuir zoom">−</button>
    <button id="zRst">Reiniciar visão</button>
    <span id="zl">100%</span>
    <button id="xPng">Exportar PNG</button>
    <button id="xSvg">Exportar SVG</button>
    <button id="xMm">Copiar Mermaid</button>
  </div>
  <div id="vp" tabindex="0" aria-label="Fluxograma: arraste para mover, role para dar zoom">
    <div id="inner"></div>
    <div id="msg">Gerando…</div>
  </div>
</div>
<div id="pS" hidden><ol id="steps"></ol></div>
${hasMermaid
  ? `<script nonce="${nonce}" src="${u(mermaidDir, 'mermaid.min.js')}"></script>`
  : `<script nonce="${nonce}">window.NO_MERMAID=true;</script>`}
<script nonce="${nonce}" src="${u(media, 'main.js')}"></script>
</body></html>`;
}

function deactivate() { panels.forEach(p => p.panel.dispose()); }

module.exports = { activate, deactivate };
