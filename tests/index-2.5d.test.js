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

test('мышь разделяет панорамирование, наклон и масштабирование', () => {
    assert.match(html, /if \(e\.button === 1\)/);
    assert.match(html, /mouseTiltStart = \{ tilt: projectionTilt, y: e\.clientY \}/);
    assert.match(html, /SolarSpaceProjection\.tiltFromVerticalDrag/);
    assert.match(html, /if \(e\.button !== 0\) return/);
    assert.match(html, /canvas\.addEventListener\('wheel'/);
    assert.match(html, /viewScale \* factor/);
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
    assert.doesNotMatch(html, /ctx\.arc\(cx, cy, auToPx\(planet\.sma\)/);
});

test('карта использует гибридную шкалу до реальной границы гелиопаузы', () => {
    assert.match(html, /SolarSpaceProjection\.solarDistanceToPixels\(au, maxR \* ORBIT_SCALE, viewScale\)/);
    assert.match(html, /const r = auToPx\(120\)/);
    assert.match(html, /30 \+ Math\.random\(\) \* 25/);
});

test('семантический зум удерживает маркеры и подписи в читаемом размере', () => {
    assert.match(html, /function mapUiScale\(detailMultiplier = 1\)/);
    assert.match(html, /const primaryMarkerRadius = Math\.max\(p\.r, 2\.8\)/);
    assert.match(html, /const visualR = primaryMarkerRadius \* planetUiScale/);
    assert.match(html, /drawLabel\(px, py, p, labelUiScale, primaryMarkerRadius\)/);
    assert.match(html, /function satelliteOrbitScale\(\)/);
    assert.match(html, /drawMoon\([^;]+moonOrbitScale[^;]+moonUiScale\)/s);
    assert.match(html, /wheelZoomFactor\(e\.deltaY, e\.deltaMode, window\.innerHeight\)/);
});

test('карточки разделяют пояс Койпера и более далёкие области', () => {
    assert.match(html, /name: 'Пояс Койпера \(30–55 а\.е\.\)'/);
    assert.match(html, /distantRegions: \{/);
    assert.match(html, /'За гелиопаузой: дальние области'/);
    assert.doesNotMatch(html, /'За гелиопаузой: дальние области →'/);
    assert.match(html, /'Пояс Койпера', labelPoint\.x, labelPoint\.y - 18 \/ viewScale/);
    assert.match(html, /'За гелиопаузой: дальние области', labelPoint\.x, labelPoint\.y - 32 \/ viewScale/);
    assert.doesNotMatch(html, /Math\.max\(labelPoint\.y - (?:18|32) \/ viewScale, topSafeY\)/);
    assert.match(html, /const uiScale = 1 \/ Math\.max\(0\.01, viewScale\)/);
    assert.match(html, /облаком Хиллса/);
    assert.doesNotMatch(html, /Пояс Койпера[^]*?продолжается почти до 1 000 а\.е\./);
});

test('главный пояс астероидов нарисован между Марсом и Юпитером и открывает справку', () => {
    assert.match(html, /const ASTEROID_BELT_INNER_AU = 2\.2/);
    assert.match(html, /const ASTEROID_BELT_OUTER_AU = 3\.2/);
    assert.match(html, /Array\.from\(\{ length: 520 \}/);
    assert.match(html, /asteroidBelt: \{/);
    assert.match(html, /'Главный пояс астероидов'/);
    assert.doesNotMatch(html, /'Главный пояс астероидов →'/);
    assert.match(html, /'Главный пояс астероидов',[\s\S]+?'rgba\(199, 215, 255, 0\.78\)'/);
    assert.match(html, /FEATURE_INFO\.asteroidBelt/);
});

test('объём пояса Койпера включает наклонённую орбиту Плутона', () => {
    assert.match(html, /Array\.from\(\{ length: 700 \}/);
    assert.match(html, /hotPopulation = Math\.random\(\) < 0\.42/);
    assert.match(html, /7 \+ Math\.random\(\) \* 25/);
});

test('каталог миссий доступен с карты и блокирует неподготовленные симуляции', () => {
    assert.match(html, /id="launch-btn"[^>]*>🚀 Запустить ракету/);
    assert.match(html, /id="hud-left">[\s\S]*?id="date-label"[\s\S]*?id="now-btn">Сегодня<\/button>/);
    assert.match(html, /id="hud-right">[\s\S]*?id="view-mode-btn"[\s\S]*?id="launch-btn"/);
    assert.doesNotMatch(html, /id="time-actions"/);
    assert.match(html, /id="mission-catalog"[^>]+aria-hidden="true"/);
    assert.match(html, /id="mission-grid"/);
    assert.match(html, /id="mission-detail"[^>]+aria-labelledby="mission-detail-name"/);
    assert.match(html, /<h3>История миссии<\/h3>/);
    assert.match(html, /id="mission-story"/);
    assert.match(html, /mission\.story\.forEach/);
    assert.match(html, /missionCatalogApi\.filterByCategory\(SolarMissionCatalog, missionCategory\)/);
    assert.match(html, /simulate\.disabled = !ready/);
    assert.match(html, /solar:mission-simulation-request/);
    assert.match(html, /id="mission-simulation"[^>]+aria-hidden="true"/);
    assert.doesNotMatch(html, /id="mission-simulation-status"/);
    assert.match(html, /id="mission-story-panel"/);
    assert.match(html, /id="mission-story-scroll"/);
    assert.match(html, /id="mission-progress" type="range" min="0" max="1000"/);
    assert.match(html, /missionProgress\.addEventListener\('input'/);
    assert.match(html, /missionElapsedMs = Number\(event\.currentTarget\.value\) \/ 1000 \* missionPresentationMs/);
    assert.match(html, /setMissionSimulationPaused\(true\)/);
    assert.doesNotMatch(html, /function startMissionSimulation\(mission\) \{\s*closeMissionDetail\(\);\s*closeMissionCatalog\(\)/);
    assert.match(html, /Вернуться к списку миссий/);
    assert.match(html, /populateMissionStory\(mission\)/);
    assert.match(html, /updateMissionStory\(progress\)/);
    assert.match(html, /getImg\('planets\/earth\.png'\)/);
    assert.match(html, /getImg\('moons\/moon\.png'\)/);
    assert.match(html, /id="mission-vehicle-info"/);
    assert.match(html, /id="mission-vehicle-image"/);
    assert.match(html, /missionSimulation\.classList\.add\('vehicle-open'\)/);
    assert.match(html, /Полёт завершён/);
    assert.match(html, /simTime = new Date\(\)/);
});
