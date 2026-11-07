// 唯一的 HTTP 封装：超时、网络错误、GitHub API 错误统一处理
export class ApiError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
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

// 拉取 awesome-patent 仓库 data/ 目录下全部专利 YAML。
// ref 支持 master（默认）或任意分支，便于在 PR 合并前预览分支数据。
export async function fetchPatents(owner, repo, ref = 'master') {
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

  const patents = []
  for (const file of yamlFiles) {
    const resp = await request(file.download_url)
    const text = await resp.text()
    try {
      const meta = yaml.load(text)
      if (meta && meta.name && meta.number) {
        patents.push({
          name: String(meta.name),
          number: String(meta.number),
          link: meta.link || `https://patents.google.com/patent/${meta.number}`,
          kind: meta.kind || 'Other',
          creator: meta.creator || 'Unknown',
          year: meta.year || null,
        })
      }
    } catch {
      // 单个 YAML 解析失败时跳过，不影响整体
    }
  }
  return patents
}
