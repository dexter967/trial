/* =====================================
   SWARITHMETIC - JAVASCRIPT
===================================== */

/* =====================================
   GET ELEMENTS
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

/* =====================================
   MICROPHONE & PITCH STATE
===================================== */

let audioContext = null;
let analyser = null;
let microphone = null;
let audioData = null;
let microphoneStream = null;
let isPitchDetecting = false;

/* =====================================
   OPERATORS
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
    symbol: "−",
    theme: "minus",
    panelColor: "#E4E4E4",
    buttonColor: "#3A3A3A",
    textColor: "#2E2E2E",
    subColor: "#5A5A5A",
  },
  {
    symbol: "×",
    theme: "times",
    panelColor: "#F8DCE7",
    buttonColor: "#D46A93",
    textColor: "#7A2E48",
    subColor: "#8A4D63",
  },
  {
    symbol: "÷",
    theme: "divide",
    panelColor: "#E8E8E2",
    buttonColor: "#888884",
    textColor: "#4A4A46",
    subColor: "#6B6B66",
  },
];

let operatorIndex = 0;

/* =====================================
   SWARAS
===================================== */

const swaras = [
  { name: "SA", target: 25 },
  { name: "RI", target: 55 },
  { name: "GA", target: 80 },
];

let currentLevel = 0;

/* =====================================
   APPLY THEME
===================================== */

function applyTheme(operator) {
  document.body.dataset.theme = operator.theme;
  document.body.style.setProperty("--panel-color", operator.panelColor);
  document.body.style.setProperty("--button-color", operator.buttonColor);
  document.body.style.setProperty("--text-color", operator.textColor);
  document.body.style.setProperty("--sub-color", operator.subColor);
}

if (operators[operatorIndex]) {
  applyTheme(operators[operatorIndex]);
}

/* =====================================
   OPERATOR CLICK
===================================== */

if (opButton) {
  opButton.addEventListener("click", function () {
    operatorIndex++;
    if (operatorIndex >= operators.length) {
      operatorIndex = 0;
    }

    const currentOperator = operators[operatorIndex];
    opButton.textContent = currentOperator.symbol;
    applyTheme(currentOperator);
  });
}

/* =====================================
   MICROPHONE INITIALIZATION
===================================== */

async function startMicrophone() {
  clearError();

  try {
    // Force direct prompt request
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    // Handle browser autoplay restriction policies
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    microphone = audioContext.createMediaStreamSource(microphoneStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;

    microphone.connect(analyser);
    audioData = new Float32Array(analyser.fftSize);

    isPitchDetecting = true;
    listenAudio();

    return true;
  } catch (err) {
    console.error("Microphone Access Error:", err);
    showError(
      "Could not connect to microphone. Check hardware settings or reload.",
    );
    return false;
  }
}

/* =====================================
   AUDIO ANALYSIS & METER UPDATE
===================================== */

function listenAudio() {
  if (!isPitchDetecting || !analyser) return;

  analyser.getFloatTimeDomainData(audioData);

  // Calculate volume level (RMS)
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  let rms = Math.sqrt(sum / audioData.length);
  let volumePercent = Math.min(100, Math.round(rms * 400)); // Scale volume for display

  // If microphone detects sound, reflect volume on meter
  if (meterFill && volumePercent > 5) {
    meterFill.style.width = volumePercent + "%";

    const currentSwara = swaras[currentLevel] || swaras[0];
    if (Math.abs(volumePercent - currentSwara.target) <= 4) {
      solveSwara();
    }
  }

  requestAnimationFrame(listenAudio);
}

/* =====================================
   CALCULATE / START GAME
===================================== */

if (calculateButton) {
  calculateButton.addEventListener("click", startGame);
}

async function startGame() {
  clearError();

  const a = Number(num1 ? num1.value : 0);
  const b = Number(num2 ? num2.value : 0);

  if (!num1 || !num2 || num1.value === "" || num2.value === "") {
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

  // Reveal section immediately
  if (game) {
    game.hidden = false;
  }

  currentLevel = 0;
  prepareLevel();

  // Initialize microphone stream
  await startMicrophone();

  setTimeout(function () {
    if (game) {
      game.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, 100);
}

/* =====================================
   GAME CONTROLS
===================================== */

function prepareLevel() {
  const currentSwara = swaras[currentLevel] || swaras[0];

  if (level)
    level.textContent = "LEVEL " + (currentLevel + 1) + " / " + swaras.length;
  if (swaraButton) {
    swaraButton.textContent = currentSwara.name;
    swaraButton.classList.remove("solved", "listening");
  }

  if (stepLabel) {
    stepLabel.textContent = "target: " + currentSwara.target + "%";
    stepLabel.classList.remove("solved");
  }

  if (meterFill) meterFill.style.width = "0%";
  if (targetLine) targetLine.style.left = currentSwara.target + "%";

  if (equation) equation.textContent = "";
  if (answer) answer.textContent = "";
  if (resetButton) resetButton.hidden = true;
}

if (swaraButton) {
  swaraButton.addEventListener("click", singSwara);
}

function singSwara() {
  const currentSwara = swaras[currentLevel] || swaras[0];
  if (swaraButton) swaraButton.classList.add("listening");

  let value = 0;
  const direction = currentLevel % 2 === 0 ? 1 : -1;

  const interval = setInterval(function () {
    value += direction * 2;
    if (value < 0) value = 0;
    if (value > 100) value = 100;

    if (meterFill) meterFill.style.width = value + "%";

    if (Math.abs(value - currentSwara.target) <= 2) {
      clearInterval(interval);
      solveSwara();
    }
  }, 30);
}

function solveSwara() {
  if (swaraButton) {
    swaraButton.classList.remove("listening");
    swaraButton.classList.add("solved");
    swaraButton.textContent = "✓";
  }

  if (stepLabel) {
    stepLabel.classList.add("solved");
    stepLabel.textContent = "SWARA UNLOCKED!";
  }

  setTimeout(function () {
    currentLevel++;

    if (currentLevel < swaras.length) {
      prepareLevel();
    } else {
      showResult();
    }
  }, 900);
}

function showResult() {
  const a = Number(num1 ? num1.value : 0);
  const b = Number(num2 ? num2.value : 0);
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
  if (level) level.textContent = "ALL SWARAS UNLOCKED";

  if (meterFill) meterFill.style.width = "100%";
  if (swaraButton) {
    swaraButton.classList.add("solved");
    swaraButton.textContent = "✓";
  }

  if (stepLabel) {
    stepLabel.textContent = "CALCULATION UNLOCKED";
    stepLabel.classList.add("solved");
  }

  if (resetButton) resetButton.hidden = false;
}

function formatResult(value) {
  return Number.isInteger(value) ? value : value.toFixed(2);
}

if (resetButton) {
  resetButton.addEventListener("click", function () {
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
