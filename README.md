# PyFlow Visualizer (extensão VS Code)

Transforma código **Python, JavaScript/TypeScript, Java e C/C++** em:
- **Fluxograma** (Mermaid) com zoom, arrastar, exportar PNG/SVG e copiar código Mermaid;
- **Resumo em passos**, em português.

## Como usar
1. Abra um arquivo de código.
2. Clique em um dos botões na barra do editor (canto superior direito):
   - ícone de hierarquia → **Criar fluxograma**
   - ícone de lista numerada → **Resumo em passos**
   (também há atalhos no topo do arquivo — CodeLens — e no menu de contexto do botão direito).
3. Uma nova aba abre ao lado, com as abas **Visão Gráfica** e **Resumo em Passos**.
   Ela atualiza sozinha enquanto você edita (`pyflow.autoUpdate`).

## Instalar / testar
```bash
npm install          # baixa o Mermaid (obrigatório)
```
- **Testar:** abra esta pasta no VS Code e pressione **F5** (abre uma janela de desenvolvimento).
- **Gerar o instalador:** `npx @vscode/vsce package` → cria `pyflow-visualizer-0.1.0.vsix`.
- **Instalar o .vsix:** `code --install-extension pyflow-visualizer-0.1.0.vsix`
  (ou Extensões → “…” → *Install from VSIX*).

## Estrutura
| Arquivo | Função |
|---|---|
| `package.json` | Comandos, botões na barra do editor, configurações |
| `extension.js` | Ativação, CodeLens, painel webview, salvar/copiar |
| `core.js` | Parser → grafo → Mermaid + resumo (sem dependências) |
| `media/main.js`, `media/main.css` | Interface da aba (render, zoom/pan, exportação) |

## Limitações
Parser por heurística (não é AST completa): não cobre comprehensions, `match`/`switch`, `do…while`, lambdas nem `if` de uma linha sem chaves. `try/except` e `class` são achatados no fluxo.

<img width="982" height="618" alt="image" src="https://github.com/user-attachments/assets/9bf99d02-347f-4c3b-b0a6-4f17684c551e" />

<img width="490" height="614" alt="image" src="https://github.com/user-attachments/assets/53464b09-8783-4dfa-b17e-a3d2a3177e88" />

