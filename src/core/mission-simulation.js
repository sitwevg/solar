(function initMissionSimulation(root, factory) {
    'use strict';

    const isNode = typeof process !== 'undefined' && process.versions
        && Boolean(process.versions.node) && typeof module === 'object' && module.exports;
    const astronomy = isNode ? require('../../astronomy.js') : root.Astronomy;
    const api = factory(astronomy);
    if (isNode) module.exports = api;
    else root.SolarMissionSimulation = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMissionSimulation(Astronomy) {
    'use strict';

    const EARTH_RADIUS_KM = 6371;
    const EARTH_MOON_SCENE = Object.freeze({
        earthRadius: 0.17,
        moonRadius: 0.045,
        earthOrbitRadius: 0.24,
        moonOrbitRadius: 0.095
    });
    const MOON_MEAN_RADIUS_KM = 1737.4;
    const EARTH_MOON_MEAN_DISTANCE_KM = 384400;
    const J2000_UTC_MS = Date.parse('2000-01-01T12:00:00Z');
    const LUNAR_MEAN_LONGITUDE_J2000_DEG = 218.3164477;
    const LUNAR_MEAN_MOTION_DEG_PER_DAY = 13.17639648;
    const earthMoonPacingCache = new WeakMap();
    const heliocentricRouteCache = new WeakMap();
    const SOLAR_MU_AU3_DAY2 = 0.0002959122082855911;
    const AU_KM = 149597870.7;
    const EQJ_TO_ECL = Astronomy?.Rotation_EQJ_ECL ? Astronomy.Rotation_EQJ_ECL() : null;
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

    function heliocentricTransferSegment(mission) {
        return mission?.trajectory?.segments?.find(segment => segment.model === 'heliocentric-transfer') || null;
    }

    function primarySegment(mission) {
        return orbitalSegment(mission) || earthMoonSegment(mission) || heliocentricTransferSegment(mission);
    }

    function presentationDurationSeconds(mission) {
        const segment = primarySegment(mission);
        if (!segment) return 0;
        const storyCharacters = [
            mission.name,
            ...(mission.simulationStory || mission.story || []),
            mission.result || ''
        ].join(' ').length;
        const readingSeconds = storyCharacters / 14;
        return Math.round(clamp(readingSeconds, 90, 180));
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
        if (!segment) {
            if (earthMoonSegment(mission)) return earthMoonPositionAtProgress(mission, progress);
            return heliocentricPositionAtProgress(mission, progress);
        }
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

    function normalizedVector(vector) {
        const length = Math.hypot(vector.x, vector.y, vector.z || 0) || 1;
        return { x: vector.x / length, y: vector.y / length, z: (vector.z || 0) / length };
    }

    function heliocentricBodyPosition(mission, body, progress) {
        if (!Astronomy?.HelioVector || !EQJ_TO_ECL) return { x: 0, y: 0, z: 0 };
        const date = missionDateAtProgress(mission, progress);
        const equatorial = Astronomy.HelioVector(Astronomy.Body[body], date);
        const ecliptic = Astronomy.RotateVector(EQJ_TO_ECL, equatorial);
        return { x: ecliptic.x, y: ecliptic.y, z: ecliptic.z };
    }

    const vectorLength = vector => Math.hypot(vector.x, vector.y, vector.z || 0);
    const vectorDot = (left, right) => left.x * right.x + left.y * right.y + (left.z || 0) * (right.z || 0);
    const vectorScale = (vector, scale) => ({ x: vector.x * scale, y: vector.y * scale, z: (vector.z || 0) * scale });
    const vectorAdd = (left, right) => ({ x: left.x + right.x, y: left.y + right.y, z: (left.z || 0) + (right.z || 0) });
    const vectorSubtract = (left, right) => ({ x: left.x - right.x, y: left.y - right.y, z: (left.z || 0) - (right.z || 0) });

    function stumpffC(z) {
        if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
        if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
        return .5 - z / 24 + z * z / 720;
    }

    function stumpffS(z) {
        if (z > 1e-8) return (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / Math.sqrt(z) ** 3;
        if (z < -1e-8) return (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / Math.sqrt(-z) ** 3;
        return 1 / 6 - z / 120 + z * z / 5040;
    }

    function lambertInitialVelocity(start, end, durationDays) {
        const startRadius = vectorLength(start);
        const endRadius = vectorLength(end);
        const cosine = clamp(vectorDot(start, end) / (startRadius * endRadius), -1, 1);
        const crossZ = start.x * end.y - start.y * end.x;
        const sine = Math.sign(crossZ || 1) * Math.sqrt(Math.max(0, 1 - cosine * cosine));
        const parameterA = sine * Math.sqrt(startRadius * endRadius / Math.max(1e-12, 1 - cosine));
        const expectedTime = durationDays;

        const timeAt = z => {
            const c = stumpffC(z);
            const s = stumpffS(z);
            if (!(c > 0)) return null;
            const y = startRadius + endRadius + parameterA * (z * s - 1) / Math.sqrt(c);
            if (!(y > 0)) return null;
            return {
                y,
                days: ((y / c) ** 1.5 * s + parameterA * Math.sqrt(y)) / Math.sqrt(SOLAR_MU_AU3_DAY2)
            };
        };

        let lower = null;
        let upper = null;
        let previous = null;
        for (let index = 0; index <= 3200; index += 1) {
            const z = -4 * Math.PI ** 2 + 8 * Math.PI ** 2 * index / 3200;
            const sample = timeAt(z);
            if (!sample) continue;
            const difference = sample.days - expectedTime;
            if (previous && previous.difference * difference <= 0) {
                lower = previous;
                upper = { z, difference };
                break;
            }
            previous = { z, difference };
        }
        if (!lower || !upper) throw new Error('Не удалось подобрать межпланетную дугу Ламберта.');
        for (let iteration = 0; iteration < 70; iteration += 1) {
            const z = (lower.z + upper.z) / 2;
            const sample = timeAt(z);
            if (!sample) {
                lower = { z, difference: lower.difference };
                continue;
            }
            const difference = sample.days - expectedTime;
            if (lower.difference * difference <= 0) upper = { z, difference };
            else lower = { z, difference };
        }
        const solution = timeAt((lower.z + upper.z) / 2);
        const f = 1 - solution.y / startRadius;
        const g = parameterA * Math.sqrt(solution.y / SOLAR_MU_AU3_DAY2);
        return vectorScale(vectorSubtract(end, vectorScale(start, f)), 1 / g);
    }

    function propagateSolarState(position, velocity, durationDays) {
        if (Math.abs(durationDays) < 1e-10) return { ...position };
        const radius = vectorLength(position);
        const velocitySquared = vectorDot(velocity, velocity);
        const radialVelocity = vectorDot(position, velocity) / radius;
        const alpha = 2 / radius - velocitySquared / SOLAR_MU_AU3_DAY2;
        const rootMu = Math.sqrt(SOLAR_MU_AU3_DAY2);
        let anomaly = Math.abs(alpha) > 1e-8
            ? rootMu * Math.abs(alpha) * durationDays
            : rootMu * durationDays / radius;
        for (let iteration = 0; iteration < 50; iteration += 1) {
            const z = alpha * anomaly * anomaly;
            const c = stumpffC(z);
            const s = stumpffS(z);
            const value = radius * radialVelocity / rootMu * anomaly * anomaly * c
                + (1 - alpha * radius) * anomaly ** 3 * s
                + radius * anomaly - rootMu * durationDays;
            const derivative = radius * radialVelocity / rootMu * anomaly * (1 - z * s)
                + (1 - alpha * radius) * anomaly * anomaly * c + radius;
            const step = value / derivative;
            anomaly -= step;
            if (Math.abs(step) < 1e-11) break;
        }
        const z = alpha * anomaly * anomaly;
        const f = 1 - anomaly * anomaly / radius * stumpffC(z);
        const g = durationDays - anomaly ** 3 / rootMu * stumpffS(z);
        return vectorAdd(vectorScale(position, f), vectorScale(velocity, g));
    }

    function bodyVelocityAtProgress(mission, body, progress) {
        const date = missionDateAtProgress(mission, progress);
        const offsetDays = .02;
        const earlier = new Date(date.getTime() - offsetDays * 86400000);
        const later = new Date(date.getTime() + offsetDays * 86400000);
        const vectorAt = shownDate => {
            const equatorial = Astronomy.HelioVector(Astronomy.Body[body], shownDate);
            return Astronomy.RotateVector(EQJ_TO_ECL, equatorial);
        };
        return vectorScale(vectorSubtract(vectorAt(later), vectorAt(earlier)), 1 / (offsetDays * 2));
    }

    function rotateAroundZ(vector, angle) {
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        return {
            x: vector.x * cosine - vector.y * sine,
            y: vector.x * sine + vector.y * cosine,
            z: vector.z || 0
        };
    }

    function heliocentricRouteSolution(mission) {
        if (heliocentricRouteCache.has(mission)) return heliocentricRouteCache.get(mission);
        const segment = heliocentricTransferSegment(mission);
        const departureDate = missionDateAtProgress(mission, segment.departureProgress);
        const encounterDate = missionDateAtProgress(mission, segment.encounterProgress);
        const durationDays = (encounterDate - departureDate) / 86400000;
        const start = heliocentricBodyPosition(mission, segment.originBody || 'Earth', segment.departureProgress);
        const venusCenter = heliocentricBodyPosition(mission, segment.targetBody, segment.encounterProgress);

        let arrival = { ...venusCenter };
        let initialVelocity = lambertInitialVelocity(start, arrival, durationDays);
        const venusVelocity = bodyVelocityAtProgress(mission, segment.targetBody, segment.encounterProgress);
        const preliminaryArrivalVelocity = (() => {
            const before = propagateSolarState(start, initialVelocity, durationDays - .02);
            return vectorScale(vectorSubtract(arrival, before), 1 / .02);
        })();
        const incomingRelative = vectorSubtract(preliminaryArrivalVelocity, venusVelocity);
        let closestSide = normalizedVector({ x: -incomingRelative.y, y: incomingRelative.x, z: 0 });
        const sunward = normalizedVector(vectorScale(venusCenter, -1));
        if (vectorDot(closestSide, sunward) < 0) closestSide = vectorScale(closestSide, -1);
        arrival = vectorAdd(venusCenter, vectorScale(closestSide, (segment.closestApproachKm || 34854) / AU_KM));
        initialVelocity = lambertInitialVelocity(start, arrival, durationDays);
        const beforeArrival = propagateSolarState(start, initialVelocity, durationDays - .02);
        const arrivalVelocity = vectorScale(vectorSubtract(arrival, beforeArrival), 1 / .02);
        const relativeArrival = vectorSubtract(arrivalVelocity, venusVelocity);
        const bend = (segment.encounterBendDeg || 0) * Math.PI / 180;
        const candidateA = vectorAdd(venusVelocity, rotateAroundZ(relativeArrival, bend));
        const candidateB = vectorAdd(venusVelocity, rotateAroundZ(relativeArrival, -bend));
        const departureVelocity = vectorLength(candidateA) >= vectorLength(candidateB) ? candidateA : candidateB;
        const solution = Object.freeze({
            start, arrival, initialVelocity, departureVelocity,
            departureDateMs: departureDate.getTime(),
            encounterDateMs: encounterDate.getTime(),
            durationDays
        });
        heliocentricRouteCache.set(mission, solution);
        return solution;
    }

    function heliocentricRawPosition(mission, progress) {
        const segment = heliocentricTransferSegment(mission);
        if (!segment) return null;
        const shownProgress = clamp(progress, 0, 1);
        const departureProgress = segment.departureProgress;
        const encounterProgress = segment.encounterProgress;
        if (shownProgress <= departureProgress) {
            return { ...heliocentricBodyPosition(mission, segment.originBody || 'Earth', shownProgress), phase: shownProgress < departureProgress * .22 ? 'earth-launch' : 'earth-parking' };
        }
        const route = heliocentricRouteSolution(mission);
        const shownDateMs = missionDateAtProgress(mission, shownProgress).getTime();
        if (shownProgress <= encounterProgress) {
            const elapsedDays = clamp((shownDateMs - route.departureDateMs) / 86400000, 0, route.durationDays);
            return { ...propagateSolarState(route.start, route.initialVelocity, elapsedDays), phase: 'interplanetary-cruise' };
        }
        const elapsedDays = Math.max(0, (shownDateMs - route.encounterDateMs) / 86400000);
        const post = propagateSolarState(route.arrival, route.departureVelocity, elapsedDays);
        const local = (shownProgress - encounterProgress) / (1 - encounterProgress);
        return { ...post, phase: local < .18 ? 'planetary-flyby' : 'post-flyby' };
    }

    function heliocentricDepartureDisplay(mission, progress) {
        const segment = heliocentricTransferSegment(mission);
        if (!segment) return null;
        const departureProgress = segment.departureProgress;
        const shownProgress = clamp(progress, 0, 1);
        const launchAngle = (segment.launchAngleDeg || 0) * Math.PI / 180;
        const local = shownProgress / departureProgress;
        if (shownProgress <= departureProgress) {
            const ascentEnd = .22;
            const parkingEnd = .58;
            if (local <= ascentEnd) {
                const stage = local / ascentEnd;
                return { angle: launchAngle + stage * .3, radiusScale: 1 + .55 * stage, phase: 'earth-launch' };
            }
            if (local <= parkingEnd) {
                const stage = (local - ascentEnd) / (parkingEnd - ascentEnd);
                return { angle: launchAngle + .3 + stage * (segment.parkingArcDeg || 62) * Math.PI / 180, radiusScale: 1.55, phase: 'earth-parking' };
            }
            const stage = (local - parkingEnd) / (1 - parkingEnd);
            return {
                angle: launchAngle + .3 + (segment.parkingArcDeg || 62) * Math.PI / 180
                    + stage * (segment.escapeSweepDeg || 145) * Math.PI / 180,
                radiusScale: 1.55 + .32 * stage,
                phase: 'earth-escape'
            };
        }
        const fadeEnd = departureProgress + .035;
        if (shownProgress >= fadeEnd) return null;
        const fade = (shownProgress - departureProgress) / (fadeEnd - departureProgress);
        return {
            angle: launchAngle + .3 + ((segment.parkingArcDeg || 62) + (segment.escapeSweepDeg || 145)) * Math.PI / 180,
            radiusScale: 1.87 * (1 - fade * fade * (3 - 2 * fade)),
            phase: 'earth-escape'
        };
    }

    function heliocentricPositionAtProgress(mission, progress) {
        const segment = heliocentricTransferSegment(mission);
        if (!segment) return null;
        const shownProgress = clamp(progress, 0, 1);
        const point = heliocentricRawPosition(mission, shownProgress);
        const phase = shownProgress <= segment.departureProgress
            ? (shownProgress <= segment.departureProgress * .16 ? 'earth-launch' : 'earth-parking')
            : shownProgress <= segment.encounterProgress
                ? 'interplanetary-cruise'
                : shownProgress <= segment.encounterProgress + (1 - segment.encounterProgress) * .18
                    ? 'planetary-flyby'
                    : 'post-flyby';
        return Object.freeze({
            x: point.x,
            y: point.y,
            z: point.z,
            phase
        });
    }

    function heliocentricCameraState(mission, progress, manualZoom = 1) {
        const segment = heliocentricTransferSegment(mission);
        if (!segment) return null;
        const shownProgress = clamp(progress, 0, 1);
        const craft = heliocentricPositionAtProgress(mission, shownProgress);
        const earth = heliocentricBodyPosition(mission, segment.originBody || 'Earth', shownProgress);
        const smoothstep = value => {
            const normalized = clamp(value, 0, 1);
            return normalized * normalized * (3 - 2 * normalized);
        };
        const followProgress = smoothstep(
            (shownProgress - segment.departureProgress * .55)
            / Math.max(.01, .27 - segment.departureProgress * .55)
        );
        const zoomOut = smoothstep(
            (shownProgress - segment.departureProgress * .45)
            / Math.max(.01, .36 - segment.departureProgress * .45)
        );
        return Object.freeze({
            x: earth.x + (craft.x - earth.x) * followProgress,
            y: earth.y + (craft.y - earth.y) * followProgress,
            z: earth.z + (craft.z - earth.z) * followProgress,
            automaticZoom: 6 - zoomOut * 3,
            zoom: (6 - zoomOut * 3) * clamp(manualZoom, .5, 1.8),
            followProgress
        });
    }

    function phaseAngle(segment, phase, localProgress) {
        const start = (phase.angleDeg ?? 0) * Math.PI / 180;
        const end = start + (phase.turns ?? 0) * Math.PI * 2;
        const phaseIndex = segment.phases.indexOf(phase);
        const duration = Math.max(1e-9, phase.endProgress - phase.startProgress);
        let startSlope = end - start;
        let endSlope = end - start;
        let usesHermite = false;
        if (phase.type === 'moon-orbit') {
            const next = segment.phases[phaseIndex + 1];
            if (next?.type === 'moon-descent') {
                const nextDuration = Math.max(1e-9, next.endProgress - next.startProgress);
                const nextDelta = (next.turns ?? 0) * Math.PI * 2;
                let nextStartSlope = (phase.turns ?? 0) * Math.PI * 2 / duration * nextDuration;
                if (nextDelta !== 0 && Math.sign(nextStartSlope) === Math.sign(nextDelta)) {
                    nextStartSlope = Math.sign(nextDelta) * Math.min(
                        Math.abs(nextStartSlope),
                        Math.abs(nextDelta) * 3
                    );
                }
                endSlope = nextStartSlope / nextDuration * duration;
                usesHermite = true;
            }
        } else if (phase.type === 'moon-descent') {
            const previous = segment.phases[phaseIndex - 1];
            const previousDuration = Math.max(1e-9, previous.endProgress - previous.startProgress);
            startSlope = previous.type === 'translunar'
                ? end - start
                : (previous.turns ?? 0) * Math.PI * 2 / previousDuration * duration;
            const angleDelta = end - start;
            if (angleDelta !== 0 && Math.sign(startSlope) === Math.sign(angleDelta)) {
                startSlope = Math.sign(angleDelta) * Math.min(
                    Math.abs(startSlope),
                    Math.abs(angleDelta) * 3
                );
            }
            endSlope = 0;
            usesHermite = true;
        } else if (phase.type === 'moon-ascent') {
            const next = segment.phases[phaseIndex + 1];
            const nextDuration = Math.max(1e-9, next.endProgress - next.startProgress);
            startSlope = 0;
            endSlope = (next.turns ?? 0) * Math.PI * 2 / nextDuration * duration;
            usesHermite = true;
        }
        if (!usesHermite) {
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
        const visualDateMs = missionDateAtProgress(mission, motionProgress).getTime();
        let longitudeDeg;
        let latitudeDeg = 0;
        let distanceScale = 1;
        if (Astronomy?.EclipticGeoMoon) {
            const ecliptic = Astronomy.EclipticGeoMoon(new Date(visualDateMs));
            longitudeDeg = ecliptic.lon;
            latitudeDeg = ecliptic.lat;
            const distanceKm = ecliptic.dist * (Astronomy.KM_PER_AU || 149597870.7);
            distanceScale = distanceKm / EARTH_MOON_MEAN_DISTANCE_KM;
        } else {
            const daysFromJ2000 = (visualDateMs - J2000_UTC_MS) / 86400000;
            longitudeDeg = LUNAR_MEAN_LONGITUDE_J2000_DEG
                + LUNAR_MEAN_MOTION_DEG_PER_DAY * daysFromJ2000;
        }
        const angle = longitudeDeg * Math.PI / 180;
        const latitude = latitudeDeg * Math.PI / 180;
        return Object.freeze({
            x: Math.cos(angle) * distanceScale,
            y: Math.sin(angle) * distanceScale,
            z: Math.sin(latitude) * distanceScale,
            angle,
            longitudeDeg,
            latitudeDeg,
            distanceScale
        });
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

    function lunarHyperbolaPoint(mission, phase, localProgress) {
        const hyperbola = phase.hyperbola;
        if (!hyperbola) return null;
        const shownLocal = clamp(localProgress, 0, 1);
        const limit = (hyperbola.trueAnomalyLimitDeg ?? 95) * Math.PI / 180;
        const direction = hyperbola.direction ?? 1;
        const anomaly = direction * (-limit + 2 * limit * shownLocal);
        const eccentricity = hyperbola.eccentricity;
        const periapsisSceneRadius = EARTH_MOON_SCENE.moonRadius
            * hyperbola.periapsisKm / MOON_MEAN_RADIUS_KM;
        const semiLatusRectum = periapsisSceneRadius * (1 + eccentricity);
        const radius = semiLatusRectum / (1 + eccentricity * Math.cos(anomaly));
        const progress = phase.startProgress
            + (phase.endProgress - phase.startProgress) * shownLocal;
        const moon = moonPositionAtProgress(mission, progress);
        const periapsisMoon = moonPositionAtProgress(
            mission,
            (phase.startProgress + phase.endProgress) / 2
        );
        const periapsisAngle = periapsisMoon.angle
            + (hyperbola.periapsisAngleOffsetDeg ?? 0) * Math.PI / 180;
        return pointAround(moon, radius, periapsisAngle + anomaly);
    }

    function lunarHyperbolaTangent(mission, phase, localProgress) {
        const epsilon = 1e-4;
        const lower = clamp(localProgress - epsilon, 0, 1);
        const upper = clamp(localProgress + epsilon, 0, 1);
        const start = lunarHyperbolaPoint(mission, phase, lower);
        const end = lunarHyperbolaPoint(mission, phase, upper);
        return normalized({ x: end.x - start.x, y: end.y - start.y });
    }

    function transferPoint(mission, phase, localProgress) {
        const segment = earthMoonSegment(mission);
        const outbound = phase.type === 'translunar';
        const earthAngle = (phase.earthAngleDeg ?? 0) * Math.PI / 180;
        const moonAngle = lunarReferenceAngle(mission) + (phase.moonAngleDeg ?? 180) * Math.PI / 180;
        const earthRadius = phase.earthRadius ?? EARTH_MOON_SCENE.earthOrbitRadius;
        const moonRadius = phase.moonRadius ?? EARTH_MOON_SCENE.moonOrbitRadius;
        const earthPoint = pointAround({ x: 0, y: 0 }, earthRadius, earthAngle);
        const moonProgress = outbound ? phase.endProgress : phase.startProgress;
        const adjacentHyperbola = segment.phases.find(candidate => (
            candidate.type === 'moon-flyby'
            && candidate.hyperbola
            && (outbound
                ? candidate.startProgress === phase.endProgress
                : candidate.endProgress === phase.startProgress)
        ));
        const moonPoint = adjacentHyperbola
            ? lunarHyperbolaPoint(mission, adjacentHyperbola, outbound ? 0 : 1)
            : pointAround(moonPositionAtProgress(mission, moonProgress), moonRadius, moonAngle);
        const start = outbound ? earthPoint : moonPoint;
        const end = outbound ? moonPoint : earthPoint;
        const startAngle = outbound ? earthAngle : moonAngle;
        const endAngle = outbound ? moonAngle : earthAngle;
        const startTangent = !outbound && adjacentHyperbola
            ? lunarHyperbolaTangent(mission, adjacentHyperbola, 1)
            : outbound && phase.departureTangent === 'radial-out'
                ? normalized(earthPoint)
                : normalized(orbitTangent(startAngle, phase.departureDirection ?? 1));
        const endTangent = outbound && adjacentHyperbola
            ? lunarHyperbolaTangent(mission, adjacentHyperbola, 0)
            : outbound && phase.arrivalTangent === 'radial-in'
                ? normalized({
                    x: moonPositionAtProgress(mission, moonProgress).x - moonPoint.x,
                    y: moonPositionAtProgress(mission, moonProgress).y - moonPoint.y
                })
                : normalized(orbitTangent(endAngle, phase.arrivalDirection ?? 1));
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
            const eased = phase.radialAscent
                ? localProgress
                : localProgress * localProgress * (3 - 2 * localProgress);
            const radius = EARTH_MOON_SCENE.earthRadius
                + (targetRadius - EARTH_MOON_SCENE.earthRadius) * eased;
            point = pointAround({ x: 0, y: 0 }, radius, angle);
        } else if (phase.type === 'earth-orbit') {
            point = pointAround({ x: 0, y: 0 }, phase.radius ?? EARTH_MOON_SCENE.earthOrbitRadius, angle);
        } else if (phase.type === 'translunar' || phase.type === 'transearth') {
            point = transferPoint(mission, phase, localProgress);
        } else if (phase.type === 'moon-flyby' && phase.hyperbola) {
            point = lunarHyperbolaPoint(mission, phase, localProgress);
        } else if (phase.type === 'moon-orbit' || phase.type === 'moon-flyby') {
            const baseRadius = phase.radius ?? EARTH_MOON_SCENE.moonOrbitRadius;
            const flybyBulge = phase.type === 'moon-flyby'
                ? (phase.radiusBulge ?? 0) * Math.sin(Math.PI * localProgress) ** 2
                : 0;
            point = pointAround(moonPositionAtProgress(mission, shownProgress), baseRadius + flybyBulge, angle);
        } else if (phase.type === 'moon-descent') {
            const startRadius = phase.radius ?? EARTH_MOON_SCENE.moonOrbitRadius;
            const eased = phase.radialDescent
                ? localProgress
                : localProgress * localProgress * (3 - 2 * localProgress);
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

    function traveledPathSegments(mission, progress, maximumSampleCount = 320) {
        const segment = earthMoonSegment(mission);
        if (!segment) {
            const path = traveledPath(mission, progress, maximumSampleCount);
            return path.length ? [path] : [];
        }
        const shownProgress = clamp(progress, 0, 1);
        const paths = [];
        let activePath = null;
        segment.phases.forEach(phase => {
            if (phase.startProgress >= shownProgress) return;
            if (phase.type === 'moon-surface') {
                activePath = null;
                return;
            }
            const endProgress = Math.min(phase.endProgress, shownProgress);
            if (endProgress <= phase.startProgress) return;
            if (!activePath) {
                activePath = [positionAtProgress(mission, phase.startProgress)];
                paths.push(activePath);
            }
            const sampleCount = Math.max(
                1,
                Math.ceil(maximumSampleCount * (endProgress - phase.startProgress))
            );
            for (let index = 1; index <= sampleCount; index += 1) {
                const localProgress = index / sampleCount;
                const sampleProgress = phase.startProgress
                    + (endProgress - phase.startProgress) * localProgress;
                activePath.push(positionAtProgress(mission, sampleProgress));
            }
        });
        return paths.filter(path => path.length > 1);
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
        EARTH_RADIUS_KM, EARTH_MOON_SCENE, ACCURACY_LABELS, orbitalSegment, earthMoonSegment,
        heliocentricTransferSegment, primarySegment,
        presentationDurationSeconds, missionDateAtProgress, positionAtProgress, orbitPath, traveledPath, traveledPathSegments,
        currentEvent, currentEventAtProgress,
        moonPositionAtProgress, heliocentricBodyPosition, heliocentricCameraState, heliocentricDepartureDisplay,
        presentationProgressAtElapsed, elapsedFractionAtPresentationProgress,
        formatUtcDateTime, outcomeLabel
    });
}));
