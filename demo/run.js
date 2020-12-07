'use strict';

const open = require('open');
const path = require('path');
const __coverage__ = require('./data.json');

const { Reporter, Collector } = require('..');
// console.log(__coverage__);
const collector = new Collector();
collector.add(__coverage__);

const p = path.join(__dirname, '..', 'coverage');
const reporter = new Reporter(null, p);
reporter.addAll([
  'html',
  'lcov',
  'json',
]);
reporter.write(collector, true, () => {
  const coverageHtml = path.join(p, 'index.html');
  console.log(coverageHtml);
  open(coverageHtml);
});
