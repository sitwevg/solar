(function initMissionSimulation(root, factory) {
    'use strict';

    const api = factory();
    const isNode = typeof process !== 'undefined' && process.versions
        && Boolean(process.versions.node) && typeof module === 'object' && module.exports;
    if (isNode) module.exports = api;
    else root.SolarMissionSimulation = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMissionSimulation() {
    'use strict';

    const EARTH_RADIUS_KM = 6371;
    const EARTH_MOON_SCENE = Object.freeze({
        earthRadius: 0.17,
        moonRadius: 0.045,
        earthOrbitRadius: 0.24,
        moonOrbitRadius: 0.095
    });
    const J2000_UTC_MS = Date.parse('2000-01-01T12:00:00Z');
    const LUNAR_MEAN_LONGITUDE_J2000_DEG = 218.3164477;
    const LUNAR_MEAN_MOTION_DEG_PER_DAY = 13.17639648;
    const earthMoonPacingCache = new WeakMap();
    const ACCURACY_LABELS = Object.freeze({
        'exact-ephemeris': 'Точная эфемерида',
        'event-reconstructed': 'Реконструкция по событиям',
        schematic: 'Учебная реконструкция',
        pending: 'Траектория не подготовлена'
    });

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function orbitalSegment(mission) {
        return mission?.trajectory?.segments?.find(segment => segment.model === 'elliptic-orbit') || null;
    }

    function earthMoonSegment(mission) {
        return mission?.trajectory?.segments?.find(segment => segment.model === 'earth-moon-route') || null;
    }

    function primarySegment(mission) {
        return orbitalSegment(mission) || earthMoonSegment(mission);
    }

    function presentationDurationSeconds(mission) {
        const segment = primarySegment(mission);
        if (!segment) return 0;
        const days = Math.max(1 / 24, (Date.parse(segment.endDate) - Date.parse(segment.startDate)) / 86400000);
        const storyCharacters = (mission.simulationStory || mission.story || []).join(' ').length;
        const readingSeconds = storyCharacters / 15;
        return Math.round(clamp(Math.max(82 + Math.log10(days + 1) * 12, readingSeconds), 82, 150));
    }

    function missionDateAtProgress(mission, progress) {
        const segment = primarySegment(mission);
        if (!segment) return null;
        const shownProgress = clamp(progress, 0, 1);
        const timeline = Array.isArray(segment.timeline) && segment.timeline.length >= 2
            ? segment.timeline
            : [{ progress: 0, date: segment.startDate }, { progress: 1, date: segment.endDate }];
        const upperIndex = timeline.findIndex(point => point.progress >= shownProgress);
        if (upperIndex <= 0) return new Date(timeline[0].date);
        const upper = timeline[upperIndex];
        const lower = timeline[upperIndex - 1];
        const local = (shownProgress - lower.progress) / Math.max(1e-9, upper.progress - lower.progress);
        return new Date(Date.parse(lower.date) + (Date.parse(upper.date) - Date.parse(lower.date)) * local);
    }

    function orbitRadiusAtAngle(segment, angle) {
        const orbit = segment.orbit;
        const perigee = EARTH_RADIUS_KM + orbit.perigeeKm;
        const apogee = EARTH_RADIUS_KM + orbit.apogeeKm;
        const semiMajor = (perigee + apogee) / 2;
        const eccentricity = (apogee - perigee) / (apogee + perigee);
        const startAngle = (orbit.launchAngleDeg ?? orbit.phaseDeg ?? 0) * Math.PI / 180;
        const anomaly = angle - startAngle;
        return semiMajor * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(anomaly));
    }

    function positionAtAngleAndRadius(segment, angle, radius, phase) {
        const orbit = segment.orbit;
        const inclination = orbit.inclinationDeg * Math.PI / 180;
        return Object.freeze({
            x: radius * Math.cos(angle),
            y: radius * Math.sin(angle) * Math.cos(inclination),
            z: radius * Math.sin(angle) * Math.sin(inclination),
            angle,
            radiusKm: radius,
            ...(phase ? { phase } : {})
        });
    }

    function orbitPositionAtAngle(segment, angle) {
        return positionAtAngleAndRadius(segment, angle, orbitRadiusAtAngle(segment, angle));
    }

    function returnProgress(mission) {
        const event = mission.events.find(item => (
            ['return', 'mission-end'].includes(item.type) && Number.isFinite(item.simulationProgress)
        ));
        return clamp(event?.simulationProgress ?? 0.88, 0.72, 0.96);
    }

    function positionAtProgress(mission, progress) {
        const segment = orbitalSegment(mission);
        if (!segment) return earthMoonPositionAtProgress(mission, progress);
        const orbit = segment.orbit;
        const shownProgress = clamp(progress, 0, 1);
        const launchEnd = clamp(orbit.launchProgress ?? 0.08, 0.02, 0.16);
        const returnStart = Math.max(launchEnd + 0.35, returnProgress(mission));
        const startAngle = (orbit.launchAngleDeg ?? orbit.phaseDeg ?? 0) * Math.PI / 180;
        const angularRate = Math.PI * 2 * orbit.displayOrbits;
        const angle = startAngle + angularRate * shownProgress;
        const orbitalRadius = orbitRadiusAtAngle(segment, angle);

        if (shownProgress <= launchEnd) {
            const radius = EARTH_RADIUS_KM
                + (orbitalRadius - EARTH_RADIUS_KM) * shownProgress / launchEnd;
            return positionAtAngleAndRadius(segment, angle, radius, 'launch');
        }

        if (shownProgress < returnStart) {
            return positionAtAngleAndRadius(segment, angle, orbitalRadius, 'orbit');
        }

        const descent = (shownProgress - returnStart) / (1 - returnStart);
        const radius = EARTH_RADIUS_KM + (orbitalRadius - EARTH_RADIUS_KM) * (1 - descent);
        return positionAtAngleAndRadius(segment, angle, radius, 'return');
    }

    function pointAround(center, radius, angle) {
        return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, z: 0 };
    }

    function phaseAngle(segment, phase, localProgress) {
        const start = (phase.angleDeg ?? 0) * Math.PI / 180;
        const end = start + (phase.turns ?? 0) * Math.PI * 2;
        const phaseIndex = segment.phases.indexOf(phase);
        const duration = Math.max(1e-9, phase.endProgress - phase.startProgress);
        let startSlope = end - start;
        let endSlope = end - start;
        if (phase.type === 'moon-descent') {
            const previous = segment.phases[phaseIndex - 1];
            const previousDuration = Math.max(1e-9, previous.endProgress - previous.startProgress);
            startSlope = previous.type === 'translunar'
                ? end - start
                : (previous.turns ?? 0) * Math.PI * 2 / previousDuration * duration;
            endSlope = 0;
        } else if (phase.type === 'moon-ascent') {
            const next = segment.phases[phaseIndex + 1];
            const nextDuration = Math.max(1e-9, next.endProgress - next.startProgress);
            startSlope = 0;
            endSlope = (next.turns ?? 0) * Math.PI * 2 / nextDuration * duration;
        }
        if (!['moon-descent', 'moon-ascent'].includes(phase.type)) {
            return start + (end - start) * localProgress;
        }
        const t = localProgress;
        const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
        const h10 = t ** 3 - 2 * t ** 2 + t;
        const h01 = -2 * t ** 3 + 3 * t ** 2;
        const h11 = t ** 3 - t ** 2;
        return h00 * start + h10 * startSlope + h01 * end + h11 * endSlope;
    }

    function moonPositionAtProgress(mission, progress) {
        const segment = earthMoonSegment(mission);
        if (!segment) return null;
        const motionProgress = Math.min(
            clamp(progress, 0, 1),
            clamp(segment.moonMotionEndProgress ?? 1, 0, 1)
        );
        const date = missionDateAtProgress(mission, motionProgress);
        const daysFromJ2000 = (date.getTime() - J2000_UTC_MS) / 86400000;
        const angle = (
            LUNAR_MEAN_LONGITUDE_J2000_DEG
            + LUNAR_MEAN_MOTION_DEG_PER_DAY * daysFromJ2000
        ) * Math.PI / 180;
        return Object.freeze({ x: Math.cos(angle), y: Math.sin(angle), z: 0, angle });
    }

    function lunarReferenceAngle(mission) {
        const segment = earthMoonSegment(mission);
        const arrival = segment.phases.find(phase => phase.type === 'translunar');
        return moonPositionAtProgress(mission, arrival?.endProgress ?? 0).angle;
    }

    function normalized(vector) {
        const length = Math.hypot(vector.x, vector.y) || 1;
        return { x: vector.x / length, y: vector.y / length };
    }

    function orbitTangent(angle, direction = 1) {
        return { x: -Math.sin(angle) * direction, y: Math.cos(angle) * direction };
    }

    function cubicPoint(start, control1, control2, end, t) {
        const inverse = 1 - t;
        return {
            x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x
                + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
            y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y
                + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y,
            z: 0
        };
    }

    function transferPoint(mission, phase, localProgress) {
        const outbound = phase.type === 'translunar';
        const earthAngle = (phase.earthAngleDeg ?? 0) * Math.PI / 180;
        const moonAngle = lunarReferenceAngle(mission) + (phase.moonAngleDeg ?? 180) * Math.PI / 180;
        const earthRadius = phase.earthRadius ?? EARTH_MOON_SCENE.earthOrbitRadius;
        const moonRadius = phase.moonRadius ?? EARTH_MOON_SCENE.moonOrbitRadius;
        const earthPoint = pointAround({ x: 0, y: 0 }, earthRadius, earthAngle);
        const moonProgress = outbound ? phase.endProgress : phase.startProgress;
        const moonPoint = pointAround(moonPositionAtProgress(mission, moonProgress), moonRadius, moonAngle);
        const start = outbound ? earthPoint : moonPoint;
        const end = outbound ? moonPoint : earthPoint;
        const startAngle = outbound ? earthAngle : moonAngle;
        const endAngle = outbound ? moonAngle : earthAngle;
        const startTangent = normalized(orbitTangent(startAngle, phase.departureDirection ?? 1));
        const endTangent = normalized(orbitTangent(endAngle, phase.arrivalDirection ?? 1));
        const chord = Math.hypot(end.x - start.x, end.y - start.y);
        const handle = chord * (phase.handleScale ?? 0.32);
        const control1 = {
            x: start.x + startTangent.x * handle,
            y: start.y + startTangent.y * handle
        };
        const control2 = {
            x: end.x - endTangent.x * handle,
            y: end.y - endTangent.y * handle
        };
        const sampleCount = 120;
        const samples = [];
        let totalLength = 0;
        for (let index = 0; index <= sampleCount; index += 1) {
            const t = index / sampleCount;
            const point = cubicPoint(start, control1, control2, end, t);
            if (samples.length) totalLength += Math.hypot(point.x - samples.at(-1).x, point.y - samples.at(-1).y);
            samples.push({ ...point, length: totalLength });
        }
        const targetLength = totalLength * localProgress;
        const upperIndex = samples.findIndex(point => point.length >= targetLength);
        if (upperIndex <= 0) return samples[0];
        const upper = samples[upperIndex];
        const lower = samples[upperIndex - 1];
        const local = (targetLength - lower.length) / Math.max(1e-9, upper.length - lower.length);
        return {
            x: lower.x + (upper.x - lower.x) * local,
            y: lower.y + (upper.y - lower.y) * local,
            z: 0
        };
    }

    function earthMoonPositionAtProgress(mission, progress) {
        const segment = earthMoonSegment(mission);
        if (!segment) return null;
        const shownProgress = clamp(progress, 0, 1);
        const phase = segment.phases.find(item => shownProgress <= item.endProgress)
            || segment.phases.at(-1);
        const localProgress = clamp(
            (shownProgress - phase.startProgress) / Math.max(1e-9, phase.endProgress - phase.startProgress),
            0,
            1
        );
        const isLunarPhase = phase.type.startsWith('moon-');
        const angle = phaseAngle(segment, phase, localProgress) + (isLunarPhase ? lunarReferenceAngle(mission) : 0);
        let point;
        if (phase.type === 'earth-launch') {
            const targetRadius = phase.radius ?? EARTH_MOON_SCENE.earthOrbitRadius;
            const eased = localProgress * localProgress * (3 - 2 * localProgress);
            const radius = EARTH_MOON_SCENE.earthRadius
                + (targetRadius - EARTH_MOON_SCENE.earthRadius) * eased;
            point = pointAround({ x: 0, y: 0 }, radius, angle);
        } else if (phase.type === 'earth-orbit') {
            point = pointAround({ x: 0, y: 0 }, phase.radius ?? EARTH_MOON_SCENE.earthOrbitRadius, angle);
        } else if (phase.type === 'translunar' || phase.type === 'transearth') {
            point = transferPoint(mission, phase, localProgress);
        } else if (phase.type === 'moon-orbit' || phase.type === 'moon-flyby') {
            point = pointAround(moonPositionAtProgress(mission, shownProgress), phase.radius ?? EARTH_MOON_SCENE.moonOrbitRadius, angle);
        } else if (phase.type === 'moon-descent') {
            const startRadius = phase.radius ?? EARTH_MOON_SCENE.moonOrbitRadius;
            const eased = localProgress * localProgress * (3 - 2 * localProgress);
            const radius = startRadius + (EARTH_MOON_SCENE.moonRadius - startRadius) * eased;
            point = pointAround(moonPositionAtProgress(mission, shownProgress), radius, angle);
        } else if (phase.type === 'moon-ascent') {
            const endRadius = phase.radius ?? EARTH_MOON_SCENE.moonOrbitRadius;
            const eased = localProgress * localProgress * (3 - 2 * localProgress);
            const radius = EARTH_MOON_SCENE.moonRadius + (endRadius - EARTH_MOON_SCENE.moonRadius) * eased;
            point = pointAround(moonPositionAtProgress(mission, shownProgress), radius, angle);
        } else if (phase.type === 'earth-entry') {
            const startRadius = phase.radius ?? EARTH_MOON_SCENE.earthOrbitRadius;
            const eased = localProgress * localProgress * (3 - 2 * localProgress);
            const radius = startRadius + (EARTH_MOON_SCENE.earthRadius - startRadius) * eased;
            point = pointAround({ x: 0, y: 0 }, radius, angle);
        } else if (phase.type === 'moon-surface' || phase.type === 'moon-impact') {
            point = pointAround(moonPositionAtProgress(mission, shownProgress), EARTH_MOON_SCENE.moonRadius, angle);
        } else {
            point = { x: 0, y: 0, z: 0 };
        }
        return Object.freeze({ ...point, phase: phase.type });
    }

    function earthMoonPacingTable(mission) {
        if (earthMoonPacingCache.has(mission)) return earthMoonPacingCache.get(mission);
        const sampleCount = 900;
        const samples = [];
        const distances = [];
        let previous = earthMoonPositionAtProgress(mission, 0);
        for (let index = 1; index <= sampleCount; index += 1) {
            const progress = index / sampleCount;
            const point = earthMoonPositionAtProgress(mission, progress);
            distances.push(Math.hypot(point.x - previous.x, point.y - previous.y));
            samples.push({ progress, point });
            previous = point;
        }
        const moving = distances.filter(distance => distance > 1e-5).sort((a, b) => a - b);
        const typicalStep = moving[Math.floor(moving.length / 2)] || 1 / sampleCount;
        let total = 0;
        const table = [{ progress: 0, distance: 0 }];
        samples.forEach((sample, index) => {
            total += Math.max(distances[index], typicalStep * 0.32);
            table.push({ progress: sample.progress, distance: total });
        });
        table.forEach(point => { point.fraction = point.distance / total; });
        earthMoonPacingCache.set(mission, table);
        return table;
    }

    function interpolateTable(table, target, key, valueKey) {
        const upperIndex = table.findIndex(point => point[key] >= target);
        if (upperIndex <= 0) return table[0][valueKey];
        const upper = table[upperIndex];
        const lower = table[upperIndex - 1];
        const local = (target - lower[key]) / Math.max(1e-9, upper[key] - lower[key]);
        return lower[valueKey] + (upper[valueKey] - lower[valueKey]) * local;
    }

    function presentationProgressAtElapsed(mission, elapsedFraction) {
        if (!earthMoonSegment(mission)) return clamp(elapsedFraction, 0, 1);
        return interpolateTable(earthMoonPacingTable(mission), clamp(elapsedFraction, 0, 1), 'fraction', 'progress');
    }

    function elapsedFractionAtPresentationProgress(mission, progress) {
        if (!earthMoonSegment(mission)) return clamp(progress, 0, 1);
        return interpolateTable(earthMoonPacingTable(mission), clamp(progress, 0, 1), 'progress', 'fraction');
    }

    function orbitPath(mission, sampleCount = 160) {
        const segment = orbitalSegment(mission);
        if (!segment) return [];
        const startAngle = (segment.orbit.launchAngleDeg ?? segment.orbit.phaseDeg ?? 0) * Math.PI / 180;
        return Array.from({ length: sampleCount + 1 }, (_, index) => (
            orbitPositionAtAngle(segment, startAngle + index / sampleCount * Math.PI * 2)
        ));
    }

    function traveledPath(mission, progress, maximumSampleCount = 320) {
        if (!primarySegment(mission)) return [];
        const shownProgress = clamp(progress, 0, 1);
        if (shownProgress <= 0) return [];
        const sampleCount = Math.max(2, Math.ceil(maximumSampleCount * shownProgress));
        return Array.from({ length: sampleCount + 1 }, (_, index) => (
            positionAtProgress(mission, shownProgress * index / sampleCount)
        ));
    }

    function currentEvent(mission, date) {
        if (!date) return null;
        return mission.events
            .filter(event => Date.parse(event.date) <= date.getTime())
            .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
            .at(-1) || mission.events[0] || null;
    }

    function currentEventAtProgress(mission, progress) {
        if (!mission.events.length) return null;
        if (mission.events.some(event => event.date.includes('T'))) {
            return currentEvent(mission, missionDateAtProgress(mission, progress));
        }
        const timed = mission.events.filter(event => Number.isFinite(event.simulationProgress));
        if (timed.length === mission.events.length) {
            return timed.filter(event => event.simulationProgress <= progress).at(-1) || timed[0];
        }
        const index = Math.min(mission.events.length - 1, Math.floor(clamp(progress, 0, 0.999999) * mission.events.length));
        return mission.events[index];
    }

    function formatUtcDateTime(date) {
        if (!date) return '—';
        return new Intl.DateTimeFormat('ru-RU', {
            timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(date).replace(' в ', ' · ') + ' UTC';
    }

    function outcomeLabel(status) {
        return ({
            success: 'Миссия успешна', 'partial-success': 'Миссия завершена с частичным успехом',
            lost: 'Аппарат потерян', 'launch-failure': 'Запуск не удался',
            catastrophe: 'Миссия завершилась катастрофой', active: 'Миссия продолжается'
        })[status] || 'Миссия завершена';
    }

    return Object.freeze({
        EARTH_RADIUS_KM, EARTH_MOON_SCENE, ACCURACY_LABELS, orbitalSegment, earthMoonSegment, primarySegment,
        presentationDurationSeconds, missionDateAtProgress, positionAtProgress, orbitPath, traveledPath, currentEvent, currentEventAtProgress,
        moonPositionAtProgress, presentationProgressAtElapsed, elapsedFractionAtPresentationProgress,
        formatUtcDateTime, outcomeLabel
    });
}));
