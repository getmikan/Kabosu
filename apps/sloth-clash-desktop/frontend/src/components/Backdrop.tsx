import { useEffect, useState } from 'react'

import { Shape, type ShapeName } from '../ui/M3'

// Each slot cycles through its own outlines; m3e-shape morphs between them
// while CSS keeps the layer drifting and spinning, so the window is never
// static even when the user does nothing.
const CYCLES: ShapeName[][] = [
  ['12-sided-cookie', 'flower', 'soft-burst', '9-sided-cookie'],
  ['puffy', '4-leaf-clover', 'sunny', 'puffy-diamond'],
  ['7-sided-cookie', 'pentagon', 'gem', 'soft-boom'],
  ['very-sunny', 'burst', '8-leaf-clover', 'flower'],
  ['oval', 'pill', 'arch', 'bun'],
]

// One slot morphs per step, so something is always changing but never all at once.
const STEP_MS = 2600

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function Backdrop() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (reducedMotion()) return
    const id = window.setInterval(() => setTick((n) => n + 1), STEP_MS)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="backdrop" aria-hidden="true">
      {CYCLES.map((cycle, i) => (
        <Shape
          key={cycle[0]}
          className="backdropShape"
          name={cycle[Math.floor((tick + CYCLES.length - i) / CYCLES.length) % cycle.length]}
        />
      ))}
    </div>
  )
}
