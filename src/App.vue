<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchPatents } from './api.js'
import PatentGraph from './components/PatentGraph.vue'

const DATA_OWNER = 'LinuxSuRen'
const DATA_REPO = 'awesome-patent'
const dataRef = new URLSearchParams(location.search).get('ref') || 'master'

const patents = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const selected = ref(null)
const hover = ref(null)
const activeKinds = ref({})
const dataFetchedAt = ref(null)
const dataStale = ref(false)

const fetchedAtText = computed(() => {
  if (!dataFetchedAt.value) return ''
  const d = new Date(dataFetchedAt.value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

const kinds = computed(() => {
  const counts = new Map()
  for (const p of patents.value) counts.set(p.kind, (counts.get(p.kind) || 0) + 1)
  return [...counts.entries()].map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count)
})
const companies = computed(() => {
  const counts = new Map()
  for (const p of patents.value) counts.set(p.creator, (counts.get(p.creator) || 0) + 1)
  return [...counts.entries()].map(([creator, count]) => ({ creator, count }))
    .sort((a, b) => b.count - a.count)
})

function kindVisible(kind) {
  return activeKinds.value[kind] !== false
}
function toggleKind(kind) {
  activeKinds.value = { ...activeKinds.value, [kind]: !kindVisible(kind) }
}

function onSelect(node) {
  selected.value = node
}

const selectedPatents = computed(() => {
  if (!selected.value) return []
  const n = selected.value
  if (n.type === 'patent') return [n.patent]
  // 公司 / 领域节点：展示其关联专利列表
  return patents.value.filter((p) =>
    n.type === 'creator' ? p.creator === n.label : p.kind === n.label,
  )
})

onMounted(async () => {
  try {
    const result = await fetchPatents(DATA_OWNER, DATA_REPO, dataRef, {
      onStale: (entry) => {
        patents.value = entry.patents
        dataFetchedAt.value = entry.fetchedAt
        dataStale.value = true
        loading.value = false
      },
    })
    patents.value = result.patents
    dataFetchedAt.value = result.fetchedAt
    dataStale.value = false
  } catch (err) {
    error.value = err.message || '数据加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header__brand">专利图谱 <em>graph-patent</em></div>
      <div class="search-box">
        <input
          v-model="search"
          type="search"
          placeholder="搜索专利名 / 公开号 / 公司，节点点击查看详情"
        />
      </div>
      <div class="app-header__stats">
        <template v-if="fetchedAtText">
          数据更新于 {{ fetchedAtText }}
          <span v-if="dataStale" class="stale-note">（后台刷新中）</span>
          <br />
        </template>
        {{ patents.length }} 条专利 · {{ companies.length }} 家公司 · {{ kinds.length }} 个领域
        <template v-if="dataRef !== 'master'"> · 数据分支 {{ dataRef }}</template>
      </div>
      <a
        class="gh-link"
        href="https://github.com/LinuxSuRen/graph-patent"
        target="_blank"
        rel="noopener"
        aria-label="GitHub 仓库"
        title="GitHub 仓库"
      >
        <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
          />
        </svg>
      </a>
    </header>

    <div class="graph-area">
      <div v-if="loading" class="loading-note">正在从 awesome-patent 加载专利数据…</div>
      <div v-else-if="error" class="error-note">{{ error }}</div>
      <PatentGraph
        v-else
        :patents="patents"
        :search="search"
        :active-kinds="activeKinds"
        @select="onSelect"
        @hover="hover = $event"
      />
      <div
        v-if="hover"
        class="graph-tooltip"
        :style="{ left: hover.x + 14 + 'px', top: hover.y + 14 + 'px' }"
      >
        {{ hover.node.label }}
        <template v-if="hover.node.type === 'patent'">
          <br />{{ hover.node.patent.number }} · {{ hover.node.patent.creator }}
        </template>
      </div>
    </div>

    <aside class="side-panel">
      <h3>技术领域</h3>
      <div class="kind-filter">
        <button
          v-for="k in kinds"
          :key="k.kind"
          class="kind-chip"
          :class="{ 'is-active': kindVisible(k.kind) }"
          @click="toggleKind(k.kind)"
        >
          {{ k.kind }}（{{ k.count }}）
        </button>
      </div>

      <h3 v-if="selected && selected.type !== 'patent'">
        {{ selected.type === 'creator' ? '公司' : '领域' }}：{{ selected.label }}（{{ selectedPatents.length }} 条）
      </h3>
      <h3 v-else>详情</h3>
      <div v-if="!selectedPatents.length" class="empty-note">
        点击图中的专利、公司或领域节点查看详情
      </div>
      <div
        v-for="p in selectedPatents.slice(0, 20)"
        :key="p.number"
        class="detail-card"
        style="margin-bottom: 8px"
      >
        <div class="detail-card__title">{{ p.name }}</div>
        <div class="detail-card__row"><span class="k">公开号</span><span class="v" style="font-family: var(--font-mono)">{{ p.number }}</span></div>
        <div class="detail-card__row"><span class="k">公司</span><span class="v">{{ p.creator }}</span></div>
        <div class="detail-card__row"><span class="k">领域</span><span class="v">{{ p.kind }}</span></div>
        <div class="detail-card__row"><span class="k">年份</span><span class="v">{{ p.year || '—' }}</span></div>
        <div class="detail-card__row"><span class="k">链接</span><span class="v"><a :href="p.link" target="_blank" rel="noopener">Google Patents ↗</a></span></div>
      </div>
      <div v-if="selectedPatents.length > 20" class="empty-note">
        仅展示前 20 条，共 {{ selectedPatents.length }} 条
      </div>

      <h3 style="margin-top: 16px">图例</h3>
      <div class="legend">
        <div class="legend__item">⬡ 领域（技术分类）</div>
        <div class="legend__item">▪ 公司（申请人）</div>
        <div class="legend__item">● 专利（颜色 = 领域）</div>
        <div class="legend__item">滚轮缩放 · 拖拽平移 · 点击查询</div>
      </div>
    </aside>
  </div>
</template>
