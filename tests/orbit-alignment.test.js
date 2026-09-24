'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Astronomy = require('../astronomy.js');

const MS_PER_DAY = 86400000;
const PLANETS = [
    ['Mercury', 88],
    ['Venus', 225],
    ['Earth', 365],
    ['Mars', 687],
    ['Jupiter', 4333],
    ['Saturn', 10759],
    ['Uranus', 30687],
    ['Neptune', 60190],
    ['Pluto', 90560]
];

function segmentDistance(point, start, end) {
    const ab = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
    const ap = { x: point.x - start.x, y: point.y - start.y, z: point.z - start.z };
    const lengthSquared = ab.x ** 2 + ab.y ** 2 + ab.z ** 2;
    const amount = Math.max(0, Math.min(1,
        (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared
    ));
    return Math.hypot(
        point.x - start.x - ab.x * amount,
        point.y - start.y - ab.y * amount,
        point.z - start.z - ab.z * amount
    );
}

test('положение каждой планеты лежит на построенной для неё эклиптической линии', () => {
    const dates = [
        new Date('2026-01-15T12:00:00Z'),
        new Date('2026-04-15T12:00:00Z'),
        new Date('2026-07-15T12:00:00Z'),
        new Date('2026-10-15T12:00:00Z')
    ];
    const epoch = Date.UTC(2026, 0, 1, 12);
    const rotation = Astronomy.Rotation_EQJ_ECL();
    const sampleCount = 240;

    for (const [body, periodDays] of PLANETS) {
        const path = Array.from({ length: sampleCount }, (_, index) => Astronomy.RotateVector(
            rotation,
            Astronomy.HelioVector(
                Astronomy.Body[body],
                new Date(epoch + periodDays * MS_PER_DAY * index / sampleCount)
            )
        ));

        for (const date of dates) {
            const position = Astronomy.RotateVector(
                rotation,
                Astronomy.HelioVector(Astronomy.Body[body], date)
            );
            let nearest = Infinity;
            path.forEach((start, index) => {
                nearest = Math.min(nearest, segmentDistance(position, start, path[(index + 1) % path.length]));
            });

            const relativeError = nearest / Math.hypot(position.x, position.y, position.z);
            assert.ok(relativeError < 0.001, `${body} ${date.toISOString()}: отклонение ${relativeError}`);
        }
    }
});
