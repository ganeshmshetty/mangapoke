/* =============================================
   Manga Viewer — app.js
   ============================================= */

// ==================== API ====================
const api = {
  async getChapters() {
    const res = await fetch("/api/chapters");
    if (!res.ok) throw new Error("Failed to load chapters");
    return res.json();
  },
  async getChapter(chapterId) {
    const res = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}`);
    if (!res.ok) throw new Error("Failed to load chapter");
    return res.json();
  },
  async getState() {
    const res = await fetch("/api/state");
    if (!res.ok) return { state: null };
    return res.json();
  },
  async saveState(state) {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  },
};

// ==================== DOM ====================
const dom = {
  appRoot: document.getElementById("appRoot"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  sidebar: document.getElementById("sidebar"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  mobileOverlay: document.getElementById("mobileOverlay"),
  chapterSearch: document.getElementById("chapterSearch"),
  chapterList: document.getElementById("chapterList"),
  chapterTitle: document.getElementById("chapterTitle"),
  pageIndicator: document.getElementById("pageIndicator"),
  footerPageDisplay: document.getElementById("footerPageDisplay"),
  progressFill: document.getElementById("progressFill"),
  pageStage: document.getElementById("pageStage"),
  modeToggle: document.getElementById("modeToggle"),
  modeLabel: document.getElementById("modeLabel"),
  prevButton: document.getElementById("prevButton"),
  nextButton: document.getElementById("nextButton"),
  prevLabel: document.getElementById("prevLabel"),
  nextLabel: document.getElementById("nextLabel"),
  keyboardHint: document.getElementById("keyboardHint"),
  shortcutsModal: document.getElementById("shortcutsModal"),
  closeShortcuts: document.getElementById("closeShortcuts"),
  toastContainer: document.getElementById("toastContainer"),
  fullscreenToggle: document.getElementById("fullscreenToggle"),
  fullscreenIcon: document.getElementById("fullscreenIcon"),
  zoomToolbar: document.getElementById("zoomToolbar"),
  zoomLevel: document.getElementById("zoomLevel"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomResetBtn: document.getElementById("zoomResetBtn"),
};

// ==================== State ====================
const storageKey = "manga_viewer_state";
const state = {
  chapters: [],
  currentChapterId: null,
  pages: [],
  currentPageIndex: 1,
  mode: "vertical",
  updatedAt: 0,
  saveTimer: null,
  isLoading: false,
  sidebarOpen: true,
  navDirection: "right",
  imageCache: new Map(),
  pageBadgeTimer: null,
  uiHidden: false,
  // Zoom state
  zoomScale: 1,
  zoomMin: 0.5,
  zoomMax: 4,
  zoomStep: 0.25,
};

const MOBILE_BREAKPOINT = 768;

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function syncViewportHeightVar() {
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-vh", `${Math.round(viewportHeight)}px`);
}

function syncSidebarState() {
  const isMobile = isMobileViewport();
  if (isMobile) {
    // On mobile: sidebar is always a fixed overlay drawer.
    // We keep sidebar-collapsed on the app grid so the grid stays 1fr,
    // and we use mobile-open to slide the drawer in/out.
    dom.appRoot.classList.add("sidebar-collapsed");
    dom.sidebar.classList.toggle("mobile-open", state.sidebarOpen);
    dom.mobileOverlay.classList.toggle("visible", state.sidebarOpen);
  } else {
    // Desktop: toggle sidebar via grid column
    dom.sidebar.classList.remove("mobile-open");
    dom.mobileOverlay.classList.remove("visible");
    dom.appRoot.classList.toggle("sidebar-collapsed", !state.sidebarOpen);
  }
}

// ==================== Utilities ====================
function showLoading() {
  state.isLoading = true;
  dom.loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  state.isLoading = false;
  dom.loadingOverlay.classList.add("hidden");
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== State Persistence ====================
function saveLocalState() {
  if (!state.currentChapterId) return;
  const payload = {
    chapter_id: state.currentChapterId,
    page_index: state.currentPageIndex,
    mode: state.mode,
    ui_hidden: state.uiHidden,
    updated_at: Date.now(),
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
  debounceSaveServer(payload);
}

function debounceSaveServer(payload) {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    api.saveState(payload).catch(() => { }); // silent fail for server sync
  }, 600);
}

function getLocalState() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function resolveState(local, remote) {
  if (!local && !remote) return null;
  if (local && !remote) return local;
  if (!local && remote) return remote;
  return local.updated_at >= remote.updated_at ? local : remote;
}

// ==================== Sidebar ====================
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  syncSidebarState();
}

function closeMobileSidebar() {
  if (isMobileViewport() && state.sidebarOpen) {
    state.sidebarOpen = false;
    syncSidebarState();
  }
}

// ==================== Mode ====================
function setMode(mode) {
  state.mode = mode;
  state.zoomScale = 1;
  dom.zoomLevel.textContent = "100%";
  dom.modeLabel.textContent = mode === "vertical" ? "Vertical" : "Single";
  // Toggle immersive mode on reader for single mode
  const reader = dom.pageStage.closest(".reader");
  if (reader) {
    reader.classList.toggle("immersive", mode === "single");
  }
  updateNavLabels();
  renderPages();
  saveLocalState();
}

// ==================== Page Indicator & Progress ====================
function updatePageIndicator() {
  const total = state.pages.length;
  const text = `Page ${state.currentPageIndex} / ${total}`;
  dom.pageIndicator.textContent = text;
  if (dom.footerPageDisplay) {
    dom.footerPageDisplay.textContent = text;
  }
  updateProgress();
  updateNavLabels();
}

function updateProgress() {
  const total = state.pages.length;
  if (total === 0) {
    dom.progressFill.style.width = "0%";
    return;
  }
  if (state.mode === "vertical") {
    // Use scroll position for vertical mode
    const el = dom.pageStage;
    const scrollable = el.scrollHeight - el.clientHeight;
    const pct = scrollable > 0 ? (el.scrollTop / scrollable) * 100 : 0;
    dom.progressFill.style.width = `${Math.min(pct, 100)}%`;
  } else {
    const pct = (state.currentPageIndex / total) * 100;
    dom.progressFill.style.width = `${pct}%`;
  }
}

function updateNavLabels() {
  const idx = state.chapters.findIndex((c) => c.id === state.currentChapterId);
  const hasPrevChapter = idx > 0;
  const hasNextChapter = idx >= 0 && idx < state.chapters.length - 1;

  if (state.mode === "vertical") {
    // Vertical mode: prev/next always mean chapter
    dom.prevLabel.textContent = "Prev Ch";
    dom.nextLabel.textContent = "Next Ch";
    dom.prevButton.disabled = !hasPrevChapter;
    dom.nextButton.disabled = !hasNextChapter;
  } else {
    // Single mode: context-aware labels
    const atFirst = state.currentPageIndex <= 1;
    const atLast = state.currentPageIndex >= state.pages.length;

    if (atFirst && !hasPrevChapter) {
      dom.prevLabel.textContent = "Prev";
      dom.prevButton.disabled = true;
    } else if (atFirst) {
      dom.prevLabel.textContent = "Prev Ch";
      dom.prevButton.disabled = false;
    } else {
      dom.prevLabel.textContent = "Prev";
      dom.prevButton.disabled = false;
    }

    if (atLast && !hasNextChapter) {
      dom.nextLabel.textContent = "Next";
      dom.nextButton.disabled = true;
    } else if (atLast) {
      dom.nextLabel.textContent = "Next Ch";
      dom.nextButton.disabled = false;
    } else {
      dom.nextLabel.textContent = "Next";
      dom.nextButton.disabled = false;
    }
  }
}

// ==================== Chapter List ====================
function renderChapterList(filter = "") {
  dom.chapterList.innerHTML = "";
  const query = filter.toLowerCase().trim();

  state.chapters.forEach((chapter) => {
    if (query && !chapter.title.toLowerCase().includes(query) && !chapter.id.toLowerCase().includes(query)) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-item";
    if (chapter.id === state.currentChapterId) {
      button.classList.add("active");
    }

    const titleSpan = document.createElement("span");
    titleSpan.textContent = `Ch. ${chapter.title}`;

    const countSpan = document.createElement("span");
    countSpan.className = "page-count";
    countSpan.textContent = `${chapter.page_count}p`;

    button.appendChild(titleSpan);
    button.appendChild(countSpan);

    button.addEventListener("click", () => {
      selectChapter(chapter.id, 1);
      closeMobileSidebar();
    });
    dom.chapterList.appendChild(button);
  });

  // After rendering, scroll active into view
  requestAnimationFrame(() => scrollToActiveChapter());
}

function scrollToActiveChapter() {
  const active = dom.chapterList.querySelector(".chapter-item.active");
  if (active) {
    active.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

// ==================== Reader ====================
async function selectChapter(chapterId, pageIndex) {
  showLoading();
  try {
    state.currentChapterId = chapterId;
    const chapter = await api.getChapter(chapterId);
    state.pages = chapter.pages || [];
    state.currentPageIndex = Math.min(Math.max(pageIndex, 1), state.pages.length || 1);
    dom.chapterTitle.textContent = `Chapter ${getChapterTitle(chapterId)}`;
    renderChapterList(dom.chapterSearch.value);
    renderPages();
    saveLocalState();
    preloadAdjacentChapters();
  } catch (err) {
    showToast("Failed to load chapter", "error");
    console.error(err);
  } finally {
    hideLoading();
  }
}

function getChapterTitle(chapterId) {
  const chapter = state.chapters.find((item) => item.id === chapterId);
  return chapter ? chapter.title : chapterId;
}

function renderPages() {
  // Destroy any existing Panzoom instance before rebuilding
  destroyPanzoom();
  dom.pageStage.innerHTML = "";
  dom.pageStage.className = `page-stage ${state.mode}`;
  dom.pageStage.style.overflowX = "";
  dom.pageStage.style.alignItems = "";

  if (!state.pages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<p>No pages found in this chapter</p>";
    dom.pageStage.appendChild(empty);
    updatePageIndicator();
    syncZoomToolbarVisibility();
    return;
  }

  if (state.mode === "vertical") {
    state.pages.forEach((page) => {
      const img = document.createElement("img");
      img.src = page.url;
      img.loading = "lazy";
      img.alt = `Page ${page.index}`;
      img.dataset.pageIndex = page.index;
      img.onload = () => img.classList.add("loaded");
      img.onerror = () => {
        img.alt = `Failed to load page ${page.index}`;
        img.classList.add("loaded");
      };
      dom.pageStage.appendChild(img);
    });
    updatePageIndicator();
    // Delay scroll to allow images to start sizing
    requestAnimationFrame(() => {
      if (state.zoomScale !== 1) {
        applyVerticalZoom(state.zoomScale);
      }
      scrollToPage(state.currentPageIndex);
      attachScrollWatcher();
      syncZoomToolbarVisibility();
    });
  } else {
    renderSinglePage();
  }
}

function renderSinglePage() {
  dom.pageStage.innerHTML = "";
  dom.pageStage.className = "page-stage single";
  dom.pageStage.onscroll = null;

  const page = state.pages[state.currentPageIndex - 1];
  if (!page) {
    syncZoomToolbarVisibility();
    return;
  }
  const desiredZoom = Math.min(Math.max(state.zoomScale, state.zoomMin), state.zoomMax);

  // --- Wrapper for the image ---
  const wrapper = document.createElement("div");
  wrapper.className = "single-page-wrapper";

  const img = document.createElement("img");
  img.alt = `Page ${page.index}`;
  img.draggable = false;

  // Use cached image if available
  if (state.imageCache.has(page.url)) {
    img.src = page.url;
    img.classList.add("loaded");
  } else {
    img.src = page.url;
    img.onload = () => {
      img.classList.add("loaded");
      state.imageCache.set(page.url, true);
    };
  }
  img.onerror = () => {
    img.alt = `Failed to load page ${page.index}`;
    img.classList.add("loaded");
  };

  // Slide animation direction
  const dir = state.navDirection;
  const animClass = dir === "left" ? "slide-in-left" : "slide-in-right";
  img.classList.add(animClass);

  wrapper.appendChild(img);
  dom.pageStage.appendChild(wrapper);

  // --- Click zones for prev/next ---
  const idx = state.chapters.findIndex((c) => c.id === state.currentChapterId);
  const hasPrevChapter = idx > 0;
  const hasNextChapter = idx >= 0 && idx < state.chapters.length - 1;
  const canGoPrev = state.currentPageIndex > 1 || hasPrevChapter;
  const canGoNext = state.currentPageIndex < state.pages.length || hasNextChapter;

  const leftZone = document.createElement("div");
  leftZone.className = `click-zone left${canGoPrev ? "" : " disabled"} panzoom-exclude`;
  leftZone.innerHTML = '<div class="zone-icon">←</div>';
  leftZone.addEventListener("click", () => { state.navDirection = "left"; goToPrev(); });

  const rightZone = document.createElement("div");
  rightZone.className = `click-zone right${canGoNext ? "" : " disabled"} panzoom-exclude`;
  rightZone.innerHTML = '<div class="zone-icon">→</div>';
  rightZone.addEventListener("click", () => { state.navDirection = "right"; goToNext(); });

  dom.pageStage.appendChild(leftZone);
  dom.pageStage.appendChild(rightZone);

  // --- Floating page badge ---
  const badge = document.createElement("div");
  badge.className = "page-badge";
  badge.textContent = `${state.currentPageIndex} / ${state.pages.length}`;
  dom.pageStage.appendChild(badge);
  // Flash badge briefly
  showPageBadge(badge);

  // --- Thumbnail strip ---
  const strip = document.createElement("div");
  strip.className = "thumb-strip panzoom-exclude";
  state.pages.forEach((p, i) => {
    const thumb = document.createElement("div");
    thumb.className = `thumb-item${p.index === state.currentPageIndex ? " active" : ""}`;
    const thumbImg = document.createElement("img");
    thumbImg.src = p.url;
    thumbImg.loading = "lazy";
    thumbImg.alt = `Thumb ${p.index}`;
    thumbImg.draggable = false;
    thumb.appendChild(thumbImg);
    thumb.addEventListener("click", () => {
      state.navDirection = p.index > state.currentPageIndex ? "right" : "left";
      goToPage(p.index);
    });
    strip.appendChild(thumb);
  });
  dom.pageStage.appendChild(strip);

  // Scroll active thumb into view
  requestAnimationFrame(() => {
    const activeThumb = strip.querySelector(".thumb-item.active");
    if (activeThumb) {
      activeThumb.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  });

  updatePageIndicator();
  preloadSinglePageNeighbors();

  // Initialize Panzoom after slide animation finishes
  // so CSS animation transform doesn't conflict with Panzoom's transform
  const startPanzoom = () => {
    img.classList.remove(animClass);
    initPanzoom(img);
    if (desiredZoom !== 1 && panzoomInstance) {
      panzoomInstance.zoom(desiredZoom, { animate: false });
      state.zoomScale = Math.round(desiredZoom * 100) / 100;
      dom.zoomLevel.textContent = `${Math.round(state.zoomScale * 100)}%`;
    } else {
      state.zoomScale = 1;
      dom.zoomLevel.textContent = "100%";
    }
    syncZoomToolbarVisibility();
  };
  img.addEventListener("animationend", startPanzoom, { once: true });
  // Fallback if animation doesn't fire (e.g. prefers-reduced-motion)
  setTimeout(() => {
    if (!panzoomInstance) startPanzoom();
  }, 400);
}

function showPageBadge(badge) {
  clearTimeout(state.pageBadgeTimer);
  badge.classList.add("visible");
  state.pageBadgeTimer = setTimeout(() => {
    badge.classList.remove("visible");
  }, 1200);
}

function preloadSinglePageNeighbors() {
  // Preload prev and next 2 pages
  const indices = [
    state.currentPageIndex - 2,
    state.currentPageIndex - 1,
    state.currentPageIndex + 1,
    state.currentPageIndex + 2,
  ];
  indices.forEach((idx) => {
    if (idx >= 1 && idx <= state.pages.length) {
      const url = state.pages[idx - 1].url;
      if (!state.imageCache.has(url)) {
        const preImg = new Image();
        preImg.src = url;
        preImg.onload = () => state.imageCache.set(url, true);
      }
    }
  });
}

function scrollToPage(pageIndex) {
  const target = dom.pageStage.querySelector(`img[data-page-index="${pageIndex}"]`);
  if (target) {
    target.scrollIntoView({ block: "start", behavior: "auto" });
  }
}

function attachScrollWatcher() {
  let ticking = false;
  dom.pageStage.onscroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const images = Array.from(dom.pageStage.querySelectorAll("img"));
      if (!images.length) { ticking = false; return; }
      const stageTop = dom.pageStage.getBoundingClientRect().top;
      let closest = images[0];
      let closestOffset = Infinity;
      images.forEach((img) => {
        const offset = Math.abs(img.getBoundingClientRect().top - stageTop);
        if (offset < closestOffset) {
          closest = img;
          closestOffset = offset;
        }
      });
      const pageIndex = Number(closest.dataset.pageIndex || 1);
      if (pageIndex !== state.currentPageIndex) {
        state.currentPageIndex = pageIndex;
        updatePageIndicator();
        saveLocalState();
      }
      // Always update progress even if page didn't change
      updateProgress();
      ticking = false;
    });
  };
}

// ==================== Navigation ====================
function goToPage(pageIndex) {
  const clamped = Math.min(Math.max(pageIndex, 1), state.pages.length || 1);
  if (state.mode === "single" && clamped !== state.currentPageIndex) {
    state.navDirection = clamped > state.currentPageIndex ? "right" : "left";
  }
  state.currentPageIndex = clamped;
  if (state.mode === "vertical") {
    scrollToPage(clamped);
    updatePageIndicator();
    saveLocalState();
    return;
  }
  renderSinglePage();
  saveLocalState();
}

function goToNext() {
  if (state.mode === "single") {
    state.navDirection = "right";
    if (state.currentPageIndex < state.pages.length) {
      goToPage(state.currentPageIndex + 1);
      return;
    }
  }
  goToNextChapter();
}

function goToPrev() {
  if (state.mode === "single") {
    state.navDirection = "left";
    if (state.currentPageIndex > 1) {
      goToPage(state.currentPageIndex - 1);
      return;
    }
  }
  goToPrevChapter();
}

function goToNextChapter() {
  const index = state.chapters.findIndex((c) => c.id === state.currentChapterId);
  if (index >= 0 && index < state.chapters.length - 1) {
    selectChapter(state.chapters[index + 1].id, 1);
  }
}

function goToPrevChapter() {
  const index = state.chapters.findIndex((c) => c.id === state.currentChapterId);
  if (index > 0) {
    selectChapter(state.chapters[index - 1].id, 1);
  }
}

// ==================== Preloading ====================
function preloadAdjacentChapters() {
  const index = state.chapters.findIndex((c) => c.id === state.currentChapterId);
  // Preload next chapter images
  if (index >= 0 && index < state.chapters.length - 1) {
    preloadChapterImages(state.chapters[index + 1].id);
  }
}

async function preloadChapterImages(chapterId) {
  try {
    const chapter = await api.getChapter(chapterId);
    const pages = chapter.pages || [];
    // Preload first 5 images of next chapter
    pages.slice(0, 5).forEach((page) => {
      const img = new Image();
      img.src = page.url;
    });
  } catch {
    // Silent fail for preloading
  }
}

// ==================== Keyboard Shortcuts Modal ====================
function toggleShortcutsModal(show) {
  const visible = show !== undefined ? show : !dom.shortcutsModal.classList.contains("visible");
  dom.shortcutsModal.classList.toggle("visible", visible);
}

// ==================== UI Visibility ====================
function setUIHidden(hidden) {
  const reader = dom.pageStage.closest(".reader");
  if (!reader) return;
  reader.classList.toggle("ui-hidden", hidden);
  // Also remove immersive class conflicts
  if (hidden) {
    reader.classList.remove("immersive");
  } else if (state.mode === "single") {
    reader.classList.add("immersive");
  }
  state.uiHidden = hidden;
  syncZoomToolbarVisibility();
  // Also hide sidebar on desktop when hiding UI
  if (hidden && state.sidebarOpen) {
    toggleSidebar();
  }
  // Save the UI hidden state
  saveLocalState();
}

function toggleUIVisibility() {
  setUIHidden(!state.uiHidden);
}

// ==================== Fullscreen ====================
function toggleFullscreen() {
  const el = dom.appRoot;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function updateFullscreenIcon() {
  syncViewportHeightVar();
  dom.fullscreenIcon.textContent = isFullscreen() ? "⛶" : "⛶";
  dom.fullscreenToggle.title = isFullscreen() ? "Exit fullscreen (F)" : "Enter fullscreen (F)";
  // Add a visual cue: change the button style in fullscreen
  dom.fullscreenToggle.classList.toggle("active", isFullscreen());
}

// ==================== Zoom (Panzoom library for single, width-based for vertical) ====================
let panzoomInstance = null;
let panzoomWheelTarget = null;
let panzoomWheelHandler = null;
// Track cursor position for focal-point zooming via buttons/keyboard
let lastCursorPos = { clientX: 0, clientY: 0, tracked: false };

function destroyPanzoom() {
  if (panzoomWheelTarget && panzoomWheelHandler) {
    panzoomWheelTarget.removeEventListener("wheel", panzoomWheelHandler);
  }
  panzoomWheelTarget = null;
  panzoomWheelHandler = null;

  if (panzoomInstance) {
    panzoomInstance.destroy();
    panzoomInstance = null;
  }
}

function syncZoomToolbarVisibility() {
  if (state.uiHidden) {
    dom.zoomToolbar.classList.remove("visible");
    return;
  }
  const shouldShow = state.pages.length > 0 && (state.mode === "single" || state.zoomScale !== 1);
  dom.zoomToolbar.classList.toggle("visible", shouldShow);
}

function initPanzoom(elem) {
  destroyPanzoom();

  panzoomInstance = Panzoom(elem, {
    maxScale: state.zoomMax,
    minScale: state.zoomMin,
    startScale: 1,
    step: 0.15,
    cursor: "grab",
    canvas: false,
    panOnlyWhenZoomed: true,
    // Don't let Panzoom set overflow:hidden on parent — we manage that via CSS
    overflow: "visible",
  });

  // Bind wheel zoom to the wrapper (elem.parentElement)
  const wrapper = elem.parentElement;
  if (wrapper) {
    panzoomWheelTarget = wrapper;
    panzoomWheelHandler = (event) => {
      // Keep normal wheel gestures free for scroll/nav; zoom only on pinch/ctrl+wheel.
      if (!(event.ctrlKey || event.metaKey)) return;
      if (panzoomInstance) {
        panzoomInstance.zoomWithWheel(event);
      }
    };
    wrapper.addEventListener("wheel", panzoomWheelHandler, { passive: false });
  }

  // Sync our state/UI when Panzoom changes the zoom
  elem.addEventListener("panzoomzoom", (e) => {
    const scale = e.detail.scale;
    state.zoomScale = Math.round(scale * 100) / 100;
    dom.zoomLevel.textContent = `${Math.round(state.zoomScale * 100)}%`;
    syncZoomToolbarVisibility();
  });

  elem.addEventListener("panzoomreset", () => {
    state.zoomScale = 1;
    dom.zoomLevel.textContent = "100%";
    syncZoomToolbarVisibility();
  });
}

function setZoom(newScale, focusClientX = null) {
  const scale = Math.min(Math.max(newScale, state.zoomMin), state.zoomMax);

  state.zoomScale = Math.round(scale * 100) / 100;
  dom.zoomLevel.textContent = `${Math.round(state.zoomScale * 100)}%`;
  syncZoomToolbarVisibility();

  if (state.mode === "single") {
    if (panzoomInstance) {
      if (scale === 1) {
        // Reset to origin (centered)
        panzoomInstance.reset({ animate: true });
      } else if (lastCursorPos.tracked) {
        // Zoom toward cursor position
        panzoomInstance.zoomToPoint(scale, lastCursorPos, { animate: true });
      } else {
        panzoomInstance.zoom(scale, { animate: true });
      }
    }
  } else {
    applyVerticalZoom(scale, focusClientX);
  }
}

// Vertical mode: width-based zoom (not transform-based)
function applyVerticalZoom(scale, focusClientX = null) {
  const images = dom.pageStage.querySelectorAll("img[data-page-index]");
  const stage = dom.pageStage;
  const stageRect = stage.getBoundingClientRect();
  const focusOffset = focusClientX === null
    ? stage.clientWidth / 2
    : Math.min(Math.max(focusClientX - stageRect.left, 0), stage.clientWidth);
  const prevScrollWidth = stage.scrollWidth;
  const prevFocusX = stage.scrollLeft + focusOffset;
  if (scale === 1) {
    images.forEach(img => {
      img.style.maxWidth = "";
      img.style.width = "";
    });
    stage.style.overflowX = "";
    stage.style.alignItems = "";
    stage.scrollLeft = 0;
    return;
  }

  const stageWidth = stage.clientWidth;
  const baseWidth = Math.min(900, stageWidth * 0.95);
  const targetWidth = baseWidth * scale;

  images.forEach(img => {
    img.style.maxWidth = "none";
    img.style.width = targetWidth + "px";
  });

  if (targetWidth > stageWidth) {
    stage.style.overflowX = "auto";
    stage.style.alignItems = "flex-start";
    // Keep the same horizontal focal point while widths are changing.
    requestAnimationFrame(() => {
      const nextScrollWidth = stage.scrollWidth;
      const ratio = prevScrollWidth > 0 ? prevFocusX / prevScrollWidth : 0.5;
      const targetFocus = nextScrollWidth * Math.min(Math.max(ratio, 0), 1);
      stage.scrollLeft = Math.max(0, targetFocus - focusOffset);
    });
  } else {
    stage.style.overflowX = "";
    stage.style.alignItems = "";
    stage.scrollLeft = 0;
  }
}

function isGestureExcludedTarget(target) {
  return !!target.closest(".click-zone, .thumb-strip, .zoom-toolbar, button, input, textarea");
}

function getTouchDistance(touchA, touchB) {
  const dx = touchA.clientX - touchB.clientX;
  const dy = touchA.clientY - touchB.clientY;
  return Math.hypot(dx, dy);
}

let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
let lastPinchEndTime = 0;
let pinchStartDistance = 0;
let pinchStartScale = 1;
let pinchFocusX = null;
let sidebarSwipeTracking = false;
let sidebarSwipeMode = null;
let sidebarSwipeStartX = 0;
let sidebarSwipeLastX = 0;
let sidebarSwipeStartY = 0;
let sidebarSwipeLastY = 0;



// ==================== Event Binding ====================
function bindEvents() {
  // Mode toggle
  dom.modeToggle.addEventListener("click", () =>
    setMode(state.mode === "vertical" ? "single" : "vertical")
  );


  // Navigation
  dom.prevButton.addEventListener("click", goToPrev);
  dom.nextButton.addEventListener("click", goToNext);

  // Sidebar toggle
  dom.sidebarToggle.addEventListener("click", toggleSidebar);
  dom.mobileOverlay.addEventListener("click", closeMobileSidebar);

  // Chapter search
  dom.chapterSearch.addEventListener("input", (e) => {
    renderChapterList(e.target.value);
  });

  // Fullscreen toggle
  dom.fullscreenToggle.addEventListener("click", toggleFullscreen);

  // Track the cursor position over pageStage for focal-point zooming
  dom.pageStage.addEventListener("mousemove", (e) => {
    lastCursorPos.clientX = e.clientX;
    lastCursorPos.clientY = e.clientY;
    lastCursorPos.tracked = true;
  });
  dom.pageStage.addEventListener("mouseleave", () => {
    lastCursorPos.tracked = false;
  });

  // Zoom button controls
  dom.zoomInBtn.addEventListener("click", () => setZoom(state.zoomScale + state.zoomStep));
  dom.zoomOutBtn.addEventListener("click", () => setZoom(state.zoomScale - state.zoomStep));
  dom.zoomResetBtn.addEventListener("click", () => setZoom(1));

  // Double-tap / double-click on page stage toggles UI visibility
  dom.pageStage.addEventListener("dblclick", (e) => {
    if (isGestureExcludedTarget(e.target)) return;
    e.preventDefault();
    toggleUIVisibility();
  });

  dom.pageStage.addEventListener("touchstart", (e) => {
    if (state.mode === "vertical" && e.touches.length === 2) {
      pinchStartDistance = getTouchDistance(e.touches[0], e.touches[1]);
      pinchStartScale = state.zoomScale;
      pinchFocusX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    }
  }, { passive: true });

  dom.pageStage.addEventListener("touchmove", (e) => {
    if (state.mode !== "vertical" || e.touches.length !== 2 || pinchStartDistance <= 0) return;
    e.preventDefault();
    const distance = getTouchDistance(e.touches[0], e.touches[1]);
    if (!distance) return;
    const nextScale = pinchStartScale * (distance / pinchStartDistance);
    setZoom(nextScale, pinchFocusX);
  }, { passive: false });

  dom.pageStage.addEventListener("touchend", (e) => {
    if (pinchStartDistance > 0 && e.touches.length < 2) {
      pinchStartDistance = 0;
      pinchFocusX = null;
      lastPinchEndTime = Date.now();
      return;
    }
    if (!isMobileViewport() || e.changedTouches.length !== 1) return;
    if (Date.now() - lastPinchEndTime < 350) return;
    if (isGestureExcludedTarget(e.target)) return;

    const touch = e.changedTouches[0];
    const now = Date.now();
    const dt = now - lastTapTime;
    const move = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);
    if (dt < 320 && move < 36) {
      lastTapTime = 0;
      toggleUIVisibility();
      return;
    }
    lastTapTime = now;
    lastTapX = touch.clientX;
    lastTapY = touch.clientY;
  }, { passive: true });

  dom.pageStage.addEventListener("touchcancel", () => {
    pinchStartDistance = 0;
    pinchFocusX = null;
  }, { passive: true });

  // Block browser-native zoom on Ctrl+wheel / trackpad pinch in BOTH modes.
  // For vertical mode, apply our custom width-based zoom.
  // For single mode, just preventDefault — Panzoom's zoomWithWheel handles the rest.
  dom.pageStage.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Only apply manual zoom for vertical mode; Panzoom handles single mode
      if (state.mode === "vertical") {
        const rawDelta = -e.deltaY;
        const step = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta) * 0.01, state.zoomStep);
        setZoom(state.zoomScale + step, e.clientX);
      }
    }
  }, { passive: false });

  document.addEventListener("touchstart", (e) => {
    if (!isMobileViewport() || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target;
    const fromSidebar = !!target.closest(".sidebar");
    const fromOverlay = target === dom.mobileOverlay;
    const fromEdge = touch.clientX <= 24 && !state.sidebarOpen;
    if (!fromEdge && !(state.sidebarOpen && (fromSidebar || fromOverlay))) return;

    sidebarSwipeTracking = true;
    sidebarSwipeMode = fromEdge ? "open" : "close";
    sidebarSwipeStartX = touch.clientX;
    sidebarSwipeLastX = touch.clientX;
    sidebarSwipeStartY = touch.clientY;
    sidebarSwipeLastY = touch.clientY;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!sidebarSwipeTracking || e.touches.length !== 1) return;
    sidebarSwipeLastX = e.touches[0].clientX;
    sidebarSwipeLastY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchend", () => {
    if (!sidebarSwipeTracking) return;
    const deltaX = sidebarSwipeLastX - sidebarSwipeStartX;
    const deltaY = sidebarSwipeLastY - sidebarSwipeStartY;
    const mostlyHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
    if (sidebarSwipeMode === "open" && mostlyHorizontal && deltaX > 72) {
      state.sidebarOpen = true;
      syncSidebarState();
    } else if (sidebarSwipeMode === "close" && mostlyHorizontal && deltaX < -72) {
      state.sidebarOpen = false;
      syncSidebarState();
    }
    sidebarSwipeTracking = false;
    sidebarSwipeMode = null;
  }, { passive: true });

  document.addEventListener("touchcancel", () => {
    sidebarSwipeTracking = false;
    sidebarSwipeMode = null;
  }, { passive: true });

  // Listen for fullscreen changes to update icon
  document.addEventListener("fullscreenchange", updateFullscreenIcon);
  document.addEventListener("webkitfullscreenchange", updateFullscreenIcon);

  // Keyboard hint
  dom.keyboardHint.addEventListener("click", () => toggleShortcutsModal(true));

  // Shortcuts modal
  dom.closeShortcuts.addEventListener("click", () => toggleShortcutsModal(false));
  dom.shortcutsModal.addEventListener("click", (e) => {
    if (e.target === dom.shortcutsModal) toggleShortcutsModal(false);
  });

  // Global keyboard shortcuts
  window.addEventListener("keydown", (event) => {
    // Close modal with Escape
    if (event.key === "Escape") {
      // If search input is focused, blur it
      if (document.activeElement === dom.chapterSearch) {
        dom.chapterSearch.blur();
        return;
      }
      toggleShortcutsModal(false);
      closeMobileSidebar();
      return;
    }

    // Don't handle shortcuts when typing in inputs
    if (["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;

    switch (event.key.toLowerCase()) {
      case "a":
      case "arrowleft":
      case "k":
        goToPrev();
        break;
      case "d":
      case "arrowright":
      case "j":
        goToNext();
        break;
      case "m":
        setMode(state.mode === "vertical" ? "single" : "vertical");
        break;
      case "g": {
        event.preventDefault();
        const input = prompt("Go to page:");
        const value = Number(input);
        if (!Number.isNaN(value) && value > 0) goToPage(value);
        break;
      }
      case "h":
        toggleUIVisibility();
        break;
      case "s":
        toggleSidebar();
        break;
      case "f":
        event.preventDefault();
        toggleFullscreen();
        break;
      case "+":
      case "=":
        event.preventDefault();
        setZoom(state.zoomScale + state.zoomStep);
        break;
      case "-":
      case "_":
        event.preventDefault();
        setZoom(state.zoomScale - state.zoomStep);
        break;
      case "0":
        event.preventDefault();
        setZoom(1);
        break;
      case "/":
        event.preventDefault();
        // Open sidebar if closed
        if (!state.sidebarOpen) {
          toggleSidebar();
        }
        dom.chapterSearch.focus();
        break;
      case "?":
        toggleShortcutsModal();
        break;
      default:
        break;
    }
  });

  // Handle viewport and orientation changes
  const handleViewportResize = () => {
    syncViewportHeightVar();
    syncSidebarState();
    if (state.mode === "vertical" && state.zoomScale !== 1) {
      applyVerticalZoom(state.zoomScale);
    }
  };
  window.addEventListener("resize", handleViewportResize);
  window.addEventListener("orientationchange", handleViewportResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewportHeightVar);
    window.visualViewport.addEventListener("scroll", syncViewportHeightVar);
  }
}

// ==================== Initialization ====================
async function init() {
  syncViewportHeightVar();
  showLoading();

  try {
    const [chaptersRes, serverStateRes] = await Promise.all([
      api.getChapters(),
      api.getState(),
    ]);

    state.chapters = chaptersRes.chapters || [];
    renderChapterList();

    const localState = getLocalState();
    const serverState = serverStateRes.state || null;
    const chosen = resolveState(localState, serverState);

    if (chosen && chosen.chapter_id) {
      state.mode = chosen.mode || "vertical";
      dom.modeLabel.textContent = state.mode === "vertical" ? "Vertical" : "Single";
      await selectChapter(chosen.chapter_id, chosen.page_index || 1);
      // Restore UI hidden state
      if (chosen.ui_hidden) {
        setUIHidden(true);
      }
    } else if (state.chapters.length) {
      state.mode = "vertical";
      dom.modeLabel.textContent = "Vertical";
      await selectChapter(state.chapters[0].id, 1);
    } else {
      dom.chapterTitle.textContent = "No chapters found";
      dom.pageStage.innerHTML = '<div class="empty-state"><p>No manga chapters found in this directory</p></div>';
    }

    bindEvents();

    // Collapse sidebar on mobile by default
    if (isMobileViewport()) {
      state.sidebarOpen = false;
    }
    syncSidebarState();

    // Re-sync on resize (e.g. device rotation or window resize crossing breakpoint)
    let lastMobile = isMobileViewport();
    window.addEventListener("resize", () => {
      const nowMobile = isMobileViewport();
      if (nowMobile !== lastMobile) {
        lastMobile = nowMobile;
        if (nowMobile) {
          state.sidebarOpen = false;
        }
        syncSidebarState();
      }
    });
  } catch (err) {
    showToast("Failed to initialize viewer", "error");
    console.error(err);
  } finally {
    hideLoading();
  }
}

init();
