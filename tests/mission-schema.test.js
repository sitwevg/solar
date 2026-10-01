'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../src/core/mission-schema.js');
const missions = require('../src/data/missions.js');

test('исторический каталог содержит 20 уникальных миссий', () => {
    assert.equal(missions.length, 20);
    assert.equal(new Set(missions.map((mission) => mission.id)).size, 20);
    assert.deepEqual(schema.validateCatalog(missions), { valid: true, errors: [] });
});

test('каждая миссия содержит полноценный рассказ из двух абзацев', () => {
    missions.forEach((mission) => {
        assert.equal(mission.story.length, 2, mission.id);
        mission.story.forEach((paragraph) => assert.ok(paragraph.length >= 180, `${mission.id}: слишком короткий абзац`));
    });
});

test('готовые симуляции имеют отдельный расширенный рассказ и иллюстрацию аппарата', () => {
    missions.filter((mission) => mission.dataStatus === 'trajectory-ready').forEach((mission) => {
        assert.ok(mission.simulationStory.length >= 4 && mission.simulationStory.length <= 6, mission.id);
        mission.simulationStory.forEach((paragraph) => assert.ok(paragraph.length >= 120, `${mission.id}: короткий фрагмент`));
        assert.match(mission.vehicle.image, /^spacecraft\/.+\.png$/);
        assert.ok(mission.vehicle.imageAlt.length > 10);
    });
});

test('готовые симуляции содержат сформулированный результат, а не повтор цели', () => {
    missions.filter((mission) => mission.dataStatus === 'trajectory-ready').forEach((mission) => {
        assert.ok(mission.result.length > 40, mission.id);
        assert.doesNotMatch(mission.result, /^(Проверить|Изучить|Достичь|Выполнить|Отработать)\b/, mission.id);
    });
});
test('миссии распределены по пяти утверждённым группам', () => {
    const counts = Object.fromEntries(schema.ENUMS.category.map((category) => [category, 0]));
    missions.forEach((mission) => { counts[mission.category] += 1; });

    assert.deepEqual({
        early: counts['early-spaceflight'],
        lunar: counts.lunar,
        inner: counts['inner-planets'],
        outer: counts['outer-interstellar'],
        smallBodies: counts['small-bodies']
    }, {
        early: 4,
        lunar: 5,
        inner: 5,
        outer: 3,
        smallBodies: 3
    });
});

test('Хаябуса — последняя миссия первой версии по дате запуска', () => {
    const latest = missions.reduce((candidate, mission) => (
        Date.parse(mission.launchDate) > Date.parse(candidate.launchDate) ? mission : candidate
    ));
    assert.equal(latest.id, 'hayabusa');
    assert.equal(latest.launchDate, '2003-05-09');
});

test('оба Вояджера остаются активными и содержат пересечение гелиопаузы', () => {
    for (const id of ['voyager-1', 'voyager-2']) {
        const voyager = missions.find((mission) => mission.id === id);
        assert.equal(voyager.status, 'active');
        assert.equal(voyager.endDate, null);
        assert.ok(voyager.events.some((event) => event.type === 'boundary-crossing'));
        assert.ok(voyager.scales.includes('heliosphere'));
    }
});

test('схема заранее принимает жизненный цикл станции', () => {
    const station = {
        id: 'future-station-example',
        name: 'Будущая станция',
        kind: 'station',
        category: 'stations',
        status: 'active',
        dataStatus: 'outline',
        scenarioType: 'station-lifecycle',
        launchDate: '2000-01-01',
        endDate: null,
        agencies: ['Пример агентства'],
        countries: ['Пример страны'],
        summary: 'Тест расширяемости схемы.',
        objective: 'Проверить поддержку будущего раздела станций.',
        story: [
            'Первый содержательный абзац тестовой истории будущей станции, описывающий её появление, назначение и место в общей хронологии проекта.',
            'Второй содержательный абзац тестовой истории будущей станции, объясняющий результаты работы, значение эксперимента и дальнейшее развитие.'
        ],
        scales: ['earth-orbit'],
        targets: [{ id: 'earth', name: 'Земля', type: 'earth', role: 'primary' }],
        events: [{ id: 'launch', type: 'launch', date: '2000-01-01', title: 'Начало сборки' }],
        trajectory: { accuracy: 'pending', frame: 'geocentric-ecliptic-j2000', segments: [] },
        sources: [{ id: 'example', label: 'Пример', publisher: 'Пример', url: 'https://example.com/station' }]
    };

    assert.deepEqual(schema.validateCatalog([station]), { valid: true, errors: [] });
});

test('схема отклоняет дубликаты и готовую траекторию без XYZ-сегментов', () => {
    const duplicate = structuredClone(missions[0]);
    const broken = structuredClone(missions[1]);
    broken.id = duplicate.id;
    broken.trajectory.accuracy = 'schematic';
    broken.trajectory.segments = [];

    const result = schema.validateCatalog([duplicate, broken]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('дубликат')));
    assert.ok(result.errors.some((error) => error.includes('хотя бы один сегмент')));
});

test('схема проверяет специальные параметры прямого спуска к Луне', () => {
    const broken = structuredClone(missions.find(mission => mission.id === 'luna-9'));
    const phases = broken.trajectory.segments[0].phases;
    phases.find(phase => phase.type === 'translunar').arrivalTangent = 'teleport';
    phases.find(phase => phase.type === 'moon-descent').radialDescent = 'yes';

    const result = schema.validateCatalog([broken]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes('arrivalTangent')));
    assert.ok(result.errors.some(error => error.includes('radialDescent')));
});

test('схема проверяет специальные параметры прямого старта от Земли', () => {
    const broken = structuredClone(missions.find(mission => mission.id === 'luna-2'));
    const phases = broken.trajectory.segments[0].phases;
    phases.find(phase => phase.type === 'earth-launch').radialAscent = 'yes';
    phases.find(phase => phase.type === 'translunar').departureTangent = 'sideways';

    const result = schema.validateCatalog([broken]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes('radialAscent')));
    assert.ok(result.errors.some(error => error.includes('departureTangent')));
});

test('схема проверяет опорные точки межпланетного перелёта', () => {
    const broken = structuredClone(missions.find(mission => mission.id === 'mariner-2'));
    const segment = broken.trajectory.segments[0];
    segment.departureProgress = .05;
    segment.encounterProgress = segment.departureProgress;
    segment.closestApproachKm = -1;
    segment.closestApproachReference = 'clouds';
    segment.targetRadiusKm = -1;
    segment.presentationOriginOffsetAu = -1;
    segment.presentationClosestApproachAu = -1;
    segment.timeline.at(-1).progress = .9;

    const result = schema.validateCatalog([broken]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes('departureProgress')));
    assert.ok(result.errors.some(error => error.includes('encounterProgress')));
    assert.ok(result.errors.some(error => error.includes('closestApproachKm')));
    assert.ok(result.errors.some(error => error.includes('closestApproachReference')));
    assert.ok(result.errors.some(error => error.includes('targetRadiusKm')));
    assert.ok(result.errors.some(error => error.includes('presentationOriginOffsetAu')));
    assert.ok(result.errors.some(error => error.includes('presentationClosestApproachAu')));
    assert.ok(result.errors.some(error => error.includes('шкала должна идти от 0 до 1')));
});
