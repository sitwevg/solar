const test = require('node:test');
const assert = require('node:assert/strict');

const view = require('../src/core/mission-catalog-view.js');
const missions = require('../src/data/missions.js');

test('каталог сортирует все 20 миссий по дате запуска', () => {
    const sorted = view.filterByCategory(missions, 'all');
    assert.equal(sorted.length, 20);
    assert.equal(sorted[0].id, 'sputnik-1');
    assert.equal(sorted.at(-1).id, 'hayabusa');
});

test('фильтры совпадают с утверждёнными группами', () => {
    const total = view.CATEGORY_ORDER
        .filter(category => category !== 'all')
        .reduce((sum, category) => sum + view.categoryCount(missions, category), 0);

    assert.equal(total, 20);
    assert.equal(view.categoryCount(missions, 'lunar'), 5);
    assert.equal(view.categoryCount(missions, 'outer-interstellar'), 3);
    assert.equal(view.missionCountLabel(1), '1 миссия');
    assert.equal(view.missionCountLabel(3), '3 миссии');
    assert.equal(view.missionCountLabel(5), '5 миссий');
    assert.equal(view.missionCountLabel(20), '20 миссий');
});

test('черновые траектории нельзя запускать из каталога', () => {
    assert.equal(missions.every(mission => !view.isSimulationReady(mission)), true);

    const ready = structuredClone(missions[0]);
    ready.dataStatus = 'trajectory-ready';
    ready.trajectory.accuracy = 'schematic';
    ready.trajectory.segments = [{ id: 'demo' }];
    assert.equal(view.isSimulationReady(ready), true);
});

test('карточка получает русские даты, период, маршрут и статус', () => {
    const voyager = missions.find(mission => mission.id === 'voyager-2');
    assert.equal(view.formatDate(voyager.launchDate), '20 августа 1977');
    assert.equal(view.formatYearRange(voyager), '1977 — настоящее время');
    assert.match(view.targetRoute(voyager), /Земля → Юпитер → Сатурн → Уран → Нептун → Гелиопауза/);
    assert.equal(view.statusMeta(voyager.status).label, 'Продолжается');
});
