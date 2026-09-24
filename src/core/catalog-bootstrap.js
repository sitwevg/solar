(function bootstrapMissionCatalog(root) {
    'use strict';

    if (!root.SolarMissionSchema) {
        throw new Error('Не загружена схема каталога миссий.');
    }
    if (!root.SolarMissionCatalog) {
        throw new Error('Не загружен каталог миссий.');
    }

    root.SolarMissionSchema.assertValidCatalog(root.SolarMissionCatalog);
    root.SolarMissionCatalogState = Object.freeze({
        ready: true,
        count: root.SolarMissionCatalog.length
    });
}(typeof globalThis !== 'undefined' ? globalThis : this));
