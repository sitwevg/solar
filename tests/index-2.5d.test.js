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

test('режим 2.5D имеет доступные кнопки переключения и наклона', () => {
    assert.match(html, /id="view-mode-btn"[^>]+aria-pressed="false"/);
    assert.match(html, /id="tilt-controls"[^>]+aria-label="Наклон объёмного вида"/);
    assert.match(html, /id="tilt-down"[^>]+aria-label="Уменьшить наклон"/);
    assert.match(html, /id="tilt-up"[^>]+aria-label="Увеличить наклон"/);
});

test('вид сверху остаётся режимом по умолчанию, а объём использует реальную Z-координату', () => {
    assert.match(html, /projectionMode = SolarSpaceProjection\.MODE_TOP/);
    assert.match(html, /projectSpacePoint\(vec\.x, vec\.y, vec\.z\)/);
    assert.match(html, /sort\(\(a, b\) => a\.depth - b\.depth\)/);
});

test('у девяти планет заданы орбитальные элементы, включая наклон Плутона', () => {
    assert.equal((html.match(/orbit: \{ semiMajorAxis:/g) || []).length, 9);
    assert.match(html, /name: 'Плутон'[\s\S]{0,250}inclinationDeg: 17\.160/);
    assert.match(html, /PLANETS\.forEach\(drawOrbit\)/);
});
