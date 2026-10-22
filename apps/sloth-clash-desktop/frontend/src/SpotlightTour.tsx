import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import './styles/tour.css'
import { SPOTLIGHT_TOUR_STEPS } from './spotlightTourConfig'
import { Button } from './ui/M3'

type Props = {
  open: boolean
  stepIndex: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}

const PAD = 10
const DIM = 'rgba(10, 8, 6, 0.74)'

export function SpotlightTour({
  open,
  stepIndex,
  onNext,
  onPrev,
  onSkip,
}: Props) {
  const { t } = useTranslation()
  const step = SPOTLIGHT_TOUR_STEPS[stepIndex]
  const total = SPOTLIGHT_TOUR_STEPS.length
  const [rect, setRect] = useState<DOMRect | null>(null)

  const updateRect = useCallback(() => {
    requestAnimationFrame(() => {
      /* Spotlight: measure target after paint. Nested setState is not synchronous with React effects. */
      /* eslint-disable @eslint-react/set-state-in-effect */
      if (!open || !step) {
        setRect(null)
        return
      }
      const el = document.querySelector(step.selector)
      if (!el) {
        setRect(null)
        return
      }
      setRect(el.getBoundingClientRect())
      /* eslint-enable @eslint-react/set-state-in-effect */
    })
  }, [open, step])

  useEffect(() => {
    updateRect()
    if (!open) return
    const id = window.setInterval(updateRect, 500)
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      clearInterval(id)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [open, updateRect])

  useEffect(() => {
    if (!open || !step) return
    const el = document.querySelector(step.selector)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open, stepIndex, step])

  if (!open || !step) return null

  const r = rect
  const hasHole = r && r.width > 2 && r.height > 2

  return (
    <div className="tourRoot" aria-hidden={false}>
      {hasHole ? (
        <>
          <div
            className="tourDim"
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              right: 0,
              height: Math.max(0, r.top - PAD),
              background: DIM,
              zIndex: 1000,
            }}
            onClick={onSkip}
            role="presentation"
          />
          <div
            className="tourDim"
            style={{
              position: 'fixed',
              left: 0,
              top: r.bottom + PAD,
              right: 0,
              bottom: 0,
              background: DIM,
              zIndex: 1000,
            }}
            onClick={onSkip}
            role="presentation"
          />
          <div
            className="tourDim"
            style={{
              position: 'fixed',
              left: 0,
              top: r.top - PAD,
              width: Math.max(0, r.left - PAD),
              height: r.height + PAD * 2,
              background: DIM,
              zIndex: 1000,
            }}
            onClick={onSkip}
            role="presentation"
          />
          <div
            className="tourDim"
            style={{
              position: 'fixed',
              left: r.right + PAD,
              top: r.top - PAD,
              right: 0,
              height: r.height + PAD * 2,
              background: DIM,
              zIndex: 1000,
            }}
            onClick={onSkip}
            role="presentation"
          />
          <div
            className="tourRing"
            style={{
              position: 'fixed',
              left: r.left - PAD,
              top: r.top - PAD,
              width: r.width + PAD * 2,
              height: r.height + PAD * 2,
              borderRadius: 14,
              pointerEvents: 'none',
              zIndex: 1001,
            }}
          />
        </>
      ) : (
        <div
          className="tourDim"
          style={{
            position: 'fixed',
            inset: 0,
            background: DIM,
            zIndex: 1000,
          }}
          onClick={onSkip}
          role="presentation"
        />
      )}

      <div
        key={stepIndex}
        className="tourCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spotlightTitle"
        style={{ zIndex: 1002 }}
      >
        <div className="tourStepRow">
          <span className="tourStepLabel">
            {stepIndex + 1} / {total}
          </span>
          <span className="tourDots" aria-hidden>
            {SPOTLIGHT_TOUR_STEPS.map((s, i) => (
              <span
                key={s.selector}
                className="tourDot"
                data-active={i === stepIndex || undefined}
                data-done={i < stepIndex || undefined}
              />
            ))}
          </span>
        </div>
        <h3 id="spotlightTitle" className="tourTitle">
          {t(step.titleKey)}
        </h3>
        <p className="tourBody">{t(step.bodyKey)}</p>
        <div className="tourActions">
          <Button variant="text" onClick={onSkip}>
            {t('tour.skip')}
          </Button>
          <span className="tourSpacer" />
          <Button
            variant="outlined"
            disabled={stepIndex === 0}
            onClick={onPrev}
          >
            {t('tour.back')}
          </Button>
          {stepIndex < total - 1 ? (
            <Button trailingIcon="chevron" onClick={onNext}>
              {t('tour.next')}
            </Button>
          ) : (
            <Button icon="check" onClick={onSkip}>
              {t('tour.done')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
