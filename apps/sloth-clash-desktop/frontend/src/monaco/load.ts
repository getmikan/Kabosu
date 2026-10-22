// Monaco is several megabytes, so the editors live in their own chunk.
export const loadEditors = () => import('./MonacoEditors')

/** Warm the editor chunk while idle so editors open instantly. */
export function preloadMonaco() {
  void loadEditors()
}
