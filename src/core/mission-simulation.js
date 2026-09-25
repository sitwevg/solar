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

    function presentationDurationSeconds(mission) {
        const segment = orbitalSegment(mission);
        if (!segment) return 0;
        const days = Math.max(1 / 24, (Date.parse(segment.endDate) - Date.parse(segment.startDate)) / 86400000);
        return Math.round(clamp(46 + Math.log10(days + 1) * 14, 46, 82));
    }

    function missionDateAtProgress(mission, progress) {
        const segment = orbitalSegment(mission);
        if (!segment) return null;
        const start = Date.parse(segment.startDate);
        const end = Date.parse(segment.endDate);
        return new Date(start + (end - start) * clamp(progress, 0, 1));
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
        if (!segment) return null;
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

    function orbitPath(mission, sampleCount = 160) {
        const segment = orbitalSegment(mission);
        if (!segment) return [];
        const startAngle = (segment.orbit.launchAngleDeg ?? segment.orbit.phaseDeg ?? 0) * Math.PI / 180;
        return Array.from({ length: sampleCount + 1 }, (_, index) => (
            orbitPositionAtAngle(segment, startAngle + index / sampleCount * Math.PI * 2)
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
        EARTH_RADIUS_KM, ACCURACY_LABELS, orbitalSegment, presentationDurationSeconds,
        missionDateAtProgress, positionAtProgress, orbitPath, currentEvent, currentEventAtProgress,
        formatUtcDateTime, outcomeLabel
    });
}));
