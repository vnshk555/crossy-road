# Graph Report - crossy-road  (2026-10-28)

## Corpus Check
- 14 files · ~12,517 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 174 nodes · 251 edges · 16 communities (11 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05cf0fb0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SoundEffects
- .update
- GameScene
- GameScene.ts
- На практике
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
  },
}
- 📔 Дневник разработки и архитектурная документация
- package.json
- Если ничего не работает
- compilerOptions
- Подготовка шаблона преподавателем
- CHANGELOG

## God Nodes (most connected - your core abstractions)
1. `GameScene` - 50 edges
2. `SoundEffects` - 20 edges
3. `compilerOptions` - 12 edges
4. `Если ничего не работает` - 11 edges
5. `На практике` - 8 edges
6. `Правила для AI-агента` - 7 edges
7. `📔 Дневник разработки и архитектурная документация` - 7 edges
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

## Communities (16 total, 5 thin omitted)

### Community 3 - "GameScene.ts"
Cohesion: 0.24
Nodes (6): createGame(), GAME_CONFIG, HyperloopState, Lane, LaneType, Vehicle

### Community 7 - "На практике"
Cohesion: 0.09
Nodes (20): Во время изменения, Главное правило, Запрещено, Контекст курса, Перед изменением, После изменения, Правила для AI-агента, 0–10 минут — 10 идей (+12 more)

### Community 9 - "📔 Дневник разработки и архитектурная документация"
Cohesion: 0.09
Nodes (20): 📔 Дневник разработки и архитектурная документация, ⚡ Запрос на изменение №3 (CR-003): «Заказчик передумал — Фаза 2 по порогу прогресса», 📝 Зафиксируйте боль (Анализ стоимости изменения), 🛠️ Практика: «Один маленький рефакторинг — Нормальный конфиг», Суть изменения, Точка 1. ВВОД — Где обрабатывается управление?, Точка 2. СОСТОЯНИЕ ИГРЫ — Где оно хранится?, Точка 3. РЕЗУЛЬТАТ — Где наступает конец игры или победа? (+12 more)

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
- **74 isolated node(s):** `name`, `private`, `version`, `type`, `node` (+69 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GameScene` connect `GameScene` to `SoundEffects`, `.update`, `GameScene.ts`, `.tryMove`, `.createHUD`, `.onLand`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **Why does `SoundEffects` connect `SoundEffects` to `GameScene`, `GameScene.ts`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _74 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `На практике` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `📔 Дневник разработки и архитектурная документация` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `Если ничего не работает` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._