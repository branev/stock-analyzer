# Files Overview

A code map for anyone landing in this repo for the first time. Read top-to-bottom to build a mental model in one pass, or jump to the section you need. For the _why_ behind the design, see [`01-stock-analyzer-analysis.md`](01-stock-analyzer-analysis.md). For the _contract_, see [`02-stock-analyzer-brief.md`](02-stock-analyzer-brief.md).

---

## Folder map

```
stock-analyzer/
├── src/
│   ├── main.ts               ← bootstrap (Helmet, ValidationPipe, static, filter, listen)
│   ├── app.module.ts         ← composes Config, Logger, Throttler, DataModule, controllers
│   ├── analysis/
│   │   ├── best-trade.ts            ← pure function, no NestJS imports
│   │   └── best-trade.spec.ts       ← unit tests + brute-force property test + perf test
│   ├── api/
│   │   ├── analyze.controller.ts    ← GET /api/analyze
│   │   ├── dataset.controller.ts    ← GET /api/dataset
│   │   ├── health.controller.ts     ← GET /health
│   │   ├── dto/analyze.dto.ts       ← class-validator rules for query params
│   │   ├── errors.ts                ← domain error classes
│   │   ├── exception-filter.ts      ← maps domain errors → uniform error envelope
│   │   ├── response-mapper.ts       ← BestTrade + window → AnalyzeResponse JSON
│   │   ├── api.spec.ts              ← integration tests via Test.createTestingModule
│   │   └── static.spec.ts           ← static-serving route precedence test
│   ├── data/
│   │   ├── price.repository.ts      ← abstract class + DatasetMetadata + OutOfBoundsError
│   │   ├── file-price.repository.ts ← concrete impl: loads JSON at boot, integrity-checks, slices
│   │   ├── data.module.ts           ← provides PriceRepository via factory + ConfigService
│   │   ├── data.module.spec.ts      ← module wiring test
│   │   └── file-price.repository.spec.ts ← repo unit tests (slicing, OOB, malformed file)
│   └── config/
│       ├── env.schema.ts            ← Zod env schema, validateEnv() function
│       └── env.schema.spec.ts       ← schema unit tests
├── public/                   ← static frontend (Alpine + Pico + plain HTML/CSS)
├── data/acme.json            ← committed deterministic dataset
├── scripts/generate-mock-data.ts  ← regenerates data/acme.json from seed 0xACE
├── docs/                     ← analysis, brief, plan, phases, reviews, postman collection
└── test/app.e2e-spec.ts      ← minimal e2e against /health
```

---

## Suggested reading order for new engineers

You can be productive in this codebase in half a day by reading these in order:

1. **[`README.md`](../README.md)** — what the product is, the live URL, the architecture mermaid diagram.
2. **[`docs/02-stock-analyzer-brief.md`](02-stock-analyzer-brief.md)** — the contract: API shape, error codes, data model, production-ready checklist.
3. **[`src/analysis/best-trade.ts`](../src/analysis/best-trade.ts)** — the heart of the take-home: ~30 lines, single-pass O(n) algorithm.
4. **[`src/api/analyze.controller.ts`](../src/api/analyze.controller.ts)** — how the algorithm is called from HTTP.
5. **[`src/data/file-price.repository.ts`](../src/data/file-price.repository.ts)** — where the data comes from and how it's loaded.
6. **[`docs/phases/`](phases/)** — the implementation history if you want to see _why_ things ended up this way.

---

## Architectural seams worth knowing

These are the places the system can evolve without rewrites:

- **`PriceRepository` abstract class** ([`src/data/price.repository.ts`](../src/data/price.repository.ts)) — swap the data source (file → live feed → DB) without touching anything above it. `FilePriceRepository` is one implementation; a `LiveFeedRepository` would slot in the same way.
- **Algorithm as a pure function called by the controller** ([`src/analysis/best-trade.ts`](../src/analysis/best-trade.ts)) — could be moved to a worker, batched, memoised, or replaced behind the same call site. No NestJS coupling.
- **DTO + global ValidationPipe + global exception filter** ([`src/api/dto/`](../src/api/dto/), [`src/main.ts`](../src/main.ts), [`src/api/exception-filter.ts`](../src/api/exception-filter.ts)) — every controller benefits from the same validation and error-shaping for free; new endpoints don't repeat boilerplate.
- **Same-origin static + API serving** ([`src/main.ts`](../src/main.ts)) — frontend can be replaced with React/Vite later without any backend change; only the static-asset path moves.

---

## Design notes — what _isn't_ here, and why

### Why no `AnalyzeModule`, `DatasetModule`, `HealthModule`

There's a single bounded context. Splitting controllers into per-feature modules would create extra files and `imports:` arrays for **no isolation benefit** — they all share the same `PriceRepository` and have no internal state. NestJS modules earn their keep when there's encapsulation to enforce; not the case here. If a second bounded context appeared (e.g. `auth`, `portfolios`, `alerts`), modularising would be the right move _then_.

### Why no service layer between controller and algorithm

The algorithm is a pure function with no dependencies on config, the repository, or the logger. Wrapping it in an `@Injectable()` service would add ceremony for zero benefit — no lifecycle, no shared state, no testability gain. It stays trivially testable: import the function and call it.

### Why no Swagger / OpenAPI

Two API endpoints plus health. Swagger's decorator overhead doesn't pay back at this size. A Postman collection ([`docs/stock-analyzer.postman_collection.json`](stock-analyzer.postman_collection.json)) is the right size. At 20+ endpoints the calculus would flip.

### Why the data file is JSON and not a database

The dataset is ~200 KB, static, single ticker. JSON parses in milliseconds, fits trivially in memory, is inspectable with `cat`. A database for this volume would be over-engineering. See [`docs/01-stock-analyzer-analysis.md`](01-stock-analyzer-analysis.md) §3 for the breakpoints at which JSON stops being appropriate.

---

## Where to look for…

| Question                                             | File                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The algorithm                                        | [`src/analysis/best-trade.ts`](../src/analysis/best-trade.ts)                                |
| Algorithm tests + brute-force oracle + property test | [`src/analysis/best-trade.spec.ts`](../src/analysis/best-trade.spec.ts)                      |
| Query param validation rules                         | [`src/api/dto/analyze.dto.ts`](../src/api/dto/analyze.dto.ts)                                |
| Where each error code is emitted                     | [`src/api/exception-filter.ts`](../src/api/exception-filter.ts)                              |
| Index-to-timestamp conversion + price rounding       | [`src/api/response-mapper.ts`](../src/api/response-mapper.ts)                                |
| Boot-time data integrity check                       | [`src/data/file-price.repository.ts`](../src/data/file-price.repository.ts) (`onModuleInit`) |
| Repository wiring (factory + config)                 | [`src/data/data.module.ts`](../src/data/data.module.ts)                                      |
| Helmet + CSP carve-outs                              | [`src/main.ts`](../src/main.ts)                                                              |
| Throttler limits per endpoint                        | [`src/app.module.ts`](../src/app.module.ts) (`ThrottlerModule.forRoot`)                      |
| Env var schema                                       | [`src/config/env.schema.ts`](../src/config/env.schema.ts)                                    |
| Frontend reactive state                              | [`public/app.js`](../public/app.js)                                                          |
| Static-asset serving                                 | [`src/main.ts`](../src/main.ts) (`useStaticAssets`)                                          |
