'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const missions = require('../src/data/missions.js');
const simulation = require('../src/core/mission-simulation.js');

const readyIds = ['sputnik-1', 'vostok-1', 'vostok-6', 'voskhod-2'];

test('этап 3 готовит четыре околоземные миссии', () => {
    const ready = missions.filter(mission => mission.dataStatus === 'trajectory-ready');
    assert.deepEqual(ready.map(mission => mission.id), readyIds);
    ready.forEach(mission => {
        assert.equal(mission.trajectory.accuracy, 'schematic');
        assert.ok(simulation.orbitalSegment(mission));
        assert.ok(mission.vehicle.facts.length >= 3);
    });
});

test('ракета стартует и возвращается к границе Земли, а между ними идёт по орбите', () => {
    readyIds.forEach(id => {
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
    readyIds.forEach(id => {
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
