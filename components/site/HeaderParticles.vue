<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import type { ResolvedTheme } from '~/composables/useTblogTheme'

interface Props {
  muted?: boolean
  theme?: ResolvedTheme
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  depth: number
}

interface Bounds {
  left: number
  right: number
  top: number
  bottom: number
}

const props = withDefaults(defineProps<Props>(), { muted: false, theme: 'default' })

function particleColor(): string {
  if (props.theme === 'nocturne') return '142,177,184'
  if (props.theme === 'atelier') return '111,88,68'
  return '38,50,60'
}

function particleAccentColor(): string {
  return props.theme === 'nocturne' ? '223,161,104' : '181,97,60'
}

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvas')
let ctx: CanvasRenderingContext2D | null = null
let host: HTMLElement | null = null
let brand: HTMLElement | null = null
let navigation: HTMLElement | null = null
let brandBounds: Bounds | null = null
let navigationBounds: Bounds | null = null
let rafId = 0
let running = false
let reducedMotion = false
let dpr = 1
let width = 0
let height = 0
let particles: Particle[] = []
const pointer = { x: -9999, y: -9999, inside: false }

function toLocalBounds(element: HTMLElement, padding: number): Bounds | null {
  if (!host) return null
  const hostRect = host.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  return {
    left: (rect.left - hostRect.left - padding) * dpr,
    right: (rect.right - hostRect.left + padding) * dpr,
    top: (rect.top - hostRect.top - padding) * dpr,
    bottom: (rect.bottom - hostRect.top + padding) * dpr
  }
}

function updateContentBounds() {
  brandBounds = brand ? toLocalBounds(brand, 10) : null
  navigationBounds = navigation ? toLocalBounds(navigation, 8) : null
}

function isInsideBounds(x: number, y: number, bounds: Bounds | null) {
  return Boolean(
    bounds &&
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  )
}

function resize() {
  const canvas = canvasRef.value
  if (!canvas || !host) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = host.getBoundingClientRect()
  width = canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  height = canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  updateContentBounds()
}

function init() {
  const hostWidth = width / dpr
  const count = Math.min(42, Math.floor(hostWidth / 32))
  particles = Array.from({ length: Math.max(12, count) }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.06 * dpr,
    vy: (Math.random() - 0.5) * 0.06 * dpr,
    depth: Math.random() < 0.42 ? 0.42 : 1
  }))
}

function applyLogoGravity(particle: Particle) {
  if (!pointer.inside || !brandBounds) return

  const centerX = (brandBounds.left + brandBounds.right) / 2
  const centerY = (brandBounds.top + brandBounds.bottom) / 2
  const pointerDistance = Math.hypot(pointer.x - centerX, pointer.y - centerY)
  if (pointerDistance >= 210 * dpr) return

  const dx = centerX - particle.x
  const dy = centerY - particle.y
  const distance = Math.max(1, Math.hypot(dx, dy))
  const radius = 190 * dpr
  if (distance >= radius || distance <= 34 * dpr) return

  const force = (1 - distance / radius) * 0.00048 * dpr
  particle.vx += (dx / distance) * force - (dy / distance) * force * 0.32
  particle.vy += (dy / distance) * force + (dx / distance) * force * 0.32
}

function moveParticles() {
  for (const particle of particles) {
    applyLogoGravity(particle)
    particle.x += particle.vx * particle.depth
    particle.y += particle.vy * particle.depth

    const speed = Math.hypot(particle.vx, particle.vy)
    const maxSpeed = 0.09 * dpr
    if (speed > maxSpeed) {
      particle.vx = particle.vx / speed * maxSpeed
      particle.vy = particle.vy / speed * maxSpeed
    }

    if (particle.x < 0 || particle.x > width) particle.vx *= -1
    if (particle.y < 0 || particle.y > height) particle.vy *= -1
  }
}

function drawLinks(breathing: number) {
  if (!ctx) return
  const linkDistance = 108 * dpr

  for (let index = 0; index < particles.length; index++) {
    const particle = particles[index]
    for (let next = index + 1; next < particles.length; next++) {
      const neighbor = particles[next]
      const distance = Math.hypot(particle.x - neighbor.x, particle.y - neighbor.y)
      if (distance >= linkDistance) continue

      const midpointX = (particle.x + neighbor.x) / 2
      const midpointY = (particle.y + neighbor.y) / 2
      if (
        isInsideBounds(midpointX, midpointY, brandBounds) ||
        isInsideBounds(midpointX, midpointY, navigationBounds)
      ) continue

      const depthAlpha = Math.min(particle.depth, neighbor.depth) === 1 ? 1 : 0.34
      const color = particleColor()
      ctx.strokeStyle = `rgba(${color},${(1 - distance / linkDistance) * 0.34 * depthAlpha * breathing})`
      ctx.lineWidth = dpr * (depthAlpha === 1 ? 0.8 : 0.55)
      ctx.beginPath()
      ctx.moveTo(particle.x, particle.y)
      ctx.lineTo(neighbor.x, neighbor.y)
      ctx.stroke()
    }
  }
}

function drawPointerLinks() {
  if (!ctx || !pointer.inside) return
  const linkDistance = 108 * dpr
  const candidates = particles
    .map((particle) => ({
      particle,
      distance: Math.hypot(particle.x - pointer.x, particle.y - pointer.y)
    }))
    .filter(({ distance }) => distance < linkDistance * 1.65)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 5)

  for (const { particle, distance } of candidates) {
    const color = particleAccentColor()
    ctx.strokeStyle = `rgba(${color},${(1 - distance / (linkDistance * 1.65)) * 0.5})`
    ctx.lineWidth = dpr
    ctx.beginPath()
    ctx.moveTo(particle.x, particle.y)
    ctx.lineTo(pointer.x, pointer.y)
    ctx.stroke()
  }
}

function drawNodes(breathing: number) {
  if (!ctx) return
  for (const particle of particles) {
    if (
      isInsideBounds(particle.x, particle.y, brandBounds) ||
      isInsideBounds(particle.x, particle.y, navigationBounds)
    ) continue

    const alpha = particle.depth === 1 ? 0.68 : 0.28
    const radius = particle.depth === 1 ? 1.35 : 0.82
    const color = particleColor()
    ctx.fillStyle = `rgba(${color},${alpha * breathing})`
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, radius * dpr, 0, Math.PI * 2)
    ctx.fill()
  }
}

function draw(move = true) {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  if (move) moveParticles()

  const breathing = 0.88 + Math.sin(performance.now() / 1100) * 0.12
  drawLinks(breathing)
  drawPointerLinks()
  drawNodes(breathing)
}

function frame() {
  if (!running) return
  draw()
  rafId = requestAnimationFrame(frame)
}

function start() {
  if (running) return
  running = true
  rafId = requestAnimationFrame(frame)
}

function stop() {
  running = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

function onPointerMove(event: PointerEvent) {
  if (!host) return
  const rect = host.getBoundingClientRect()
  pointer.x = (event.clientX - rect.left) * dpr
  pointer.y = (event.clientY - rect.top) * dpr
  pointer.inside = true
}

function onPointerLeave() {
  pointer.inside = false
  pointer.x = -9999
  pointer.y = -9999
}

function onResize() {
  resize()
  init()
  if (!running) draw(false)
}

function onVisibility() {
  if (document.hidden) stop()
  else start()
}

watch(() => props.theme, () => {
  if (reducedMotion && ctx) draw(false)
})

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas || typeof canvas.getContext !== 'function') return
  ctx = canvas.getContext('2d')
  if (!ctx) return

  host = canvas.parentElement
  if (!host) return
  brand = host.querySelector<HTMLElement>('.site-header__brand')
  navigation = host.querySelector<HTMLElement>('.site-header__nav-wrap')
  resize()
  init()
  window.addEventListener('resize', onResize, { passive: true })

  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  if (reducedMotion) {
    draw(false)
    return
  }

  host.addEventListener('pointermove', onPointerMove, { passive: true })
  host.addEventListener('pointerleave', onPointerLeave, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  if (!document.hidden) start()
})

onBeforeUnmount(() => {
  stop()
  host?.removeEventListener('pointermove', onPointerMove)
  host?.removeEventListener('pointerleave', onPointerLeave)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <canvas
    ref="canvas"
    class="header-particles"
    :class="{
      'header-particles--muted': props.muted,
      'header-particles--nocturne': props.theme === 'nocturne'
    }"
    aria-hidden="true"
  ></canvas>
</template>

<style scoped>
.header-particles {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.62;
  transition: opacity 0.2s ease;
}

.header-particles--muted {
  opacity: 0.46;
}

.header-particles--nocturne {
  filter:
    drop-shadow(0 0 2px rgba(142, 177, 184, 0.25))
    drop-shadow(0 0 5px rgba(223, 161, 104, 0.07));
}
</style>
