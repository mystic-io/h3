# Repository Guidelines

## Project Structure & Module Organization
`src/h3lib/include/` contains public headers and `src/h3lib/lib/` contains the core C implementation. CLI tools and helper apps live under `src/apps/`: `filters/` for user-facing commands, `testapps/` for CTest-driven native tests, `fuzzers/` for API fuzz targets, `benchmarks/` for performance checks, and `miscapps/` for generators and diagnostics. Test fixtures live in `tests/inputfiles/`, while CLI regression cases are defined in `tests/cli/*.txt`. Use `examples/` for minimal integration samples, `dev-docs/` for RFCs and Doxygen inputs, and `website/` for the Docusaurus documentation site.

## Build, Test, and Development Commands
Configure an out-of-tree build with `cmake -Bbuild -DCMAKE_BUILD_TYPE=Debug -DWARNINGS_AS_ERRORS=ON .`. Build with `cmake --build build` or `make -C build`. Run the full native suite with `make -C build test`; use `make -C build test-fast` when you want to skip `*Exhaustive` tests. Generate coverage with `cmake -Bbuild -DCMAKE_BUILD_TYPE=Debug -DENABLE_COVERAGE=ON .` followed by `make -C build coverage`. Common maintenance targets include `make -C build format`, `make -C build benchmarks`, and `make -C build docs`.

For the docs site, work from `website/`: `yarn` installs dependencies, `yarn start` runs the local site, `yarn build` verifies a production build, and `yarn format` rewrites formatted frontend sources.

## Coding Style & Naming Conventions
This repository uses `clang-format-14` with the checked-in `.clang-format`: Google-based style, 4-space indentation, and right-aligned pointers (`char *name`). Follow existing C naming: `camelCase` for most functions, `PascalCase` for exported types, and descriptive filenames matching the feature area (for example `latLng.c`, `testGridDisk.c`). Keep new build artifacts in `build/`; do not commit generated outputs.

## Testing Guidelines
Add or update native tests in `src/apps/testapps/test*.c`. Reserve the `*Exhaustive.c` suffix for intentionally slow suites so `test-fast` can exclude them. Add CLI regressions by updating `tests/cli/<command>.txt`, and extend `tests/inputfiles/` when new geometry fixtures are needed. Public API changes should also include fuzzer coverage in `src/apps/fuzzers/`. Core library changes are expected to preserve 100% coverage.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects such as `Replace cellsToLinkedMultiPolygon backend with cellsToMultiPolygon`. PRs should include tests, a changelog entry in `CHANGELOG.md` under `Unreleased`, and discussion up front for large or compatibility-breaking changes. If a docs or website change is user-visible, include screenshots or the rendered page path. Contributors must also complete the Uber CLA before merge.
