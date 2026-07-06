"use strict";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const STORAGE_KEY = "coil-lab-state-v2";
// 상단 영상 7개의 정상상태 회전 주기(T = 2πr/v), r = 0.085 m.
const DEFAULT_TIMES = [0.1628, 0.1686, 0.1667, 0.1667, 0.1667, 0.1672, 0.1668];

const state = {
  graph: "current",
  times: [...DEFAULT_TIMES],
  theory: null,
  theoryInput: null,
  experiment: null,
};

const theoryFields = {
  mass: $("#mass"),
  coils: $("#coils"),
  inductance: $("#inductance"),
  current: $("#current"),
  efficiency: $("#efficiency"),
  initialSpeed: $("#initial-speed"),
  energyLoss: $("#energy-loss"),
};

function numberValue(input) {
  return Number.parseFloat(input.value);
}

function readTheoryInput() {
  return {
    massKg: numberValue(theoryFields.mass) / 1000,
    coils: numberValue(theoryFields.coils),
    inductanceH: numberValue(theoryFields.inductance) / 1000,
    currentA: numberValue(theoryFields.current),
    efficiency: numberValue(theoryFields.efficiency) / 100,
    initialSpeed: numberValue(theoryFields.initialSpeed),
    energyLossJ: numberValue(theoryFields.energyLoss) / 1000,
  };
}

function format(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatEnergy(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value < 0.001 ? value.toFixed(6) : value.toFixed(4)} J`;
}

function setError(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function setRangeTrack() {
  const input = theoryFields.efficiency;
  const progress = ((numberValue(input) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
  input.style.background = `linear-gradient(to right, var(--mint-dark) 0 ${progress}%, #dce3df ${progress}% 100%)`;
  $("#efficiency-output").value = `${input.value}%`;
}

function updateTheory() {
  setRangeTrack();
  const input = readTheoryInput();
  const errors = CoilPhysics.validateTheory(input);
  if (errors.length) {
    state.theory = null;
    setError($("#theory-error"), errors[0]);
    return;
  }

  setError($("#theory-error"));
  const result = CoilPhysics.theory(input);
  state.theoryInput = input;
  state.theory = result;

  $("#theory-speed").textContent = format(result.speedMps);
  $("#magnetic-energy").textContent = formatEnergy(result.magneticEnergyJ);
  $("#converted-energy").textContent = formatEnergy(result.convertedEnergyJ);
  $("#kinetic-energy").textContent = formatEnergy(result.kineticEnergyJ);
  $("#speed-gauge").style.width = `${Math.min(100, Math.max(2, result.speedMps * 20))}%`;
  $("#model-note").textContent = input.energyLossJ > 0
    ? `자기 에너지의 ${format(input.efficiency * 100, 0)}%가 변환되고 ${format(input.energyLossJ * 1000, 2)} mJ가 손실된다고 가정했습니다. 인덕턴스·전류·효율은 비교용 추정값입니다.`
    : `자기 에너지의 ${format(input.efficiency * 100, 0)}%가 구슬의 운동으로 변환된다고 가정했습니다. 인덕턴스·전류·효율은 비교용 추정값입니다.`;

  updateComparison();
  drawChart();
  saveState();
}

function renderMeasurements() {
  const container = $("#measurement-rows");
  container.replaceChildren();

  state.times.forEach((time, index) => {
    const row = document.createElement("div");
    row.className = "measurement-row";
    const speed = CoilPhysics.lapSpeed(numberValue($("#radius")) / 100, Number(time));
    row.innerHTML = `
      <span class="measurement-index">${String(index + 1).padStart(2, "0")}회</span>
      <label class="time-input-wrap" aria-label="${index + 1}회 한 바퀴 시간">
        <input type="number" min="0.001" step="0.01" value="${Number.isFinite(Number(time)) ? time : ""}" data-time-index="${index}" />
        <b>s</b>
      </label>
      <span class="measured-speed">${format(speed)} m/s</span>`;
    container.append(row);
  });

  $$('[data-time-index]', container).forEach((input) => {
    input.addEventListener("input", (event) => {
      state.times[Number(event.target.dataset.timeIndex)] = event.target.value;
      updateExperiment(false);
    });
  });
}

function updateExperiment(shouldRender = true) {
  if (shouldRender) renderMeasurements();
  const radiusM = numberValue($("#radius")) / 100;
  const times = state.times.map(Number);
  try {
    state.experiment = CoilPhysics.experiment(radiusM, times);
    setError($("#experiment-error"));
  } catch (error) {
    state.experiment = null;
    setError($("#experiment-error"), error.message);
  }

  if (!shouldRender) {
    $$(".measurement-row").forEach((row, index) => {
      const speed = CoilPhysics.lapSpeed(radiusM, Number(state.times[index]));
      $(".measured-speed", row).textContent = `${format(speed)} m/s`;
    });
  }
  updateComparison();
  saveState();
}

function updateComparison() {
  if (!state.theory || !state.experiment) {
    $("#compare-theory").textContent = "—";
    $("#compare-real").textContent = "—";
    $("#average-time").textContent = "—";
    $("#speed-difference").textContent = "—";
    $("#error-rate").textContent = "—";
    $("#reverse-efficiency").textContent = "—";
    $("#theory-bar").style.width = "0";
    $("#real-bar").style.width = "0";
    $("#analysis-text").textContent = "이론 조건과 유효한 실험 측정값을 입력하면 결과를 분석합니다.";
    return;
  }

  const theorySpeed = state.theory.speedMps;
  const realSpeed = state.experiment.averageSpeedMps;
  const comparison = CoilPhysics.compare(theorySpeed, realSpeed);
  const equivalentEfficiency = CoilPhysics.equivalentOnePassEfficiency(state.theoryInput, realSpeed);
  const maxSpeed = Math.max(theorySpeed, realSpeed, 0.001);

  $("#compare-theory").textContent = `${format(theorySpeed)} m/s`;
  $("#compare-real").textContent = `${format(realSpeed)} m/s`;
  $("#average-time").textContent = `${format(state.experiment.averageTimeS)} s`;
  $("#speed-difference").textContent = `${format(comparison.differenceMps)} m/s`;
  $("#error-rate").textContent = `${format(comparison.relativeDifferenceRate, 1)}%`;
  $("#reverse-efficiency").textContent = `${format(equivalentEfficiency * 100, 1)}%`;
  $("#theory-bar").style.width = `${(theorySpeed / maxSpeed) * 100}%`;
  $("#real-bar").style.width = `${(realSpeed / maxSpeed) * 100}%`;

  let interpretation;
  if (comparison.relativeDifferenceRate < 5) {
    interpretation = "두 값은 수치상 비슷하지만 회전 단계가 달라 모델 정확도의 근거로 사용할 수 없다.";
  } else if (theorySpeed > realSpeed) {
    interpretation = "1회전 기준값이 더 크지만 속도 의존 손실이 모델에 없어 원인을 이 비교만으로 확정할 수 없다.";
  } else {
    interpretation = "포화 실험값이 더 높은 것은 여러 바퀴 동안 코일을 반복 통과하며 에너지가 누적된 결과로 해석할 수 있다.";
  }
  const equivalentNote = equivalentEfficiency > 1
    ? " 1회전 등가 효율이 100%를 넘으므로 입력 변수와 모델 적용 범위를 다시 확인해야 한다."
    : ` 포화속도를 1회전 만에 얻었다고 환산한 등가 효율은 ${format(equivalentEfficiency * 100, 1)}%이며, 실제 효율 측정값은 아니다.`;

  $("#analysis-text").textContent = `입력 조건의 1회전 기준속도는 ${format(theorySpeed)} m/s이고, ${state.experiment.validTimes.length}회 영상 측정의 포화속도 평균은 ${format(realSpeed)} m/s이다. 두 값의 상대 차이율은 ${format(comparison.relativeDifferenceRate, 1)}%이다. 이는 서로 다른 회전 단계의 참고 비교이며 모델 오차율이 아니다. ${interpretation}${equivalentNote}`;
}

const graphInfo = {
  current: {
    title: "전류에 따른 예상 속도",
    relation: "v ∝ I",
    description: "다른 조건이 일정할 때 속도는 전류에 비례합니다.",
    xLabel: "전류 (A)",
  },
  mass: {
    title: "구슬 질량에 따른 예상 속도",
    relation: "v ∝ 1/√m",
    description: "같은 에너지를 받을 때 질량이 커질수록 속도는 감소합니다.",
    xLabel: "질량 (g)",
  },
  efficiency: {
    title: "변환 효율에 따른 예상 속도",
    relation: "v ∝ √η",
    description: "에너지 변환 효율이 커질수록 속도는 제곱근 관계로 증가합니다.",
    xLabel: "효율 (%)",
  },
};

function graphPoints() {
  if (!state.theoryInput) return [];
  const base = state.theoryInput;
  const points = [];
  for (let index = 0; index <= 10; index += 1) {
    const input = { ...base };
    let x;
    if (state.graph === "current") {
      x = Math.max(0.1, base.currentA * 0.2) + index * (Math.max(0.2, base.currentA * 1.8) / 10);
      input.currentA = x;
    } else if (state.graph === "mass") {
      x = Math.max(0.1, base.massKg * 1000 * 0.4) + index * (base.massKg * 1000 * 1.8 / 10);
      input.massKg = x / 1000;
    } else {
      x = 1 + index * 9.9;
      input.efficiency = x / 100;
    }
    points.push({ x, y: CoilPhysics.theory(input).speedMps });
  }
  return points;
}

function drawChart() {
  const canvas = $("#velocity-chart");
  if (!canvas || !state.theoryInput) return;
  const info = graphInfo[state.graph];
  $("#chart-title").textContent = info.title;
  $("#chart-relation").textContent = info.relation;
  $("#chart-description").textContent = info.description;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);

  const width = rect.width;
  const height = rect.height;
  const margin = { top: 22, right: 20, bottom: 47, left: 55 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const points = graphPoints();
  const maxX = Math.max(...points.map((point) => point.x));
  const minX = Math.min(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y), 0.1) * 1.12;

  ctx.clearRect(0, 0, width, height);
  ctx.font = '10px "Manrope", sans-serif';
  ctx.lineWidth = 1;
  ctx.textBaseline = "middle";
  for (let index = 0; index <= 5; index += 1) {
    const y = margin.top + (plotH / 5) * index;
    const value = maxY * (1 - index / 5);
    ctx.strokeStyle = "#e7ece9";
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
    ctx.fillStyle = "#8a9690";
    ctx.textAlign = "right";
    ctx.fillText(value.toFixed(1), margin.left - 12, y);
  }

  const xFor = (x) => margin.left + ((x - minX) / (maxX - minX || 1)) * plotW;
  const yFor = (y) => margin.top + plotH - (y / maxY) * plotH;
  points.forEach((point, index) => {
    if (index % 2 !== 0 && index !== points.length - 1) return;
    ctx.fillStyle = "#8a9690";
    ctx.textAlign = "center";
    ctx.fillText(point.x < 10 ? point.x.toFixed(1) : point.x.toFixed(0), xFor(point.x), height - 28);
  });

  const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + plotH);
  gradient.addColorStop(0, "rgba(37, 201, 138, .22)");
  gradient.addColorStop(1, "rgba(37, 201, 138, 0)");
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(point.x); const y = yFor(point.y);
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(xFor(points.at(-1).x), margin.top + plotH);
  ctx.lineTo(xFor(points[0].x), margin.top + plotH);
  ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(point.x); const y = yFor(point.y);
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#1ca876"; ctx.lineWidth = 2.5; ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath(); ctx.arc(xFor(point.x), yFor(point.y), 3, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#1ca876"; ctx.lineWidth = 1.5; ctx.stroke();
  });

  ctx.fillStyle = "#65736d"; ctx.textAlign = "center";
  ctx.fillText(info.xLabel, margin.left + plotW / 2, height - 8);
  ctx.save(); ctx.translate(12, margin.top + plotH / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText("예상 속도 (m/s)", 0, 0); ctx.restore();
}

function saveState() {
  try {
    const fields = Object.fromEntries(Object.entries(theoryFields).map(([key, input]) => [key, input.value]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fields, radius: $("#radius").value, times: state.times }));
  } catch { /* Storage may be disabled; calculations still work. */ }
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    Object.entries(saved.fields || {}).forEach(([key, value]) => {
      if (theoryFields[key] && value !== "") theoryFields[key].value = value;
    });
    if (saved.radius) $("#radius").value = saved.radius;
    if (Array.isArray(saved.times) && saved.times.length) state.times = saved.times.slice(0, 10);
  } catch { /* Ignore malformed saved data. */ }
}

function resetTheory() {
  const defaults = { mass: 9.03, coils: 6, inductance: 5, current: 5, efficiency: 10, initialSpeed: 0, energyLoss: 0 };
  Object.entries(defaults).forEach(([key, value]) => { theoryFields[key].value = value; });
  updateTheory();
}

function init() {
  restoreState();
  $("#theory-form").addEventListener("submit", (event) => event.preventDefault());
  $("#experiment-form").addEventListener("submit", (event) => event.preventDefault());
  Object.values(theoryFields).forEach((input) => input.addEventListener("input", updateTheory));
  $("#radius").addEventListener("input", () => updateExperiment(true));
  $("#reset-theory").addEventListener("click", resetTheory);
  $("#reset-experiment").addEventListener("click", () => {
    $("#radius").value = 8.5;
    state.times = [...DEFAULT_TIMES];
    updateExperiment(true);
  });
  $("#add-measurement").addEventListener("click", () => {
    if (state.times.length >= 10) {
      setError($("#experiment-error"), "측정값은 최대 10회까지 추가할 수 있습니다.");
      return;
    }
    state.times.push("");
    renderMeasurements();
    const inputs = $$('[data-time-index]');
    inputs.at(-1).focus();
  });
  $("#copy-analysis").addEventListener("click", async (event) => {
    try {
      await navigator.clipboard.writeText($("#analysis-text").textContent);
      const button = event.currentTarget;
      button.textContent = "복사됨";
      window.setTimeout(() => { button.textContent = "분석 문장 복사"; }, 1400);
    } catch {
      event.currentTarget.textContent = "복사 실패";
    }
  });
  $$(".graph-tabs button").forEach((button) => button.addEventListener("click", () => {
    state.graph = button.dataset.graph;
    $$(".graph-tabs button").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
    drawChart();
  }));
  window.addEventListener("resize", drawChart);

  renderMeasurements();
  updateTheory();
  updateExperiment(false);
}

init();
