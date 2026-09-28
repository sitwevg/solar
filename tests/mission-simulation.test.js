'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const missions = require('../src/data/missions.js');
const simulation = require('../src/core/mission-simulation.js');

const earthOrbitIds = ['sputnik-1', 'vostok-1', 'vostok-6', 'voskhod-2'];
const lunarIds = ['luna-2', 'luna-9', 'apollo-11', 'apollo-13', 'luna-17-lunokhod-1'];
const readyIds = [...earthOrbitIds, ...lunarIds];

test('подготовлены четыре околоземные и пять лунных миссий', () => {
    const ready = missions.filter(mission => mission.dataStatus === 'trajectory-ready');
    assert.deepEqual(ready.map(mission => mission.id), readyIds);
    ready.forEach(mission => {
        assert.equal(mission.trajectory.accuracy, 'schematic');
        assert.ok(simulation.primarySegment(mission));
        assert.ok(mission.vehicle.facts.length >= 3);
    });
});

test('ракета стартует и возвращается к границе Земли, а между ними идёт по орбите', () => {
    earthOrbitIds.forEach(id => {
        const mission = missions.find(item => item.id === id);
        const start = simulation.positionAtProgress(mission, 0);
        const middle = simulation.positionAtProgress(mission, 0.5);
        const finish = simulation.positionAtProgress(mission, 1);
        assert.ok(Math.abs(start.radiusKm - simulation.EARTH_RADIUS_KM) < 1e-6, `${id}: старт`);
        assert.ok(middle.radiusKm > simulation.EARTH_RADIUS_KM, `${id}: орбита`);
        assert.ok(Math.abs(finish.radiusKm - simulation.EARTH_RADIUS_KM) < 1e-6, `${id}: возвращение`);
        assert.equal(start.phase, 'launch');
        assert.equal(middle.phase, 'orbit');
        assert.equal(finish.phase, 'return');
        for (let step = 0; step <= 100; step += 1) {
            const position = simulation.positionAtProgress(mission, step / 100);
            assert.ok(position.radiusKm >= simulation.EARTH_RADIUS_KM - 1e-6, `${id}: ${step}`);
        }
    });
});

test('угловое движение равномерно, а возвращение идёт по касательной', () => {
    earthOrbitIds.forEach(id => {
        const mission = missions.find(item => item.id === id);
        const samples = [0.2, 0.3, 0.4].map(progress => simulation.positionAtProgress(mission, progress));
        const firstStep = samples[1].angle - samples[0].angle;
        const secondStep = samples[2].angle - samples[1].angle;
        assert.ok(Math.abs(firstStep - secondStep) < 1e-10, `${id}: равномерный угол`);

        const beforeLanding = simulation.positionAtProgress(mission, 0.99);
        const landing = simulation.positionAtProgress(mission, 1);
        const tangentialDistance = simulation.EARTH_RADIUS_KM * (landing.angle - beforeLanding.angle);
        const radialDistance = beforeLanding.radiusKm - landing.radiusKm;
        assert.ok(tangentialDistance > radialDistance * 2, `${id}: касательное возвращение`);
    });
});

test('лунные маршруты показывают только исторически существовавшие орбиты', () => {
    const phaseTypes = id => simulation.earthMoonSegment(
        missions.find(mission => mission.id === id)
    ).phases.map(phase => phase.type);

    assert.ok(!phaseTypes('luna-2').includes('earth-orbit'));
    assert.ok(!phaseTypes('luna-2').includes('moon-orbit'));
    assert.ok(!phaseTypes('luna-9').includes('moon-orbit'));
    assert.ok(phaseTypes('apollo-11').includes('earth-orbit'));
    assert.ok(phaseTypes('apollo-11').includes('moon-orbit'));
    assert.ok(phaseTypes('apollo-13').includes('earth-orbit'));
    assert.ok(phaseTypes('apollo-13').includes('moon-flyby'));
    assert.ok(!phaseTypes('apollo-13').includes('moon-orbit'));
    assert.ok(phaseTypes('luna-17-lunokhod-1').includes('earth-orbit'));
    assert.ok(phaseTypes('luna-17-lunokhod-1').includes('moon-orbit'));
});

test('локальные витки значительно меньше расстояния между Землёй и Луной', () => {
    assert.ok(simulation.EARTH_MOON_SCENE.earthOrbitRadius * 2 < 0.5);
    assert.ok(simulation.EARTH_MOON_SCENE.moonOrbitRadius * 2 < 0.2);
    lunarIds.forEach(id => {
        const mission = missions.find(item => item.id === id);
        for (let step = 0; step <= 100; step += 1) {
            const point = simulation.positionAtProgress(mission, step / 100);
            assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${id}: ${step}`);
        }
    });
});

test('Луна движется по средней угловой скорости, но визуально ждёт аппарат на поверхности', () => {
    const apollo11 = missions.find(mission => mission.id === 'apollo-11');
    const start = simulation.moonPositionAtProgress(apollo11, 0);
    const landing = simulation.moonPositionAtProgress(apollo11, 0.58);
    const sweptAngle = Math.atan2(
        start.x * landing.y - start.y * landing.x,
        start.x * landing.x + start.y * landing.y
    ) * 180 / Math.PI;
    const elapsedDays = (
        simulation.missionDateAtProgress(apollo11, 0.58)
        - simulation.missionDateAtProgress(apollo11, 0)
    ) / 86400000;
    assert.ok(Math.abs(sweptAngle - elapsedDays * 13.17639648) < 0.01, `угол Apollo 11: ${sweptAngle}`);
    assert.deepEqual(
        simulation.moonPositionAtProgress(apollo11, 0.58),
        simulation.moonPositionAtProgress(apollo11, 0.68),
        'во время работы Eagle на поверхности визуальная Луна не уходит от аппарата'
    );
    assert.notDeepEqual(
        simulation.moonPositionAtProgress(apollo11, 0.68),
        simulation.moonPositionAtProgress(apollo11, 0.77),
        'после взлёта движение Луны продолжается без скачка'
    );

    const lunokhod = missions.find(mission => mission.id === 'luna-17-lunokhod-1');
    assert.deepEqual(
        simulation.moonPositionAtProgress(lunokhod, 0.57),
        simulation.moonPositionAtProgress(lunokhod, 1),
        'после посадки длинная поверхностная история не рисует лишние круги Луны'
    );
});

test('американские лунные миссии стартуют с условных десяти часов', () => {
    ['apollo-11', 'apollo-13'].forEach(id => {
        const mission = missions.find(item => item.id === id);
        const phases = simulation.earthMoonSegment(mission).phases;
        assert.equal(phases[0].angleDeg, -150, `${id}: мыс Кеннеди`);
        assert.equal(phases[1].angleDeg, -121.2, `${id}: продолжение подъёма`);
        assert.equal(phases[2].earthAngleDeg, 58.8, `${id}: точка ухода к Луне`);
    });
    const soviet = simulation.earthMoonSegment(missions.find(item => item.id === 'luna-17-lunokhod-1'));
    assert.equal(soviet.phases[0].angleDeg, -55);
});

test('длительность показа определяется объёмом рассказа, а не календарной длиной миссии', () => {
    const apollo11 = missions.find(mission => mission.id === 'apollo-11');
    const apollo13 = missions.find(mission => mission.id === 'apollo-13');
    assert.ok(apollo11.simulationStory.join(' ').length > apollo13.simulationStory.join(' ').length);
    assert.ok(
        simulation.presentationDurationSeconds(apollo11)
        > simulation.presentationDurationSeconds(apollo13)
    );
});

test('стыки лунных фаз не содержат прямоугольных поворотов', () => {
    const turnAngle = (first, second) => Math.abs(Math.atan2(
        first.x * second.y - first.y * second.x,
        first.x * second.x + first.y * second.y
    ) * 180 / Math.PI);
    lunarIds.forEach(id => {
        const mission = missions.find(item => item.id === id);
        const phases = simulation.earthMoonSegment(mission).phases;
        phases.slice(1).forEach(phase => {
            const epsilon = 0.0002;
            const before = simulation.positionAtProgress(mission, phase.startProgress - epsilon);
            const join = simulation.positionAtProgress(mission, phase.startProgress);
            const after = simulation.positionAtProgress(mission, phase.startProgress + epsilon);
            const incoming = { x: join.x - before.x, y: join.y - before.y };
            const outgoing = { x: after.x - join.x, y: after.y - join.y };
            if (Math.hypot(outgoing.x, outgoing.y) < 1e-10) return;
            const angle = turnAngle(incoming, outgoing);
            assert.ok(angle < 25, `${id}/${phase.type}: поворот ${angle.toFixed(1)}°`);
        });
    });
});

test('темп Apollo 13 выравнивает видимую скорость орбиты и перелёта', () => {
    const mission = missions.find(item => item.id === 'apollo-13');
    const distancesByPhase = new Map();
    for (let step = 1; step <= 200; step += 1) {
        const previousProgress = simulation.presentationProgressAtElapsed(mission, (step - 1) / 200);
        const progress = simulation.presentationProgressAtElapsed(mission, step / 200);
        const previous = simulation.positionAtProgress(mission, previousProgress);
        const current = simulation.positionAtProgress(mission, progress);
        if (previous.phase === current.phase && previous.phase !== 'earth-launch') {
            if (!distancesByPhase.has(current.phase)) distancesByPhase.set(current.phase, []);
            distancesByPhase.get(current.phase).push(Math.hypot(current.x - previous.x, current.y - previous.y));
        }
    }
    const means = [...distancesByPhase.values()].map(values => (
        values.reduce((sum, value) => sum + value, 0) / values.length
    ));
    const minimum = Math.min(...means);
    const maximum = Math.max(...means);
    assert.ok(maximum / minimum < 1.01, `разброс средней скорости фаз: ${(maximum / minimum).toFixed(3)}`);
    for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
        const elapsed = simulation.elapsedFractionAtPresentationProgress(mission, progress);
        assert.ok(Math.abs(simulation.presentationProgressAtElapsed(mission, elapsed) - progress) < 1e-6);
    }
});

test('Apollo 13 входит в широкий свободный облёт без резкого поворота у Луны', () => {
    const mission = missions.find(item => item.id === 'apollo-13');
    const segment = simulation.earthMoonSegment(mission);
    const flyby = segment.phases.find(phase => phase.type === 'moon-flyby');
    assert.ok(flyby.radiusBulge >= 0.07, 'свободный облёт должен быть шире локальной орбиты');

    const direction = (fromProgress, toProgress) => {
        const from = simulation.positionAtProgress(mission, fromProgress);
        const to = simulation.positionAtProgress(mission, toProgress);
        return { x: to.x - from.x, y: to.y - from.y };
    };
    const incoming = direction(0.60, 0.62);
    const flybyEntry = direction(0.62, 0.64);
    const turn = Math.abs(Math.atan2(
        incoming.x * flybyEntry.y - incoming.y * flybyEntry.x,
        incoming.x * flybyEntry.x + incoming.y * flybyEntry.y
    ) * 180 / Math.PI);
    assert.ok(turn < 20, `поворот при входе в облёт: ${turn.toFixed(1)}°`);
});

test('лунная шкала времени синхронизирует ключевые фазы, не растягивая перелёт', () => {
    const apollo11 = missions.find(mission => mission.id === 'apollo-11');
    const lunokhod = missions.find(mission => mission.id === 'luna-17-lunokhod-1');
    assert.equal(simulation.missionDateAtProgress(apollo11, 0.1).toISOString(), '1969-07-16T16:16:16.000Z');
    assert.equal(simulation.missionDateAtProgress(apollo11, 0.58).toISOString(), '1969-07-20T20:17:40.000Z');
    assert.equal(simulation.missionDateAtProgress(lunokhod, 0.57).toISOString(), '1970-11-17T03:46:50.000Z');
    assert.equal(simulation.missionDateAtProgress(lunokhod, 1).toISOString(), '1971-10-04T00:00:00.000Z');
});

test('синяя траектория накапливается только за пройденной частью полёта', () => {
    const mission = missions.find(item => item.id === 'sputnik-1');
    const start = simulation.traveledPath(mission, 0);
    const middle = simulation.traveledPath(mission, 0.5);
    const finish = simulation.traveledPath(mission, 1);
    assert.deepEqual(start, []);
    assert.ok(middle.length > 2);
    assert.ok(finish.length > middle.length);
    assert.deepEqual(middle.at(-1), simulation.positionAtProgress(mission, 0.5));
    assert.deepEqual(finish.at(-1), simulation.positionAtProgress(mission, 1));
});

test('время сценария движется между реальными датами сегмента', () => {
    const mission = missions.find(item => item.id === 'vostok-1');
    const segment = simulation.orbitalSegment(mission);
    assert.equal(simulation.missionDateAtProgress(mission, 0).getTime(), Date.parse(segment.startDate));
    assert.equal(simulation.missionDateAtProgress(mission, 1).getTime(), Date.parse(segment.endDate));
    assert.match(simulation.outcomeLabel(mission.status), /успешна/i);
});

test('ключевые события появляются в заданной точке сценария', () => {
    const sputnik = missions.find(item => item.id === 'sputnik-1');
    const voskhod = missions.find(item => item.id === 'voskhod-2');
    assert.equal(simulation.currentEventAtProgress(sputnik, 0).id, 'launch');
    assert.equal(simulation.currentEventAtProgress(sputnik, 0.3).id, 'radio-end');
    assert.equal(simulation.currentEventAtProgress(sputnik, 1).id, 'mission-end');
    assert.equal(simulation.currentEventAtProgress(voskhod, 0.062).id, 'first-eva');
    assert.equal(simulation.currentEventAtProgress(voskhod, 0.08).id, 'eva-end');
});
