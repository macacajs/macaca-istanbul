/*
 Copyright (c) 2012, Yahoo! Inc.  All rights reserved.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
'use strict';

const path = require('path');
const Writer = require('../util/file-writer');
const util = require('util');
const Report = require('./index');
/**
 * a `Report` implementation that produces a coverage JSON object.
 *
 * Usage
 * -----
 *
 *      var report = require('istanbul').Report.create('json');
 *
 *
 * @class JsonReport
 * @extends Report
 * @module report
 * @constructor
 * @param {Object} opts optional
 * @param {String} [opts.dir] the directory in which to write the `coverage-final.json` file. Defaults to `process.cwd()`
 */
function JsonReport(opts) {
  this.opts = opts || {};
  this.opts.dir = this.opts.dir || process.cwd();
  this.opts.file = this.opts.file || this.getDefaultConfig().file;
  this.opts.writer = this.opts.writer || null;
}

JsonReport.TYPE = 'json';

util.inherits(JsonReport, Report);

Report.mix(JsonReport, {
  synopsis: () => {
    return 'prints the coverage object as JSON to a file';
  },
  getDefaultConfig: () => {
    return {
      file: 'coverage-final.json'
    };
  },
  writeReport: function (collector, writeOpts) {
    const outputFile = path.resolve(this.opts.dir, this.opts.file);
    const writer = this.opts.writer || new Writer(writeOpts.sync);

    writer.on('done', () => {
      this.emit('done');
    });
    writer.writeFile(outputFile, (contentWriter) => {
      let first = true;
      contentWriter.println("{");
      collector.files().forEach((key) => {
        if (first) {
          first = false;
        } else {
          contentWriter.println(",");
        }
        contentWriter.write(JSON.stringify(key));
        contentWriter.write(":");
        contentWriter.write(JSON.stringify(collector.fileCoverageFor(key)));
      });
      contentWriter.println("}");
    });
    writer.done();
  }
});

module.exports = JsonReport;
