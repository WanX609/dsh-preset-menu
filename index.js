/**
 * dsh-preset-menu — host half.
 *
 * 浏览器半区要调整弹窗的位置与尺寸，这些数字不应该写死在代码里。这里把插件目录
 * 下的 `preset-menu.json` 通过一条同源路由交给页面，于是：
 *   - 想改高度只改那一个文件，不用碰 JS、也不用重启；
 *   - 页面每次打开菜单前重新取一次，改完下一次点开就是新值；
 *   - 文件缺失或写错时退回内置默认值，插件不会因此失效。
 *
 * 只读、只注册一条路由，不碰任何其他 Host 服务。
 */

import { readFile, writeFile } from 'node:fs/promises'

/** 同源路由前缀；浏览器半区按 `${ROUTE_PREFIX}/config` 取/存配置。 */
const ROUTE_PREFIX = '/dsh-preset-menu'
/** 配置文件相对本模块的位置。 */
const CONFIG_PATH = './preset-menu.json'
/** 配置文件与默认值：数字都能被外部改写，范围只做兜底。 */
const DEFAULTS = Object.freeze({
  /** 面板底边与窗口下沿的留白：越小，向下伸得越低。 */
  bottomInset: 12,
  /** 面板与模式按钮之间的间距。 */
  sideGap: 8,
  /** 面板宽度（名称 + 一句话描述的舒适宽度）。 */
  panelWidth: 368,
  /** 下方不足这个高度就改为上浮。 */
  minSpace: 96,
})
/** 每个字段的合法区间，超出就夹回边界。 */
const LIMITS = Object.freeze({
  bottomInset: [0, 200],
  sideGap: [0, 64],
  panelWidth: [220, 900],
  minSpace: [0, 800],
})

/**
 * 把一个字段夹进合法区间。
 * @param name - 字段名。
 * @param value - 外部给的值。
 * @returns 合法数字；不是有限数时退回默认值。
 */
function clampField(name, value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULTS[name]
  const [low, high] = LIMITS[name]
  return Math.min(high, Math.max(low, Math.round(number)))
}

/**
 * 读取配置文件并补齐/夹紧字段。
 * @returns 浏览器半区可用的完整配置。
 */
async function readTuning() {
  let raw = {}
  try {
    const text = await readFile(new URL(CONFIG_PATH, import.meta.url), 'utf8')
    const parsed = JSON.parse(text)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed
  } catch {
    // 文件不存在或不是合法 JSON：整体退回默认值。
    raw = {}
  }
  return normalize(raw)
}

/**
 * 把外部输入收敛成完整、合法的配置。
 * @param raw - 来自文件或请求体的原始对象。
 * @returns 四项都合法的配置。
 */
function normalize(raw) {
  const tuning = {}
  for (const name of Object.keys(DEFAULTS)) tuning[name] = clampField(name, raw?.[name] ?? DEFAULTS[name])
  return tuning
}

/**
 * 写回配置文件；设置页保存走这里。
 * @param raw - 请求体。
 * @returns 夹紧之后真正落盘的值。
 */
async function writeTuning(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('请求体必须是对象')
  const tuning = normalize(raw)
  await writeFile(new URL(CONFIG_PATH, import.meta.url), `${JSON.stringify(tuning, null, 2)}\n`, 'utf8')
  return tuning
}

/** 需要一个宿主 Web 服务器来承载配置路由。 */
export const inject = ['webServer']

/**
 * 读请求体并解析 JSON（上限 16 KiB）。
 * @param req - Node 请求对象。
 * @returns 解析后的对象。
 */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16 * 1024) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (size === 0) throw new Error('请求体为空')
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/**
 * 统一发一个 JSON 响应。
 * @param res - Node 响应对象。
 * @param status - HTTP 状态码。
 * @param value - 可 JSON 序列化的响应体。
 */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * 注册 `/dsh-preset-menu/config`：GET 读当前值，POST 写回，两边都会夹紧越界数字。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const dispose = webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      if (req.url !== `${ROUTE_PREFIX}/config`) {
        sendJson(res, 404, { ok: false, message: 'not found' })
        return
      }
      try {
        if (req.method === 'GET') {
          sendJson(res, 200, await readTuning())
          return
        }
        if (req.method === 'POST') {
          const saved = await writeTuning(await readJsonBody(req))
          sendJson(res, 200, saved)
          return
        }
        sendJson(res, 405, { ok: false, message: 'method not allowed' })
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) })
      }
    },
  })
  ctx.effect(() => dispose)
}

/** 测试接缝：区间与默认值的直接出口（Loader 不读它）。 */
export const __test = { DEFAULTS, LIMITS, clampField, normalize, ROUTE_PREFIX }
