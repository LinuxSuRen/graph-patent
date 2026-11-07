<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'

const props = defineProps({
  patents: { type: Array, default: () => [] },
  search: { type: String, default: '' },
  activeKinds: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['select'])

const canvasEl = ref(null)
let simulation = null
let nodes = []
let links = []
let transform = { x: 0, y: 0, k: 1 }
let hoverNode = null
let rafId = 0
let dpr = 1
let width = 0
let height = 0

const NODE_STYLE = {
  patent: { r: 6, shape: 'circle' },
  creator: { r: 10, shape: 'rect' },
  kind: { r: 14, shape: 'hex' },
}

function buildGraph() {
  const creatorSet = new Map()
  const kindSet = new Map()
  nodes = []
  links = []

  for (const p of props.patents) {
    nodes.push({ id: `p:${p.number}`, type: 'patent', label: p.name, patent: p })
    const ck = `c:${p.creator}`
    if (!creatorSet.has(ck)) {
      creatorSet.set(ck, true)
      nodes.push({ id: ck, type: 'creator', label: p.creator })
    }
    const kk = `k:${p.kind}`
    if (!kindSet.has(kk)) {
      kindSet.set(kk, true)
      nodes.push({ id: kk, type: 'kind', label: p.kind })
    }
    links.push({ source: `p:${p.number}`, target: ck })
    links.push({ source: `p:${p.number}`, target: kk })
  }

  simulation = forceSimulation(nodes)
    .force('link', forceLink(links).id((d) => d.id).distance((d) => (d.target.type === 'kind' ? 70 : 46)).strength(0.7))
    .force('charge', forceManyBody().strength(-160))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide().radius((d) => radiusOf(d) + 4))
    .on('tick', scheduleRender)

  simulation.nodes().forEach((n, i) => {
    if (n.x === undefined) {
      const ring = Math.sqrt(i + 1) * 60
      const angle = i * 2.39996
      n.x = Math.cos(angle) * ring
      n.y = Math.sin(angle) * ring
    }
  })
}

function radiusOf(node) {
  if (node.type === 'patent') return 5 + Math.min(4, node.label.length / 12)
  return NODE_STYLE[node.type].r
}

// 搜索 / 过滤条件下的节点可见性：命中高亮，其余淡出
function nodeState(node) {
  // link 尚未被 d3-force 解析成节点对象（字符串）时按淡出处理
  if (!node || typeof node !== 'object' || !node.label) {
    return 'dimmed'
  }
  const search = props.search.trim().toLowerCase()
  if (node.type === 'patent' && props.activeKinds[node.patent.kind] === false) {
    return 'filtered'
  }
  if (search) {
    const hit =
      node.label.toLowerCase().includes(search) ||
      (node.patent && (node.patent.number.toLowerCase().includes(search) || node.patent.creator.toLowerCase().includes(search)))
    return hit ? 'active' : 'dimmed'
  }
  return 'active'
}

function relatedToActive(node) {
  // 与搜索命中的专利节点相邻的公司/领域节点保持可见
  const search = props.search.trim().toLowerCase()
  if (!search || node.type === 'patent') return false
  return links.some(
    (l) =>
      (l.target === node || l.source === node) &&
      l.source.type === 'patent' &&
      nodeState(l.source) === 'active',
  )
}

function draw() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  ctx.translate(width / 2 + transform.x, height / 2 + transform.y)
  ctx.scale(transform.k, transform.k)

  // 边
  ctx.lineWidth = 0.8
  for (const l of links) {
    if (typeof l.source !== 'object' || typeof l.target !== 'object') continue
    const sState = l.source.type === 'patent' ? nodeState(l.source) : (nodeState(l.source) === 'active' || relatedToActive(l.source) ? 'active' : nodeState(l.source))
    const tState = l.target.type === 'patent' ? nodeState(l.target) : (nodeState(l.target) === 'active' || relatedToActive(l.target) ? 'active' : nodeState(l.target))
    const visible = sState !== 'filtered' && tState !== 'filtered'
    ctx.strokeStyle = visible ? 'rgba(110, 118, 129, 0.35)' : 'rgba(110, 118, 129, 0.08)'
    ctx.beginPath()
    ctx.moveTo(l.source.x, l.source.y)
    ctx.lineTo(l.target.x, l.target.y)
    ctx.stroke()
  }

  // 节点
  for (const node of nodes) {
    const state = nodeState(node)
    if (state === 'filtered') continue
    const alpha = state === 'dimmed' && !relatedToActive(node) ? 0.15 : 1
    const r = radiusOf(node)
    ctx.globalAlpha = alpha
    ctx.beginPath()
    if (node.type === 'creator') {
      ctx.roundRect(node.x - r / 1.4, node.y - r / 1.4, (r / 1.4) * 2, (r / 1.4) * 2, 2)
    } else if (node.type === 'kind') {
      hexPath(ctx, node.x, node.y, r)
    } else {
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
    }
    ctx.fillStyle = fillOf(node, node === hoverNode)
    ctx.fill()
    if (node === hoverNode) {
      ctx.strokeStyle = '#f0f6fc'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    const showLabel =
      node.type !== 'patent' ||
      node === hoverNode ||
      (state === 'active' && props.search.trim() !== '')
    if (showLabel) {
      ctx.font = node.type === 'patent' ? '10px sans-serif' : '600 11px sans-serif'
      ctx.fillStyle = node === hoverNode ? '#f0f6fc' : '#8b949e'
      ctx.textAlign = 'center'
      const text = node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label
      ctx.fillText(text, node.x, node.y + r + 12)
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

const KIND_COLORS = [
  '#58a6ff', '#3fb950', '#d29922', '#f0883e',
  '#bc8cff', '#39c5cf', '#f778ba', '#7ee787', '#ffa657',
]
const kindColorMap = new Map()
function fillOf(node, hovered) {
  if (node.type === 'creator') return hovered ? '#d29922' : '#9e6a03'
  if (node.type === 'kind') return hovered ? '#f0f6fc' : '#6e7681'
  const kind = node.patent.kind
  if (!kindColorMap.has(kind)) {
    kindColorMap.set(kind, KIND_COLORS[kindColorMap.size % KIND_COLORS.length])
  }
  return kindColorMap.get(kind)
}

function hexPath(ctx, cx, cy, r) {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function scheduleRender() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    draw()
  })
}

function resize() {
  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.parentElement.getBoundingClientRect()
  dpr = window.devicePixelRatio || 1
  width = rect.width
  height = rect.height
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
  scheduleRender()
}

function pickNode(mx, my) {
  const x = (mx - width / 2 - transform.x) / transform.k
  const y = (my - height / 2 - transform.y) / transform.k
  let best = null
  let bestDist = Infinity
  for (const node of nodes) {
    if (nodeState(node) === 'filtered') continue
    const d = Math.hypot(node.x - x, node.y - y)
    if (d < radiusOf(node) + 6 && d < bestDist) {
      best = node
      bestDist = d
    }
  }
  return best
}

function toCanvasCoords(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

let dragging = false
let dragMoved = false
let last = null
function onPointerDown(e) {
  dragging = true
  dragMoved = false
  last = toCanvasCoords(e)
}
function onPointerMove(e) {
  const p = toCanvasCoords(e)
  if (dragging && last) {
    const dx = p.x - last.x
    const dy = p.y - last.y
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true
    transform.x += dx
    transform.y += dy
    last = p
    scheduleRender()
    return
  }
  const node = pickNode(p.x, p.y)
  hoverNode = node
  canvasEl.value.style.cursor = node ? 'pointer' : 'grab'
  scheduleRender()
  emit('hover', node ? { node, x: p.x, y: p.y } : null)
}
function onPointerUp(e) {
  dragging = false
  if (!dragMoved) {
    const p = toCanvasCoords(e)
    const node = pickNode(p.x, p.y)
    if (node) emit('select', node)
  }
}
function onWheel(e) {
  e.preventDefault()
  const p = toCanvasCoords(e)
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const k = Math.min(6, Math.max(0.3, transform.k * factor))
  transform.x = p.x - width / 2 - ((p.x - width / 2 - transform.x) * k) / transform.k
  transform.y = p.y - height / 2 - ((p.y - height / 2 - transform.y) * k) / transform.k
  transform.k = k
  scheduleRender()
}

watch(() => props.patents, buildGraph)
watch([() => props.search, () => props.activeKinds], scheduleRender, { deep: true })

let resizeObserver
onMounted(() => {
  buildGraph()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasEl.value.parentElement)
  resize()
})
onUnmounted(() => {
  if (simulation) simulation.stop()
  if (resizeObserver) resizeObserver.disconnect()
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <canvas
    ref="canvasEl"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="dragging = false; hoverNode = null; emit('hover', null)"
    @wheel="onWheel"
  />
</template>
