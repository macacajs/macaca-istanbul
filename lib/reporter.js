/*
 Copyright (c) 2014, Yahoo! Inc.  All rights reserved.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
'use strict';

const Report = require('./report');
const configuration = require('./config');
const inputError = require('./util/input-error');

/**
 * convenience mechanism to write one or more reports ensuring that config
 * options are respected.
 * Usage
 * -----
 *
 *      var fs = require('fs'),
 *          reporter = new require('istanbul').Reporter(),
 *          collector = new require('istanbul').Collector(),
 *          sync = true;
 *
 *      collector.add(JSON.parse(fs.readFileSync('coverage.json', 'utf8')));
 *      reporter.add('lcovonly');
 *      reporter.addAll(['clover', 'cobertura']);
 *      reporter.write(collector, sync, function () { console.log('done'); });
 *
 * @class Reporter
 * @param {Configuration} cfg  the config object, a falsy value will load the
 *  default configuration instead
 * @param {String} dir  the directory in which to write the reports, may be falsy
 *  to use config or global defaults
 * @constructor
 * @module main
 */
function Reporter(cfg, dir) {
  this.config = cfg || configuration.loadFile();
  this.dir = dir || this.config.reporting.dir();
  this.reports = {};
}

Reporter.prototype = {
  /**
   * adds a report to be generated. Must be one of the entries returned
   * by `Report.getReportList()`
   * @method add
   * @param {String} fmt the format of the report to generate
   */
  add: function (fmt) {
    if (this.reports[fmt]) { // already added
      return;
    }
    var config = this.config,
      rptConfig = config.reporting.reportConfig()[fmt] || {};
    rptConfig.verbose = config.verbose;
    rptConfig.dir = this.dir;
    rptConfig.watermarks = config.reporting.watermarks();
    try {
      this.reports[fmt] = Report.create(fmt, rptConfig);
    } catch (ex) {
      throw inputError.create('Invalid report format [' + fmt + ']');
    }
  },
  /**
   * adds an array of report formats to be generated
   * @method addAll
   * @param {Array} fmts an array of report formats
   */
  addAll: function (fmts) {
    var that = this;
    fmts.forEach(function (f) {
      that.add(f);
    });
  },
  /**
   * writes all reports added and calls the callback when done
   * @method write
   * @param {Collector} collector the collector having the coverage data
   * @param {Boolean} options
   * @param {Function} callback the callback to call when done. When `sync`
   * is true, the callback will be called in the same process tick.
   */
  write: function (collector, options = {}, callback) {
    var reports = this.reports,
      verbose = this.config.verbose,
      handler = this.handleDone.bind(this, callback);

    this.inProgress = Object.keys(reports).length;

    const writeOpts = Object.assign({
      sync: true,
    }, options);
    Object.keys(reports).forEach(function (name) {
      var report = reports[name];
      if (verbose) {
        console.error('Write report: ' + name);
      }
      report.on('done', handler);
      report.writeReport(collector, writeOpts);
    });
  },
  /*
   * handles listening on all reports to be completed before calling the callback
   * @method handleDone
   * @private
   * @param {Function} callback the callback to call when all reports are
   * written
   */
  handleDone: function (callback) {
    this.inProgress -= 1;
    if (this.inProgress === 0) {
      return callback();
    }
  }
};

module.exports = Reporter;
