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

const https = require('https');

const SOURCE_DATASET = 'natural-earth';
const SOURCE_LAYER = 'ne_50m_admin_0_countries';
const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const MAX_REDIRECTS = 5;

function getSource(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();

          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error(`Too many redirects while downloading ${url}`));
            return;
          }

          resolve(
            getSource(
              new URL(response.headers.location, url).toString(),
              redirectCount + 1,
            ),
          );
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `Unexpected status ${response.statusCode} while downloading ${url}`,
            ),
          );
          return;
        }

        response.setEncoding('utf8');

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

module.exports = {
  SOURCE_DATASET,
  SOURCE_LAYER,
  SOURCE_URL,
  getSource,
};
