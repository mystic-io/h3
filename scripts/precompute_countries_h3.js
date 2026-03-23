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

const fs = require('fs');
const Module = require('module');
const path = require('path');

const {
  SOURCE_DATASET,
  SOURCE_LAYER,
  SOURCE_URL,
  getSource,
} = require('./lib/natural_earth');

const DEFAULT_CONTAINMENT = 'center';
const VALID_CONTAINMENTS = ['center', 'full', 'overlap', 'bbox_overlap'];
const CONTAINMENT_FLAG_KEYS = {
  center: 'containmentCenter',
  full: 'containmentFull',
  overlap: 'containmentOverlapping',
  bbox_overlap: 'containmentOverlappingBbox',
};
const WEBSITE_DIR = path.join(__dirname, '..', 'website');

function getUsage() {
  return `Usage:
  node scripts/precompute_countries_h3.js \\
    --output <path> \\
    --resolution <0-15> \\
    [--containment center|full|overlap|bbox_overlap] \\
    [--input-file <local-natural-earth-geojson>] \\
    [--pretty]

Examples:
  node scripts/precompute_countries_h3.js --output build/countries_h3_r6.json --resolution 6
  node scripts/precompute_countries_h3.js --output build/countries_h3_r6_overlap.json --resolution 6 --containment overlap --pretty`;
}

function parseArgs(argv) {
  const options = {
    containment: DEFAULT_CONTAINMENT,
    pretty: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      return {help: true};
    }

    if (arg === '--pretty') {
      options.pretty = true;
      continue;
    }

    if (
      arg === '--output' ||
      arg === '--resolution' ||
      arg === '--containment' ||
      arg === '--input-file'
    ) {
      const value = argv[index + 1];
      if (value == null || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}\n\n${getUsage()}`);
      }

      index += 1;

      if (arg === '--output') {
        options.outputPath = value;
      } else if (arg === '--resolution') {
        options.resolution = value;
      } else if (arg === '--containment') {
        options.containment = value;
      } else if (arg === '--input-file') {
        options.inputFile = value;
      }

      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${getUsage()}`);
  }

  if (!options.outputPath) {
    throw new Error(`Missing required argument: --output\n\n${getUsage()}`);
  }

  if (options.resolution == null) {
    throw new Error(`Missing required argument: --resolution\n\n${getUsage()}`);
  }

  return {
    outputPath: path.resolve(options.outputPath),
    resolution: parseResolution(options.resolution),
    containment: parseContainment(options.containment),
    inputFile: options.inputFile ? path.resolve(options.inputFile) : undefined,
    pretty: options.pretty,
  };
}

function parseResolution(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 15) {
    throw new Error(`--resolution must be an integer from 0 to 15, got ${value}`);
  }

  return parsed;
}

function parseContainment(value) {
  if (!VALID_CONTAINMENTS.includes(value)) {
    throw new Error(
      `--containment must be one of ${VALID_CONTAINMENTS.join(', ')}, got ${value}`,
    );
  }

  return value;
}

function resolveH3Library({websiteDir = WEBSITE_DIR} = {}) {
  const packageJsonPath = path.join(websiteDir, 'package.json');
  const requireFromWebsite = Module.createRequire(packageJsonPath);

  try {
    const h3 = requireFromWebsite('h3-js');

    if (
      !h3 ||
      typeof h3.polygonToCellsExperimental !== 'function' ||
      typeof h3.compactCells !== 'function' ||
      !h3.POLYGON_TO_CELLS_FLAGS
    ) {
      throw new Error(
        'Resolved h3-js is missing polygonToCellsExperimental, compactCells, or POLYGON_TO_CELLS_FLAGS',
      );
    }

    return h3;
  } catch (error) {
    throw new Error(
      `Unable to resolve \`h3-js\` from the website package context at ${websiteDir}. Install the website package dependencies first, for example: (cd website && yarn install)`,
    );
  }
}

function getContainmentFlag(h3, containment) {
  const flagKey = CONTAINMENT_FLAG_KEYS[containment];

  if (!flagKey) {
    throw new Error(`Unsupported containment mode: ${containment}`);
  }

  const flag = h3.POLYGON_TO_CELLS_FLAGS[flagKey];
  if (!flag) {
    throw new Error(`Resolved h3-js does not expose ${flagKey}`);
  }

  return flag;
}

function normalizeIso3(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toUpperCase();
}

function isValidIso3(value) {
  return /^[A-Z]{3}$/.test(normalizeIso3(value));
}

function getCountryIso3(properties, featureIndex) {
  const isoA3Eh = normalizeIso3(properties.ISO_A3_EH);
  if (isValidIso3(isoA3Eh)) {
    return isoA3Eh;
  }

  const adm0A3 = normalizeIso3(properties.ADM0_A3);
  if (isValidIso3(adm0A3)) {
    return adm0A3;
  }

  throw new Error(
    `Feature ${featureIndex + 1} does not have a valid ISO alpha-3 code. ISO_A3_EH=${JSON.stringify(
      properties.ISO_A3_EH,
    )}, ADM0_A3=${JSON.stringify(properties.ADM0_A3)}`,
  );
}

function getCountryName(properties, featureIndex, iso3) {
  if (typeof properties.ADMIN !== 'string' || properties.ADMIN.trim() === '') {
    throw new Error(
      `Feature ${featureIndex + 1} (${iso3}) is missing a valid ADMIN name`,
    );
  }

  return properties.ADMIN.trim();
}

function normalizePolygonCoordinates(coordinates, featureIndex, iso3) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length === 0 ||
    !Array.isArray(coordinates[0]) ||
    coordinates[0].length === 0
  ) {
    throw new Error(
      `Feature ${featureIndex + 1} (${iso3}) has invalid polygon coordinates`,
    );
  }

  return coordinates;
}

function normalizeFeature(feature, featureIndex) {
  if (!feature || typeof feature !== 'object') {
    throw new Error(`Feature ${featureIndex + 1} is not a valid GeoJSON feature`);
  }

  const properties =
    feature.properties && typeof feature.properties === 'object'
      ? feature.properties
      : {};
  const iso3 = getCountryIso3(properties, featureIndex);
  const name = getCountryName(properties, featureIndex, iso3);
  const geometry = feature.geometry;

  if (!geometry || typeof geometry !== 'object') {
    throw new Error(`Feature ${featureIndex + 1} (${iso3}) is missing geometry`);
  }

  if (geometry.type === 'Polygon') {
    return {
      iso3,
      name,
      featureIndex,
      properties,
      polygons: [normalizePolygonCoordinates(geometry.coordinates, featureIndex, iso3)],
    };
  }

  if (geometry.type === 'MultiPolygon') {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new Error(`Feature ${featureIndex + 1} (${iso3}) has an empty MultiPolygon`);
    }

    return {
      iso3,
      name,
      featureIndex,
      properties,
      polygons: geometry.coordinates.map((polygon) =>
        normalizePolygonCoordinates(polygon, featureIndex, iso3),
      ),
    };
  }

  throw new Error(
    `Feature ${featureIndex + 1} (${iso3}) has unsupported geometry type ${geometry.type}`,
  );
}

function normalizeCell(value) {
  return String(value).toLowerCase();
}

function getDisplayNamePriority(country) {
  let score = 0;

  if (normalizeIso3(country.properties.ADM0_A3) === country.iso3) {
    score += 4;
  }

  if (country.properties.TYPE === 'Country') {
    score += 2;
  }

  if (
    typeof country.properties.SOVEREIGNT === 'string' &&
    country.name === country.properties.SOVEREIGNT.trim()
  ) {
    score += 1;
  }

  return score;
}

function mergeCountryFeatures(countries) {
  const mergedCountries = new Map();

  for (const country of countries) {
    const existing = mergedCountries.get(country.iso3);

    if (!existing) {
      mergedCountries.set(country.iso3, {
        iso3: country.iso3,
        name: country.name,
        namePriority: getDisplayNamePriority(country),
        featureIndex: country.featureIndex,
        polygons: [...country.polygons],
      });
      continue;
    }

    existing.polygons.push(...country.polygons);

    const nextPriority = getDisplayNamePriority(country);
    if (
      nextPriority > existing.namePriority ||
      (nextPriority === existing.namePriority &&
        country.featureIndex < existing.featureIndex)
    ) {
      existing.name = country.name;
      existing.namePriority = nextPriority;
      existing.featureIndex = country.featureIndex;
    }
  }

  return Array.from(mergedCountries.values()).map((country) => ({
    iso3: country.iso3,
    name: country.name,
    polygons: country.polygons,
  }));
}

function sortUniqueCells(cells) {
  return Array.from(new Set(cells.map(normalizeCell))).sort();
}

function buildCountryRecord(country, options) {
  const {h3, resolution, containmentFlag} = options;
  const rawCells = new Set();

  for (const polygon of country.polygons) {
    for (const cell of h3.polygonToCellsExperimental(
      polygon,
      resolution,
      containmentFlag,
      true,
    )) {
      rawCells.add(normalizeCell(cell));
    }
  }

  const compactedCells = rawCells.size
    ? h3.compactCells(Array.from(rawCells))
    : [];

  const cells = sortUniqueCells(compactedCells);

  return {
    iso3: country.iso3,
    name: country.name,
    polygonCount: country.polygons.length,
    cellCount: cells.length,
    cells,
  };
}

function buildManifest(featureCollection, options) {
  const {
    h3,
    resolution,
    containment = DEFAULT_CONTAINMENT,
    sourceUrl = SOURCE_URL,
    generatedAt = new Date().toISOString(),
  } = options;

  if (
    !featureCollection ||
    featureCollection.type !== 'FeatureCollection' ||
    !Array.isArray(featureCollection.features)
  ) {
    throw new Error('Input must be a GeoJSON FeatureCollection');
  }

  const normalizedResolution = parseResolution(resolution);
  const normalizedContainment = parseContainment(containment);
  const containmentFlag = getContainmentFlag(h3, normalizedContainment);
  const countries = mergeCountryFeatures(
    featureCollection.features.map((feature, featureIndex) =>
      normalizeFeature(feature, featureIndex),
    ),
  );

  countries.sort((left, right) => left.iso3.localeCompare(right.iso3));

  const countryMap = {};
  for (const country of countries) {
    countryMap[country.iso3] = buildCountryRecord(country, {
      h3,
      resolution: normalizedResolution,
      containmentFlag,
    });
  }

  return {
    source: {
      dataset: SOURCE_DATASET,
      layer: SOURCE_LAYER,
      url: sourceUrl,
    },
    resolution: normalizedResolution,
    containment: normalizedContainment,
    generatedAt,
    countryCount: countries.length,
    countries: countryMap,
  };
}

function loadFeatureCollection(rawJson, label) {
  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Unable to parse ${label} as JSON: ${error.message}`);
  }
}

async function readInputFeatureCollection({inputFile, sourceUrl, fetchSource}) {
  if (inputFile) {
    return loadFeatureCollection(
      fs.readFileSync(inputFile, 'utf8'),
      `input file ${inputFile}`,
    );
  }

  return loadFeatureCollection(
    await fetchSource(sourceUrl),
    `downloaded source ${sourceUrl}`,
  );
}

function writeManifest(manifest, outputPath, pretty) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(
    outputPath,
    pretty
      ? `${JSON.stringify(manifest, null, 2)}\n`
      : `${JSON.stringify(manifest)}\n`,
    'utf8',
  );
}

async function runPrecompute(options) {
  const {
    outputPath,
    resolution,
    containment = DEFAULT_CONTAINMENT,
    inputFile,
    pretty = false,
    h3,
    sourceUrl = SOURCE_URL,
    fetchSource = getSource,
    generatedAt,
  } = options;

  if (!outputPath) {
    throw new Error('--output is required');
  }

  const resolvedOutputPath = path.resolve(outputPath);
  const resolvedH3 = h3 || resolveH3Library();

  const featureCollection = await readInputFeatureCollection({
    inputFile,
    sourceUrl,
    fetchSource,
  });
  const manifest = buildManifest(featureCollection, {
    h3: resolvedH3,
    resolution,
    containment,
    sourceUrl,
    generatedAt,
  });

  writeManifest(manifest, resolvedOutputPath, pretty);
  return manifest;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(getUsage());
    return;
  }

  const manifest = await runPrecompute(options);
  console.log(
    `Wrote ${manifest.countryCount} countries at resolution ${manifest.resolution} to ${options.outputPath}`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  CONTAINMENT_FLAG_KEYS,
  DEFAULT_CONTAINMENT,
  SOURCE_URL,
  buildManifest,
  getContainmentFlag,
  getUsage,
  normalizeFeature,
  parseArgs,
  parseContainment,
  parseResolution,
  resolveH3Library,
  runPrecompute,
  writeManifest,
};
