(function initMissionCatalog(root, factory) {
    'use strict';

    const isNode = typeof process !== 'undefined'
        && process.versions
        && Boolean(process.versions.node)
        && typeof module === 'object'
        && module.exports;
    const schema = isNode ? require('../core/mission-schema.js') : root.SolarMissionSchema;
    const catalog = factory(schema);

    if (isNode) {
        module.exports = catalog;
    } else {
        root.SolarMissionCatalog = catalog;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMissionCatalog(schema) {
    'use strict';

    if (!schema) throw new Error('SolarMissionSchema должен быть загружен до каталога миссий.');

    const target = (id, name, type, role) => ({ id, name, type, role });
    const event = (id, type, date, title) => ({ id, type, date, title });
    const source = (id, label, publisher, url) => ({ id, label, publisher, url });

    function mission(data) {
        return Object.freeze({
            kind: 'mission',
            dataStatus: 'outline',
            trajectory: Object.freeze({
                accuracy: 'pending',
                frame: data.frame,
                segments: Object.freeze([])
            }),
            ...data
        });
    }

    const missions = [
        mission({
            id: 'sputnik-1', name: 'Спутник-1', launchDate: '1957-10-04', endDate: '1958-01-04',
            category: 'early-spaceflight', status: 'success', scenarioType: 'orbital',
            agencies: ['ОКБ-1'], countries: ['СССР'], scales: ['earth-orbit'], frame: 'geocentric-ecliptic-j2000',
            summary: 'Первый искусственный спутник Земли открыл космическую эру.',
            objective: 'Проверить вывод искусственного спутника на орбиту и исследовать прохождение радиосигнала через ионосферу.',
            targets: [target('earth', 'Земля', 'earth', 'primary')],
            events: [
                event('launch', 'launch', '1957-10-04', 'Запуск и выход на орбиту'),
                event('mission-end', 'mission-end', '1958-01-04', 'Сход с орбиты')
            ],
            sources: [source('nasa-sputnik', 'Sputnik Ushers in the Space Age', 'NASA', 'https://www.nasa.gov/history/65-years-ago-sputnik-ushers-in-the-space-age/')]
        }),
        mission({
            id: 'vostok-1', name: 'Восток-1', launchDate: '1961-04-12', endDate: '1961-04-12',
            category: 'early-spaceflight', status: 'success', scenarioType: 'orbital',
            agencies: ['ОКБ-1'], countries: ['СССР'], scales: ['earth-orbit'], frame: 'geocentric-ecliptic-j2000',
            summary: 'Первый полёт человека в космос и один оборот вокруг Земли.',
            objective: 'Проверить возможность пребывания человека в космосе и безопасного возвращения.',
            targets: [target('earth', 'Земля', 'earth', 'primary')],
            events: [
                event('launch', 'launch', '1961-04-12', 'Старт Юрия Гагарина'),
                event('return', 'return', '1961-04-12', 'Возвращение на Землю')
            ],
            sources: [source('nasa-vostok-1', 'Vostok 1', 'NASA', 'https://starchild.gsfc.nasa.gov/docs/StarChild/space_level2/vostok1.html')]
        }),
        mission({
            id: 'vostok-6', name: 'Восток-6', launchDate: '1963-06-16', endDate: '1963-06-19',
            category: 'early-spaceflight', status: 'success', scenarioType: 'orbital',
            agencies: ['ОКБ-1'], countries: ['СССР'], scales: ['earth-orbit'], frame: 'geocentric-ecliptic-j2000',
            summary: 'Валентина Терешкова стала первой женщиной в космосе.',
            objective: 'Изучить влияние космического полёта на организм и продолжить испытания корабля «Восток».',
            targets: [target('earth', 'Земля', 'earth', 'primary')],
            events: [
                event('launch', 'launch', '1963-06-16', 'Старт Валентины Терешковой'),
                event('return', 'return', '1963-06-19', 'Возвращение на Землю')
            ],
            sources: [source('nasa-tereshkova', 'Valentina Tereshkova and Vostok 6', 'NASA', 'https://www.nasa.gov/history/60-years-ago-valentina-tereshkova-becomes-the-first-woman-in-space/')]
        }),
        mission({
            id: 'voskhod-2', name: 'Восход-2', launchDate: '1965-03-18', endDate: '1965-03-19',
            category: 'early-spaceflight', status: 'success', scenarioType: 'orbital',
            agencies: ['ОКБ-1'], countries: ['СССР'], scales: ['earth-orbit'], frame: 'geocentric-ecliptic-j2000',
            summary: 'Во время полёта Алексей Леонов первым вышел в открытый космос.',
            objective: 'Проверить выход человека из корабля и работу автономного скафандра в вакууме.',
            targets: [target('earth', 'Земля', 'earth', 'primary')],
            events: [
                event('launch', 'launch', '1965-03-18', 'Запуск «Восхода-2»'),
                event('first-eva', 'eva', '1965-03-18', 'Первый выход человека в открытый космос'),
                event('return', 'return', '1965-03-19', 'Возвращение экипажа')
            ],
            sources: [source('nasa-spacewalk-history', 'Spacewalking History', 'NASA', 'https://www.nasa.gov/history/space-station-20th-spacewalking-history/')]
        }),

        mission({
            id: 'luna-2', name: 'Луна-2', launchDate: '1959-09-12', endDate: '1959-09-14',
            category: 'lunar', status: 'success', scenarioType: 'landing',
            agencies: ['ОКБ-1'], countries: ['СССР'], scales: ['earth-moon'], frame: 'geocentric-ecliptic-j2000',
            summary: 'Первый созданный человеком аппарат, достигший другого небесного тела.',
            objective: 'Достичь поверхности Луны и провести измерения межпланетного пространства.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('moon', 'Луна', 'moon', 'landing')],
            events: [event('launch', 'launch', '1959-09-12', 'Запуск к Луне'), event('impact', 'landing', '1959-09-14', 'Достижение поверхности Луны')],
            sources: [source('nasa-luna-2', 'Luna 02', 'NASA NSSDC', 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1959-014A')]
        }),
        mission({
            id: 'luna-9', name: 'Луна-9', launchDate: '1966-01-31', endDate: '1966-02-06',
            category: 'lunar', status: 'success', scenarioType: 'landing',
            agencies: ['ОКБ-1', 'НПО имени С. А. Лавочкина'], countries: ['СССР'], scales: ['earth-moon', 'target-closeup'], frame: 'geocentric-ecliptic-j2000',
            summary: 'Первая мягкая посадка на Луну и первые снимки с её поверхности.',
            objective: 'Отработать мягкую посадку и передать панорамы лунной поверхности.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('moon', 'Луна', 'moon', 'landing')],
            events: [event('launch', 'launch', '1966-01-31', 'Запуск к Луне'), event('landing', 'landing', '1966-02-03', 'Первая мягкая посадка на Луну'), event('mission-end', 'mission-end', '1966-02-06', 'Окончание передачи данных')],
            sources: [source('nasa-luna-9', 'Luna 09', 'NASA NSSDC', 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1966-006A')]
        }),
        mission({
            id: 'apollo-11', name: 'Apollo 11', launchDate: '1969-07-16', endDate: '1969-07-24',
            category: 'lunar', status: 'success', scenarioType: 'multi-phase',
            agencies: ['NASA'], countries: ['США'], scales: ['earth-moon', 'target-closeup'], frame: 'geocentric-ecliptic-j2000',
            summary: 'Первая пилотируемая высадка людей на Луну.',
            objective: 'Высадить людей на Луне, выполнить научную программу и безопасно вернуть экипаж.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('moon', 'Луна', 'moon', 'landing')],
            events: [event('launch', 'launch', '1969-07-16', 'Старт Apollo 11'), event('landing', 'landing', '1969-07-20', 'Посадка Eagle'), event('return', 'return', '1969-07-24', 'Приводнение на Земле')],
            sources: [source('nasa-apollo-11', 'Apollo 11 Mission Overview', 'NASA', 'https://www.nasa.gov/mission/apollo-11/')]
        }),
        mission({
            id: 'apollo-13', name: 'Apollo 13', launchDate: '1970-04-11', endDate: '1970-04-17',
            category: 'lunar', status: 'partial-success', scenarioType: 'multi-phase',
            agencies: ['NASA'], countries: ['США'], scales: ['earth-moon'], frame: 'geocentric-ecliptic-j2000',
            summary: 'После аварии высадка была отменена, а экипаж удалось вернуть на Землю.',
            objective: 'Первоначально — третья пилотируемая высадка на Луну; после аварии — спасение экипажа.',
            targets: [target('earth', 'Земля', 'earth', 'return'), target('moon', 'Луна', 'moon', 'flyby')],
            events: [event('launch', 'launch', '1970-04-11', 'Старт Apollo 13'), event('lunar-flyby', 'flyby', '1970-04-15', 'Облёт Луны по траектории возвращения'), event('return', 'return', '1970-04-17', 'Безопасное приводнение')],
            sources: [source('nasa-apollo-13', 'Apollo 13 Mission Overview', 'NASA', 'https://www.nasa.gov/mission/apollo-13/')]
        }),
        mission({
            id: 'luna-17-lunokhod-1', name: 'Луна-17 / Луноход-1', launchDate: '1970-11-10', endDate: '1971-10-04',
            category: 'lunar', status: 'success', scenarioType: 'multi-phase',
            agencies: ['НПО имени С. А. Лавочкина'], countries: ['СССР'], scales: ['earth-moon', 'target-closeup'], frame: 'geocentric-ecliptic-j2000',
            summary: 'Первый успешно работавший дистанционно управляемый планетоход.',
            objective: 'Доставить на Луну мобильную лабораторию и исследовать грунт и рельеф.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('moon', 'Луна', 'moon', 'landing')],
            events: [event('launch', 'launch', '1970-11-10', 'Запуск «Луны-17»'), event('landing', 'landing', '1970-11-17', 'Посадка и выгрузка «Лунохода-1»'), event('mission-end', 'mission-end', '1971-10-04', 'Официальное завершение программы')],
            sources: [source('nasa-luna-17', 'Luna 17 / Lunokhod 1', 'NASA NSSDC', 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1970-095A')]
        }),

        mission({
            id: 'mariner-2', name: 'Mariner 2', launchDate: '1962-08-27', endDate: '1963-01-03',
            category: 'inner-planets', status: 'success', scenarioType: 'flyby',
            agencies: ['NASA', 'JPL'], countries: ['США'], scales: ['inner-solar-system'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Первый успешный межпланетный аппарат: пролёт у Венеры.',
            objective: 'Исследовать Венеру с пролётной траектории и измерить межпланетную среду.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('venus', 'Венера', 'planet', 'flyby')],
            events: [event('launch', 'launch', '1962-08-27', 'Запуск к Венере'), event('venus-flyby', 'flyby', '1962-12-14', 'Пролёт у Венеры'), event('mission-end', 'mission-end', '1963-01-03', 'Последний сеанс связи')],
            sources: [source('nasa-mariner-2', 'Mariner 2', 'NASA Science', 'https://science.nasa.gov/mission/mariner-2/')]
        }),
        mission({
            id: 'venera-7', name: 'Венера-7', launchDate: '1970-08-17', endDate: '1970-12-15',
            category: 'inner-planets', status: 'success', scenarioType: 'landing',
            agencies: ['НПО имени С. А. Лавочкина'], countries: ['СССР'], scales: ['inner-solar-system', 'target-closeup'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Первая передача данных с поверхности другой планеты.',
            objective: 'Выполнить посадку на Венеру и измерить условия на поверхности.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('venus', 'Венера', 'planet', 'landing')],
            events: [event('launch', 'launch', '1970-08-17', 'Запуск к Венере'), event('landing', 'landing', '1970-12-15', 'Посадка и передача данных')],
            sources: [source('nasa-venera-7', 'Venera 7', 'NASA NSSDC', 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1970-060A')]
        }),
        mission({
            id: 'mars-3', name: 'Марс-3', launchDate: '1971-05-28', endDate: '1972-08-22',
            category: 'inner-planets', status: 'partial-success', scenarioType: 'multi-phase',
            agencies: ['НПО имени С. А. Лавочкина'], countries: ['СССР'], scales: ['inner-solar-system', 'target-closeup'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Первая мягкая посадка аппарата на Марс; связь с посадочным модулем быстро прекратилась.',
            objective: 'Исследовать Марс с орбиты и поверхности.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('mars', 'Марс', 'planet', 'landing')],
            events: [event('launch', 'launch', '1971-05-28', 'Запуск к Марсу'), event('landing', 'landing', '1971-12-02', 'Мягкая посадка на Марс'), event('mission-end', 'mission-end', '1972-08-22', 'Завершение работы орбитального аппарата')],
            sources: [source('nasa-mars-3', 'Mars 3', 'NASA NSSDC', 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1971-049A')]
        }),
        mission({
            id: 'mariner-10', name: 'Mariner 10', launchDate: '1973-11-03', endDate: '1975-03-24',
            category: 'inner-planets', status: 'success', scenarioType: 'multi-phase',
            agencies: ['NASA', 'JPL'], countries: ['США'], scales: ['inner-solar-system'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Первая миссия к Меркурию и первое применение гравитационного манёвра у планеты.',
            objective: 'Исследовать Венеру и Меркурий с пролётной траектории.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('venus', 'Венера', 'planet', 'gravity-assist'), target('mercury', 'Меркурий', 'planet', 'primary')],
            events: [event('launch', 'launch', '1973-11-03', 'Запуск'), event('venus-assist', 'gravity-assist', '1974-02-05', 'Гравитационный манёвр у Венеры'), event('mercury-flyby-1', 'flyby', '1974-03-29', 'Первый пролёт у Меркурия'), event('mission-end', 'mission-end', '1975-03-24', 'Последний сеанс связи')],
            sources: [source('nasa-mariner-10', 'Mariner 10', 'NASA Science', 'https://science.nasa.gov/mission/mariner-10/')]
        }),
        mission({
            id: 'viking-1', name: 'Viking 1', launchDate: '1975-08-20', endDate: '1982-11-11',
            category: 'inner-planets', status: 'success', scenarioType: 'multi-phase',
            agencies: ['NASA', 'JPL'], countries: ['США'], scales: ['inner-solar-system', 'target-closeup'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Первая полностью успешная американская посадка на Марс и долгая работа на поверхности.',
            objective: 'Исследовать Марс с орбиты и поверхности, включая поиск признаков биологической активности.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('mars', 'Марс', 'planet', 'landing')],
            events: [event('launch', 'launch', '1975-08-20', 'Запуск к Марсу'), event('mars-orbit', 'orbit-insertion', '1976-06-19', 'Выход на орбиту Марса'), event('landing', 'landing', '1976-07-20', 'Посадка в Хризе'), event('mission-end', 'mission-end', '1982-11-11', 'Последний сеанс связи с посадочным аппаратом')],
            sources: [source('nasa-viking-1', 'Viking 1', 'NASA Science', 'https://science.nasa.gov/mission/viking-1/')]
        }),

        mission({
            id: 'voyager-1', name: 'Voyager 1', launchDate: '1977-09-05', endDate: null,
            category: 'outer-interstellar', status: 'active', scenarioType: 'multi-phase',
            agencies: ['NASA', 'JPL'], countries: ['США'], scales: ['outer-solar-system', 'heliosphere'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Исследовал Юпитер и Сатурн, затем первым вошёл в межзвёздное пространство.',
            objective: 'Исследовать внешние планеты и продолжить измерения у границ гелиосферы.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('jupiter', 'Юпитер', 'planet', 'flyby'), target('saturn', 'Сатурн', 'planet', 'gravity-assist'), target('heliopause', 'Гелиопауза', 'region', 'primary')],
            events: [event('launch', 'launch', '1977-09-05', 'Запуск'), event('jupiter-flyby', 'flyby', '1979-03-05', 'Пролёт у Юпитера'), event('saturn-flyby', 'gravity-assist', '1980-11-12', 'Пролёт у Сатурна и уход из плоскости планет'), event('heliopause', 'boundary-crossing', '2012-08-25', 'Выход за гелиопаузу')],
            sources: [source('nasa-voyager-1', 'Voyager 1', 'NASA Science', 'https://science.nasa.gov/mission/voyager/voyager-1/')]
        }),
        mission({
            id: 'voyager-2', name: 'Voyager 2', launchDate: '1977-08-20', endDate: null,
            category: 'outer-interstellar', status: 'active', scenarioType: 'multi-phase',
            agencies: ['NASA', 'JPL'], countries: ['США'], scales: ['outer-solar-system', 'heliosphere'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Единственный аппарат, посетивший все четыре планеты-гиганта, и второй за гелиопаузой.',
            objective: 'Выполнить редкий тур по планетам-гигантам и исследовать границы гелиосферы.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('jupiter', 'Юпитер', 'planet', 'gravity-assist'), target('saturn', 'Сатурн', 'planet', 'gravity-assist'), target('uranus', 'Уран', 'planet', 'gravity-assist'), target('neptune', 'Нептун', 'planet', 'gravity-assist'), target('heliopause', 'Гелиопауза', 'region', 'primary')],
            events: [event('launch', 'launch', '1977-08-20', 'Запуск'), event('jupiter-flyby', 'gravity-assist', '1979-07-09', 'Пролёт у Юпитера'), event('saturn-flyby', 'gravity-assist', '1981-08-25', 'Пролёт у Сатурна'), event('uranus-flyby', 'gravity-assist', '1986-01-24', 'Пролёт у Урана'), event('neptune-flyby', 'gravity-assist', '1989-08-25', 'Пролёт у Нептуна'), event('heliopause', 'boundary-crossing', '2018-11-05', 'Выход за гелиопаузу')],
            sources: [source('nasa-voyager-2', 'Voyager 2', 'NASA Science', 'https://science.nasa.gov/mission/voyager/voyager-2/')]
        }),
        mission({
            id: 'cassini-huygens', name: 'Cassini–Huygens', launchDate: '1997-10-15', endDate: '2017-09-15',
            category: 'outer-interstellar', status: 'success', scenarioType: 'multi-phase',
            agencies: ['NASA', 'ESA', 'ASI'], countries: ['США', 'Европейские страны'], scales: ['inner-solar-system', 'outer-solar-system', 'target-closeup'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Орбитальная экспедиция к Сатурну и первая посадка во внешней Солнечной системе — на Титан.',
            objective: 'Исследовать систему Сатурна, а посадочным аппаратом Huygens — атмосферу и поверхность Титана.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('venus', 'Венера', 'planet', 'gravity-assist'), target('jupiter', 'Юпитер', 'planet', 'gravity-assist'), target('saturn', 'Сатурн', 'planet', 'primary'), target('titan', 'Титан', 'satellite', 'landing')],
            events: [event('launch', 'launch', '1997-10-15', 'Запуск'), event('saturn-orbit', 'orbit-insertion', '2004-07-01', 'Выход на орбиту Сатурна'), event('huygens-landing', 'landing', '2005-01-14', 'Посадка Huygens на Титан'), event('mission-end', 'mission-end', '2017-09-15', 'Управляемый вход Cassini в атмосферу Сатурна')],
            sources: [source('nasa-cassini', 'Cassini–Huygens', 'NASA Science', 'https://science.nasa.gov/mission/cassini/')]
        }),

        mission({
            id: 'giotto', name: 'Giotto', launchDate: '1985-07-02', endDate: '1992-07-23',
            category: 'small-bodies', status: 'success', scenarioType: 'multi-phase',
            agencies: ['ESA'], countries: ['Европейские страны'], scales: ['inner-solar-system', 'target-closeup'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Первый близкий пролёт у ядра кометы Галлея.',
            objective: 'Изучить ядро, газ и пыль кометы Галлея, а затем посетить комету Григга—Скьеллерупа.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('halley', 'Комета Галлея', 'comet', 'primary'), target('grigg-skjellerup', 'Комета Григга—Скьеллерупа', 'comet', 'flyby')],
            events: [event('launch', 'launch', '1985-07-02', 'Запуск'), event('halley-flyby', 'flyby', '1986-03-14', 'Пролёт у кометы Галлея'), event('grigg-flyby', 'flyby', '1992-07-10', 'Пролёт у кометы Григга—Скьеллерупа'), event('mission-end', 'mission-end', '1992-07-23', 'Окончание операций')],
            sources: [source('esa-giotto', 'Giotto Overview', 'ESA', 'https://www.esa.int/Science_Exploration/Space_Science/Giotto_overview')]
        }),
        mission({
            id: 'near-shoemaker', name: 'NEAR Shoemaker', launchDate: '1996-02-17', endDate: '2001-02-28',
            category: 'small-bodies', status: 'success', scenarioType: 'multi-phase',
            agencies: ['NASA', 'APL'], countries: ['США'], scales: ['inner-solar-system', 'target-closeup'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Первый аппарат на орбите астероида и первая посадка на астероид.',
            objective: 'Подробно исследовать околоземный астероид Эрос с орбиты и поверхности.',
            targets: [target('earth', 'Земля', 'earth', 'origin'), target('mathilde', 'Астероид Матильда', 'asteroid', 'flyby'), target('eros', 'Астероид Эрос', 'asteroid', 'landing')],
            events: [event('launch', 'launch', '1996-02-17', 'Запуск'), event('mathilde-flyby', 'flyby', '1997-06-27', 'Пролёт у Матильды'), event('eros-orbit', 'orbit-insertion', '2000-02-14', 'Выход на орбиту Эроса'), event('eros-landing', 'landing', '2001-02-12', 'Посадка на Эрос'), event('mission-end', 'mission-end', '2001-02-28', 'Последний сеанс связи')],
            sources: [source('nasa-near', 'NEAR Shoemaker', 'NASA Science', 'https://science.nasa.gov/mission/near-shoemaker/')]
        }),
        mission({
            id: 'hayabusa', name: 'Hayabusa', launchDate: '2003-05-09', endDate: '2010-06-13',
            category: 'small-bodies', status: 'success', scenarioType: 'multi-phase',
            agencies: ['JAXA', 'ISAS'], countries: ['Япония'], scales: ['inner-solar-system', 'target-closeup'], frame: 'heliocentric-ecliptic-j2000',
            summary: 'Первая доставка на Землю образцов вещества астероида.',
            objective: 'Исследовать астероид Итокава, взять образцы и вернуть капсулу на Землю.',
            targets: [target('earth', 'Земля', 'earth', 'return'), target('itokawa', 'Астероид Итокава', 'asteroid', 'primary')],
            events: [event('launch', 'launch', '2003-05-09', 'Запуск'), event('itokawa-arrival', 'surface-operations', '2005-09-12', 'Прибытие к Итокаве'), event('return', 'return', '2010-06-13', 'Возвращение капсулы с образцами')],
            sources: [source('jaxa-hayabusa', 'Hayabusa Project Topics', 'JAXA', 'https://global.jaxa.jp/projects/sat/muses_c/topics.html')]
        })
    ];

    schema.assertValidCatalog(missions);
    return Object.freeze(missions);
}));
