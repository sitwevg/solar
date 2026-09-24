(function initSpaceProjection(root, factory) {
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
        root.SolarSpaceProjection = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createSpaceProjection() {
    'use strict';

    const MODE_TOP = 'top';
    const MODE_VOLUME = 'volume';
    const MIN_TILT = 20;
    const MAX_TILT = 70;
    const DEFAULT_TILT = 42;

    function clampTilt(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return DEFAULT_TILT;
        return Math.max(MIN_TILT, Math.min(MAX_TILT, numeric));
    }

    function normalizeMode(mode) {
        return mode === MODE_VOLUME ? MODE_VOLUME : MODE_TOP;
    }

    function projectPoint(point, options) {
        const x = Number(point.x) || 0;
        const y = Number(point.y) || 0;
        const z = Number(point.z) || 0;
        const centerX = Number(options.centerX) || 0;
        const centerY = Number(options.centerY) || 0;
        const mode = normalizeMode(options.mode);
        const distanceToPixels = options.distanceToPixels;

        if (typeof distanceToPixels !== 'function') {
            throw new TypeError('distanceToPixels должен быть функцией.');
        }

        const distance = mode === MODE_TOP ? Math.hypot(x, y) : Math.hypot(x, y, z);
        if (distance === 0) return { x: centerX, y: centerY, depth: 0 };

        const radius = distanceToPixels(distance);
        const nx = x / distance;
        const ny = y / distance;

        if (mode === MODE_TOP) {
            return {
                x: centerX + nx * radius,
                y: centerY - ny * radius,
                depth: 0
            };
        }

        const nz = z / distance;
        const tilt = clampTilt(options.tiltDeg) * Math.PI / 180;
        const cosTilt = Math.cos(tilt);
        const sinTilt = Math.sin(tilt);

        return {
            x: centerX + nx * radius,
            y: centerY - (ny * cosTilt + nz * sinTilt) * radius,
            depth: (ny * sinTilt - nz * cosTilt) * radius
        };
    }

    function orbitPoint(elements, trueAnomaly) {
        const a = Number(elements.semiMajorAxis);
        const e = Number(elements.eccentricity) || 0;
        const inclination = (Number(elements.inclinationDeg) || 0) * Math.PI / 180;
        const ascendingNode = (Number(elements.ascendingNodeDeg) || 0) * Math.PI / 180;
        const argumentPeriapsis = (Number(elements.argumentPeriapsisDeg) || 0) * Math.PI / 180;

        if (!Number.isFinite(a) || a <= 0 || e < 0 || e >= 1) {
            throw new RangeError('Некорректные элементы эллиптической орбиты.');
        }

        const radius = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));
        const argument = argumentPeriapsis + trueAnomaly;
        const cosNode = Math.cos(ascendingNode);
        const sinNode = Math.sin(ascendingNode);
        const cosArgument = Math.cos(argument);
        const sinArgument = Math.sin(argument);
        const cosInclination = Math.cos(inclination);
        const sinInclination = Math.sin(inclination);

        return {
            x: radius * (cosNode * cosArgument - sinNode * sinArgument * cosInclination),
            y: radius * (sinNode * cosArgument + cosNode * sinArgument * cosInclination),
            z: radius * sinArgument * sinInclination
        };
    }

    function sampleOrbit(elements, sampleCount = 180) {
        const count = Math.max(24, Math.floor(Number(sampleCount) || 180));
        return Array.from({ length: count + 1 }, (_, index) => (
            orbitPoint(elements, index / count * Math.PI * 2)
        ));
    }

    return Object.freeze({
        MODE_TOP,
        MODE_VOLUME,
        MIN_TILT,
        MAX_TILT,
        DEFAULT_TILT,
        clampTilt,
        normalizeMode,
        projectPoint,
        orbitPoint,
        sampleOrbit
    });
}));
