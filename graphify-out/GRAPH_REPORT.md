# Graph Report - crossy-road  (2026-11-11)

## Corpus Check
- 14 files · ~14,856 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 186 nodes · 284 edges · 13 communities (9 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cfe7c396`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SoundEffects
- .update
- GameScene.ts
- На практике
- 📔 Дневник разработки и архитектурная документация
- package.json
- Если ничего не работает
- compilerOptions
- Подготовка шаблона преподавателем
- CHANGELOG
- {
  display: {
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    tileSize: TILE_SIZE,
    gridCols: GRID_COLS,
    cameraOffsetY: CAMERA_OFFSET_Y,
    hopDuration: HOP_DURATION,
    maxLanesBehind: MAX_LANES_BEHIND,
    lanesAhead: LANES_AHEAD,
  },
  pizza: {
    initialTemperature: INITIAL_TEMPERATURE,
    heatDecayPerSec: HEAT_DECAY_PER_SEC,
    heatBoostOnForward: HEAT_BOOST_ON_FORWARD,
    checkpointInterval: CHECKPOINT_INTERVAL,
    tipPerDelivery: TIP_PER_DELIVERY,
  },
  phases: {
    phase2DeliveryThreshold: PHASE_2_DELIVERY_THRESHOLD,
    phase3DeliveryThreshold: PHASE_3_DELIVERY_THRESHOLD,
    phase4DeliveryThreshold: PHASE_4_DELIVERY_THRESHOLD,
  },
}

## God Nodes (most connected - your core abstractions)
1. `GameScene` - 58 edges
2. `SoundEffects` - 20 edges
3. `compilerOptions` - 12 edges
4. `Если ничего не работает` - 11 edges
5. `На практике` - 8 edges
6. `📔 Дневник разработки и архитектурная документация` - 8 edges
7. `Правила для AI-агента` - 7 edges
8. `🎯 Часть 1. Экспресс-анализ: «Где живёт ваша игра? 5 ключевых точек»` - 6 edges
9. `scripts` - 5 edges
10. `🍕 CYBER COURIER: Hot Delivery (Кибер-курьер)` - 5 edges

## Surprising Connections (you probably didn't know these)
- `createGame()` --indirect_call--> `GameScene`  [INFERRED]
  src/game/config.ts → src/game/GameScene.ts
- `GameScene` --references--> `SoundEffects`  [EXTRACTED]
  src/game/GameScene.ts → src/game/SoundEffects.ts

## Import Cycles
- None detected.

## Communities (13 total, 4 thin omitted)

### Community 3 - "GameScene.ts"
Cohesion: 0.20
Nodes (8): createGame(), GAME_CONFIG, CleanBot, HoloBarrierState, HyperloopState, Lane, LaneType, Vehicle

### Community 7 - "На практике"
Cohesion: 0.09
Nodes (20): Во время изменения, Главное правило, Запрещено, Контекст курса, Перед изменением, После изменения, Правила для AI-агента, 0–10 минут — 10 идей (+12 more)

### Community 9 - "📔 Дневник разработки и архитектурная документация"
Cohesion: 0.08
Nodes (22): 📔 Дневник разработки и архитектурная документация, ⚡ Запрос на изменение №3 (CR-003): «Заказчик передумал — Фаза 2 по порогу прогресса», 📝 Зафиксируйте боль (Анализ стоимости изменения), 🛠️ Практика: «Один маленький рефакторинг — Нормальный конфиг», 🌟 Практика: «Расширение фаз прогрессии — Фазы 3 и 4», Суть изменения, Точка 1. ВВОД — Где обрабатывается управление?, Точка 2. СОСТОЯНИЕ ИГРЫ — Где оно хранится? (+14 more)

### Community 10 - "package.json"
Cohesion: 0.12
Nodes (16): dependencies, phaser, devDependencies, typescript, vite, engines, node, name (+8 more)

### Community 11 - "Если ничего не работает"
Cohesion: 0.14
Nodes (13): 10. Что отправить преподавателю / AI при проблеме, 1. Проверить Node.js, 2. Проверить Git, 3. Зависимости, 4. Запуск, 5. Белый / пустой экран, 6. TypeScript, 7. Проверка финальной сборки (+5 more)

### Community 12 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleResolution, noEmit, skipLibCheck (+5 more)

### Community 13 - "Подготовка шаблона преподавателем"
Cohesion: 0.50
Nodes (3): Один раз перед курсом, Перед первой практикой, Подготовка шаблона преподавателем

## Knowledge Gaps
- **77 isolated node(s):** `name`, `private`, `version`, `type`, `node` (+72 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GameScene` connect `.update` to `SoundEffects`, `GameScene.ts`, `.createHUD`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Why does `SoundEffects` connect `SoundEffects` to `.update`, `GameScene.ts`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _77 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `.update` be split into smaller, more focused modules?**
  _Cohesion score 0.1207897793263647 - nodes in this community are weakly interconnected._
- **Should `На практике` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `📔 Дневник разработки и архитектурная документация` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._