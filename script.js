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
   TUNABLES & DETECTOR SETTINGS
===================================== */

const MATCH_TOLERANCE_CENTS = 35; // Sensitivity window for exact pitch matching (+/- 35 cents)
const HOLD_TIME_MS = 600; // Pitch must be held continuously for 600ms
const MIN_RMS = 0.035; // Minimum signal loudness to ignore quiet ambient noise
const YIN_THRESHOLD = 0.15; // Harmonic clarity threshold (ignores unpitched noise/talking)
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
  { name: "SA'", targetFreq: 523.25 }, // High C (C5)
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
  {
    symbol: "+",
    theme: "plus",
    panelColor: "#D8E6F3",
    buttonColor: "#5B8DBE",
    textColor: "#1F3B57",
    subColor: "#3D5568",
  },
  {
    symbol: "\u2212",
    theme: "minus",
    panelColor: "#E4E4E4",
    buttonColor: "#3A3A3A",
    textColor: "#2E2E2E",
    subColor: "#5A5A5A",
  },
  {
    symbol: "\u00D7",
    theme: "times",
    panelColor: "#F8DCE7",
    buttonColor: "#D46A93",
    textColor: "#7A2E48",
    subColor: "#8A4D63",
  },
  {
    symbol: "\u00F7",
    theme: "divide",
    panelColor: "#E8E8E2",
    buttonColor: "#888884",
    textColor: "#4A4A46",
    subColor: "#6B6B66",
  },
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
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });

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
   STRICT PITCH DETECTION (YIN Algorithm)
   Rejects ambient noise, talking, and invalid pitches
===================================== */

function detectPitchYin(buffer, sampleRate) {
  const SIZE = buffer.length;
  const HALF_SIZE = Math.floor(SIZE / 2);

  // 1. RMS Loudness Check
  let sumOfSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    sumOfSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumOfSquares / SIZE);

  if (rms < MIN_RMS) {
    return { freq: -1, probability: 0 };
  }

  // 2. Difference Function
  const yinBuffer = new Float32Array(HALF_SIZE);
  for (let t = 0; t < HALF_SIZE; t++) {
    for (let i = 0; i < HALF_SIZE; i++) {
      const delta = buffer[i] - buffer[i + t];
      yinBuffer[t] += delta * delta;
    }
  }

  // 3. Cumulative Mean Normalized Difference
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let t = 1; t < HALF_SIZE; t++) {
    runningSum += yinBuffer[t];
    yinBuffer[t] *= t / runningSum;
  }

  // 4. Absolute Threshold Check (Rejects noisy & unpitched signals)
  let tau = -1;
  for (let t = 2; t < HALF_SIZE; t++) {
    if (yinBuffer[t] < YIN_THRESHOLD) {
      while (t + 1 < HALF_SIZE && yinBuffer[t + 1] < yinBuffer[t]) {
        t++;
      }
      tau = t;
      break;
    }
  }

  if (tau === -1 || yinBuffer[tau] >= YIN_THRESHOLD) {
    return { freq: -1, probability: 0 };
  }

  // 5. Parabolic Interpolation for Precise Frequency Estimation
  let betterTau;
  const x0 = tau < 1 ? tau : tau - 1;
  const x2 = tau + 1 < HALF_SIZE ? tau + 1 : tau;

  if (x0 === tau) {
    betterTau = yinBuffer[tau] <= yinBuffer[x2] ? tau : x2;
  } else if (x2 === tau) {
    betterTau = yinBuffer[tau] <= yinBuffer[x0] ? tau : x0;
  } else {
    const s0 = yinBuffer[x0];
    const s1 = yinBuffer[tau];
    const s2 = yinBuffer[x2];
    betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
  }

  const pitchHz = sampleRate / betterTau;
  const probability = 1 - yinBuffer[tau];

  return { freq: pitchHz, probability: probability };
}

/* =====================================
   OCTAVE-NEUTRAL PITCH DISTANCE (Cents)
===================================== */

function centsBetween(freqA, freqB) {
  let cents = 1200 * Math.log2(freqA / freqB);
  
  // Normalizes across octaves so male (low) and female (high) voices match correctly
  cents = cents % 1200;
  if (cents > 600) cents -= 1200;
  if (cents < -600) cents += 1200;
  
  return cents;
}

/* =====================================
   LISTEN LOOP & STRICT SWARA MATCHING
===================================== */

function startListening(targetFreq, onSolved) {
  matchStartTime = null;

  function frame() {
    analyser.getFloatTimeDomainData(audioData);
    const result = detectPitchYin(audioData, audioContext.sampleRate);

    updateSideMeter(result.freq, targetFreq);

    if (result.freq > 0) {
      const cents = centsBetween(result.freq, targetFreq);
      const absCents = Math.abs(cents);
      const isCorrectSwara = absCents <= MATCH_TOLERANCE_CENTS;

      // Update Closeness Progress Meter
      const closeness = Math.max(0, 1 - absCents / (MATCH_TOLERANCE_CENTS * 2.5));
      if (meterFill) meterFill.style.width = Math.round(closeness * 100) + "%";

      // Progression strictly occurs ONLY on the correct pitch target
      if (isCorrectSwara) {
        if (matchStartTime === null) matchStartTime = performance.now();
        const held = performance.now() - matchStartTime;

        if (holdReadout) {
          holdReadout.textContent =
            "holding " +
            Math.min(HOLD_TIME_MS, Math.round(held)) +
            " / " +
            HOLD_TIME_MS +
            " ms";
        }

        // Must sustain the targeted pitch steadily for the required duration
        if (held >= HOLD_TIME_MS) {
          stopListening();
          onSolved();
          return;
        }
      } else {
        // Reset timer immediately if pitch strays to another note or swara
        matchStartTime = null;
        if (holdReadout) holdReadout.textContent = "Wrong pitch!";
      }
    } else {
      // Noise / Silence handling
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
  if (targetReadout)
    targetReadout.textContent = "target ~" + Math.round(targetFreq) + " Hz";

  if (freq > 0) {
    const pct = clampPct(((freq - lo) / (hi - lo)) * 100);
    sideMeterFill.style.width = pct + "%";
    if (pitchReadout) pitchReadout.textContent = Math.round(freq) + " Hz";

    const cents = centsBetween(freq, targetFreq);
    sideMeterFill.style.background =
      Math.abs(cents) <= MATCH_TOLERANCE_CENTS
        ? "#97C459"
        : "var(--button-color)";
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
    } while (i > 0 && SWARA_POOL[randomIndex].name === sequence[i - 1].name);

    sequence.push({
      stage: stages[i],
      name: SWARA_POOL[randomIndex].name,
      targetFreq: SWARA_POOL[randomIndex].targetFreq,
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
    level.textContent =
      "STEP " +
      (currentLevel + 1) +
      " / 3: " +
      currentSwara.stage.toUpperCase();
  }
  if (swaraButton) {
    swaraButton.textContent = currentSwara.name;
    swaraButton.classList.remove("solved", "listening");
    swaraButton.disabled = false;
  }

  if (stepLabel) {
    stepLabel.textContent =
      "Sing " +
      currentSwara.name +
      " (~" +
      Math.round(currentSwara.targetFreq) +
      " Hz)";
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
    stepLabel.textContent =
      activeSwarasSequence[currentLevel].name + " HARMONIZED!";
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
    case 0:
      result = a + b;
      break;
    case 1:
      result = a - b;
      break;
    case 2:
      result = a * b;
      break;
    case 3:
      result = a / b;
      break;
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
