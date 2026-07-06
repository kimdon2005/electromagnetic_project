(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CoilPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const isPositive = (value) => Number.isFinite(value) && value > 0;
  const isNonNegative = (value) => Number.isFinite(value) && value >= 0;

  function validateTheory(input) {
    const errors = [];
    if (!isPositive(input.massKg)) errors.push("구슬 질량은 0보다 커야 합니다.");
    if (!Number.isInteger(input.coils) || input.coils < 1) errors.push("코일 개수는 1 이상의 정수여야 합니다.");
    if (!isPositive(input.inductanceH)) errors.push("인덕턴스는 0보다 커야 합니다.");
    if (!isPositive(input.currentA)) errors.push("전류는 0보다 커야 합니다.");
    if (!isPositive(input.efficiency) || input.efficiency > 1) errors.push("효율은 0%보다 크고 100% 이하여야 합니다.");
    if (!isNonNegative(input.initialSpeed)) errors.push("초기 속도는 0 이상이어야 합니다.");
    if (!isNonNegative(input.energyLossJ)) errors.push("손실 에너지는 0 이상이어야 합니다.");
    return errors;
  }

  function theory(input) {
    const errors = validateTheory(input);
    if (errors.length) throw new RangeError(errors.join(" "));

    const magneticEnergyJ = input.coils * 0.5 * input.inductanceH * input.currentA ** 2;
    const convertedEnergyJ = magneticEnergyJ * input.efficiency;
    const initialKineticEnergyJ = 0.5 * input.massKg * input.initialSpeed ** 2;
    const kineticEnergyJ = Math.max(0, initialKineticEnergyJ + convertedEnergyJ - input.energyLossJ);
    const speedMps = Math.sqrt((2 * kineticEnergyJ) / input.massKg);

    return { speedMps, magneticEnergyJ, convertedEnergyJ, initialKineticEnergyJ, kineticEnergyJ };
  }

  function lapSpeed(radiusM, lapTimeS) {
    if (!isPositive(radiusM) || !isPositive(lapTimeS)) return NaN;
    return (2 * Math.PI * radiusM) / lapTimeS;
  }

  function experiment(radiusM, lapTimesS) {
    if (!isPositive(radiusM)) throw new RangeError("궤도 반지름은 0보다 커야 합니다.");
    const validTimes = lapTimesS.filter(isPositive);
    if (!validTimes.length) throw new RangeError("유효한 한 바퀴 시간을 하나 이상 입력하세요.");
    const speedsMps = validTimes.map((time) => lapSpeed(radiusM, time));
    const averageTimeS = validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length;
    const averageSpeedMps = speedsMps.reduce((sum, speed) => sum + speed, 0) / speedsMps.length;
    return { validTimes, speedsMps, averageTimeS, averageSpeedMps };
  }

  function compare(theorySpeedMps, realSpeedMps) {
    if (!isNonNegative(theorySpeedMps) || !isPositive(realSpeedMps)) {
      throw new RangeError("비교할 속도값이 올바르지 않습니다.");
    }
    const differenceMps = Math.abs(theorySpeedMps - realSpeedMps);
    return { differenceMps, relativeDifferenceRate: (differenceMps / realSpeedMps) * 100 };
  }

  function equivalentOnePassEfficiency(input, measuredSpeedMps) {
    const denominator = input.coils * input.inductanceH * input.currentA ** 2;
    if (!isPositive(input.massKg) || !isPositive(denominator) || !isNonNegative(measuredSpeedMps)) return NaN;
    const requiredEnergyTerm = input.massKg * (measuredSpeedMps ** 2 - input.initialSpeed ** 2) + 2 * input.energyLossJ;
    return Math.max(0, requiredEnergyTerm / denominator);
  }

  return { validateTheory, theory, lapSpeed, experiment, compare, equivalentOnePassEfficiency };
});
