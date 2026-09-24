'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('все встроенные JavaScript-блоки index.html синтаксически корректны', () => {
    const scriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;
    let compiled = 0;

    while ((match = scriptPattern.exec(html)) !== null) {
        const code = match[1].trim();
        if (!code) continue;
        assert.doesNotThrow(() => new vm.Script(code));
        compiled += 1;
    }

    assert.ok(compiled >= 3);
});

test('режим 3D имеет доступные кнопки переключения и наклона', () => {
    assert.match(html, /id="view-mode-btn"[^>]+aria-pressed="false"/);
    assert.match(html, /id="tilt-controls"[^>]+aria-label="Наклон 3D-вида"/);
    assert.match(html, /id="tilt-down"[^>]+aria-label="Уменьшить наклон"/);
    assert.match(html, /id="tilt-up"[^>]+aria-label="Увеличить наклон"/);
    assert.match(html, /viewModeBtn\.textContent = volume \? '3D' : '2D'/);
});

test('вид сверху остаётся режимом по умолчанию, а 3D использует эклиптическую Z-координату', () => {
    assert.match(html, /projectionMode = SolarSpaceProjection\.MODE_TOP/);
    assert.match(html, /Astronomy\.Rotation_EQJ_ECL\(\)/);
    assert.match(html, /projectSpacePoint\(eclipticVec\.x, eclipticVec\.y, eclipticVec\.z\)/);
    assert.match(html, /sort\(\(a, b\) => a\.depth - b\.depth\)/);
});

test('линии орбит и планеты строятся одной моделью Astronomy Engine', () => {
    assert.match(html, /function eclipticHelioVector\(body, date\)/);
    assert.match(html, /function ensureOrbitPaths\(\)/);
    assert.match(html, /ORBIT_PATHS\.set\(planet\.body, points\)/);
    assert.match(html, /PLANETS\.forEach\(drawOrbit\)/);
});
