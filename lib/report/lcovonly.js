/*
 Copyright (c) 2012, Yahoo! Inc.  All rights reserved.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
'use strict';

const path = require('path');
const util = require('util');
const Writer = require('../util/file-writer');
const Report = require('./index');
const utils = require('../object-utils');
/**
 * a `Report` implementation that produces an LCOV coverage file from coverage objects.
 *
 * Usage
 * -----
 *
 *      var report = require('istanbul').Report.create('lcovonly');
 *
 *
 * @class LcovOnlyReport
 * @extends Report
 * @module report
 * @constructor
 * @param {Object} opts optional
 * @param {String} [opts.dir] the directory in which to the `lcov.info` file. Defaults to `process.cwd()`
 */
function LcovOnlyReport(opts) {
  this.opts = opts || {};
  this.opts.dir = this.opts.dir || process.cwd();
  this.opts.file = this.opts.file || this.getDefaultConfig().file;
  this.opts.writer = this.opts.writer || null;
}

LcovOnlyReport.TYPE = 'lcovonly';
util.inherits(LcovOnlyReport, Report);

Report.mix(LcovOnlyReport, {
  synopsis: function () {
    return 'lcov coverage report that can be consumed by the lcov tool';
  },
  getDefaultConfig: function () {
    return { file: 'lcov.info' };
  },
  writeFileCoverage: function (writer, fc) {
    const functions = fc.f;
    const functionMap = fc.fnMap;
    const lines = fc.l;
    const branches = fc.b;
    const branchMap = fc.branchMap;
    const summary = utils.summarizeFileCoverage(fc);

    writer.println('TN:'); //no test name
    writer.println('SF:' + fc.path);

    Object.keys(functions).forEach(function (key) {
      const meta = functionMap[key];
      writer.println('FN:' + [meta.line, meta.name].join(','));
    });
    writer.println('FNF:' + summary.functions.total);
    writer.println('FNH:' + summary.functions.covered);

    Object.keys(functions).forEach(function (key) {
      const stats = functions[key];
      const meta = functionMap[key];
      writer.println('FNDA:' + [stats, meta.name].join(','));
    });

    Object.keys(lines).forEach(function (key) {
      const stat = lines[key];
      writer.println('DA:' + [key, stat].join(','));
    });
    writer.println('LF:' + summary.lines.total);
    writer.println('LH:' + summary.lines.covered);

    Object.keys(branches).forEach((key) => {
      const branchArray = branches[key];
      const meta = branchMap[key];
      const line = meta.line;
      let i = 0;
      branchArray.forEach((b) => {
        writer.println('BRDA:' + [line, key, i, b].join(','));
        i += 1;
      });
    });
    writer.println('BRF:' + summary.branches.total);
    writer.println('BRH:' + summary.branches.covered);
    writer.println('end_of_record');
  },

  writeReport: function (collector, writeOpts = {}) {
    const outputFile = path.resolve(this.opts.dir, this.opts.file);
    const writer = this.opts.writer || new Writer(writeOpts.sync);
    writer.on('done', () => {
      this.emit('done');
    });
    writer.writeFile(outputFile, (contentWriter) => {
      collector.files().forEach((key) => {
        this.writeFileCoverage(contentWriter, collector.fileCoverageFor(key));
      });
    });
    writer.done();
  }
});

module.exports = LcovOnlyReport;
