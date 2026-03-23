#!/usr/bin/env node
/*
 * Copyright 2026 Uber Technologies, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  SOURCE_URL,
  buildManifest,
  resolveH3Library,
  runPrecompute,
} = require('./precompute_countries_h3');

const FIXTURE_PATH = path.join(
  __dirname,
  '..',
  'tests',
  'inputfiles',
  'ne_admin0_tiny.geojson',
);
const FIXED_TIME = '2026-03-23T00:00:00.000Z';

const tests = [];

function test(name, fn) {
  tests.push({name, fn});
}

function readFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

function makeTempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const intersects =
      y1 > y !== y2 > y &&
      x < ((x2 - x1) * (y - y1)) / (y2 - y1 || Number.EPSILON) + x1;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(point, loops) {
  if (!pointInRing(point, loops[0])) {
    return false;
  }

  for (let index = 1; index < loops.length; index += 1) {
    if (pointInRing(point, loops[index])) {
      return false;
    }
  }

  return true;
}

function getBoundingBox(loop) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  for (const [x, y] of loop) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }

  return bounds;
}

function sampleCellPoints(x, y, divisions = 5) {
  const points = [];

  for (let row = 0; row < divisions; row += 1) {
    for (let column = 0; column < divisions; column += 1) {
      points.push([
        x + (column + 0.5) / divisions,
        y + (row + 0.5) / divisions,
      ]);
    }
  }

  return points;
}

function bboxIntersectsCell(box, x, y) {
  return !(box.maxX <= x || box.minX >= x + 1 || box.maxY <= y || box.minY >= y + 1);
}

function makeFakeH3() {
  const stats = {
    compactCalls: 0,
  };

  const POLYGON_TO_CELLS_FLAGS = {
    containmentCenter: 'containmentCenter',
    containmentFull: 'containmentFull',
    containmentOverlapping: 'containmentOverlapping',
    containmentOverlappingBbox: 'containmentOverlappingBbox',
  };

  function shouldIncludeCell(loops, x, y, flag) {
    const samples = sampleCellPoints(x, y);

    if (flag === POLYGON_TO_CELLS_FLAGS.containmentCenter) {
      return pointInPolygon([x + 0.5, y + 0.5], loops);
    }

    if (flag === POLYGON_TO_CELLS_FLAGS.containmentFull) {
      return samples.every((point) => pointInPolygon(point, loops));
    }

    if (flag === POLYGON_TO_CELLS_FLAGS.containmentOverlapping) {
      return samples.some((point) => pointInPolygon(point, loops));
    }

    if (flag === POLYGON_TO_CELLS_FLAGS.containmentOverlappingBbox) {
      return bboxIntersectsCell(getBoundingBox(loops[0]), x, y);
    }

    throw new Error(`Unsupported fake containment flag ${flag}`);
  }

  return {
    stats,
    h3: {
      POLYGON_TO_CELLS_FLAGS,
      polygonToCellsExperimental(loops, resolution, flag) {
        const bounds = getBoundingBox(loops[0]);
        const cells = [];

        for (let y = Math.floor(bounds.minY); y < Math.ceil(bounds.maxY); y += 1) {
          for (let x = Math.floor(bounds.minX); x < Math.ceil(bounds.maxX); x += 1) {
            if (shouldIncludeCell(loops, x, y, flag)) {
              cells.push(`r${resolution}-x${x}-y${y}`);
            }
          }
        }

        return cells;
      },
      compactCells(cells) {
        stats.compactCalls += 1;
        return Array.from(new Set(cells));
      },
    },
  };
}

test('smoke case writes a manifest with expected metadata', async () => {
  const tempDir = makeTempDir('precompute-smoke');
  const outputPath = path.join(tempDir, 'manifest.json');
  const fake = makeFakeH3();

  await runPrecompute({
    outputPath,
    resolution: 1,
    inputFile: FIXTURE_PATH,
    pretty: true,
    h3: fake.h3,
    generatedAt: FIXED_TIME,
  });

  const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(manifest.source.dataset, 'natural-earth');
  assert.equal(manifest.source.layer, 'ne_50m_admin_0_countries');
  assert.equal(manifest.source.url, SOURCE_URL);
  assert.equal(manifest.resolution, 1);
  assert.equal(manifest.containment, 'center');
  assert.equal(manifest.generatedAt, FIXED_TIME);
  assert.equal(manifest.countryCount, 3);
  assert.deepEqual(Object.keys(manifest.countries), ['BDR', 'CTR', 'ISL']);
  assert.equal(fake.stats.compactCalls, 3);
});

test('multipolygon features merge into one country record with fallback ISO metadata', () => {
  const fake = makeFakeH3();
  const manifest = buildManifest(readFixture(), {
    h3: fake.h3,
    resolution: 1,
    containment: 'center',
    generatedAt: FIXED_TIME,
  });
  const islandUnion = manifest.countries.ISL;

  assert.equal(islandUnion.iso3, 'ISL');
  assert.equal(islandUnion.name, 'Island Union');
  assert.equal(islandUnion.polygonCount, 2);
  assert.deepEqual(islandUnion.cells, ['r1-x5-y0', 'r1-x7-y0']);
});

test('holes do not assign cells inside the interior ring', () => {
  const fake = makeFakeH3();
  const manifest = buildManifest(readFixture(), {
    h3: fake.h3,
    resolution: 1,
    containment: 'center',
    generatedAt: FIXED_TIME,
  });
  const centerland = manifest.countries.CTR;

  assert.equal(centerland.polygonCount, 1);
  assert.equal(centerland.cellCount, 8);
  assert.equal(centerland.cells.includes('r1-x1-y1'), false);
  assert.equal(centerland.cells.includes('r1-x0-y0'), true);
  assert.equal(centerland.cells.includes('r1-x2-y2'), true);
});

test('center and overlap containment produce different cell counts', () => {
  const centerManifest = buildManifest(readFixture(), {
    h3: makeFakeH3().h3,
    resolution: 1,
    containment: 'center',
    generatedAt: FIXED_TIME,
  });
  const overlapManifest = buildManifest(readFixture(), {
    h3: makeFakeH3().h3,
    resolution: 1,
    containment: 'overlap',
    generatedAt: FIXED_TIME,
  });

  assert.notEqual(
    centerManifest.countries.BDR.cellCount,
    overlapManifest.countries.BDR.cellCount,
  );
  assert.ok(
    overlapManifest.countries.BDR.cellCount >
      centerManifest.countries.BDR.cellCount,
  );
});

test('two runs with the same inputs are byte-stable aside from generatedAt', async () => {
  const tempDir = makeTempDir('precompute-determinism');
  const firstPath = path.join(tempDir, 'first.json');
  const secondPath = path.join(tempDir, 'second.json');

  await runPrecompute({
    outputPath: firstPath,
    resolution: 1,
    inputFile: FIXTURE_PATH,
    h3: makeFakeH3().h3,
    generatedAt: '2026-03-23T00:00:00.000Z',
  });
  await runPrecompute({
    outputPath: secondPath,
    resolution: 1,
    inputFile: FIXTURE_PATH,
    h3: makeFakeH3().h3,
    generatedAt: '2026-03-24T00:00:00.000Z',
  });

  const first = fs
    .readFileSync(firstPath, 'utf8')
    .replace(/"generatedAt":"[^"]+"/, '"generatedAt":"<generatedAt>"');
  const second = fs
    .readFileSync(secondPath, 'utf8')
    .replace(/"generatedAt":"[^"]+"/, '"generatedAt":"<generatedAt>"');

  assert.equal(first, second);
});

test('missing website dependencies fail with a clear setup message', () => {
  const tempDir = makeTempDir('precompute-missing-deps');
  const websiteDir = path.join(tempDir, 'website');

  fs.mkdirSync(websiteDir, {recursive: true});
  fs.writeFileSync(
    path.join(websiteDir, 'package.json'),
    JSON.stringify({name: 'fake-website', private: true}, null, 2),
  );

  assert.throws(
    () => resolveH3Library({websiteDir}),
    /Install the website package dependencies first.*cd website && yarn install/,
  );
});

test('invalid ISO metadata aborts instead of silently skipping a feature', () => {
  const fixture = readFixture();
  fixture.features[0].properties.ISO_A3_EH = '??';
  fixture.features[0].properties.ADM0_A3 = '1';

  assert.throws(
    () =>
      buildManifest(fixture, {
        h3: makeFakeH3().h3,
        resolution: 1,
        containment: 'center',
        generatedAt: FIXED_TIME,
      }),
    /does not have a valid ISO alpha-3 code/,
  );
});

test('duplicate ISO features merge into one country record with a canonical display name', () => {
  const fixture = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          ISO_A3_EH: 'AUS',
          ADM0_A3: 'AUS',
          ADMIN: 'Australia',
          TYPE: 'Country',
          SOVEREIGNT: 'Australia',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {
          ISO_A3_EH: 'AUS',
          ADM0_A3: 'IOA',
          ADMIN: 'Indian Ocean Territories',
          TYPE: 'Dependency',
          SOVEREIGNT: 'Australia',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [2, 0],
              [3, 0],
              [3, 1],
              [2, 1],
              [2, 0],
            ],
          ],
        },
      },
    ],
  };

  const manifest = buildManifest(fixture, {
    h3: makeFakeH3().h3,
    resolution: 1,
    containment: 'center',
    generatedAt: FIXED_TIME,
  });

  assert.deepEqual(Object.keys(manifest.countries), ['AUS']);
  assert.equal(manifest.countries.AUS.name, 'Australia');
  assert.equal(manifest.countries.AUS.polygonCount, 2);
  assert.deepEqual(manifest.countries.AUS.cells, ['r1-x0-y0', 'r1-x2-y0']);
});

async function runTests() {
  let failures = 0;

  for (const {name, fn} of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`not ok - ${name}`);
      console.error(error.stack);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`passed ${tests.length} tests`);
}

runTests();
