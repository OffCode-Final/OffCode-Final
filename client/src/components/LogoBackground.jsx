import { useEffect, useRef } from 'react'
import { LOGO_DEFINITIONS, createLogoAnimationEngine } from './logoAnimationEngine'

export default function LogoBackground({ cardRef }) {
  const containerRef = useRef(null)
  const logoRefs = useRef([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Reduced motion media query check
    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    let prefersReducedMotion = mediaQuery ? mediaQuery.matches : false

    let animId = null
    let lastTime = 0
    let resizeObserver = null

    const elements = LOGO_DEFINITIONS.map((def, idx) => ({
      id: def.id,
      size: def.size,
      el: logoRefs.current[idx]
    }))

    const engine = createLogoAnimationEngine({
      getContainerSize: () => ({
        width: container.clientWidth || window.innerWidth,
        height: container.clientHeight || window.innerHeight,
        getBoundingClientRect: () => container.getBoundingClientRect()
      }),
      getCardRect: () => (cardRef?.current ? cardRef.current.getBoundingClientRect() : null),
      elements
    })

    const handleReducedMotionStatic = () => {
      engine.measure()
      engine.seedAll()
      const logos = engine.getLogos()
      logos.forEach((b) => {
        if (b.el && b.el.style) {
          b.el.style.opacity = '0.22'
          b.el.style.transform = `translate(${(b.x - b.size / 2).toFixed(1)}px,${(b.y - b.size / 2).toFixed(1)}px) rotate(0deg) scale(${engine.getK().toFixed(3)})`
        }
      })
    }

    const frame = (t) => {
      if (prefersReducedMotion) return
      if (!lastTime) lastTime = t
      const dt = Math.min((t - lastTime) / 1000, 0.05)
      lastTime = t

      engine.step(dt)
      engine.renderDom()

      animId = requestAnimationFrame(frame)
    }

    if (prefersReducedMotion) {
      handleReducedMotionStatic()
    } else {
      animId = requestAnimationFrame(frame)
    }

    const onResize = () => {
      if (prefersReducedMotion) {
        handleReducedMotionStatic()
      } else {
        engine.onSize()
      }
    }

    window.addEventListener('resize', onResize)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize)
      resizeObserver.observe(container)
    }

    const onMediaChange = (e) => {
      prefersReducedMotion = e.matches
      if (prefersReducedMotion) {
        if (animId) cancelAnimationFrame(animId)
        handleReducedMotionStatic()
      } else {
        lastTime = 0
        animId = requestAnimationFrame(frame)
      }
    }

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', onMediaChange)
    }

    return () => {
      if (animId) cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      if (resizeObserver) resizeObserver.disconnect()
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', onMediaChange)
      }
    }
  }, [cardRef])

  return (
    <div
      ref={containerRef}
      className="logo-animation-background"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0
      }}
    >
      {LOGO_DEFINITIONS.map((def, idx) => (
        <div
          key={def.id}
          ref={(el) => {
            logoRefs.current[idx] = el
          }}
          className="logo-animation-item"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${def.size}px`,
            height: `${def.size}px`,
            willChange: 'transform',
            opacity: 0
          }}
        >
          <img
            src={def.src}
            alt=""
            draggable={false}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              userSelect: 'none'
            }}
          />
        </div>
      ))}
    </div>
  )
}
