(() => {
  "use strict";

  /* ------------------------------------------------------------------------
     DOM References
     ------------------------------------------------------------------------ */
  const card = document.getElementById("message-card");
  const languageView = document.getElementById("language-view");
  const languageStartHeading = document.getElementById("language-start-heading");
  const startLangButtons = document.querySelectorAll(".btn-start-lang");
  const questionView = document.getElementById("question-view");
  const celebrationView = document.getElementById("celebration-view");
  const questionHeading = document.getElementById("question-heading");
  const celebrationHeading = document.getElementById("celebration-heading");
  const cardEmblem = questionView.querySelector(".card-emblem");
  const yesBtn = document.getElementById("yes-btn");
  const noBtn = document.getElementById("no-btn");
  const noSlot = document.getElementById("no-slot");
  const nextBtn = document.getElementById("next-btn");
  const resetBtn = document.getElementById("reset-btn");
  const emblemHeartAnswer = document.getElementById("emblem-heart-answer");
  const emblemKissAnswer = document.getElementById("emblem-kiss-answer");
  const heartBurstLayer = document.getElementById("heart-burst");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsPanel = document.getElementById("settings-panel");
  const settingsCloseBtn = document.getElementById("settings-close-btn");
  const settingsTitle = document.getElementById("settings-title");
  const languageLabel = document.getElementById("language-label");
  const langOptionButtons = document.querySelectorAll(".lang-option");

  /* ------------------------------------------------------------------------
     Translations (French, English, German)
     ------------------------------------------------------------------------ */
  const STORAGE_KEY = "kawaii_message_lang";

  const TRANSLATIONS = {
    en: {
      chooseLanguage: "Choose your language",
      question1: "Are you in love with me?",
      answer1: "Ohhh! Really? Actually, I love you too ❤️",
      nextLabel: "Next question",
      question2: "Would you like to go out with me?",
      answer2: "Now we are a couple, my love 😘",
      yes: "Yes",
      no: "No",
      resetLabel: "Start over",
      settingsLabel: "Settings",
      settingsTitle: "Settings",
      languageLabel: "Language",
      closeSettingsLabel: "Close settings",
    },
    fr: {
      chooseLanguage: "Choisis ta langue",
      question1: "Es-tu amoureuse de moi ?",
      answer1: "Ohhh ! Vraiment ? En fait, je t'aime aussi ❤️",
      nextLabel: "Question suivante",
      question2: "Voudrais-tu sortir avec moi ?",
      answer2: "Maintenant nous sommes en couple, mon amour 😘",
      yes: "Oui",
      no: "Non",
      resetLabel: "Recommencer",
      settingsLabel: "Paramètres",
      settingsTitle: "Paramètres",
      languageLabel: "Langue",
      closeSettingsLabel: "Fermer les paramètres",
    },
    de: {
      chooseLanguage: "Wähle deine Sprache",
      question1: "Bist du in mich verliebt?",
      answer1: "Ohhh! Wirklich? Eigentlich liebe ich dich auch ❤️",
      nextLabel: "Nächste Frage",
      question2: "Möchtest du mit mir ausgehen?",
      answer2: "Jetzt sind wir ein Paar, mein Schatz 😘",
      yes: "Ja",
      no: "Nein",
      resetLabel: "Neu starten",
      settingsLabel: "Einstellungen",
      settingsTitle: "Einstellungen",
      languageLabel: "Sprache",
      closeSettingsLabel: "Einstellungen schließen",
    },
  };

  /* ------------------------------------------------------------------------
     Configuration & State
     ------------------------------------------------------------------------ */
  const SAFE_MARGIN = 16;         // Minimum gap from viewport edges (px)
  const APPROACH_RADIUS = 28;     // Distance at which an approaching mouse triggers dodge (px)
  const DODGE_COOLDOWN_MS = 320;  // Matches smooth glide so movement isn't jittery
  const MAX_PICK_ATTEMPTS = 140;

  let hasStarted = false;
  let currentStep = 1;
  let isEscaped = false;
  let isCelebrated = false;
  let currentPos = { x: 0, y: 0 };
  let lastDodgeAt = 0;
  let currentLang = "en";

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ------------------------------------------------------------------------
     Viewport & Geometry Helpers
     ------------------------------------------------------------------------ */

  /**
   * Returns usable visible viewport dimensions, respecting visualViewport on mobile.
   */
  function getViewportSize() {
    const docW = document.documentElement.clientWidth || window.innerWidth;
    const docH = document.documentElement.clientHeight || window.innerHeight;

    if (window.visualViewport) {
      return {
        width: Math.min(docW, window.visualViewport.width),
        height: Math.min(docH, window.visualViewport.height),
      };
    }

    return { width: docW, height: docH };
  }

  /**
   * Expands a DOMRect-like box by `pad` pixels on all sides.
   */
  function expandRect(rect, pad) {
    return {
      left: rect.left - pad,
      top: rect.top - pad,
      right: rect.right + pad,
      bottom: rect.bottom + pad,
    };
  }

  /**
   * Checks whether two axis-aligned rectangles overlap.
   */
  function rectsOverlap(a, b) {
    return (
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top
    );
  }

  /**
   * Returns two tiers of obstacle rectangles that the "No" button must avoid:
   * - strict: avoids the entire card surface so "No" stays cleanly outside it
   * - fallback: avoids the heading, emblem, and "Yes" button (for very tight screens)
   */
  function getObstacleTiers() {
    const strict = [
      expandRect(card.getBoundingClientRect(), 12),
      expandRect(settingsBtn.getBoundingClientRect(), 12),
    ];
    const fallback = [
      expandRect(questionHeading.getBoundingClientRect(), 14),
      expandRect(yesBtn.getBoundingClientRect(), 18),
      expandRect(settingsBtn.getBoundingClientRect(), 12),
    ];

    if (cardEmblem) {
      fallback.push(expandRect(cardEmblem.getBoundingClientRect(), 10));
    }

    if (!settingsPanel.hidden) {
      const panelBox = expandRect(settingsPanel.getBoundingClientRect(), 12);
      strict.push(panelBox);
      fallback.push(panelBox);
    }

    return { strict, fallback };
  }

  /**
   * Euclidean distance between two top-left coordinates.
   */
  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /**
   * Checks whether a candidate top-left position for the button is inside the
   * viewport and clear of all rectangles in `obstacles`.
   */
  function isPositionClear(x, y, btnW, btnH, obstacles) {
    const candidate = {
      left: x,
      top: y,
      right: x + btnW,
      bottom: y + btnH,
    };

    for (let i = 0; i < obstacles.length; i += 1) {
      if (rectsOverlap(candidate, obstacles[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Searches a specific obstacle tier for a valid position noticeably far from `currentPos`.
   */
  function searchSafePosition(minX, maxX, minY, maxY, btnW, btnH, obstacles, minJump, maxJump) {
    let bestClear = null;
    let bestClearDist = -1;
    let fallbackFar = null;

    // 1. Random sampling for organic, playful unpredictability within a smooth pace range
    for (let i = 0; i < MAX_PICK_ATTEMPTS; i += 1) {
      const x = minX + Math.random() * Math.max(0, maxX - minX);
      const y = minY + Math.random() * Math.max(0, maxY - minY);

      if (!isPositionClear(x, y, btnW, btnH, obstacles)) {
        continue;
      }

      const dist = distanceBetween({ x, y }, currentPos);
      if (dist >= minJump && dist <= maxJump) {
        return { x: Math.round(x), y: Math.round(y) };
      }

      if (dist >= minJump && !fallbackFar) {
        fallbackFar = { x: Math.round(x), y: Math.round(y) };
      }

      if (dist > bestClearDist) {
        bestClearDist = dist;
        bestClear = { x: Math.round(x), y: Math.round(y) };
      }
    }

    if (fallbackFar) {
      return fallbackFar;
    }

    // 2. Deterministic grid scan if random samples didn't hit a clear spot
    const stepX = Math.max(16, Math.floor((maxX - minX) / 14));
    const stepY = Math.max(16, Math.floor((maxY - minY) / 14));

    for (let gx = minX; gx <= maxX; gx += stepX) {
      for (let gy = minY; gy <= maxY; gy += stepY) {
        if (!isPositionClear(gx, gy, btnW, btnH, obstacles)) {
          continue;
        }
        const dist = distanceBetween({ x: gx, y: gy }, currentPos);
        if (dist > bestClearDist) {
          bestClearDist = dist;
          bestClear = { x: Math.round(gx), y: Math.round(gy) };
        }
      }
    }

    return bestClear;
  }

  /**
   * Computes a new safe position inside the visible viewport that never overlaps
   * the question text, the "Yes" button, or other content.
   */
  function pickSafePosition(btnW, btnH) {
    const vw = getViewportSize().width;
    const vh = getViewportSize().height;

    const minX = SAFE_MARGIN;
    const minY = SAFE_MARGIN;
    const maxX = Math.max(minX, vw - btnW - SAFE_MARGIN);
    const maxY = Math.max(minY, vh - btnH - SAFE_MARGIN);

    const minJump = Math.min(180, Math.hypot(vw, vh) * 0.24);
    const maxJump = Math.max(minJump + 120, Math.min(420, Math.hypot(vw, vh) * 0.45));
    const { strict, fallback } = getObstacleTiers();

    // First try staying completely outside the card
    const outsideCard = searchSafePosition(
      minX,
      maxX,
      minY,
      maxY,
      btnW,
      btnH,
      strict,
      minJump,
      maxJump
    );
    if (outsideCard) {
      return outsideCard;
    }

    // On very small screens, stay clear of the heading, emblem, and "Yes" button
    const clearOfContent = searchSafePosition(
      minX,
      maxX,
      minY,
      maxY,
      btnW,
      btnH,
      fallback,
      minJump * 0.65,
      maxJump
    );
    if (clearOfContent) {
      return clearOfContent;
    }

    // Absolute fallback: clamped corner farthest from current position
    const corners = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: minX, y: maxY },
      { x: maxX, y: maxY },
    ];
    corners.sort((a, b) => distanceBetween(b, currentPos) - distanceBetween(a, currentPos));
    return { x: Math.round(corners[0].x), y: Math.round(corners[0].y) };
  }

  /* ------------------------------------------------------------------------
     "No" Button Escape Logic
     ------------------------------------------------------------------------ */

  /**
   * Detaches the "No" button into fixed viewport space on first dodge while
   * preserving its slot inside the card so the "Yes" button never jumps.
   */
  function ensureEscaped() {
    if (isEscaped) {
      return;
    }

    const rect = noBtn.getBoundingClientRect();

    // Reserve original space so "Yes" stays anchored
    noSlot.style.width = `${rect.width}px`;
    noSlot.style.height = `${rect.height}px`;

    // Move to body so fixed positioning is relative to the true viewport
    document.body.appendChild(noBtn);

    noBtn.style.transition = "none";
    noBtn.style.width = `${rect.width}px`;
    noBtn.style.height = `${rect.height}px`;
    noBtn.classList.add("is-escaped");
    noBtn.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;

    // Force reflow so the browser commits the starting transform before animating
    void noBtn.offsetWidth;
    noBtn.style.transition = "";

    currentPos = { x: rect.left, y: rect.top };
    isEscaped = true;
  }

  /**
   * Smoothly moves the "No" button to a new safe viewport position.
   */
  function dodgeNoButton(force = false) {
    if (!hasStarted || isCelebrated) {
      return;
    }

    const now = performance.now();
    if (!force && now - lastDodgeAt < DODGE_COOLDOWN_MS) {
      return;
    }
    lastDodgeAt = now;

    const wasEscaped = isEscaped;
    ensureEscaped();

    const rect = noBtn.getBoundingClientRect();
    const nextPos = pickSafePosition(rect.width, rect.height);

    currentPos = nextPos;
    if (!wasEscaped) {
      // Ensure the browser paints the initial fixed position before gliding
      window.requestAnimationFrame(() => {
        if (!isCelebrated && isEscaped) {
          noBtn.style.transform = `translate3d(${nextPos.x}px, ${nextPos.y}px, 0)`;
        }
      });
    } else {
      noBtn.style.transform = `translate3d(${nextPos.x}px, ${nextPos.y}px, 0)`;
    }
  }

  /**
   * Keeps the escaped "No" button inside bounds and non-overlapping on resize/orientation change.
   */
  function handleViewportChange() {
    if (!isEscaped || isCelebrated) {
      return;
    }

    const rect = noBtn.getBoundingClientRect();
    const { width: vw, height: vh } = getViewportSize();
    const { fallback } = getObstacleTiers();

    const outOfBounds =
      currentPos.x < SAFE_MARGIN ||
      currentPos.y < SAFE_MARGIN ||
      currentPos.x + rect.width > vw - SAFE_MARGIN ||
      currentPos.y + rect.height > vh - SAFE_MARGIN;

    const overlappingContent = !isPositionClear(
      currentPos.x,
      currentPos.y,
      rect.width,
      rect.height,
      fallback
    );

    if (outOfBounds || overlappingContent) {
      const safePos = pickSafePosition(rect.width, rect.height);
      currentPos = safePos;
      noBtn.style.transform = `translate3d(${safePos.x}px, ${safePos.y}px, 0)`;
    }
  }

  /* ------------------------------------------------------------------------
     Pointer, Touch, and Keyboard Listeners for "No" Button
     ------------------------------------------------------------------------ */

  // Hover / pointer approach directly over the button (mouse & pen)
  noBtn.addEventListener("pointerenter", () => {
    dodgeNoButton(true);
  });

  // Mobile touch & pen: trigger before a tap can turn into a click
  noBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dodgeNoButton(true);
  });

  // Proximity detection: dodge as the cursor approaches the "No" button
  document.addEventListener("pointermove", (event) => {
    if (!hasStarted || isCelebrated || event.pointerType === "touch") {
      return;
    }

    const rect = noBtn.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
    const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);

    if (Math.hypot(dx, dy) <= APPROACH_RADIUS) {
      dodgeNoButton(false);
    }
  });

  // Never allow "No" to be clicked or keyboard-activated
  noBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dodgeNoButton(true);
  });

  noBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      dodgeNoButton(true);
    }
  });

  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(handleViewportChange, 120);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleViewportChange);
  }

  /* ------------------------------------------------------------------------
     Celebration Effect & State Transitions ("Yes" & "Start over")
     ------------------------------------------------------------------------ */

  /**
   * Spawns a radial burst of glowing pink & red hearts centered on the card.
   */
  function spawnHeartBurst(mode = "heart") {
    heartBurstLayer.innerHTML = "";

    if (reducedMotionQuery.matches) {
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const originX = cardRect.left + cardRect.width / 2;
    const originY = cardRect.top + cardRect.height / 2;

    const colors = ["#ff4d97", "#ff9ec7", "#e11d64", "#ff75b5", "#ffe0ef"];
    const glyphs = mode === "kiss" ? ["😘", "💋", "❤", "♥"] : ["❤", "♥", "♡"];
    const count = 28;

    for (let i = 0; i < count; i += 1) {
      const heart = document.createElement("span");
      heart.className = "burst-heart";
      heart.textContent = glyphs[i % glyphs.length];

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
      const spread = 110 + Math.random() * 190;
      const endX = originX + Math.cos(angle) * spread;
      const endY = originY + Math.sin(angle) * spread - 35;

      heart.style.setProperty("--sx", `${Math.round(originX)}px`);
      heart.style.setProperty("--sy", `${Math.round(originY)}px`);
      heart.style.setProperty("--ex", `${Math.round(endX)}px`);
      heart.style.setProperty("--ey", `${Math.round(endY)}px`);
      heart.style.setProperty("--b-size", `${(1 + Math.random() * 1.15).toFixed(2)}rem`);
      heart.style.setProperty("--b-color", colors[i % colors.length]);
      heart.style.setProperty("--b-scale", (0.9 + Math.random() * 0.7).toFixed(2));
      heart.style.setProperty("--b-rot", `${Math.round((Math.random() - 0.5) * 70)}deg`);
      heart.style.setProperty("--b-dur", `${(0.95 + Math.random() * 0.6).toFixed(2)}s`);
      heart.style.setProperty("--b-delay", `${(Math.random() * 0.14).toFixed(2)}s`);

      heart.addEventListener("animationend", () => {
        heart.remove();
      });

      heartBurstLayer.appendChild(heart);
    }
  }

  /**
   * Restores the "No" button back into its original card slot.
   */
  function resetNoButtonToSlot() {
    isEscaped = false;
    lastDodgeAt = 0;

    noBtn.hidden = false;
    noBtn.classList.remove("is-escaped");
    noBtn.style.transform = "";
    noBtn.style.width = "";
    noBtn.style.height = "";
    noBtn.style.transition = "";
    noSlot.style.width = "";
    noSlot.style.height = "";
    noSlot.appendChild(noBtn);
  }

  /**
   * Shows the answer screen for the current step (Answer 1 with right arrow, or Answer 2 with kiss + reset).
   */
  function handleYesClick() {
    if (isCelebrated) {
      return;
    }

    isCelebrated = true;
    noBtn.hidden = true;
    noBtn.remove();
    questionView.hidden = true;

    const copy = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    const isFirstStep = currentStep === 1;

    emblemHeartAnswer.hidden = !isFirstStep;
    emblemKissAnswer.hidden = isFirstStep;
    celebrationHeading.textContent = isFirstStep ? copy.answer1 : copy.answer2;
    nextBtn.hidden = !isFirstStep;
    resetBtn.hidden = isFirstStep;

    celebrationView.hidden = false;
    celebrationView.classList.remove("is-entering");
    void celebrationView.offsetWidth;
    celebrationView.classList.add("is-entering");

    spawnHeartBurst(isFirstStep ? "heart" : "kiss");
    celebrationHeading.focus({ preventScroll: true });
  }

  /**
   * Advances from Answer 1 to Question 2 when the right-arrow button is clicked.
   */
  function handleNextClick() {
    if (!isCelebrated || currentStep !== 1) {
      return;
    }

    currentStep = 2;
    isCelebrated = false;

    // Clear Answer 1 burst particles
    heartBurstLayer.innerHTML = "";

    // Restore "No" button back into its card slot for Question 2
    resetNoButtonToSlot();

    const copy = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    questionHeading.textContent = copy.question2;

    celebrationView.hidden = true;
    celebrationView.classList.remove("is-entering");
    questionView.hidden = false;
    questionView.classList.remove("is-transitioning");
    void questionView.offsetWidth;
    questionView.classList.add("is-transitioning");

    yesBtn.focus({ preventScroll: true });
  }

  /**
   * Starts Question 1 directly after choosing a language on the start screen.
   */
  function startWithLanguage(lang) {
    applyLanguage(lang);
    hasStarted = true;
    currentStep = 1;
    isCelebrated = false;

    resetNoButtonToSlot();

    languageView.hidden = true;
    celebrationView.hidden = true;
    questionView.hidden = false;
    questionView.classList.remove("is-transitioning");
    void questionView.offsetWidth;
    questionView.classList.add("is-transitioning");

    yesBtn.focus({ preventScroll: true });
  }

  /**
   * Resets the page directly back to Question 1 (never re-triggering the start language screen).
   */
  function handleResetClick() {
    hasStarted = true;
    currentStep = 1;
    isCelebrated = false;

    // Clear burst particles
    heartBurstLayer.innerHTML = "";

    // Restore "No" button back into its original card slot
    resetNoButtonToSlot();

    // Restore Question 1 copy in current language
    const copy = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    questionHeading.textContent = copy.question1;

    // Swap views directly to Question 1
    languageView.hidden = true;
    celebrationView.hidden = true;
    celebrationView.classList.remove("is-entering");
    questionView.hidden = false;
    questionView.classList.remove("is-transitioning");
    void questionView.offsetWidth;
    questionView.classList.add("is-transitioning");

    yesBtn.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------------
     Settings Panel & Language Switching
     ------------------------------------------------------------------------ */

  /**
   * Applies the chosen language across all UI text, accessible labels, and <html lang>.
   */
  function applyLanguage(lang) {
    const safeLang = TRANSLATIONS[lang] ? lang : "en";
    const copy = TRANSLATIONS[safeLang];
    currentLang = safeLang;

    document.documentElement.lang = safeLang;
    languageStartHeading.textContent = copy.chooseLanguage;
    questionHeading.textContent = currentStep === 1 ? copy.question1 : copy.question2;
    yesBtn.textContent = copy.yes;
    noBtn.textContent = copy.no;
    celebrationHeading.textContent = currentStep === 1 ? copy.answer1 : copy.answer2;

    nextBtn.setAttribute("aria-label", copy.nextLabel);
    nextBtn.setAttribute("title", copy.nextLabel);
    resetBtn.setAttribute("aria-label", copy.resetLabel);
    resetBtn.setAttribute("title", copy.resetLabel);

    settingsBtn.setAttribute("aria-label", copy.settingsLabel);
    settingsBtn.setAttribute("title", copy.settingsLabel);
    settingsTitle.textContent = copy.settingsTitle;
    languageLabel.textContent = copy.languageLabel;
    settingsCloseBtn.setAttribute("aria-label", copy.closeSettingsLabel);
    settingsCloseBtn.setAttribute("title", copy.closeSettingsLabel);

    langOptionButtons.forEach((btn) => {
      const isSelected = btn.getAttribute("data-lang") === safeLang;
      btn.classList.toggle("is-active", isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    });

    try {
      window.localStorage.setItem(STORAGE_KEY, safeLang);
    } catch {
      // Ignore storage errors in restricted environments
    }

    // Re-check bounds if the "No" button is already floating
    if (isEscaped && !isCelebrated) {
      noBtn.style.width = "";
      noBtn.style.height = "";
      handleViewportChange();
    }
  }

  function loadSavedLanguage() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && TRANSLATIONS[saved]) {
        return saved;
      }
    } catch {
      // Ignore storage errors in restricted environments
    }
    return "en";
  }

  function openSettings() {
    settingsPanel.hidden = false;
    settingsBtn.setAttribute("aria-expanded", "true");
    handleViewportChange();
  }

  function closeSettings(restoreFocus = false) {
    if (settingsPanel.hidden) {
      return;
    }
    settingsPanel.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      settingsBtn.focus({ preventScroll: true });
    }
  }

  function toggleSettings() {
    if (settingsPanel.hidden) {
      openSettings();
    } else {
      closeSettings(false);
    }
  }

  settingsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSettings();
  });

  settingsCloseBtn.addEventListener("click", () => {
    closeSettings(true);
  });

  langOptionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosenLang = btn.getAttribute("data-lang");
      if (chosenLang) {
        applyLanguage(chosenLang);
      }
    });
  });

  // Close settings panel when clicking outside or pressing Escape
  document.addEventListener("click", (event) => {
    if (settingsPanel.hidden) {
      return;
    }
    const target = event.target;
    if (
      target instanceof Node &&
      !settingsPanel.contains(target) &&
      !settingsBtn.contains(target)
    ) {
      closeSettings(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settingsPanel.hidden) {
      closeSettings(true);
    }
  });

  startLangButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosenLang = btn.getAttribute("data-start-lang");
      if (chosenLang) {
        startWithLanguage(chosenLang);
      }
    });
  });

  yesBtn.addEventListener("click", handleYesClick);
  nextBtn.addEventListener("click", handleNextClick);
  resetBtn.addEventListener("click", handleResetClick);

  // Initialize saved language preference while showing the start language chooser
  applyLanguage(loadSavedLanguage());
})();
