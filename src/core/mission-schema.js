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
                }
            }
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
