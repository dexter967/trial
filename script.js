/* =====================================
   SWARITHMETIC - JAVASCRIPT
===================================== */

/* =====================================
   GET DOM ELEMENTS
===================================== */

const opButton = document.getElementById("opButton");
const num1 = document.getElementById("num1");
const num2 = document.getElementById("num2");
const calculateButton = document.getElementById("calculateButton");
const errorMessage = document.getElementById("errorMessage");
const game = document.getElementById("game");
const level = document.getElementById("level");
const swaraButton = document.getElementById("swaraButton");
const stepLabel = document.getElementById("stepLabel");
const meterFill = document.getElementById("meterFill");
const targetLine = document.getElementById("targetLine");
const equation = document.getElementById("equation");
const answer = document.getElementById("answer");
const resetButton = document.getElementById("resetButton");

const sideMeterFill = document.getElementById("sideMeterFill");
const sideMeterTarget = document.getElementById("sideMeterTarget");
const pitchReadout = document.getElementById("pitchReadout");
const targetReadout = document.getElementById("targetReadout");
const holdReadout = document.getElementById("holdReadout");

/* =====================================
   TUNABLES
===================================== */

const MATCH_TOLERANCE_CENTS = 35; // Sensitivity window for pitch matching
const HOLD_TIME_MS = 600; // Time pitch must be held steady
const MIN_RMS = 0.04; // Minimum loudness threshold
const METER_DISPLAY_RANGE_HZ = [200, 600]; // Visual scale bounds for side meter

/* =====================================
   SWARA FREQUENCY POOL (Indian Scale)
===================================== */

const SWARA_POOL = [
  { name: "SA", targetFreq: 261.63 }, // Middle C (C4)
  { name: "RI", targetFreq: 293.66 }, // D4
  { name: "GA", targetFreq: 329.63 }, // E4
  { name: "MA", targetFreq: 349.23 }, // F4
  { name: "PA", targetFreq: 392.00 }, // G4
  { name: "DHA", targetFreq: 440.00 }, // A4
  { name: "NI", targetFreq: 493.88 }, // B4
  { name: "SA'", targetFreq: 523.25 }  // High C (C5)
];

let activeSwarasSequence = [];
let currentLevel = 0;

/* =====================================
   MICROPHONE & AUDIO ANALYSIS STATE
===================================== */

let audioContext = null;
let analyser = null;
let microphone = null;
let audioData = null;
let microphoneStream = null;
let listenLoopId = null;
let matchStartTime = null;

/* =====================================
   OPERATORS & THEMES
===================================== */

const operators = [
  { symbol: "+", theme: "plus", panelColor: "#D8E6F3", buttonColor: "#5B8DBE", textColor: "#1F3B57", subColor: "#3D5568" },
  { symbol: "\u2212", theme: "minus", panelColor: "#E4E4E4", buttonColor: "#3A3A3A", textColor: "#2E2E2E", subColor: "#5A5A5A" },
  { symbol: "\u00D7", theme: "times", panelColor: "#F8DCE7", buttonColor: "#D46A93", textColor: "#7A2E48", subColor: "#8A4D63" },
  { symbol: "\u00F7", theme: "divide", panelColor: "#E8E8E2", buttonColor: "#888884", textColor: "#4A4A46", subColor: "#6B6B66" }
];

let operatorIndex = 0;

/* =====================================
   THEME SWITCHING
===================================== */

function applyTheme(operator) {
  document.body.dataset.theme = operator.theme;
  document.body.style.setProperty("--panel-color", operator.panelColor);
  document.body.style.setProperty("--button-color", operator.buttonColor);
  document.body.style.setProperty("--text-color", operator.textColor);
  document.body.style.setProperty("--sub-color", operator.subColor);
}

applyTheme(operators[operatorIndex]);

if (opButton) {
  opButton.addEventListener("click", function () {
    operatorIndex = (operatorIndex + 1) % operators.length;
    const currentOperator = operators[operatorIndex];
    opButton.textContent = currentOperator.symbol;
    applyTheme(currentOperator);
  });
}

/* =====================================
   MICROPHONE SETUP
===================================== */

async function startMicrophone() {
  if (audioContext) return true;

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    microphone = audioContext.createMediaStreamSource(microphoneStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    audioData = new Float32Array(analyser.fftSize);
    microphone.connect(analyser);

    return true;
  } catch (err) {
    console.error("Microphone access failed:", err);
    showError("Could not connect to microphone. Check permissions and try again.");
    return false;
  }
}

/* =====================================
   PITCH DETECTION (AUTOCORRELATION)
===================================== */

function detectPitch(buffer, sampleRate) {
  const SIZE = buffer.length;

  let sumOfSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    sumOfSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumOfSquares / SIZE);

  if (rms < MIN_RMS) {
    return { freq: -1, rms: rms };
  }

  let r1 = 0;
  let r2 = SIZE - 1;
  const trimThreshold = 0.2;

  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) > trimThreshold) {
      r1 = i;
      break;
    }
  }
  for (let i = SIZE - 1; i > SIZE / 2; i--) {
    if (Math.abs(buffer[i]) > trimThreshold) {
      r2 = i;
      break;
    }
  }

  const trimmed = buffer.slice(r1, r2);
  const trimmedSize = trimmed.length;
  if (trimmedSize < 2) {
    return { freq: -1, rms: rms };
  }

  const c = new Array(trimmedSize).fill(0);
  for (let lag = 0; lag < trimmedSize; lag++) {
    for (let j = 0; j < trimmedSize - lag; j++) {
      c[lag] += trimmed[j] * trimmed[j + lag];
    }
  }

  let d = 0;
  while (d < c.length - 1 && c[d] > c[d + 1]) d++;

  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < c.length; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }

  if (maxPos <= 0) {
    return { freq: -1, rms: rms };
  }

  let t0 = maxPos;
  const x1 = c[t0 - 1] || 0;
  const x2 = c[t0] || 0;
  const x3 = c[t0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a !== 0) t0 = t0 - b / (2 * a);

  const freq = sampleRate / t0;
  return { freq: freq, rms: rms };
}

function centsBetween(freqA, freqB) {
  return 1200 * Math.log2(freqA / freqB);
}

/* =====================================
   LISTEN LOOP & PITCH MATCHING
===================================== */

function startListening(targetFreq, onSolved) {
  matchStartTime = null;

  function frame() {
    analyser.getFloatTimeDomainData(audioData);
    const result = detectPitch(audioData, audioContext.sampleRate);

    updateSideMeter(result.freq, targetFreq);

    if (result.freq > 0) {
      const cents = centsBetween(result.freq, targetFreq);
      const closeness = Math.max(0, 1 - Math.abs(cents) / (MATCH_TOLERANCE_CENTS * 3));
      if (meterFill) meterFill.style.width = Math.round(closeness * 100) + "%";

      if (Math.abs(cents) <= MATCH_TOLERANCE_CENTS) {
        if (matchStartTime === null) matchStartTime = performance.now();
        const held = performance.now() - matchStartTime;
        if (holdReadout) {
          holdReadout.textContent = "holding " + Math.min(HOLD_TIME_MS, Math.round(held)) + " / " + HOLD_TIME_MS + " ms";
        }

        if (held >= HOLD_TIME_MS) {
          stopListening();
          onSolved();
          return;
        }
      } else {
        matchStartTime = null;
        if (holdReadout) holdReadout.textContent = "";
      }
    } else {
      matchStartTime = null;
      if (meterFill) meterFill.style.width = "0%";
      if (holdReadout) holdReadout.textContent = "";
    }

    listenLoopId = requestAnimationFrame(frame);
  }

  listenLoopId = requestAnimationFrame(frame);
}

function stopListening() {
  if (listenLoopId) cancelAnimationFrame(listenLoopId);
  listenLoopId = null;
  matchStartTime = null;
  if (holdReadout) holdReadout.textContent = "";
}

function updateSideMeter(freq, targetFreq) {
  if (!sideMeterFill || !sideMeterTarget) return;

  const [lo, hi] = METER_DISPLAY_RANGE_HZ;
  const targetPct = clampPct(((targetFreq - lo) / (hi - lo)) * 100);

  sideMeterTarget.style.left = targetPct + "%";
  if (targetReadout) targetReadout.textContent = "target ~" + Math.round(targetFreq) + " Hz";

  if (freq > 0) {
    const pct = clampPct(((freq - lo) / (hi - lo)) * 100);
    sideMeterFill.style.width = pct + "%";
    if (pitchReadout) pitchReadout.textContent = Math.round(freq) + " Hz";

    const cents = centsBetween(freq, targetFreq);
    sideMeterFill.style.background = Math.abs(cents) <= MATCH_TOLERANCE_CENTS ? "#97C459" : "var(--button-color)";
  } else {
    sideMeterFill.style.width = "0%";
    sideMeterFill.style.background = "var(--button-color)";
    if (pitchReadout) pitchReadout.textContent = "-- Hz";
  }
}

function clampPct(v) {
  return Math.max(0, Math.min(100, v));
}

/* =====================================
   RANDOM SWARA GENERATOR
===================================== */

function generateRandomSequence() {
  const stages = ["Operand 1", "Operator", "Operand 2"];
  const sequence = [];

  for (let i = 0; i < 3; i++) {
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * SWARA_POOL.length);
    } while (i > 0 && SWARA_POOL[randomIndex].name === sequence[i - 1].name); // Avoid exact consecutive swara repeats

    sequence.push({
      stage: stages[i],
      name: SWARA_POOL[randomIndex].name,
      targetFreq: SWARA_POOL[randomIndex].targetFreq
    });
  }

  return sequence;
}

/* =====================================
   GAME FLOW
===================================== */

if (calculateButton) {
  calculateButton.addEventListener("click", startGame);
}

async function startGame() {
  clearError();

  const a = Number(num1.value);
  const b = Number(num2.value);

  if (num1.value === "" || num2.value === "") {
    showError("Enter both numbers first.");
    return;
  }
  if (a < 0 || a > 999 || b < 0 || b > 999) {
    showError("Numbers must be between 0 and 999.");
    return;
  }
  if (operatorIndex === 3 && b === 0) {
    showError("Cannot divide by zero.");
    return;
  }

  const micReady = await startMicrophone();
  if (!micReady) return;

  // Generate unique random target swaras for this round
  activeSwarasSequence = generateRandomSequence();

  if (game) game.hidden = false;
  currentLevel = 0;
  prepareLevel();

  setTimeout(function () {
    if (game) game.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 100);
}

function prepareLevel() {
  const currentSwara = activeSwarasSequence[currentLevel];

  if (level) {
    level.textContent = "STEP " + (currentLevel + 1) + " / 3: " + currentSwara.stage.toUpperCase();
  }
  if (swaraButton) {
    swaraButton.textContent = currentSwara.name;
    swaraButton.classList.remove("solved", "listening");
    swaraButton.disabled = false;
  }

  if (stepLabel) {
    stepLabel.textContent = "Sing " + currentSwara.name + " (~" + Math.round(currentSwara.targetFreq) + " Hz)";
    stepLabel.classList.remove("solved");
  }

  if (meterFill) meterFill.style.width = "0%";
  if (targetLine) targetLine.style.left = "50%";

  if (equation) equation.textContent = "";
  if (answer) answer.textContent = "";
  if (resetButton) resetButton.hidden = true;

  updateSideMeter(-1, currentSwara.targetFreq);
}

if (swaraButton) {
  swaraButton.addEventListener("click", function () {
    if (swaraButton.classList.contains("solved")) return;
    swaraButton.disabled = true;
    swaraButton.classList.add("listening");

    const currentSwara = activeSwarasSequence[currentLevel];
    startListening(currentSwara.targetFreq, function () {
      solveSwara();
    });
  });
}

function solveSwara() {
  if (swaraButton) {
    swaraButton.classList.remove("listening");
    swaraButton.classList.add("solved");
    swaraButton.textContent = "\u2713";
  }

  if (stepLabel) {
    stepLabel.classList.add("solved");
    stepLabel.textContent = activeSwarasSequence[currentLevel].name + " HARMONIZED!";
  }
  if (meterFill) meterFill.style.width = "100%";

  setTimeout(function () {
    currentLevel++;
    if (currentLevel < activeSwarasSequence.length) {
      prepareLevel();
    } else {
      showResult();
    }
  }, 900);
}

function showResult() {
  const a = Number(num1.value);
  const b = Number(num2.value);
  const symbol = operators[operatorIndex].symbol;

  let result;
  switch (operatorIndex) {
    case 0: result = a + b; break;
    case 1: result = a - b; break;
    case 2: result = a * b; break;
    case 3: result = a / b; break;
  }

  if (equation) equation.textContent = a + " " + symbol + " " + b;
  if (answer) answer.textContent = "= " + formatResult(result);
  if (level) level.textContent = "HARMONY COMPLETE!";
  if (stepLabel) {
    stepLabel.textContent = "CALCULATED WITH MUSIC!";
    stepLabel.classList.add("solved");
  }
  if (resetButton) resetButton.hidden = false;
}

function formatResult(value) {
  return Number.isInteger(value) ? value : value.toFixed(2);
}

if (resetButton) {
  resetButton.addEventListener("click", function () {
    stopListening();
    if (game) game.hidden = true;
    currentLevel = 0;
    if (meterFill) meterFill.style.width = "0%";
    if (equation) equation.textContent = "";
    if (answer) answer.textContent = "";
    clearError();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function showError(message) {
  if (errorMessage) errorMessage.textContent = message;
}

function clearError() {
  if (errorMessage) errorMessage.textContent = "";
}
