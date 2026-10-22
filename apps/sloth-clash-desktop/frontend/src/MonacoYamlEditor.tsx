import { type ComponentProps, lazy, Suspense } from 'react'

import { loadEditors } from './monaco/load'
import { Skeleton } from './ui/M3'

const LazyCode = lazy(() =>
  loadEditors().then((m) => ({ default: m.MonacoCodeEditor })),
)
const LazyDiff = lazy(() =>
  loadEditors().then((m) => ({ default: m.MonacoDiffViewer })),
)

function EditorSkeleton() {
  return <Skeleton className="edMonacoSkeleton" />
}

type CodeProps = ComponentProps<typeof LazyCode>

export function MonacoYamlEditor(props: Omit<CodeProps, 'language'>) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <LazyCode {...props} language="yaml" />
    </Suspense>
  )
}

export function MonacoScriptEditor(props: Omit<CodeProps, 'language'>) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <LazyCode {...props} language="javascript" />
    </Suspense>
  )
}

export function MonacoDiffViewer(props: ComponentProps<typeof LazyDiff>) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <LazyDiff {...props} />
    </Suspense>
  )
}
