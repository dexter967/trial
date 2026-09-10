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
   MICROPHONE STATE
===================================== */

let audioContext = null;
let analyser = null;
let microphone = null;
let audioData = null;
let microphoneStream = null;

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

// Apply starting theme
applyTheme(operators[operatorIndex]);

/* =====================================
   COLOR CHANGE
===================================== */

opButton.addEventListener("click", function () {
  operatorIndex++;
  if (operatorIndex >= operators.length) {
    operatorIndex = 0;
  }

  const currentOperator = operators[operatorIndex];
  opButton.textContent = currentOperator.symbol;
  applyTheme(currentOperator);

  opButton.animate(
    [
      { transform: "scale(0.9)" },
      { transform: "scale(1.08)" },
      { transform: "scale(1)" },
    ],
    {
      duration: 300,
      easing: "ease-out",
    },
  );
});

/* =====================================
   START MICROPHONE
===================================== */

async function startMicrophone() {
  try {
    // 1. Create or resume AudioContext immediately on user gesture
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    // 2. Request microphone access (triggers browser permission popup if reset)
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    // 3. Connect stream to Web Audio API
    microphone = audioContext.createMediaStreamSource(microphoneStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    microphone.connect(analyser);
    audioData = new Float32Array(analyser.fftSize);

    console.log("Microphone connected successfully");
    return true;
  } catch (error) {
    console.error("Microphone access failed:", error);
    showError(
      "Microphone access was denied. Please allow microphone permissions in your browser address bar and try again.",
    );
    return false;
  }
}

/* =====================================
   CALCULATE
===================================== */

calculateButton.addEventListener("click", startGame);

async function startGame() {
  clearError();

  const a = Number(num1.value);
  const b = Number(num2.value);

  /* Check input */
  if (num1.value === "" || num2.value === "") {
    showError("Enter both numbers first.");
    return;
  }

  /* 3-digit limit */
  if (a < 0 || a > 999 || b < 0 || b > 999) {
    showError("Numbers must be between 0 and 999.");
    return;
  }

  /* Division by zero */
  if (operatorIndex === 3 && b === 0) {
    showError("Cannot divide by zero.");
    return;
  }

  /* Start microphone */
  const micReady = await startMicrophone();
  if (!micReady) {
    return;
  }

  /* Show game section */
  game.hidden = false;

  /* Reset level */
  currentLevel = 0;

  /* Display game */
  prepareLevel();

  /* Move screen down smoothly */
  setTimeout(function () {
    game.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, 100);
}

/* =====================================
   PREPARE LEVEL
===================================== */

function prepareLevel() {
  const currentSwara = swaras[currentLevel];

  level.textContent = "LEVEL " + (currentLevel + 1) + " / " + swaras.length;
  swaraButton.textContent = currentSwara.name;
  swaraButton.classList.remove("solved", "listening");

  stepLabel.textContent = "target: " + currentSwara.target + "%";
  stepLabel.classList.remove("solved");

  meterFill.style.width = "0%";
  targetLine.style.left = currentSwara.target + "%";

  equation.textContent = "";
  answer.textContent = "";
  resetButton.hidden = true;
}

/* =====================================
   SWARA CLICK
===================================== */

swaraButton.addEventListener("click", singSwara);

function singSwara() {
  const currentSwara = swaras[currentLevel];
  swaraButton.classList.add("listening");

  /* DEMO MODE: Simulates meter filling */
  let value = 0;
  const direction = currentLevel % 2 === 0 ? 1 : -1;

  const interval = setInterval(function () {
    value += direction * 2;

    if (value < 0) value = 0;
    if (value > 100) value = 100;

    meterFill.style.width = value + "%";

    if (Math.abs(value - currentSwara.target) <= 2) {
      clearInterval(interval);
      solveSwara();
    }
  }, 30);
}

/* =====================================
   SWARA SOLVED
===================================== */

function solveSwara() {
  swaraButton.classList.remove("listening");
  swaraButton.classList.add("solved");
  swaraButton.textContent = "✓";

  stepLabel.classList.add("solved");
  stepLabel.textContent = "SWARA UNLOCKED!";

  setTimeout(function () {
    currentLevel++;

    if (currentLevel < swaras.length) {
      prepareLevel();
    } else {
      showResult();
    }
  }, 900);
}

/* =====================================
   FINAL RESULT
===================================== */

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

  equation.textContent = a + " " + symbol + " " + b;
  answer.textContent = "= " + formatResult(result);
  level.textContent = "ALL SWARAS UNLOCKED";

  meterFill.style.width = "100%";
  swaraButton.classList.add("solved");
  swaraButton.textContent = "✓";

  stepLabel.textContent = "CALCULATION UNLOCKED";
  stepLabel.classList.add("solved");

  resetButton.hidden = false;
}

/* =====================================
   FORMAT RESULT
===================================== */

function formatResult(value) {
  if (Number.isInteger(value)) {
    return value;
  }
  return value.toFixed(2);
}

/* =====================================
   RESET
===================================== */

resetButton.addEventListener("click", function () {
  game.hidden = true;
  currentLevel = 0;
  meterFill.style.width = "0%";
  equation.textContent = "";
  answer.textContent = "";

  clearError();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

/* =====================================
   ERROR HANDLING
===================================== */

function showError(message) {
  errorMessage.textContent = message;
}

function clearError() {
  errorMessage.textContent = "";
}
