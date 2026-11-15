/**
 * dsh-preset-menu — 新建任务页「Agent 模式」弹窗的定位与排版修正。
 *
 * 为什么从 DOM 层动手：这个弹窗属于官方 agent-preset 面板（
 * @deepseek-ai/dsh-client-ui-agent-preset 用的 primitives <Menu>），定位完全由
 * CSS 锚点定位负责，规则是「贴着窗口边缘也不许溢出」。在首页 hero 区，那意味着
 * 一个很高的面板会照常向下展开、盖住下面的输入框卡片；行内又是「名称 + 描述」
 * 两行文字塞在单行菜单项里，勾选图标垂直居中，看起来就很挤。
 *
 * 于是这里从外面把它扶正：
 *   - 默认向下展开（左边缘对齐按钮），只有下方几乎没地方时才改为上浮，
 *     并保证不越过窗口边缘；
 *   - 高度封在按钮下方的可用空间上（默认顶到窗口下沿留 12px 的位置），内容更多就在
 *     列表内滚动；
 *   - 两行内容的行布局重新排：名称 13/18 半粗、描述 12/17 次级色，勾选靠右上角对齐。
 *
 * 面板的表面、圆角、阴影、描边一概不碰，仍是官方菜单的底色。
 *
 * 几何数字不写死：宿主半区把插件目录下的 `preset-menu.json`（bottomInset / sideGap /
 * panelWidth / minSpace）经 `/dsh-preset-menu/config` 交给页面，改那个文件即可调整
 * 面板往下伸到哪、多宽、与按钮的间距；取不到时用这里的 DEFAULTS。
 *
 * 识别只依赖结构，不依赖哈希类名：一个 role="menu" 面板里，只要有至少两行是
 * 「名称 + 描述」的两段 span 结构，就认定是模式菜单。结构对不上（比如官方改了
 * 实现）就什么都不做，退回原来的行为。
 *
 * 坐标修正：窗口可能处在带 CSS `zoom` 的祖先里，此时 style 里的长度会被放大/缩小。
 * fitAxis() 用两次采样解出线性映射，把面板放到测量出来的位置上，而不是按比例漂移。
 */

window.__ModuleLoader__.load({
  id: 'dsh-preset-menu',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const STYLE_ID = 'dsh-preset-menu-style'
    const PANEL_CLASS = 'dspm-panel'
    const LIST_CLASS = 'dspm-list'

    /**
     * 几何参数的默认值，对应插件目录下的 `preset-menu.json`：
     * bottomInset = 面板底边与窗口下沿的留白（越小越往下伸），sideGap = 与按钮的间距，
     * panelWidth = 面板宽度，minSpace = 下方不足多少就改为上浮。
     */
    const DEFAULTS = Object.freeze({ bottomInset: 12, sideGap: 8, panelWidth: 368, minSpace: 96 })
    /** 当前生效的参数；打开菜单前会尝试从宿主刷新一次。 */
    const tuning = { ...DEFAULTS }
    /** 宿主提供参数的同源路由。 */
    const CONFIG_PATH = '/dsh-preset-menu/config'

    /**
     * 把一组值写回宿主（设置页保存按钮走这里）。
     * @param values - 四项几何参数。
     * @returns 宿主夹紧后真正落盘的值。
     */
    async function saveTuning(values) {
      const response = await fetch(CONFIG_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      })
      const body = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error(body?.message ?? `HTTP ${response.status}`)
      for (const name of Object.keys(DEFAULTS)) {
        const value = Number(body?.[name])
        if (Number.isFinite(value)) tuning[name] = value
      }
      return { ...tuning }
    }

    /**
     * 从宿主取最新的几何参数（宿主每次请求都重读 preset-menu.json）。
     * @returns 刷新后的参数快照。
     */
    async function refreshTuning() {
      try {
        const response = await fetch(CONFIG_PATH, { cache: 'no-store' })
        if (!response.ok) return tuning
        const next = await response.json()
        for (const name of Object.keys(DEFAULTS)) {
          const value = Number(next?.[name])
          if (Number.isFinite(value)) tuning[name] = value
        }
      } catch {
        // 宿主路由暂时不可用：保持当前值，不影响弹窗本身。
      }
      return tuning
    }

    const CSS = `
/* 只改「怎么放」「行内怎么排」和圆角档位：面板的表面、阴影、描边仍由官方样式表决定。 */
.dspm-panel {
  display: flex;
  flex-direction: column;
  border-radius: calc(var(--dsw-radius-lg) + 4px);
  overflow: hidden;
}

/* 不画滚动条，但保留滚动能力：滚轮 / 触控板 / 方向键照常翻。 */
.dspm-list {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.dspm-list::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.dspm-row-wrap {
  flex: none;
}

.dspm-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  min-height: 0;
  padding: 8px 10px;
  border-radius: calc(var(--dsw-radius-md) + 4px);
}

.dspm-stack {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: none;
}

/* 字号与颜色比官方菜单项低一档：整块面板不该比周围界面更亮。 */
.dspm-name {
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}

.dspm-desc {
  font-size: 12px;
  line-height: 17px;
  color: var(--dsw-alias-label-tertiary);
  white-space: normal;
}

/* 当前选中的那一行回到主文字色，靠它承担层级，而不是整块面板都发亮。 */
.dspm-row[data-dspm-selected] .dspm-name {
  color: var(--dsw-alias-label-primary);
}

.dspm-row > svg {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  margin-left: auto;
  color: var(--dsw-alias-brand-primary);
}

.dspm-row[data-dspm-selected] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}
`

    /**
     * 元素的直接子元素列表。
     * @param node - 父元素。
     * @returns 子元素数组（不含文本节点）。
     */
    function kids(node) {
      return Array.prototype.slice.call(node.children)
    }

    /**
     * 判断一个 span 是否是某一行「名称 + 描述」的容器。
     * @param node - 候选元素。
     * @returns 直接子元素恰好是两个 span 时为 true。
     */
    function isTitleStack(node) {
      if (!(node instanceof HTMLElement) || node.tagName !== 'SPAN') return false
      const children = kids(node)
      return children.length === 2 && children.every(child => child.tagName === 'SPAN')
    }

    /**
     * 在一行菜单项里找出「名称 + 描述」容器。
     * @param row - 一个 `button[role=menuitem]`。
     * @returns 该容器，找不到时为 undefined。
     */
    function titleStack(row) {
      for (const node of row.querySelectorAll('span')) {
        if (isTitleStack(node)) return node
      }
      return undefined
    }

    /**
     * 判断一个面板是否就是 Agent 模式菜单。
     * @param panel - 候选面板元素。
     * @returns 至少两行带描述时为 true。
     */
    function isPresetMenu(panel) {
      if (!(panel instanceof HTMLElement)) return false
      if (panel.getAttribute('role') !== 'menu') return false
      const rows = panel.querySelectorAll('button[role="menuitem"]')
      if (rows.length < 2) return false
      let stacks = 0
      for (const row of rows) {
        if (titleStack(row) !== undefined) stacks += 1
      }
      return stacks >= 2
    }

    /**
     * 给面板、列表与每一行打上样式表使用的类名。
     * @param panel - 模式菜单面板。
     */
    function decorate(panel) {
      panel.classList.add(PANEL_CLASS)
      const list = kids(panel).find(child => child.tagName === 'DIV' && !child.hasAttribute('aria-hidden'))
      if (list !== undefined) list.classList.add(LIST_CLASS)
      for (const row of panel.querySelectorAll('button[role="menuitem"]')) {
        row.classList.add('dspm-row')
        const stack = titleStack(row)
        if (stack !== undefined) {
          stack.classList.add('dspm-stack')
          const [name, desc] = kids(stack)
          name.classList.add('dspm-name')
          desc.classList.add('dspm-desc')
        }
        // 勾选图标是行内最后一个 svg；用它标记当前选中项。
        if (kids(row).some(child => child.tagName === 'svg')) row.dataset.dspmSelected = 'true'
        const wrap = row.parentElement
        if (wrap !== null) wrap.classList.add('dspm-row-wrap')
      }
    }

    /**
     * 写入一个长度，直到渲染结果与目标一致。
     *
     * 窗口若处在带 CSS `zoom` 的祖先里，style 里的长度会被缩放。这里采两次样解出
     * 线性映射（实际值 = 比例 × 写入值 + 偏移），再反解出应有的写入值，避免面板
     * 按缩放比例漂到窗口外。
     *
     * @param write - 以 style 像素写入候选值。
     * @param read - 从实时布局读回同一轴上的值。
     * @param want - 目标值（视口像素）。
     * @returns 该轴上的比例（写入值 → 渲染值）。
     */
    function fitAxis(write, read, want) {
      write(want)
      const first = read()
      if (Math.abs(first - want) <= 1) return 1
      write(want + 100)
      const second = read()
      const scale = (second - first) / 100
      if (!Number.isFinite(scale) || Math.abs(scale) < 0.05) {
        write(want)
        return 1
      }
      write((want - (first - scale * want)) / scale)
      return scale
    }

    /**
     * 撤掉全部覆盖样式，把定位交还给官方样式表。
     * @param panel - 模式菜单面板。
     */
    function releasePanel(panel) {
      for (const property of ['top', 'left', 'right', 'bottom', 'width', 'height', 'max-height']) {
        panel.style.removeProperty(property)
      }
      panel.style.removeProperty('position-try-fallbacks')
      delete panel.dataset.dspmPlaced
    }

    /**
     * 决定向上还是向下展开。
     *
     * 以向下为准：下方只要能挤出 minSpace 就向下展开，空间不够时把高度压到
     * 可用范围内、让列表自己滚。只有下方几乎没地方、且上方确实更宽裕时才上浮。
     *
     * @param measure - 上下可用空间（视口像素）。
     * @returns `'above'` 或 `'below'`。
     */
    function chooseSide({ roomAbove, roomBelow }) {
      if (roomBelow >= tuning.minSpace) return 'below'
      return roomAbove > roomBelow ? 'above' : 'below'
    }

    /**
     * 按可用空间决定上浮还是下拉，并写入尺寸与坐标。
     * @param panel - 模式菜单面板。
     * @param chip - 当前展开的模式按钮。
     * @returns 是否真的接管了定位。
     */
    function place(panel, chip) {
      // 视口尺寸要与 chipBox 用同一套坐标（窗口祖先可能带 CSS zoom，innerHeight 与
      // getBoundingClientRect 会相差一个缩放比），所以这里量 body 的矩形。
      const shellBox = document.body.getBoundingClientRect()
      const viewWidth = shellBox.width > 0 ? shellBox.width : window.innerWidth
      const viewHeight = shellBox.height > 0 ? shellBox.height : window.innerHeight
      const chipBox = chip.getBoundingClientRect()
      // 位置与视口都没变就别再量一遍：滚动与重渲染都会走到这里，而量一次要读好几回布局。
      // 这个判断必须放在改样式之前——否则提前返回时会把限高留在 none 上。
      const signature = [
        Math.round(chipBox.left), Math.round(chipBox.top),
        Math.round(chipBox.width), Math.round(chipBox.height),
        viewWidth, viewHeight,
      ].join(':')
      if (panel.dataset.dspmPlaced === signature) return true

      panel.style.height = 'auto'
      panel.style.maxHeight = 'none'
      panel.style.bottom = 'auto'
      panel.style.right = 'auto'
      // 量高会先把限高撤掉，列表的滚动位置会因此归零；量完再放回去。
      const list = panel.querySelector(`.${LIST_CLASS}`)
      const keepScroll = list === null ? 0 : list.scrollTop
      const restoreScroll = () => {
        if (list !== null && list.scrollTop !== keepScroll) list.scrollTop = keepScroll
      }
      if (chipBox.bottom < 0 || chipBox.top > viewHeight) {
        releasePanel(panel)
        return false
      }

      fitAxis(
        (value) => { panel.style.width = `${value}px` },
        () => panel.getBoundingClientRect().width,
        Math.min(tuning.panelWidth, viewWidth - tuning.bottomInset * 2),
      )
      const renderedWidth = panel.getBoundingClientRect().width
      const natural = panel.getBoundingClientRect().height
      if (natural < 1 || renderedWidth < 1) {
        restoreScroll()
        releasePanel(panel)
        return false
      }

      const roomBelow = viewHeight - tuning.bottomInset - (chipBox.bottom + tuning.sideGap)
      const roomAbove = chipBox.top - tuning.sideGap - tuning.bottomInset
      const side = chooseSide({ roomAbove, roomBelow })
      const room = side === 'below' ? roomBelow : roomAbove
      if (room < tuning.minSpace) {
        restoreScroll()
        releasePanel(panel)
        return false
      }

      // 高度封在可用空间上（一直顶到窗口下沿留 bottomInset 的位置），内容更多就在列表内滚动。
      const height = Math.min(natural, room)
      const left = Math.min(
        Math.max(chipBox.left, tuning.bottomInset),
        Math.max(tuning.bottomInset, viewWidth - tuning.bottomInset - renderedWidth),
      )
      fitAxis(
        (value) => { panel.style.left = `${value}px` },
        () => panel.getBoundingClientRect().left,
        left,
      )
      const top = side === 'below' ? chipBox.bottom + tuning.sideGap : chipBox.top - tuning.sideGap - height
      const topScale = fitAxis(
        (value) => { panel.style.top = `${value}px` },
        () => panel.getBoundingClientRect().top,
        top,
      )
      panel.style.maxHeight = `${height / topScale}px`
      panel.style.setProperty('position-try-fallbacks', 'none')
      panel.dataset.dspmPlaced = signature
      restoreScroll()
      return true
    }

    /**
     * 监听弹窗的出现与消失，并在其打开期间维持定位。
     * @returns start / stop 两个句柄。
     */
    function createController() {
      /** @type {{ panel: HTMLElement, chip: HTMLElement | undefined, abort: AbortController, watch: MutationObserver } | null} */
      let active = null
      /** 待执行的重新定位帧。 */
      let frame = 0

      /** 丢掉排队中的重新定位。 */
      function dropFrame() {
        if (frame === 0) return
        cancelAnimationFrame(frame)
        frame = 0
      }

      /**
       * 在 body 里找当前打开的 Agent 模式面板。
       * @returns 面板元素，找不到时为 undefined。
       */
      function findPanel() {
        const candidates = document.body.querySelectorAll('[role="menu"]')
        for (let index = candidates.length - 1; index >= 0; index -= 1) {
          if (isPresetMenu(candidates[index])) return candidates[index]
        }
        return undefined
      }

      /**
       * 找当前展开的模式按钮（弹窗的锚点）。
       * @returns 按钮元素，找不到时为 undefined。
       */
      function findChip() {
        const triggers = document.querySelectorAll('button[aria-haspopup="menu"][aria-expanded="true"]')
        return triggers.length === 0 ? undefined : triggers[triggers.length - 1]
      }

      /**
       * 盯住官方重渲染对面板属性的改写：类名被抹掉就补回来，inline 覆盖被抹掉就重新定位。
       * @param panel - 模式菜单面板。
       * @param reposition - 排队一次重新定位。
       * @returns 该面板的观察器。
       */
      function watchPanel(panel, reposition) {
        const watch = new MutationObserver(() => {
          if (!panel.isConnected) return
          if (!panel.classList.contains(PANEL_CLASS)) decorate(panel)
          if (panel.style.top === '') {
            delete panel.dataset.dspmPlaced
            reposition()
          }
        })
        watch.observe(panel, { attributes: true, attributeFilter: ['class', 'style'] })
        return watch
      }

      /** 结束当前面板的接管。 */
      function teardown() {
        if (active === null) return
        dropFrame()
        active.abort.abort()
        active.watch.disconnect()
        active = null
        // 关掉之后顺手取一次最新参数，下一次点开就是新值。
        void refreshTuning()
      }

      /**
       * 接管一个新出现（或已经打开）的面板。
       * @param panel - 模式菜单面板。
       */
      function activate(panel) {
        decorate(panel)
        const chip = findChip()
        const abort = new AbortController()
        // 只跟窗口级变化走；列表内部滚动自己的滚动条不该触发重排。
        const reposition = () => {
          if (frame !== 0 || chip === undefined) return
          frame = requestAnimationFrame(() => {
            frame = 0
            if (panel.isConnected) place(panel, chip)
          })
        }
        active = { panel, chip, abort, watch: watchPanel(panel, reposition) }
        if (chip === undefined) return
        place(panel, chip)
        const onScroll = (event) => {
          const target = event.target
          if (target instanceof Node && panel.contains(target)) return
          reposition()
        }
        window.addEventListener('resize', reposition, { signal: abort.signal, passive: true })
        window.addEventListener('scroll', onScroll, { signal: abort.signal, capture: true, passive: true })
        // 字体或内容落定后高度可能微调，稳定一帧后再量一次。
        reposition()
      }

      /** 对齐当前状态：面板换了就换接管对象，关掉就收尾。 */
      function sync() {
        if (active !== null && !active.panel.isConnected) teardown()
        const panel = findPanel()
        if (panel === undefined) {
          if (active !== null) teardown()
          return
        }
        if (active !== null && active.panel === panel) return
        teardown()
        activate(panel)
      }

      /**
       * 新加入的节点是否可能是一个菜单。
       * @param node - 新增节点。
       * @returns 是菜单根或包含菜单时为 true。
       */
      function looksLikeMenu(node) {
        if (!(node instanceof HTMLElement)) return false
        return node.matches('[role="menu"], [data-menu-material]') || node.querySelector('[role="menu"]') !== null
      }

      const observer = new MutationObserver((records) => {
        let opened = false
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (looksLikeMenu(node)) opened = true
          }
        }
        if (active !== null && !active.panel.isConnected) teardown()
        // 弹窗挂载发生在绘制前，这里同步定位，不会先闪一下官方位置。
        if (opened) sync()
      })

      return {
        start() {
          void refreshTuning()
          // 弹层由 portal 直接挂在 body 上，盯这一层就够了，不必订阅整棵子树。
          observer.observe(document.body, { childList: true })
          sync()
        },
        stop() {
          observer.disconnect()
          // 插件被停用/重载时，正在打开的面板交还给官方定位。
          if (active !== null && active.panel.isConnected) releasePanel(active.panel)
          teardown()
        },
      }
    }

    /** 设置页里的一行：左侧标题与说明，右侧数字输入。 */
    const FIELDS = Object.freeze([
      { key: 'bottomInset', title: '底部留白', hint: '面板底边距窗口下沿的像素。越小，弹窗向下伸得越低。', min: 0, max: 200 },
      { key: 'sideGap', title: '与按钮的间距', hint: '弹窗与模式按钮之间的距离。', min: 0, max: 64 },
      { key: 'panelWidth', title: '面板宽度', hint: '名称与描述换行后的舒适宽度。', min: 220, max: 900 },
      { key: 'minSpace', title: '上浮阈值', hint: '按钮下方不足这个高度时，改为向上展开。', min: 0, max: 800 },
    ])

    /** 设置页用到的主题取色（都带 fallback，明暗主题都跟着走）。 */
    const SKIN = Object.freeze({
      label: 'var(--dsw-alias-label-primary, #1f2329)',
      dim: 'var(--dsw-alias-label-secondary, #6b7280)',
      faint: 'var(--dsw-alias-label-tertiary, #9aa1ab)',
      border: 'var(--dsw-alias-border-l2, #e4e7ec)',
      field: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, #ffffff))',
      accent: 'var(--dsw-alias-brand-primary, #4d6bfe)',
      error: 'var(--dsw-alias-state-error-primary, #e5484d)',
      ok: 'var(--dsw-alias-state-success-primary, #30a46c)',
    })

    /** 数字输入框。 */
    function NumberField({ field, value, disabled, onChange }) {
      return h('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: 16, padding: '12px 0', borderTop: `0.5px solid ${SKIN.border}` },
      }, [
        h('div', { key: 'text', style: { flex: '1 1 auto', minWidth: 0 } }, [
          h('div', { key: 'title', style: { fontSize: 13, lineHeight: '20px', fontWeight: 500, color: SKIN.label } }, field.title),
          h('div', { key: 'hint', style: { fontSize: 12, lineHeight: '17px', color: SKIN.dim, marginTop: 2 } }, field.hint),
        ]),
        h('div', { key: 'input', style: { display: 'flex', alignItems: 'center', gap: 6, flex: 'none' } }, [
          h('input', {
            key: 'value',
            type: 'number',
            min: field.min,
            max: field.max,
            step: 1,
            value: value ?? '',
            disabled,
            onChange: (event) => onChange(field.key, event.target.value),
            style: {
              width: 88, padding: '5px 8px', fontSize: 13, lineHeight: '20px', textAlign: 'right',
              color: SKIN.label, background: SKIN.field,
              border: `0.5px solid ${SKIN.border}`, borderRadius: 8,
              outline: 'none', fontFamily: 'inherit',
            },
          }),
          h('span', { key: 'unit', style: { fontSize: 12, color: SKIN.faint, width: 18 } }, 'px'),
        ]),
      ])
    }

    /** 设置页里「Agent 模式弹窗」这一页。 */
    function PresetMenuSection() {
      const [draft, setDraft] = React.useState(null)
      const [status, setStatus] = React.useState('')
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let alive = true
        void refreshTuning().then((values) => { if (alive) setDraft({ ...values }) })
        return () => { alive = false }
      }, [])

      const commit = async (values) => {
        setBusy(true)
        setStatus('')
        setError('')
        try {
          setDraft({ ...await saveTuning(values) })
          setStatus('已保存，下次点开模式菜单即生效')
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }

      const buttonStyle = (primary) => ({
        padding: '6px 14px', fontSize: 13, lineHeight: '20px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
        border: primary ? 'none' : `0.5px solid ${SKIN.border}`,
        // 主按钮走「反色」：label-primary 作底、bg-base 作字，和 DSH 自己的主按钮一致，
        // 明暗主题都有对比（品牌色在部分主题里会解析成浅色，白字会看不见）。
        background: primary ? 'var(--dsw-alias-label-primary, #1f2329)' : 'transparent',
        color: primary ? 'var(--dsw-alias-bg-base, #ffffff)' : SKIN.label,
        opacity: busy ? 0.6 : 1,
        fontFamily: 'inherit',
      })

      const note = error !== ''
        ? h('span', { key: 'note', style: { fontSize: 12, color: SKIN.error } }, error)
        : status !== ''
          ? h('span', { key: 'note', style: { fontSize: 12, color: SKIN.ok } }, status)
          : h('span', { key: 'note', style: { fontSize: 12, color: SKIN.faint } }, '这组数字决定弹窗往下伸多低、多宽、与按钮的间距。')

      return h('div', { style: { display: 'flex', flexDirection: 'column', fontFamily: 'inherit' } }, [
        h('div', { key: 'intro', style: { fontSize: 13, lineHeight: '20px', color: SKIN.dim, marginBottom: 4 } },
          '调整新建任务页「Agent 模式」弹窗的位置与尺寸；保存后会写回插件目录下的 preset-menu.json。'),
        ...FIELDS.map((field) => h(NumberField, {
          key: field.key,
          field,
          value: draft === null ? '' : draft[field.key],
          disabled: busy || draft === null,
          onChange: (key, text) => setDraft((current) => (current === null ? current : { ...current, [key]: text })),
        })),
        h('div', { key: 'footer', style: { display: 'flex', alignItems: 'center', gap: 12, paddingTop: 16, marginTop: 4, borderTop: `0.5px solid ${SKIN.border}` } }, [
          h('button', { key: 'save', type: 'button', disabled: busy || draft === null, style: buttonStyle(true), onClick: () => { void commit(draft) } }, '保存'),
          h('button', {
            key: 'reset',
            type: 'button',
            disabled: busy || draft === null,
            style: buttonStyle(false),
            onClick: () => { void commit(DEFAULTS) },
          }, '恢复默认'),
          h('span', { key: 'spacer', style: { flex: '1 1 auto' } }),
          note,
        ]),
      ])
    }

    /**
     * 把设置页挂进「设置」侧栏；拿不到插槽服务时安静跳过。
     * @param ctx - 浏览器半区插件上下文。
     */
    function mountSettingsSection(ctx) {
      try {
        const slots = ctx.get?.('slots')
        if (slots === undefined || typeof slots.inject !== 'function') return
        const dispose = slots.inject('settings.section', () => slots.register({
          name: 'settings.section',
          id: 'dsh-preset-menu',
          order: 34,
          label: '模式弹窗',
        }, PresetMenuSection))
        if (typeof dispose === 'function') ctx.effect(() => dispose)
      } catch {
        // 设置面板不可用时不影响弹窗本身。
      }
    }

    /**
     * 注入样式表并启动监听。
     * @param ctx - 浏览器半区插件上下文。
     */
    function apply(ctx) {
      ctx.effect(() => {
        const previous = document.getElementById(STYLE_ID)
        if (previous !== null) previous.remove()
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.dataset.plugin = 'dsh-preset-menu'
        style.textContent = CSS
        document.head.appendChild(style)
        const controller = createController()
        controller.start()
        return () => {
          controller.stop()
          style.remove()
        }
      }, 'dsh-preset-menu: agent-mode menu placement and rows')
      mountSettingsSection(ctx)
    }

    return { name: 'dsh-preset-menu', inject: [], apply }
  },
})
