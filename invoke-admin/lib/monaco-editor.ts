import Editor, { loader } from '@monaco-editor/react'

loader.config({
  paths: {
    vs: '/monaco/vs'
  }
})

// Disable built-in TS/JS hover providers BEFORE any editor is created.
// We replace them with a custom hover in onMount that overrides `any`-typed
// req/res/next params with InvokeRequest/InvokeResponse types.
loader.init().then(monaco => {
  const noHovers = {
    completionItems: true,
    hovers: false,
    documentSymbols: true,
    definitions: true,
    references: true,
    documentHighlights: true,
    rename: true,
    diagnostics: true,
    documentRangeFormattingEdits: true,
    signatureHelp: true,
    onTypeFormattingEdits: true,
    codeActions: true,
    inlayHints: true
  }
  monaco.languages.typescript.typescriptDefaults.setModeConfiguration(noHovers)
  monaco.languages.typescript.javascriptDefaults.setModeConfiguration(noHovers)
})

export default Editor
