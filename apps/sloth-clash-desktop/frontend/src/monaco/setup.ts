// Serve Monaco from the app bundle. Without this, @monaco-editor/react pulls
// the whole editor from cdn.jsdelivr.net on first use, which made every YAML
// editor open slowly (and fail offline or behind a dead tunnel).
import { loader } from '@monaco-editor/react'
import 'monaco-editor/esm/vs/editor/edcore.main.js'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker'

// Only the generic editor worker ships: YAML and JavaScript use Monarch
// tokenizers, which need no language-service workers.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

loader.config({ monaco })
