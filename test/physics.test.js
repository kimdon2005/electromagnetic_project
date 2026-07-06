const test = require("node:test");
const assert = require("node:assert/strict");
const Physics = require("../physics.js");

const base = {
  massKg: 0.01,
  coils: 4,
  inductanceH: 0.005,
  currentA: 2,
  efficiency: 0.1,
  initialSpeed: 0,
  energyLossJ: 0,
};

test("로드맵 기본값의 자기 에너지와 속도를 계산한다", () => {
  const result = Physics.theory(base);
  assert.equal(result.magneticEnergyJ, 0.04);
  assert.equal(result.convertedEnergyJ, 0.004);
  assert.ok(Math.abs(result.speedMps - Math.sqrt(0.8)) < 1e-12);
});

test("초기 속도와 손실 에너지를 함께 반영한다", () => {
  const result = Physics.theory({ ...base, initialSpeed: 1, energyLossJ: 0.002 });
  assert.ok(Math.abs(result.kineticEnergyJ - 0.007) < 1e-12);
  assert.ok(Math.abs(result.speedMps - Math.sqrt(1.4)) < 1e-12);
});

test("손실이 가용 에너지보다 크면 속도를 0으로 제한한다", () => {
  const result = Physics.theory({ ...base, energyLossJ: 1 });
  assert.equal(result.kineticEnergyJ, 0);
  assert.equal(result.speedMps, 0);
});

test("원형 궤도의 한 바퀴 속도와 반복 측정 평균을 계산한다", () => {
  assert.ok(Math.abs(Physics.lapSpeed(0.12, 0.5) - 1.5079644737) < 1e-9);
  const result = Physics.experiment(0.12, [0.52, 0.5, 0.54, 0.51, 0.53]);
  assert.ok(Math.abs(result.averageTimeS - 0.52) < 1e-12);
  assert.ok(Math.abs(result.averageSpeedMps - 1.4510396505) < 1e-9);
});

test("상대 차이율은 실험값을 분모로 계산한다", () => {
  const result = Physics.compare(1.6, 1.45);
  assert.ok(Math.abs(result.differenceMps - 0.15) < 1e-12);
  assert.ok(Math.abs(result.relativeDifferenceRate - 10.3448275862) < 1e-9);
});

test("포화속도를 1회전 등가 효율로 환산한다", () => {
  const efficiency = Physics.equivalentOnePassEfficiency(base, 1.45);
  assert.ok(Math.abs(efficiency - 0.2628125) < 1e-12);
});

test("물리적으로 유효하지 않은 입력을 거부한다", () => {
  assert.throws(() => Physics.theory({ ...base, massKg: 0 }), RangeError);
  assert.throws(() => Physics.experiment(0.12, [0, -1]), RangeError);
  assert.throws(() => Physics.compare(1, 0), RangeError);
});
