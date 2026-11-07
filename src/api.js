// 唯一的 HTTP 封装：超时、网络错误、GitHub API 错误统一处理
export class ApiError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

const CACHE_TTL = 60 * 60 * 1000 // 1 小时内直接用缓存，超过后后台刷新

function cacheKey(owner, repo, ref) {
  return `graph-patent:cache:${owner}/${repo}@${ref}`
}

function readCache(owner, repo, ref) {
  try {
    const raw = localStorage.getItem(cacheKey(owner, repo, ref))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.patents) && parsed.patents.length > 0) return parsed
  } catch {
    // 缓存损坏时忽略，走网络
  }
  return null
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal })
    if (!resp.ok) {
      throw new ApiError(`请求失败（HTTP ${resp.status}）`, `http-${resp.status}`)
    }
    return resp
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试', 'timeout')
    }
    throw new ApiError('无法连接 GitHub，请确认网络后重试', 'network')
  } finally {
    clearTimeout(timer)
  }
}

// 并发拉取（限制同时连接数，避免浏览器/CDN 限流）
async function fetchAll(urls, concurrency, mapper) {
  const results = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (cursor < urls.length) {
      const i = cursor++
      try {
        results.push(await mapper(urls[i]))
      } catch {
        // 单个文件失败时跳过，不影响整体
      }
    }
  })
  await Promise.all(workers)
  return results.filter(Boolean)
}

// 拉取 awesome-patent 仓库 data/ 目录下全部专利 YAML。
// ref 支持 master（默认）或任意分支，便于在 PR 合并前预览分支数据。
//
// 浏览器端缓存策略（stale-while-revalidate）：
// - 命中未过期缓存（1 小时内）直接返回
// - 缓存过期时先返回旧数据（onStale 回调），后台刷新成功后回调 onRefresh
// - 网络失败且有缓存时，返回缓存并标记 fromCache
export async function fetchPatents(owner, repo, ref = 'master', hooks = {}) {
  const { onStale, onRefresh } = hooks
  const cached = readCache(owner, repo, ref)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { patents: cached.patents, fetchedAt: cached.fetchedAt, fromCache: true }
  }

  if (cached) {
    // 先给旧数据，界面立即可用
    onStale?.(cached)
  }

  try {
    const listResp = await request(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/data?ref=${encodeURIComponent(ref)}`,
      { headers: { Accept: 'application/vnd.github+json' } },
    )
    const files = await listResp.json()
    if (!Array.isArray(files)) {
      throw new ApiError('数据格式异常，请稍后重试', 'bad-shape')
    }
    const yamlFiles = files.filter((f) => f.name.endsWith('.yaml') || f.name.endsWith('.yml'))
    const [{ default: yaml }] = await Promise.all([import('js-yaml')])

    const patents = await fetchAll(yamlFiles, 10, async (file) => {
      const resp = await request(file.download_url)
      const text = await resp.text()
      try {
        const meta = yaml.load(text)
        if (meta && meta.name && meta.number) {
          return {
            name: String(meta.name),
            number: String(meta.number),
            link: meta.link || `https://patents.google.com/patent/${meta.number}`,
            kind: meta.kind || 'Other',
            creator: meta.creator || 'Unknown',
            year: meta.year || null,
          }
        }
      } catch {
        // 单个 YAML 解析失败时跳过
      }
      return null
    })

    const entry = { fetchedAt: Date.now(), count: yamlFiles.length, patents }
    try {
      localStorage.setItem(cacheKey(owner, repo, ref), JSON.stringify(entry))
    } catch {
      // 存储空间不足等情况下放弃写缓存
    }
    onRefresh?.(entry)
    return { patents, fetchedAt: entry.fetchedAt, fromCache: false }
  } catch (err) {
    if (cached) {
      return { patents: cached.patents, fetchedAt: cached.fetchedAt, fromCache: true, stale: true, error: err }
    }
    throw err
  }
}
