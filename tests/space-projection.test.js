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
