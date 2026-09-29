'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Astronomy = require('../astronomy.js');
const missions = require('../src/data/missions.js');
const simulation = require('../src/core/mission-simulation.js');

const earthOrbitIds = ['sputnik-1', 'vostok-1', 'vostok-6', 'voskhod-2'];
const lunarIds = ['luna-2', 'luna-9', 'apollo-11', 'apollo-13', 'luna-17-lunokhod-1'];
const interplanetaryIds = ['mariner-2'];
const readyIds = [...earthOrbitIds, ...lunarIds, ...interplanetaryIds];

test('подготовлены четыре околоземные, пять лунных и первая межпланетная миссия', () => {
    const ready = missions.filter(mission => mission.dataStatus === 'trajectory-ready');
    assert.deepEqual(ready.map(mission => mission.id), readyIds);
    ready.forEach(mission => {
        assert.ok(['schematic', 'event-reconstructed'].includes(mission.trajectory.accuracy));
        assert.ok(simulation.primarySegment(mission));
        assert.ok(mission.vehicle.facts.length >= 3);
    });
});

test('Mariner 2 плавно уходит с парковочной орбиты и проходит рядом с эфемеридной Венерой', () => {
    const mission = missions.find(item => item.id === 'mariner-2');
    const segment = simulation.heliocentricTransferSegment(mission);
    assert.ok(segment);
    assert.equal(segment.originBody, 'Earth');
    assert.equal(segment.targetBody, 'Venus');
    assert.equal(segment.departureProgress, 0.12);
    assert.equal(segment.encounterProgress, 0.88);

    const start = simulation.positionAtProgress(mission, 0);
    const earth = simulation.heliocentricBodyPosition(mission, 'Earth', 0);
    assert.ok(Math.hypot(start.x - earth.x, start.y - earth.y) < segment.parkingDisplayRadiusAu);
    assert.equal(start.phase, 'earth-launch');
    assert.equal(simulation.positionAtProgress(mission, 0.06).phase, 'earth-parking');
    assert.equal(simulation.positionAtProgress(mission, 0.5).phase, 'interplanetary-cruise');
    assert.equal(simulation.positionAtProgress(mission, 0.9).phase, 'planetary-flyby');

    const encounter = simulation.positionAtProgress(mission, segment.encounterProgress);
    const venus = simulation.heliocentricBodyPosition(mission, 'Venus', segment.encounterProgress);
    assert.ok(Math.abs(
        Math.hypot(encounter.x - venus.x, encounter.y - venus.y, encounter.z - venus.z)
        - segment.flybyDisplayRadiusAu
    ) < 2e-5);

    const turnAt = progress => {
        const epsilon = .0002;
        const before = simulation.positionAtProgress(mission, progress - epsilon);
        const join = simulation.positionAtProgress(mission, progress);
        const after = simulation.positionAtProgress(mission, progress + epsilon);
        const incoming = { x: join.x - before.x, y: join.y - before.y };
        const outgoing = { x: after.x - join.x, y: after.y - join.y };
        return Math.abs(Math.atan2(
            incoming.x * outgoing.y - incoming.y * outgoing.x,
            incoming.x * outgoing.x + incoming.y * outgoing.y
        ) * 180 / Math.PI);
    };
    assert.ok(turnAt(segment.departureProgress) < 3, 'уход от Земли не должен ломать траекторию');
    assert.ok(turnAt(segment.encounterProgress) < 3, 'пролёт Венеры должен быть гладким');

    const startCamera = simulation.heliocentricCameraState(mission, 0, 1);
    const cruiseCamera = simulation.heliocentricCameraState(mission, .5, 1);
    const enlargedCamera = simulation.heliocentricCameraState(mission, .5, 1.5);
    assert.equal(startCamera.automaticZoom, 6);
    assert.equal(cruiseCamera.automaticZoom, 3);
    assert.equal(enlargedCamera.zoom, 4.5);
    assert.equal(cruiseCamera.followProgress, 1);
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
    assert.ok(phaseTypes('luna-9').includes('earth-orbit'));
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

test('Луна следует эфемериде Astronomy Engine и движется во время стоянки Apollo 11', () => {
    const luna2 = missions.find(mission => mission.id === 'luna-2');
    const luna2Start = simulation.moonPositionAtProgress(luna2, 0);
    const luna2Expected = Astronomy.EclipticGeoMoon(simulation.missionDateAtProgress(luna2, 0));
    assert.ok(Math.abs(luna2Start.longitudeDeg - luna2Expected.lon) < 1e-9);
    assert.ok(Math.abs(luna2Start.latitudeDeg - luna2Expected.lat) < 1e-9);

    const apollo11 = missions.find(mission => mission.id === 'apollo-11');
    const landing = simulation.moonPositionAtProgress(apollo11, 0.58);
    const expected = Astronomy.EclipticGeoMoon(simulation.missionDateAtProgress(apollo11, 0.58));
    assert.ok(Math.abs(landing.longitudeDeg - expected.lon) < 1e-9);
    assert.ok(Math.abs(landing.latitudeDeg - expected.lat) < 1e-9);
    assert.ok(Math.abs(landing.distanceScale
        - expected.dist * Astronomy.KM_PER_AU / 384400) < 1e-9);
    assert.notDeepEqual(
        simulation.moonPositionAtProgress(apollo11, 0.58),
        simulation.moonPositionAtProgress(apollo11, 0.68),
        'во время работы Eagle поверхность вместе с Луной продолжает движение'
    );
    assert.notDeepEqual(
        simulation.moonPositionAtProgress(apollo11, 0.68),
        simulation.moonPositionAtProgress(apollo11, 0.77),
        'после взлёта движение Луны продолжается'
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
            if (phase.type === 'moon-surface' || phase.type === 'moon-impact') return;
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

test('геометрия лунных миссий соответствует историческому типу полёта и стороне Луны', () => {
    const mission = id => missions.find(item => item.id === id);
    const phases = id => simulation.earthMoonSegment(mission(id)).phases;
    const normalizeDegrees = degrees => ((degrees % 360) + 360) % 360;
    const angularDistance = (first, second) => {
        const difference = Math.abs(normalizeDegrees(first) - normalizeDegrees(second));
        return Math.min(difference, 360 - difference);
    };
    const relativeAngleAt = (id, progress) => {
        const item = mission(id);
        const point = simulation.positionAtProgress(item, progress);
        const moon = simulation.moonPositionAtProgress(item, progress);
        return normalizeDegrees(Math.atan2(point.y - moon.y, point.x - moon.x) * 180 / Math.PI);
    };
    const earthFacingAngleAt = (id, progress) => {
        const moon = simulation.moonPositionAtProgress(mission(id), progress);
        return normalizeDegrees(Math.atan2(-moon.y, -moon.x) * 180 / Math.PI);
    };

    const luna2Transfer = phases('luna-2').find(phase => phase.type === 'translunar');
    const luna2Launch = phases('luna-2').find(phase => phase.type === 'earth-launch');
    assert.equal(luna2Launch.turns, 0);
    assert.equal(luna2Launch.radialAscent, true);
    assert.equal(luna2Transfer.departureTangent, 'radial-out');
    assert.equal(luna2Transfer.arrivalTangent, 'radial-in');
    assert.equal(luna2Transfer.moonRadius, simulation.EARTH_MOON_SCENE.moonRadius);
    const luna2BeforeInjection = simulation.positionAtProgress(mission('luna-2'), 0.0698);
    const luna2Injection = simulation.positionAtProgress(mission('luna-2'), 0.07);
    const luna2AfterInjection = simulation.positionAtProgress(mission('luna-2'), 0.0702);
    const luna2Incoming = {
        x: luna2Injection.x - luna2BeforeInjection.x,
        y: luna2Injection.y - luna2BeforeInjection.y
    };
    const luna2Outgoing = {
        x: luna2AfterInjection.x - luna2Injection.x,
        y: luna2AfterInjection.y - luna2Injection.y
    };
    assert.ok(Math.abs(Math.atan2(
        luna2Incoming.x * luna2Outgoing.y - luna2Incoming.y * luna2Outgoing.x,
        luna2Incoming.x * luna2Outgoing.x + luna2Incoming.y * luna2Outgoing.y
    ) * 180 / Math.PI) < 5, 'прямой старт Луны-2 не должен поворачивать у Земли');
    assert.ok(angularDistance(
        relativeAngleAt('luna-2', 1),
        earthFacingAngleAt('luna-2', 1)
    ) < 15, 'Луна-2 должна попадать в обращённую к Земле область');

    const luna9Phases = phases('luna-9');
    const luna9Transfer = luna9Phases.find(phase => phase.type === 'translunar');
    const luna9Descent = luna9Phases.find(phase => phase.type === 'moon-descent');
    assert.equal(luna9Transfer.arrivalTangent, 'radial-in');
    assert.equal(luna9Descent.radialDescent, true);
    assert.equal(luna9Descent.turns, 0, 'Луна-9 не должна изображать четверть лунной орбиты');
    assert.ok(angularDistance(
        relativeAngleAt('luna-9', 0.55),
        earthFacingAngleAt('luna-9', 0.55)
    ) < 90, 'Океан Бурь находится на видимой стороне');

    const apollo11Phases = phases('apollo-11');
    const apollo11Orbit = apollo11Phases.find(phase => phase.type === 'moon-orbit');
    const apollo11Return = apollo11Phases.find(phase => phase.type === 'transearth');
    assert.ok(apollo11Orbit.turns > 0, 'экранная орбита Apollo 11 должна идти по часовой стрелке — ретроградно');
    assert.ok(angularDistance(
        relativeAngleAt('apollo-11', 0.58),
        earthFacingAngleAt('apollo-11', 0.58)
    ) < 90, 'Море Спокойствия находится на видимой стороне');
    assert.ok(angularDistance(
        normalizeDegrees(apollo11Return.moonAngleDeg),
        normalizeDegrees(simulation.moonPositionAtProgress(mission('apollo-11'), 0.77).angle * 180 / Math.PI
            - simulation.moonPositionAtProgress(mission('apollo-11'), 0.42).angle * 180 / Math.PI)
    ) < 25, 'импульс возвращения должен начинаться за Луной');

    const apollo13Phases = phases('apollo-13');
    assert.ok(apollo13Phases.some(phase => phase.type === 'moon-flyby' && phase.hyperbola));
    assert.ok(!apollo13Phases.some(phase => phase.type === 'moon-orbit'));

    const luna17Orbit = phases('luna-17-lunokhod-1').find(phase => phase.type === 'moon-orbit');
    assert.equal(luna17Orbit.inclinationDeg, 141);
    assert.ok(luna17Orbit.turns > 0, 'ретроградная орбита Луны-17 показана по часовой стрелке');
    assert.ok(angularDistance(
        relativeAngleAt('luna-17-lunokhod-1', 0.57),
        earthFacingAngleAt('luna-17-lunokhod-1', 0.57)
    ) < 90, 'Море Дождей находится на видимой стороне');

    const luna17 = mission('luna-17-lunokhod-1');
    const descentAngles = [];
    for (let step = 0; step <= 20; step += 1) {
        const progress = 0.52 + 0.05 * step / 20;
        const point = simulation.positionAtProgress(luna17, progress);
        const moon = simulation.moonPositionAtProgress(luna17, progress);
        let angle = Math.atan2(point.y - moon.y, point.x - moon.x);
        if (descentAngles.length) {
            while (angle < descentAngles.at(-1) - Math.PI) angle += Math.PI * 2;
            while (angle > descentAngles.at(-1) + Math.PI) angle -= Math.PI * 2;
        }
        descentAngles.push(angle);
    }
    descentAngles.slice(1).forEach((angle, index) => {
        assert.ok(angle >= descentAngles[index] - 1e-9, 'Луна-17 не должна разворачиваться на спуске');
    });
});

test('след Apollo 11 прерывается на поверхности и возобновляется с движущейся Луны', () => {
    const mission = missions.find(item => item.id === 'apollo-11');
    const atLanding = simulation.traveledPathSegments(mission, 0.58, 420);
    const onSurface = simulation.traveledPathSegments(mission, 0.64, 420);
    const afterAscent = simulation.traveledPathSegments(mission, 0.7, 420);

    assert.deepEqual(onSurface, atLanding, 'синяя линия не должна рисоваться во время стоянки');
    assert.equal(afterAscent.length, 2, 'после взлёта должен начаться новый участок следа');
    const landingPoint = atLanding[0].at(-1);
    const ascentPoint = afterAscent[1][0];
    assert.ok(
        Math.hypot(ascentPoint.x - landingPoint.x, ascentPoint.y - landingPoint.y) > 0.1,
        'разрыв должен отражать перемещение Луны между посадкой и взлётом'
    );
    const moonAtAscent = simulation.moonPositionAtProgress(mission, 0.68);
    assert.ok(Math.abs(
        Math.hypot(ascentPoint.x - moonAtAscent.x, ascentPoint.y - moonAtAscent.y)
        - simulation.EARTH_MOON_SCENE.moonRadius
    ) < 1e-9, 'новый след начинается на поверхности в новом положении Луны');
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

test('Apollo 13 проходит открытую гиперболу NASA без лунной орбиты и резких стыков', () => {
    const mission = missions.find(item => item.id === 'apollo-13');
    const segment = simulation.earthMoonSegment(mission);
    const flyby = segment.phases.find(phase => phase.type === 'moon-flyby');
    assert.equal(flyby.turns, undefined, 'свободный облёт не должен имитировать лунную орбиту');
    assert.equal(flyby.hyperbola.eccentricity, 1.4462);
    assert.equal(flyby.hyperbola.periapsisKm, 1988.8);
    assert.equal(flyby.hyperbola.inclinationDeg, 173.7);
    assert.equal(flyby.hyperbola.epoch, '1970-04-15T00:33:57Z');

    const perilune = simulation.positionAtProgress(mission, 0.65);
    const moon = simulation.moonPositionAtProgress(mission, 0.65);
    const scenePerilune = Math.hypot(perilune.x - moon.x, perilune.y - moon.y);
    const expectedScenePerilune = simulation.EARTH_MOON_SCENE.moonRadius * 1988.8 / 1737.4;
    assert.ok(Math.abs(scenePerilune - expectedScenePerilune) < 1e-9);

    const direction = (fromProgress, toProgress) => {
        const from = simulation.positionAtProgress(mission, fromProgress);
        const to = simulation.positionAtProgress(mission, toProgress);
        return { x: to.x - from.x, y: to.y - from.y };
    };
    [0.62, 0.68].forEach(progress => {
        const epsilon = 0.0002;
        const incoming = direction(progress - epsilon, progress);
        const outgoing = direction(progress, progress + epsilon);
        const turn = Math.abs(Math.atan2(
            incoming.x * outgoing.y - incoming.y * outgoing.x,
            incoming.x * outgoing.x + incoming.y * outgoing.y
        ) * 180 / Math.PI);
        assert.ok(turn < 5, `поворот в стыке ${progress}: ${turn.toFixed(1)}°`);
    });

    const pcPlus2 = mission.events.find(event => event.id === 'pc-plus-2');
    assert.equal(pcPlus2.date, '1970-04-15T02:40:38Z');
    assert.ok(pcPlus2.simulationProgress > 0.65, 'коррекция PC+2 выполняется после перицентра');
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
