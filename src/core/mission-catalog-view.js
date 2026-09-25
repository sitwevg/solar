(function initMissionCatalogView(root, factory) {
    'use strict';

    const api = factory();
    const isNode = typeof process !== 'undefined'
        && process.versions
        && Boolean(process.versions.node)
        && typeof module === 'object'
        && module.exports;

    if (isNode) module.exports = api;
    else root.SolarMissionCatalogView = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMissionCatalogView() {
    'use strict';

    const CATEGORY_META = Object.freeze({
        all: Object.freeze({ label: 'Все миссии', shortLabel: 'Все' }),
        'early-spaceflight': Object.freeze({ label: 'Начало космической эры', shortLabel: 'Первые полёты' }),
        lunar: Object.freeze({ label: 'Лунные миссии', shortLabel: 'Луна' }),
        'inner-planets': Object.freeze({ label: 'Внутренняя Солнечная система', shortLabel: 'Внутренние планеты' }),
        'outer-interstellar': Object.freeze({ label: 'Внешняя система и гелиосфера', shortLabel: 'Внешняя система' }),
        'small-bodies': Object.freeze({ label: 'Астероиды и кометы', shortLabel: 'Малые тела' }),
        stations: Object.freeze({ label: 'Космические станции', shortLabel: 'Станции' })
    });

    const CATEGORY_ORDER = Object.freeze([
        'all',
        'early-spaceflight',
        'lunar',
        'inner-planets',
        'outer-interstellar',
        'small-bodies'
    ]);

    const STATUS_META = Object.freeze({
        success: Object.freeze({ label: 'Успешна', tone: 'success' }),
        'partial-success': Object.freeze({ label: 'Частичный успех', tone: 'partial' }),
        active: Object.freeze({ label: 'Продолжается', tone: 'active' }),
        lost: Object.freeze({ label: 'Аппарат потерян', tone: 'lost' }),
        'launch-failure': Object.freeze({ label: 'Неудачный запуск', tone: 'failure' }),
        catastrophe: Object.freeze({ label: 'Катастрофа', tone: 'catastrophe' })
    });

    const MONTHS = Object.freeze([
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ]);

    function sortByLaunchDate(missions) {
        return [...missions].sort((a, b) => Date.parse(a.launchDate) - Date.parse(b.launchDate));
    }

    function filterByCategory(missions, category) {
        const sorted = sortByLaunchDate(missions);
        return category === 'all' ? sorted : sorted.filter(mission => mission.category === category);
    }

    function categoryCount(missions, category) {
        return category === 'all'
            ? missions.length
            : missions.filter(mission => mission.category === category).length;
    }

    function missionCountLabel(count) {
        const value = Math.abs(Number(count) || 0);
        const mod100 = value % 100;
        const mod10 = value % 10;
        const noun = mod100 >= 11 && mod100 <= 14
            ? 'миссий'
            : mod10 === 1
                ? 'миссия'
                : mod10 >= 2 && mod10 <= 4 ? 'миссии' : 'миссий';
        return `${value} ${noun}`;
    }

    function formatDate(isoDate) {
        if (!isoDate) return 'по настоящее время';
        const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
        const calendarDate = `${day} ${MONTHS[month - 1]} ${year}`;
        if (!isoDate.includes('T')) return calendarDate;
        return `${calendarDate} · ${isoDate.slice(11, 16)} UTC`;
    }

    function formatYearRange(mission) {
        const launchYear = mission.launchDate.slice(0, 4);
        if (!mission.endDate) return `${launchYear} — настоящее время`;
        const endYear = mission.endDate.slice(0, 4);
        return launchYear === endYear ? launchYear : `${launchYear}–${endYear}`;
    }

    function targetRoute(mission) {
        return mission.targets.map(target => target.name).join(' → ');
    }

    function isSimulationReady(mission) {
        const publishedData = mission.dataStatus === 'trajectory-ready' || mission.dataStatus === 'published';
        return publishedData
            && mission.trajectory.accuracy !== 'pending'
            && mission.trajectory.segments.length > 0;
    }

    function statusMeta(status) {
        return STATUS_META[status] || Object.freeze({ label: status, tone: 'unknown' });
    }

    function categoryMeta(category) {
        return CATEGORY_META[category] || Object.freeze({ label: category, shortLabel: category });
    }

    return Object.freeze({
        CATEGORY_META,
        CATEGORY_ORDER,
        STATUS_META,
        sortByLaunchDate,
        filterByCategory,
        categoryCount,
        missionCountLabel,
        formatDate,
        formatYearRange,
        targetRoute,
        isSimulationReady,
        statusMeta,
        categoryMeta
    });
}));
