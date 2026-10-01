(function initMissionSchema(root, factory) {
    'use strict';

    const api = factory();
    const isNode = typeof process !== 'undefined'
        && process.versions
        && Boolean(process.versions.node)
        && typeof module === 'object'
        && module.exports;

    if (isNode) {
        module.exports = api;
    } else {
        root.SolarMissionSchema = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMissionSchema() {
    'use strict';

    const ENUMS = Object.freeze({
        kind: Object.freeze(['mission', 'station']),
        category: Object.freeze([
            'early-spaceflight',
            'lunar',
            'inner-planets',
            'outer-interstellar',
            'small-bodies',
            'stations'
        ]),
        status: Object.freeze([
            'success',
            'partial-success',
            'lost',
            'launch-failure',
            'catastrophe',
            'active'
        ]),
        dataStatus: Object.freeze(['outline', 'researched', 'trajectory-ready', 'published']),
        scenarioType: Object.freeze([
            'orbital',
            'transfer',
            'landing',
            'flyby',
            'multi-phase',
            'station-lifecycle'
        ]),
        targetType: Object.freeze([
            'earth',
            'moon',
            'planet',
            'satellite',
            'asteroid',
            'comet',
            'region'
        ]),
        targetRole: Object.freeze([
            'origin',
            'primary',
            'flyby',
            'gravity-assist',
            'landing',
            'return'
        ]),
        eventType: Object.freeze([
            'launch',
            'departure-burn',
            'course-correction',
            'science-observation',
            'orbit-insertion',
            'eva',
            'flyby',
            'gravity-assist',
            'landing',
            'surface-operations',
            'return',
            'loss-of-contact',
            'boundary-crossing',
            'mission-end'
        ]),
        frame: Object.freeze([
            'geocentric-ecliptic-j2000',
            'heliocentric-ecliptic-j2000',
            'target-local'
        ]),
        scale: Object.freeze([
            'earth-orbit',
            'earth-moon',
            'inner-solar-system',
            'outer-solar-system',
            'heliosphere',
            'target-closeup'
        ]),
        accuracy: Object.freeze([
            'exact-ephemeris',
            'event-reconstructed',
            'schematic',
            'pending'
        ])
    });

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function isIsoDate(value) {
        if (!isNonEmptyString(value)) return false;
        if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z)?$/.test(value)) return false;
        return !Number.isNaN(Date.parse(value));
    }

    function pushError(errors, path, message) {
        errors.push(`${path}: ${message}`);
    }

    function requireString(value, path, errors) {
        if (!isNonEmptyString(value)) pushError(errors, path, 'ожидалась непустая строка');
    }

    function requireEnum(value, enumName, path, errors) {
        if (!ENUMS[enumName].includes(value)) {
            pushError(errors, path, `неизвестное значение «${String(value)}»`);
        }
    }

    function requireStringArray(value, path, errors) {
        if (!Array.isArray(value) || value.length === 0) {
            pushError(errors, path, 'ожидался непустой массив строк');
            return;
        }
        value.forEach((item, index) => requireString(item, `${path}[${index}]`, errors));
    }

    function validateTarget(target, path, errors) {
        if (!isPlainObject(target)) {
            pushError(errors, path, 'ожидался объект цели');
            return;
        }
        requireString(target.id, `${path}.id`, errors);
        requireString(target.name, `${path}.name`, errors);
        requireEnum(target.type, 'targetType', `${path}.type`, errors);
        requireEnum(target.role, 'targetRole', `${path}.role`, errors);
    }

    function validateEvent(event, path, errors) {
        if (!isPlainObject(event)) {
            pushError(errors, path, 'ожидался объект события');
            return;
        }
        requireString(event.id, `${path}.id`, errors);
        requireEnum(event.type, 'eventType', `${path}.type`, errors);
        requireString(event.title, `${path}.title`, errors);
        if (!isIsoDate(event.date)) pushError(errors, `${path}.date`, 'ожидалась дата ISO 8601');
        if (event.description !== undefined) requireString(event.description, `${path}.description`, errors);
        if (event.simulationProgress !== undefined
            && (!Number.isFinite(event.simulationProgress) || event.simulationProgress < 0 || event.simulationProgress > 1)) {
            pushError(errors, `${path}.simulationProgress`, 'ожидалось число от 0 до 1');
        }
    }

    function validateSource(source, path, errors) {
        if (!isPlainObject(source)) {
            pushError(errors, path, 'ожидался объект источника');
            return;
        }
        requireString(source.id, `${path}.id`, errors);
        requireString(source.label, `${path}.label`, errors);
        requireString(source.publisher, `${path}.publisher`, errors);
        if (!isNonEmptyString(source.url) || !/^https:\/\//.test(source.url)) {
            pushError(errors, `${path}.url`, 'ожидалась HTTPS-ссылка');
        }
    }

    function validatePoint(point, path, errors) {
        if (!isPlainObject(point)) {
            pushError(errors, path, 'ожидалась точка траектории');
            return;
        }
        if (!isIsoDate(point.date)) pushError(errors, `${path}.date`, 'ожидалась дата ISO 8601');
        ['x', 'y', 'z'].forEach((axis) => {
            if (!Number.isFinite(point[axis])) pushError(errors, `${path}.${axis}`, 'ожидалось конечное число');
        });
    }

    function validateEarthMoonPhase(phase, path, errors) {
        if (!isPlainObject(phase)) {
            pushError(errors, path, 'ожидалась фаза маршрута');
            return;
        }
        const types = [
            'earth-launch', 'earth-orbit', 'translunar', 'moon-orbit', 'moon-flyby',
            'moon-descent', 'moon-surface', 'moon-impact', 'moon-ascent', 'transearth', 'earth-entry'
        ];
        if (!types.includes(phase.type)) pushError(errors, `${path}.type`, 'неизвестный тип фазы');
        ['startProgress', 'endProgress'].forEach((field) => {
            if (!Number.isFinite(phase[field]) || phase[field] < 0 || phase[field] > 1) {
                pushError(errors, `${path}.${field}`, 'ожидалось число от 0 до 1');
            }
        });
        if (Number.isFinite(phase.startProgress) && Number.isFinite(phase.endProgress)
            && phase.endProgress <= phase.startProgress) {
            pushError(errors, `${path}.endProgress`, 'конец фазы должен быть позже начала');
        }
        ['angleDeg', 'turns', 'radius', 'earthAngleDeg', 'moonAngleDeg', 'earthRadius', 'moonRadius',
            'handleScale', 'departureDirection', 'arrivalDirection', 'inclinationDeg']
            .forEach((field) => {
                if (phase[field] !== undefined && !Number.isFinite(phase[field])) {
                    pushError(errors, `${path}.${field}`, 'ожидалось конечное число');
                }
            });
        if (phase.arrivalTangent !== undefined) {
            if (phase.type !== 'translunar') {
                pushError(errors, `${path}.arrivalTangent`, 'касательная прибытия допустима только на пути к Луне');
            } else if (!['orbit', 'radial-in'].includes(phase.arrivalTangent)) {
                pushError(errors, `${path}.arrivalTangent`, 'ожидалось orbit или radial-in');
            }
        }
        if (phase.departureTangent !== undefined) {
            if (phase.type !== 'translunar') {
                pushError(errors, `${path}.departureTangent`, 'касательная старта допустима только на пути к Луне');
            } else if (!['orbit', 'radial-out'].includes(phase.departureTangent)) {
                pushError(errors, `${path}.departureTangent`, 'ожидалось orbit или radial-out');
            }
        }
        if (phase.radialAscent !== undefined) {
            if (phase.type !== 'earth-launch') {
                pushError(errors, `${path}.radialAscent`, 'радиальный подъём допустим только в фазе старта');
            } else if (typeof phase.radialAscent !== 'boolean') {
                pushError(errors, `${path}.radialAscent`, 'ожидалось логическое значение');
            }
        }
        if (phase.radialDescent !== undefined) {
            if (phase.type !== 'moon-descent') {
                pushError(errors, `${path}.radialDescent`, 'радиальный спуск допустим только в фазе посадки');
            } else if (typeof phase.radialDescent !== 'boolean') {
                pushError(errors, `${path}.radialDescent`, 'ожидалось логическое значение');
            }
        }
        if (phase.hyperbola !== undefined) {
            if (phase.type !== 'moon-flyby') {
                pushError(errors, `${path}.hyperbola`, 'гипербола допустима только для облёта Луны');
            } else if (!isPlainObject(phase.hyperbola)) {
                pushError(errors, `${path}.hyperbola`, 'ожидались параметры гиперболы');
            } else {
                const hyperbola = phase.hyperbola;
                ['eccentricity', 'periapsisKm', 'inclinationDeg', 'longitudeAscendingNodeDeg',
                    'argumentPeriapsisDeg', 'trueAnomalyLimitDeg', 'direction', 'periapsisAngleOffsetDeg']
                    .forEach((field) => {
                        if (!Number.isFinite(hyperbola[field])) {
                            pushError(errors, `${path}.hyperbola.${field}`, 'ожидалось конечное число');
                        }
                    });
                if (Number.isFinite(hyperbola.eccentricity) && hyperbola.eccentricity <= 1) {
                    pushError(errors, `${path}.hyperbola.eccentricity`, 'для открытой траектории значение должно быть больше 1');
                }
                if (Number.isFinite(hyperbola.periapsisKm) && hyperbola.periapsisKm <= 0) {
                    pushError(errors, `${path}.hyperbola.periapsisKm`, 'ожидалось положительное расстояние');
                }
                if (Number.isFinite(hyperbola.inclinationDeg)
                    && (hyperbola.inclinationDeg < 0 || hyperbola.inclinationDeg > 180)) {
                    pushError(errors, `${path}.hyperbola.inclinationDeg`, 'ожидался угол от 0 до 180 градусов');
                }
                if (![1, -1].includes(hyperbola.direction)) {
                    pushError(errors, `${path}.hyperbola.direction`, 'ожидалось направление 1 или -1');
                }
                if (!isIsoDate(hyperbola.epoch)) {
                    pushError(errors, `${path}.hyperbola.epoch`, 'ожидалась дата ISO 8601');
                }
            }
        }
    }

    function validateTrajectory(trajectory, path, errors) {
        if (!isPlainObject(trajectory)) {
            pushError(errors, path, 'ожидался объект траектории');
            return;
        }

        requireEnum(trajectory.accuracy, 'accuracy', `${path}.accuracy`, errors);
        requireEnum(trajectory.frame, 'frame', `${path}.frame`, errors);

        if (!Array.isArray(trajectory.segments)) {
            pushError(errors, `${path}.segments`, 'ожидался массив сегментов');
            return;
        }

        if (trajectory.accuracy !== 'pending' && trajectory.segments.length === 0) {
            pushError(errors, `${path}.segments`, 'готовая траектория должна содержать хотя бы один сегмент');
        }

        trajectory.segments.forEach((segment, segmentIndex) => {
            const segmentPath = `${path}.segments[${segmentIndex}]`;
            if (!isPlainObject(segment)) {
                pushError(errors, segmentPath, 'ожидался объект сегмента');
                return;
            }
            requireString(segment.id, `${segmentPath}.id`, errors);
            requireEnum(segment.frame || trajectory.frame, 'frame', `${segmentPath}.frame`, errors);
            if (segment.model === 'elliptic-orbit') {
                if (!isIsoDate(segment.startDate)) pushError(errors, `${segmentPath}.startDate`, 'ожидалась дата ISO 8601');
                if (!isIsoDate(segment.endDate)) pushError(errors, `${segmentPath}.endDate`, 'ожидалась дата ISO 8601');
                const orbit = segment.orbit;
                if (!isPlainObject(orbit)) {
                    pushError(errors, `${segmentPath}.orbit`, 'ожидались параметры орбиты');
                } else {
                    ['perigeeKm', 'apogeeKm', 'inclinationDeg', 'periodMinutes', 'displayOrbits'].forEach((field) => {
                        if (!Number.isFinite(orbit[field]) || orbit[field] <= 0) {
                            pushError(errors, `${segmentPath}.orbit.${field}`, 'ожидалось положительное число');
                        }
                    });
                    ['phaseDeg', 'launchAngleDeg'].forEach((field) => {
                        if (orbit[field] !== undefined && !Number.isFinite(orbit[field])) {
                            pushError(errors, `${segmentPath}.orbit.${field}`, 'ожидалось конечное число');
                        }
                    });
                    if (orbit.launchProgress !== undefined
                        && (!Number.isFinite(orbit.launchProgress) || orbit.launchProgress <= 0 || orbit.launchProgress >= 1)) {
                        pushError(errors, `${segmentPath}.orbit.launchProgress`, 'ожидалось число больше 0 и меньше 1');
                    }
                    if (orbit.launchSite !== undefined) requireString(orbit.launchSite, `${segmentPath}.orbit.launchSite`, errors);
                    if (orbit.returnMode !== undefined && !['landing', 'burn-up'].includes(orbit.returnMode)) {
                        pushError(errors, `${segmentPath}.orbit.returnMode`, 'ожидалось landing или burn-up');
                    }
                }
            }
            if (segment.model === 'earth-moon-route') {
                if (!isIsoDate(segment.startDate)) pushError(errors, `${segmentPath}.startDate`, 'ожидалась дата ISO 8601');
                if (!isIsoDate(segment.endDate)) pushError(errors, `${segmentPath}.endDate`, 'ожидалась дата ISO 8601');
                if (segment.moonMotionEndProgress !== undefined
                    && (!Number.isFinite(segment.moonMotionEndProgress)
                        || segment.moonMotionEndProgress < 0
                        || segment.moonMotionEndProgress > 1)) {
                    pushError(errors, `${segmentPath}.moonMotionEndProgress`, 'ожидалось число от 0 до 1');
                }
                if (!Array.isArray(segment.phases) || segment.phases.length === 0) {
                    pushError(errors, `${segmentPath}.phases`, 'ожидался непустой массив фаз');
                } else {
                    segment.phases.forEach((phase, phaseIndex) => (
                        validateEarthMoonPhase(phase, `${segmentPath}.phases[${phaseIndex}]`, errors)
                    ));
                    const first = segment.phases[0];
                    const last = segment.phases.at(-1);
                    if (first?.startProgress !== 0) pushError(errors, `${segmentPath}.phases[0].startProgress`, 'маршрут должен начинаться с 0');
                    if (last?.endProgress !== 1) pushError(errors, `${segmentPath}.phases`, 'маршрут должен заканчиваться на 1');
                    segment.phases.slice(1).forEach((phase, phaseIndex) => {
                        if (phase.startProgress !== segment.phases[phaseIndex].endProgress) {
                            pushError(errors, `${segmentPath}.phases[${phaseIndex + 1}].startProgress`, 'между фазами не должно быть разрыва');
                        }
                    });
                }
                if (!Array.isArray(segment.timeline) || segment.timeline.length < 2) {
                    pushError(errors, `${segmentPath}.timeline`, 'ожидалось не менее двух точек времени');
                } else {
                    segment.timeline.forEach((point, pointIndex) => {
                        const pointPath = `${segmentPath}.timeline[${pointIndex}]`;
                        if (!isPlainObject(point)) {
                            pushError(errors, pointPath, 'ожидалась точка времени');
                            return;
                        }
                        if (!Number.isFinite(point.progress) || point.progress < 0 || point.progress > 1) {
                            pushError(errors, `${pointPath}.progress`, 'ожидалось число от 0 до 1');
                        }
                        if (!isIsoDate(point.date)) pushError(errors, `${pointPath}.date`, 'ожидалась дата ISO 8601');
                    });
                    if (segment.timeline[0]?.progress !== 0 || segment.timeline.at(-1)?.progress !== 1) {
                        pushError(errors, `${segmentPath}.timeline`, 'шкала должна идти от 0 до 1');
                    }
                }
            }
            if (segment.model === 'heliocentric-transfer') {
                if (!isIsoDate(segment.startDate)) pushError(errors, `${segmentPath}.startDate`, 'ожидалась дата ISO 8601');
                if (!isIsoDate(segment.endDate)) pushError(errors, `${segmentPath}.endDate`, 'ожидалась дата ISO 8601');
                ['originBody', 'targetBody'].forEach((field) => requireString(segment[field], `${segmentPath}.${field}`, errors));
                ['departureProgress', 'encounterProgress', 'closestApproachKm', 'targetRadiusKm',
                    'presentationOriginOffsetAu', 'presentationClosestApproachAu']
                    .forEach((field) => {
                        if (!Number.isFinite(segment[field])) {
                            pushError(errors, `${segmentPath}.${field}`, 'ожидалось конечное число');
                        }
                    });
                if (Number.isFinite(segment.departureProgress)
                    && segment.departureProgress !== 0) {
                    pushError(errors, `${segmentPath}.departureProgress`, 'межпланетная сцена должна начинаться сразу после ухода от Земли');
                }
                if (Number.isFinite(segment.encounterProgress)
                    && (segment.encounterProgress <= segment.departureProgress || segment.encounterProgress >= 1)) {
                    pushError(errors, `${segmentPath}.encounterProgress`, 'встреча должна быть после старта и до завершения');
                }
                ['closestApproachKm', 'targetRadiusKm', 'presentationOriginOffsetAu',
                    'presentationClosestApproachAu'].forEach((field) => {
                    if (Number.isFinite(segment[field]) && segment[field] <= 0) {
                        pushError(errors, `${segmentPath}.${field}`, 'ожидалось положительное число');
                    }
                });
                if (!['center', 'surface'].includes(segment.closestApproachReference)) {
                    pushError(errors, `${segmentPath}.closestApproachReference`, 'ожидалось center или surface');
                }
                if (segment.launchAngleDeg !== undefined && !Number.isFinite(segment.launchAngleDeg)) {
                    pushError(errors, `${segmentPath}.launchAngleDeg`, 'ожидалось конечное число');
                }
                if (!Array.isArray(segment.timeline) || segment.timeline.length < 2) {
                    pushError(errors, `${segmentPath}.timeline`, 'ожидалось не менее двух точек времени');
                } else {
                    segment.timeline.forEach((point, pointIndex) => {
                        const pointPath = `${segmentPath}.timeline[${pointIndex}]`;
                        if (!isPlainObject(point)) {
                            pushError(errors, pointPath, 'ожидалась точка времени');
                            return;
                        }
                        if (!Number.isFinite(point.progress) || point.progress < 0 || point.progress > 1) {
                            pushError(errors, `${pointPath}.progress`, 'ожидалось число от 0 до 1');
                        }
                        if (!isIsoDate(point.date)) pushError(errors, `${pointPath}.date`, 'ожидалась дата ISO 8601');
                    });
                    if (segment.timeline[0]?.progress !== 0 || segment.timeline.at(-1)?.progress !== 1) {
                        pushError(errors, `${segmentPath}.timeline`, 'шкала должна идти от 0 до 1');
                    }
                }
            }
            if (segment.model === 'earth-moon-route' || segment.model === 'heliocentric-transfer') return;
            if (!Array.isArray(segment.points) || segment.points.length < 2) {
                pushError(errors, `${segmentPath}.points`, 'сегмент должен содержать не менее двух XYZ-точек');
                return;
            }
            segment.points.forEach((point, pointIndex) => validatePoint(point, `${segmentPath}.points[${pointIndex}]`, errors));
        });
    }

    function validateVehicle(vehicle, path, errors) {
        if (!isPlainObject(vehicle)) {
            pushError(errors, path, 'ожидалась карточка аппарата');
            return;
        }
        requireString(vehicle.name, `${path}.name`, errors);
        requireString(vehicle.type, `${path}.type`, errors);
        if (!Number.isFinite(vehicle.massKg) || vehicle.massKg <= 0) {
            pushError(errors, `${path}.massKg`, 'ожидалось положительное число');
        }
        requireStringArray(vehicle.facts, `${path}.facts`, errors);
        requireString(vehicle.image, `${path}.image`, errors);
        requireString(vehicle.imageAlt, `${path}.imageAlt`, errors);
    }

    function validateUniqueIds(items, path, errors) {
        const seen = new Set();
        items.forEach((item, index) => {
            if (!item || !isNonEmptyString(item.id)) return;
            if (seen.has(item.id)) pushError(errors, `${path}[${index}].id`, `дубликат «${item.id}»`);
            seen.add(item.id);
        });
    }

    function validateMission(mission, index) {
        const errors = [];
        const path = `missions[${index}]`;

        if (!isPlainObject(mission)) {
            pushError(errors, path, 'ожидался объект миссии');
            return errors;
        }

        requireString(mission.id, `${path}.id`, errors);
        requireString(mission.name, `${path}.name`, errors);
        requireEnum(mission.kind, 'kind', `${path}.kind`, errors);
        requireEnum(mission.category, 'category', `${path}.category`, errors);
        requireEnum(mission.status, 'status', `${path}.status`, errors);
        requireEnum(mission.dataStatus, 'dataStatus', `${path}.dataStatus`, errors);
        requireEnum(mission.scenarioType, 'scenarioType', `${path}.scenarioType`, errors);
        requireString(mission.summary, `${path}.summary`, errors);
        requireString(mission.objective, `${path}.objective`, errors);
        if (mission.result !== undefined) requireString(mission.result, `${path}.result`, errors);
        requireStringArray(mission.story, `${path}.story`, errors);
        if (Array.isArray(mission.story) && mission.story.length !== 2) {
            pushError(errors, `${path}.story`, 'ожидалось ровно два абзаца');
        }

        if (!isIsoDate(mission.launchDate)) pushError(errors, `${path}.launchDate`, 'ожидалась дата ISO 8601');
        if (mission.endDate !== null && !isIsoDate(mission.endDate)) {
            pushError(errors, `${path}.endDate`, 'ожидалась дата ISO 8601 или null');
        }
        if (isIsoDate(mission.launchDate) && isIsoDate(mission.endDate)
            && Date.parse(mission.endDate) < Date.parse(mission.launchDate)) {
            pushError(errors, `${path}.endDate`, 'дата завершения раньше запуска');
        }

        requireStringArray(mission.agencies, `${path}.agencies`, errors);
        requireStringArray(mission.countries, `${path}.countries`, errors);

        if (!Array.isArray(mission.scales) || mission.scales.length === 0) {
            pushError(errors, `${path}.scales`, 'ожидался непустой массив масштабов');
        } else {
            mission.scales.forEach((scale, scaleIndex) => requireEnum(scale, 'scale', `${path}.scales[${scaleIndex}]`, errors));
        }

        if (!Array.isArray(mission.targets) || mission.targets.length === 0) {
            pushError(errors, `${path}.targets`, 'ожидался непустой массив целей');
        } else {
            mission.targets.forEach((target, targetIndex) => validateTarget(target, `${path}.targets[${targetIndex}]`, errors));
            validateUniqueIds(mission.targets, `${path}.targets`, errors);
        }

        if (!Array.isArray(mission.events) || mission.events.length === 0) {
            pushError(errors, `${path}.events`, 'ожидался непустой массив событий');
        } else {
            mission.events.forEach((event, eventIndex) => validateEvent(event, `${path}.events[${eventIndex}]`, errors));
            validateUniqueIds(mission.events, `${path}.events`, errors);
        }

        if (!Array.isArray(mission.sources) || mission.sources.length === 0) {
            pushError(errors, `${path}.sources`, 'ожидался непустой массив источников');
        } else {
            mission.sources.forEach((source, sourceIndex) => validateSource(source, `${path}.sources[${sourceIndex}]`, errors));
            validateUniqueIds(mission.sources, `${path}.sources`, errors);
        }

        validateTrajectory(mission.trajectory, `${path}.trajectory`, errors);
        if (mission.dataStatus === 'trajectory-ready' || mission.dataStatus === 'published') {
            validateVehicle(mission.vehicle, `${path}.vehicle`, errors);
            requireString(mission.result, `${path}.result`, errors);
            requireStringArray(mission.simulationStory, `${path}.simulationStory`, errors);
            if (Array.isArray(mission.simulationStory)
                && (mission.simulationStory.length < 4 || mission.simulationStory.length > 6)) {
                pushError(errors, `${path}.simulationStory`, 'ожидалось от четырёх до шести фрагментов');
            }
        }
        return errors;
    }

    function validateCatalog(catalog) {
        const errors = [];
        if (!Array.isArray(catalog)) {
            return { valid: false, errors: ['catalog: ожидался массив миссий'] };
        }

        catalog.forEach((mission, index) => errors.push(...validateMission(mission, index)));
        validateUniqueIds(catalog, 'missions', errors);

        return { valid: errors.length === 0, errors };
    }

    function assertValidCatalog(catalog) {
        const result = validateCatalog(catalog);
        if (!result.valid) {
            throw new Error(`Каталог миссий не прошёл проверку:\n${result.errors.join('\n')}`);
        }
        return result;
    }

    return Object.freeze({ ENUMS, validateMission, validateCatalog, assertValidCatalog });
}));
