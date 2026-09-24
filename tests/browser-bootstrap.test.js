'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function runBrowserScript(context, relativePath) {
    const code = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

test('каталог загружается в браузер рядом с CommonJS-обёрткой Astronomy Engine', () => {
    const fakeAstronomyExports = { sentinel: 'astronomy' };
    const context = vm.createContext({
        console,
        exports: fakeAstronomyExports,
        module: { exports: fakeAstronomyExports }
    });

    runBrowserScript(context, 'src/core/mission-schema.js');
    runBrowserScript(context, 'src/data/missions.js');
    runBrowserScript(context, 'src/core/catalog-bootstrap.js');
    runBrowserScript(context, 'src/core/space-projection.js');

    assert.equal(context.SolarMissionCatalogState.ready, true);
    assert.equal(context.SolarMissionCatalogState.count, 20);
    assert.equal(context.SolarMissionCatalog.length, 20);
    assert.equal(typeof context.SolarSpaceProjection.projectPoint, 'function');
    assert.equal(context.module.exports.sentinel, 'astronomy');
});
test('index.html подключает схему, каталог и проверку в правильном порядке', () => {
    const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
    const schemaIndex = html.indexOf('src/core/mission-schema.js');
    const catalogIndex = html.indexOf('src/data/missions.js');
    const bootstrapIndex = html.indexOf('src/core/catalog-bootstrap.js');
    const projectionIndex = html.indexOf('src/core/space-projection.js');

    assert.ok(schemaIndex > -1);
    assert.ok(catalogIndex > schemaIndex);
    assert.ok(bootstrapIndex > catalogIndex);
    assert.ok(projectionIndex > bootstrapIndex);
});
