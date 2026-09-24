'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const projection = require('../src/core/space-projection.js');

const identityScale = (distance) => distance;

test('вид сверху сохраняет прежнее преобразование XY и игнорирует Z', () => {
    const result = projection.projectPoint(
        { x: 3, y: 4, z: 12 },
        { centerX: 100, centerY: 80, mode: 'top', tiltDeg: 42, distanceToPixels: identityScale }
    );

    assert.deepEqual(result, { x: 103, y: 76, depth: 0 });
});

test('объёмный вид показывает высоту Z и возвращает глубину', () => {
    const flat = projection.projectPoint(
        { x: 0, y: 4, z: 0 },
        { centerX: 0, centerY: 0, mode: 'volume', tiltDeg: 45, distanceToPixels: identityScale }
    );
    const raised = projection.projectPoint(
        { x: 0, y: 4, z: 3 },
        { centerX: 0, centerY: 0, mode: 'volume', tiltDeg: 45, distanceToPixels: identityScale }
    );

    assert.notEqual(raised.y, flat.y);
    assert.notEqual(raised.depth, flat.depth);
});

test('наклон камеры ограничен безопасным диапазоном', () => {
    assert.equal(projection.clampTilt(-100), projection.MIN_TILT);
    assert.equal(projection.clampTilt(100), projection.MAX_TILT);
    assert.equal(projection.clampTilt('bad'), projection.DEFAULT_TILT);
});

test('наклонённая орбита Плутона содержит ненулевую координату Z', () => {
    const points = projection.sampleOrbit({
        semiMajorAxis: 39.48,
        eccentricity: 0.2488,
        inclinationDeg: 17.16,
        ascendingNodeDeg: 110.3,
        argumentPeriapsisDeg: 113.8
    });
    const maxZ = Math.max(...points.map((point) => Math.abs(point.z)));

    assert.ok(maxZ > 8);
    for (const axis of ['x', 'y', 'z']) {
        assert.ok(Math.abs(points[0][axis] - points.at(-1)[axis]) < 1e-10);
    }
});

test('гибридная шкала разделяет внешние планеты и сохраняет границы пояса', () => {
    const radius = 300;
    const uranus = projection.solarDistanceToPixels(19.19, radius);
    const neptune = projection.solarDistanceToPixels(30.07, radius);
    const plutoAverage = projection.solarDistanceToPixels(39.48, radius);
    const kuiperOuter = projection.solarDistanceToPixels(55, radius);
    const heliopause = projection.solarDistanceToPixels(120, radius);

    assert.ok(uranus < neptune);
    assert.ok(neptune < plutoAverage);
    assert.ok(plutoAverage < kuiperOuter);
    assert.ok(neptune - uranus > radius * 0.07);
    assert.ok(plutoAverage - neptune > radius * 0.05);
    assert.equal(heliopause, radius);
});

test('орбита Плутона остаётся внутри визуального пояса Койпера', () => {
    const radius = 300;
    const beltInner = projection.solarDistanceToPixels(30, radius);
    const beltOuter = projection.solarDistanceToPixels(55, radius);
    const plutoPerihelion = projection.solarDistanceToPixels(30, radius);
    const plutoAphelion = projection.solarDistanceToPixels(49.3, radius);

    assert.equal(plutoPerihelion, beltInner);
    assert.ok(plutoAphelion < beltOuter);
});
