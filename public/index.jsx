import "@logseq/libs"
import { render } from "preact"
import { debounce } from "rambdax"
import ConfigProvider from "./comps/ConfigProvider.jsx"
import TocGen from "./comps/TocGen.jsx"
import { hash, HeadingTypes } from "./utils.js"

const observers = {}
let resizeObserver = null
let pageObserver = null

const BACK_TOP_ICON = `<svg t="1641276288794" class="kef-tocgen-icon-backtop" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4076" width="200" height="200"><path d="M526.848 202.24c-4.096-4.096-9.216-6.144-14.848-6.144s-11.264 2.048-14.848 6.144L342.016 356.864c-8.192 8.192-8.192 21.504 0 30.208 8.192 8.192 21.504 8.192 30.208 0L512 247.296l139.776 139.776c4.096 4.096 9.728 6.144 14.848 6.144 5.632 0 10.752-2.048 14.848-6.144 8.192-8.192 8.192-21.504 0-30.208L526.848 202.24zM116.224 595.968h90.624v231.936h42.496V595.968h90.624v-42.496H115.712v42.496z m458.24-42.496h-112.64c-13.824 0-27.136 5.12-37.376 15.36s-15.36 24.064-15.36 37.376v168.448c0 13.824 5.12 27.136 15.36 37.376s24.064 15.36 37.376 15.36h112.64c13.824 0 27.136-5.12 37.376-15.36s15.36-24.064 15.36-37.376V606.208c0-13.824-5.12-27.136-15.36-37.376s-23.552-15.36-37.376-15.36z m10.752 221.696c0 2.048-0.512 5.12-3.072 7.68s-5.632 3.072-7.68 3.072h-112.64c-2.048 0-5.12-0.512-7.68-3.072s-3.072-5.632-3.072-7.68V606.72c0-2.048 0.512-5.12 3.072-7.68s5.632-3.072 7.68-3.072h112.64c2.048 0 5.12 0.512 7.68 3.072s3.072 5.632 3.072 7.68v168.448z m307.2-205.824c-10.24-10.24-24.064-15.36-37.376-15.36H709.632v274.432h42.496v-120.32H855.04c13.824 0 27.136-5.12 37.376-15.36s15.36-24.064 15.36-37.376v-48.128c0-14.336-5.12-27.648-15.36-37.888z m-27.136 84.992c0 2.048-0.512 5.12-3.072 7.68s-5.632 3.072-7.68 3.072H751.104v-69.12H855.04c2.048 0 5.12 0.512 7.68 3.072s3.072 5.632 3.072 7.68v47.616h-0.512z" p-id="4077"></path></svg>`
const ICON_TRANSITION_DURATION = 200
const CURRENT = "*"

const scrollHandler = debounce((e) => {
  const scrollTop = e.target.scrollTop
  const backtop = parent.document.querySelector(".kef-tocgen-backtop")
  if (scrollTop >= 300) {
    if (backtop.style.display !== "block") {
      backtop.style.display = "block"
      requestAnimationFrame(() => {
        backtop.style.opacity = 0.7
      })
    }
  } else {
    if (backtop.style.display === "block") {
      backtop.style.opacity = 0
      setTimeout(() => {
        backtop.style.display = ""
      }, ICON_TRANSITION_DURATION)
    }
  }
}, 50)

async function main() {
  const { preferredLanguage: lang } = await logseq.App.getUserConfigs()

  logseq.provideStyle(`
    .kef-tocgen-page {
      line-height: 2;
    }
    .kef-tocgen-page:hover > .inline {
      cursor: pointer;
      color: var(--ls-link-ref-text-color);
    }
    .kef-tocgen-block {
      line-height: 1.7;
    }
    .kef-tocgen-block-children {
      margin-left: 20px;
    }
    .kef-tocgen-into {
      cursor: pointer;
    }
    .kef-tocgen-into:hover {
      color: var(--ls-link-ref-text-color);
    }
    .kef-tocgen-to {
      font-size: 0.8em;
      margin-left: 6px;
      color: var(--ls-icon-color);
    }
    .kef-tocgen-to:hover {
      color: var(--ls-link-ref-text-color);
    }
    .kef-tocgen-arrow {
      padding-right: 4px;
      margin-right: 3px;
    }
    .kef-tocgen-noactivepage::before {
      content: "${lang === "zh-CN" ? "无活动页面" : "No active page"}";
    }

    .kef-tocgen-backtop {
      position: fixed;
      left: 0;
      bottom: 55px;
      will-change: transform;
      background: var(--ls-secondary-background-color);
      border-radius: 50%;
      display: none;
      opacity: 0;
      transition: opacity ${ICON_TRANSITION_DURATION}ms ease-in-out;
    }
    .kef-tocgen-backtop:hover {
      opacity: 1 !important;
      box-shadow: 0px 2px 4px 0px #ccc;
    }
    .kef-tocgen-icon-backtop {
      width: 35px;
      height: 35px;
      fill: var(--ls-primary-text-color);
      padding: 4px;
    }
  `)

  logseq.App.onMacroRendererSlotted(tocRenderer)

  logseq.Editor.registerSlashCommand("Table of Contents", async () => {
    await logseq.Editor.insertAtEditingCursor("{{renderer :tocgen }}")
    // NOTE: Leave this cursor moving code for future reference.
    // const input = parent.document.activeElement
    // const pos = input.selectionStart - 2
    // input.setSelectionRange(pos, pos)
  })

  const mainContainer = parent.document.getElementById("main-container")
  const mainContentContainer = parent.document.getElementById(
    "main-content-container",
  )

  if (!logseq.settings?.hideBackTop) {
    const { preferredLanguage: lang } = await logseq.App.getUserConfigs()

    logseq.provideUI({
      key: "kef-tocgen-backtop",
      path: "#app-container",
      template: `<a title="${
        lang === "zh-CN" ? "回到顶部" : "Back to Top"
      }" class="kef-tocgen-backtop" data-on-click="backtop">${BACK_TOP_ICON}</a>`,
    })

    // Let backtop element get generated first.
    setTimeout(() => {
      const backtop = parent.document.querySelector(".kef-tocgen-backtop")
      const contentEl = parent.document.querySelector(
        "div[data-is-global-graph-pages] > div:first-child",
      )
      if (contentEl) {
        resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            const contentElRect = contentEl.getBoundingClientRect()
            const mainContentContainerRect =
              mainContentContainer.getBoundingClientRect()
            backtop.style.transform = `translateX(${
              contentElRect.right + 57 < mainContentContainerRect.right
                ? contentElRect.right + 20
                : mainContentContainerRect.right - 57
            }px)`
          })
        })
        resizeObserver.observe(mainContentContainer)
        resizeObserver.observe(contentEl)
      }
      mainContainer.addEventListener("scroll", scrollHandler)
    }, 0)
  }

  logseq.beforeunload(() => {
    pageObserver?.disconnect()
    for (const observer of Object.values(observers)) {
      observer?.disconnect()
    }
    mainContainer.removeEventListener("scroll", scrollHandler)
    resizeObserver?.disconnect()
  })

  console.log("#tocgen loaded")
}

async function tocRenderer({ slot, payload: { arguments: args, uuid } }) {
  const [type] = args
  if (type.trim() !== ":tocgen") return

  const { preferredLanguage: lang } = await logseq.App.getUserConfigs()
  const nameArg = !args[1] || args[1] === "$1" ? "" : args[1].trim()
  const isBlock = nameArg?.startsWith("((")
  const name =
    nameArg === CURRENT
      ? await getCurrentPageName()
      : (isBlock
          ? nameArg?.replace(/^\(\((.*)\)\)\s*$/, "$1")
          : nameArg?.replace(/^\[\[(.*)\]\]\s*$/, "$1")) ||
        (
          await logseq.Editor.getPage(
            (
              await logseq.Editor.getBlock(uuid)
            ).page.id,
          )
        ).name

  const levels =
    !args[2] || args[2] === "$2"
      ? logseq.settings?.defaultLevels ?? 1
      : Math.max(1, +args[2] || 1)
  const headingType =
    !args[3] || args[3] === "$3"
      ? logseq.settings?.defaultHeadingType ?? "any"
      : args[3].trim()
  const id = `kef-toc-${await hash(
    name,
  )}-${levels}-${headingType}-${uuid}-${slot}`

  if (HeadingTypes[headingType] == null) {
    logseq.provideUI({
      key: id,
      slot,
      template: `<div id="${id}" style="color:#f00">[${
        lang === "zh-CN"
          ? "标题类型需为 any 或 h！"
          : 'Heading type must be "any" or "h"!'
      }]</div>`,
    })
    return
  }

  const root =
    name == null
      ? null
      : isBlock
      ? await logseq.Editor.getBlock(name, { includeChildren: true })
      : await logseq.Editor.getPage(name)

  if (name != null && root == null) {
    logseq.provideUI({
      key: id,
      slot,
      template: `<div id="${id}" style="color:#f00">[${
        lang === "zh-CN" ? "页面/块不存在！" : "Page/Block not found!"
      }]</div>`,
    })
    return
  }

  logseq.provideUI({
    key: id,
    slot,
    template: `<div id="${id}"></div>`,
    reset: true,
  })

  // Let div root element get generated first.
  setTimeout(async () => {
    if (root != null) {
      await observeAndGenerate(id, root, levels, headingType, lang)
    }
    if (nameArg === CURRENT) {
      observePageViewChange(id, levels, headingType, lang)
      if (name == null) {
        const rootEl = parent.document.getElementById(id)
        render(<div class="kef-tocgen-noactivepage" />, rootEl)
      }
    }
  }, 0)
}

async function observeAndGenerate(id, root, levels, headingType, lang) {
  const rootEl = parent.document.getElementById(id)

  async function renderIfPageBlock(node) {
    const blockEl = getBlockEl(node)
    if (blockEl == null) return false

    const blockID = blockEl.getAttribute("blockid")
    let block = await logseq.Editor.getBlock(blockID)
    if (block == null) return false
    if (root.page == null && block.page.id !== root.id) return false
    if (root.page != null) {
      // Keep checking parent until root is found or no more parent.
      while (block != null) {
        if (block.parent.id === root.id) break
        block = await logseq.Editor.getBlock(block.parent.id)
      }
      if (block == null) return false
    }

    const blocks =
      root.page == null
        ? await logseq.Editor.getPageBlocksTree(root.name)
        : (await logseq.Editor.getBlock(root.id, { includeChildren: true }))
            .children
    render(
      <ConfigProvider lang={lang}>
        <TocGen
          root={root}
          blocks={blocks}
          levels={levels}
          headingType={headingType}
        />
      </ConfigProvider>,
      rootEl,
    )
    return true
  }

  if (observers[id] == null) {
    const observer = new MutationObserver(async (mutationList) => {
      for (const mutation of mutationList) {
        if (mutation.removedNodes.length > 0 && !rootEl.isConnected) {
          observer.disconnect()
          observers[id] = undefined
          return
        }

        for (const node of mutation.addedNodes) {
          if (await renderIfPageBlock(node)) return
        }
      }
    })
    observers[id] = observer

    observer.observe(parent.document.body, {
      subtree: true,
      childList: true,
    })
  }

  const blocks =
    root.page == null
      ? await logseq.Editor.getPageBlocksTree(root.name)
      : root.children

  render(
    <ConfigProvider lang={lang}>
      <TocGen
        root={root}
        blocks={blocks}
        levels={levels}
        headingType={headingType}
      />
    </ConfigProvider>,
    rootEl,
  )
}

function observePageViewChange(id, levels, headingType, lang) {
  const rootEl = parent.document.getElementById(id)

  pageObserver = new MutationObserver(async (mutationList) => {
    for (const mutation of mutationList) {
      if (mutation.removedNodes.length > 0 && !rootEl.isConnected) {
        pageObserver.disconnect()
        return
      }

      for (const node of mutation.addedNodes) {
        if (
          node.classList &&
          node.classList.contains("page") &&
          node.classList.contains("relative")
        ) {
          let root = await logseq.Editor.getCurrentPage()
          if (root.page != null) {
            root = await logseq.Editor.getPage(root.page.id)
          }
          observers[id]?.disconnect()
          observers[id] = undefined
          await observeAndGenerate(id, root, levels, headingType, lang)
          break
        }
      }
    }
  })

  pageObserver.observe(parent.document.body, {
    subtree: true,
    childList: true,
  })
}

function getBlockEl(node) {
  const body = document.body
  while (
    node != null &&
    node.getAttribute?.("blockid") == null &&
    node !== body
  ) {
    node = node.parentElement
  }
  return node === body ? null : node
}

async function getCurrentPageName() {
  let page = await logseq.Editor.getCurrentPage()
  if (page?.page != null) {
    page = await logseq.Editor.getPage(page.page.id)
  }
  return page?.name
}

function createModel() {
  return {
    backtop() {
      const mainContainer = parent.document.getElementById("main-container")
      mainContainer.scroll({ top: 0 })
    },
  }
}

logseq.ready(createModel(), main).catch(console.error)
