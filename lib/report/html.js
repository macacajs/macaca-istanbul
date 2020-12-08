/*
 Copyright (c) 2012, Yahoo! Inc.  All rights reserved.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const util = require('util');
const timestamp = new Date().getTime();
const assetsDir = path.resolve(__dirname, '..', 'assets');
const incrementFileCoverageFor = require('../util/gen-incremental-coverage');

const assetsContentMap = {
  'base.css': fs.readFileSync(path.resolve(assetsDir, 'base.css')),
  'sorter.js': fs.readFileSync(path.resolve(assetsDir, 'sorter.js')),
  'vendor/prettify.js': fs.readFileSync(path.resolve(assetsDir, 'vendor/prettify.js')),
  'vendor/prettify.css': fs.readFileSync(path.resolve(assetsDir, 'vendor/prettify.css')),
};

const handlebars = require('handlebars').create();
const templateFor = name => {
  return handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'templates', name + '.handlebars'), 'utf8'));
};
const headerTemplate = templateFor('head');
const footerTemplate = templateFor('foot');
const detailTemplate = handlebars.compile([
  '<tr>',
  '<td class="line-count quiet">{{#show_lines}}{{maxLines}}{{/show_lines}}</td>',
  '<td class="line-coverage quiet">{{#show_line_execution_counts fileCoverage}}{{maxLines}}{{/show_line_execution_counts}}</td>',
  '<td class="text"><pre class="prettyprint lang-js">{{#show_code structured}}{{/show_code}}</pre></td>',
  '</tr>\n',
].join(''));
const summaryTableHeader = [
  '<div class="pad1">',
  '<table class="coverage-summary">',
  '<thead>',
  '<tr>',
  '   <th data-col="file" data-fmt="html" data-html="true" class="file">File</th>',
  '   <th data-col="pic" data-type="number" data-fmt="html" data-html="true" class="pic"></th>',
  '   <th data-col="lines" data-type="number" data-fmt="pct" class="pct">Lines</th>',
  '   <th data-col="lines_raw" data-type="number" data-fmt="html" class="abs"></th>',
  '   <th data-col="functions" data-type="number" data-fmt="pct" class="pct">Functions</th>',
  '   <th data-col="functions_raw" data-type="number" data-fmt="html" class="abs"></th>',
  '   <th data-col="statements" data-type="number" data-fmt="pct" class="pct">Statements</th>',
  '   <th data-col="statements_raw" data-type="number" data-fmt="html" class="abs"></th>',
  '   <th data-col="branches" data-type="number" data-fmt="pct" class="pct">Branches</th>',
  '   <th data-col="branches_raw" data-type="number" data-fmt="html" class="abs"></th>',
  '</tr>',
  '</thead>',
  '<tbody>',
].join('\n');
const summaryLineTemplate = handlebars.compile([
  '<tr class="summary-line {{type}}">',
  '<td class="file {{reportClasses.statements}}" data-value="{{file}}"><a href="{{output}}?t=' + timestamp + '">{{file}}</a></td>',
  '<td data-value="{{metrics.statements.pct}}" class="pic {{reportClasses.statements}}"><div class="chart">{{#show_picture}}{{metrics.statements.pct}}{{/show_picture}}</div></td>',
  '<td data-value="{{metrics.lines.pct}}" class="pct {{reportClasses.lines}}">{{metrics.lines.pct}}%</td>',
  '<td data-value="{{metrics.lines.total}}" class="abs {{reportClasses.lines}}">{{metrics.lines.covered}}/{{metrics.lines.total}}</td>',
  '<td data-value="{{metrics.functions.pct}}" class="pct {{reportClasses.functions}}">{{metrics.functions.pct}}%</td>',
  '<td data-value="{{metrics.functions.total}}" class="abs {{reportClasses.functions}}">{{metrics.functions.covered}}/{{metrics.functions.total}}</td>',
  '<td data-value="{{metrics.statements.pct}}" class="pct {{reportClasses.statements}}">{{metrics.statements.pct}}%</td>',
  '<td data-value="{{metrics.statements.total}}" class="abs {{reportClasses.statements}}">{{metrics.statements.covered}}/{{metrics.statements.total}}</td>',
  '<td data-value="{{metrics.branches.pct}}" class="pct {{reportClasses.branches}}">{{metrics.branches.pct}}%</td>',
  '<td data-value="{{metrics.branches.total}}" class="abs {{reportClasses.branches}}">{{metrics.branches.covered}}/{{metrics.branches.total}}</td>',
  '</tr>\n',
].join('\n\t'));
const summaryTableFooter = [
  '</tbody>',
  '</table>',
  '</div>',
].join('\n');

const getIcremental = (incrementalMap, fileKey, line) => {
  let incremental = false;
  if (!incrementalMap) {
    return incremental;
  }
  const matrix = incrementalMap[fileKey];
  if (!matrix) {
    return incremental;
  }
  for (let i = 0; i < matrix.length; i++) {
    const field = matrix[i];
    if (!field.length) {
      continue;
    }
    const [ left, right ] = field;
    if (line >= left && line <= right) {
      incremental = true;
      break;
    }
  }
  return incremental;
};

const defaults = require('./common/defaults');
const FileWriter = require('../util/file-writer');
const Report = require('./index');
const Store = require('../store');
const InsertionText = require('../util/insertion-text');
const TreeSummarizer = require('../util/tree-summarizer');
const utils = require('../object-utils');

const lt = '\u0001';
const gt = '\u0002';
const RE_LT = /</g;
const RE_GT = />/g;
const RE_AMP = /&/g;
const RE_lt = /\u0001/g;
const RE_gt = /\u0002/g;

handlebars.registerHelper('show_picture', function(opts) {
  let num = Number(opts.fn(this));
  let rest;
  let cls = '';
  if (isFinite(num)) {
    if (num === 100) {
      cls = ' cover-full';
    }
    num = Math.floor(num);
    rest = 100 - num;
    return '<div class="cover-fill' + cls + '" style="width: ' + num + '%;"></div>' +
      '<div class="cover-empty" style="width:' + rest + '%;"></div>';
  }
  return '';

});

handlebars.registerHelper('if_has_ignores', function(metrics, opts) {
  return (metrics.statements.skipped +
    metrics.functions.skipped +
    metrics.branches.skipped) === 0 ? '' : opts.fn(this);
});

handlebars.registerHelper('show_ignores', function(metrics) {
  const statements = metrics.statements.skipped;
  const functions = metrics.functions.skipped;
  const branches = metrics.branches.skipped;

  if (statements === 0 && functions === 0 && branches === 0) {
    return '<span class="ignore-none">none</span>';
  }

  const result = [];
  if (statements > 0) { result.push(statements === 1 ? '1 statement' : statements + ' statements'); }
  if (functions > 0) { result.push(functions === 1 ? '1 function' : functions + ' functions'); }
  if (branches > 0) { result.push(branches === 1 ? '1 branch' : branches + ' branches'); }

  return result.join(', ');
});

handlebars.registerHelper('show_lines', function(opts) {
  const maxLines = Number(opts.fn(this));
  const array = [];
  for (let i = 0; i < maxLines; i += 1) {
    array[i] = i + 1;
  }
  return array.join('\n');
});

handlebars.registerHelper('show_line_execution_counts', function(context, opts) {
  const lines = context.l;
  const maxLines = Number(opts.fn(this));
  const array = [];
  let value = '';

  for (let i = 0; i < maxLines; i += 1) {
    const lineNumber = i + 1;
    value = '&nbsp;';
    let covered = 'neutral';
    if (lines.hasOwnProperty(lineNumber)) {
      if (lines[lineNumber] > 0) {
        covered = 'yes';
        value = lines[lineNumber] + '×';
      } else {
        covered = 'no';
      }
    }
    array.push('<span class="cline-any cline-' + covered + '">' + value + '</span>');
  }
  return array.join('\n');
});

function customEscape(text) {
  text = text.toString();
  return text.replace(RE_AMP, '&amp;')
    .replace(RE_LT, '&lt;')
    .replace(RE_GT, '&gt;')
    .replace(RE_lt, '<')
    .replace(RE_gt, '>');
}

handlebars.registerHelper('show_code', (context /* , opts */) => {
  const array = [];
  context.forEach(item => array.push(customEscape(item.text) || '&nbsp;'));
  return array.join('\n');
});

const title = str => {
  return ` title="${str}" `;
};

const annotateLines = (fileCoverage, structuredText) => {
  const lineStats = fileCoverage.l;
  if (!lineStats) {
    return;
  }
  Object.keys(lineStats).forEach(lineNumber => {
    const count = lineStats[lineNumber];
    if (structuredText[lineNumber]) {
      structuredText[lineNumber].covered = count > 0 ? 'yes' : 'no';
    }
  });
  structuredText.forEach(item => {
    if (item.covered === null) {
      item.covered = 'neutral';
    }
    if (!item.incremental) {
      const text = item.text;
      const openSpan = `${lt}span class="disabled"${gt}`;
      const closeSpan = `${lt}/span${gt}`;
      text.wrap(0, openSpan, text.originalLength(), closeSpan);
    }
  });
};

const annotateStatements = (fileCoverage, structuredText) => {
  const statementStats = fileCoverage.s;
  const statementMeta = fileCoverage.statementMap;
  Object.keys(statementStats).forEach(stName => {
    const count = statementStats[stName];
    const meta = statementMeta[stName];
    const type = count > 0 ? 'yes' : 'no';
    const startCol = meta.start.column;
    let endCol = meta.end.column + 1;
    const startLine = meta.start.line;
    let endLine = meta.end.line;
    const openSpan = `${lt}span class="${meta.skip ? 'cstat-skip' : 'cstat-no'}"${title('statement not covered')}${gt}`;
    const closeSpan = `${lt}/span${gt}`;

    if (type === 'no' && structuredText[startLine]) {
      if (endLine !== startLine) {
        endLine = startLine;
        endCol = structuredText[startLine].text.originalLength();
      }
      const text = structuredText[startLine].text;
      text.wrap(startCol, openSpan, startLine === endLine ? endCol : text.originalLength(), closeSpan);
    }
  });
};

const annotateFunctions = (fileCoverage, structuredText) => {
  const fnStats = fileCoverage.f;
  const fnMeta = fileCoverage.fnMap;
  if (!fnStats) {
    return;
  }
  Object.keys(fnStats).forEach(fName => {
    const count = fnStats[fName];
    const meta = fnMeta[fName];
    const type = count > 0 ? 'yes' : 'no';
    const startCol = meta.loc.start.column;
    let endCol = meta.loc.end.column + 1;
    const startLine = meta.loc.start.line;
    let endLine = meta.loc.end.line;
    const openSpan = lt + 'span class="' + (meta.skip ? 'fstat-skip' : 'fstat-no') + '"' + title('function not covered') + gt;
    const closeSpan = `${lt}/span${gt}`;

    if (type === 'no' && structuredText[startLine]) {
      if (endLine !== startLine) {
        endLine = startLine;
        endCol = structuredText[startLine].text.originalLength();
      }
      const text = structuredText[startLine].text;
      text.wrap(startCol, openSpan, startLine === endLine ? endCol : text.originalLength(), closeSpan);
    }
  });
};

function annotateBranches(fileCoverage, structuredText) {
  const branchStats = fileCoverage.b;
  const branchMeta = fileCoverage.branchMap;
  if (!branchStats) {
    return;
  }

  Object.keys(branchStats).forEach(branchName => {
    const branchArray = branchStats[branchName];
    const sumCount = branchArray.reduce((p, n) => {
      return p + n;
    }, 0);
    const metaArray = branchMeta[branchName].locations;

    if (sumCount > 0) { // only highlight if partial branches are missing
      for (let i = 0; i < branchArray.length; i += 1) {
        const count = branchArray[i];
        const meta = metaArray[i];
        const startCol = meta.start.column;
        let endCol = meta.end.column + 1;
        const startLine = meta.start.line;
        let endLine = meta.end.line;
        const openSpan = lt + 'span class="branch-' + i + ' ' + (meta.skip ? 'cbranch-skip' : 'cbranch-no') + '"' + title('branch not covered') + gt;
        const closeSpan = `${lt}/span${gt}`;

        if (count === 0 && structuredText[startLine]) { // skip branches taken
          if (endLine !== startLine) {
            endLine = startLine;
            endCol = structuredText[startLine].text.originalLength();
          }
          const text = structuredText[startLine].text;
          if (branchMeta[branchName].type === 'if') { // and 'if' is a special case since the else branch might not be visible, being non-existent
            text.insertAt(startCol, lt + 'span class="' + (meta.skip ? 'skip-if-branch' : 'missing-if-branch') + '"' +
              title((i === 0 ? 'if' : 'else') + ' path not taken') + gt +
              (i === 0 ? 'I' : 'E') + lt + '/span' + gt, true, false);
          } else {
            text.wrap(startCol, openSpan, startLine === endLine ? endCol : text.originalLength(), closeSpan);
          }
        }
      }
    }
  });
}

function getReportClass(stats, watermark) {
  const coveragePct = stats.pct,
    identity = 1;
  if (coveragePct * identity === coveragePct) {
    return coveragePct >= watermark[1] ? 'high' : coveragePct >= watermark[0] ? 'medium' : 'low';
  }
  return '';

}

function cleanPath(name) {
  const SEP = path.sep || '/';
  return (SEP !== '/') ? name.split(SEP).join('/') : name;
}

function isEmptySourceStore(sourceStore) {
  if (!sourceStore) {
    return true;
  }
  const cache = sourceStore.sourceCache;
  return cache && !Object.keys(cache).length;
}

/**
 * a `Report` implementation that produces HTML coverage reports.
 *
 * Usage
 * -----
 *
 *      var report = require('istanbul').Report.create('html');
 *
 *
 * @class HtmlReport
 * @augments Report
 * @module report
 * @class
 * @param {Object} opts optional
 * @param {String} [opts.dir] the directory in which to generate reports. Defaults to `./html-report`
 */
function HtmlReport(opts) {
  Report.call(this);
  this.opts = opts || {};
  this.opts.dir = this.opts.dir || path.resolve(process.cwd(), 'html-report');
  this.opts.sourceStore = isEmptySourceStore(this.opts.sourceStore) ?
    Store.create('fslookup') : this.opts.sourceStore;
  this.opts.linkMapper = this.opts.linkMapper || this.standardLinkMapper();
  this.opts.writer = this.opts.writer || null;
  this.opts.templateData = { datetime: Date() };
  this.opts.watermarks = this.opts.watermarks || defaults.watermarks();
}

HtmlReport.TYPE = 'html';
util.inherits(HtmlReport, Report);

Report.mix(HtmlReport, {

  synopsis: () => {
    return 'Navigable HTML coverage report for every file and directory';
  },

  getPathHtml(node, linkMapper) {
    let parent = node.parent;
    const nodePath = [];
    const linkPath = [];

    while (parent) {
      nodePath.push(parent);
      parent = parent.parent;
    }

    for (let i = 0; i < nodePath.length; i += 1) {
      linkPath.push('<a href="' + linkMapper.ancestor(node, i + 1) + '?t=' + timestamp + '">' +
        (cleanPath(nodePath[i].relativeName) || 'all files') + '</a>');
    }
    linkPath.reverse();
    return linkPath.length > 0 ? linkPath.join(' / ') + ' ' +
      cleanPath(node.displayShortName()) : '/';
  },

  fillTemplate(node, templateData, incrementTeeMap) {
    const opts = this.opts;
    const linkMapper = opts.linkMapper;

    templateData.entity = node.name || 'All files';
    templateData.metrics = node.metrics;
    templateData.reportClass = getReportClass(node.metrics.statements, opts.watermarks.statements);
    const incrementalNode = incrementTeeMap && incrementTeeMap[node.name];
    if (incrementalNode) {
      templateData.incrementMetrics = incrementalNode.metrics;
      templateData.incrementReportClass = getReportClass(incrementalNode.metrics.statements, opts.watermarks.statements);
    }
    templateData.pathHtml = this.getPathHtml(node, linkMapper);
    templateData.base = {
      css: assetsContentMap['base.css'],
    };
    templateData.sorter = {
      js: assetsContentMap['sorter.js'],
    };
    templateData.prettify = {
      js: assetsContentMap['vendor/prettify.js'],
      css: assetsContentMap['vendor/prettify.css'],
    };
  },

  writeDetailPage(writer, node, fileCoverage, incrementMap) {
    const opts = this.opts;
    const { incrementalMap } = this.writeOpts;
    const sourceStore = opts.sourceStore;
    const templateData = opts.templateData;
    const sourceText = fileCoverage.code && Array.isArray(fileCoverage.code)
      ? fileCoverage.code.join('\n') + '\n'
      : sourceStore.get(fileCoverage.path);
    const code = sourceText.split(/(?:\r?\n)|\r/);
    let count = 0;
    const structured = code.map(str => {
      count += 1;
      const incremental = getIcremental(incrementalMap, fileCoverage.path, count);
      return {
        line: count,
        covered: null,
        text: new InsertionText(str, true),
        incremental,
      };
    });

    structured.unshift({
      line: 0,
      covered: null,
      text: new InsertionText(''),
      incremental: false,
    });

    this.fillTemplate(node, templateData, incrementMap);
    writer.write(headerTemplate(templateData));
    writer.write('<pre><table class="coverage">\n');

    annotateLines(fileCoverage, structured);
    // note: order is important, since statements typically result in spanning the whole line and doing branches late
    // causes mismatched tags
    annotateBranches(fileCoverage, structured);
    annotateFunctions(fileCoverage, structured);
    annotateStatements(fileCoverage, structured);

    structured.shift();
    const context = {
      structured,
      maxLines: structured.length,
      fileCoverage,
    };
    writer.write(detailTemplate(context));
    writer.write('</table></pre>\n');
    writer.write(footerTemplate(templateData));
  },

  writeIndexPage(writer, node, incrementMap) {
    const linkMapper = this.opts.linkMapper;
    const templateData = this.opts.templateData;
    const children = Array.prototype.slice.apply(node.children);
    const watermarks = this.opts.watermarks;

    children.sort(function(a, b) {
      return a.name < b.name ? -1 : 1;
    });

    this.fillTemplate(node, templateData, incrementMap);
    writer.write(headerTemplate(templateData));
    writer.write(summaryTableHeader);
    children.forEach(function(child) {
      const metrics = child.metrics;
      const reportClasses = {
        statements: getReportClass(metrics.statements, watermarks.statements),
        lines: getReportClass(metrics.lines, watermarks.lines),
        functions: getReportClass(metrics.functions, watermarks.functions),
        branches: getReportClass(metrics.branches, watermarks.branches),
      };
      const data = {
        type: 'origin',
        metrics,
        reportClasses,
        file: cleanPath(child.displayShortName()),
        output: linkMapper.fromParent(child),
      };
      writer.write(summaryLineTemplate(data) + '\n');

      const incrementalNode = incrementMap && incrementMap[child.name];
      if (incrementalNode) {
        const incrementMetrics = incrementalNode.metrics;
        const reportIncrementalClasses = {
          statements: getReportClass(incrementMetrics.statements, watermarks.statements),
          lines: getReportClass(incrementMetrics.lines, watermarks.lines),
          functions: getReportClass(incrementMetrics.functions, watermarks.functions),
          branches: getReportClass(incrementMetrics.branches, watermarks.branches),
        };
        const incrementalData = {
          type: 'incremental',
          metrics: incrementMetrics,
          reportClasses: reportIncrementalClasses,
          file: cleanPath(child.displayShortName()),
          output: linkMapper.fromParent(child),
        };
        writer.write(summaryLineTemplate(incrementalData) + '\n');
      }

    });
    writer.write(summaryTableFooter);
    writer.write(footerTemplate(templateData));
  },

  writeFiles(writer, node, dir, collector, incrementMap = {}) {
    const indexFile = path.resolve(dir, 'index.html');

    if (this.opts.verbose) {
      console.error('Writing ' + indexFile);
    }

    writer.writeFile(indexFile, contentWriter => {
      this.writeIndexPage(contentWriter, node, incrementMap);
    });

    node.children.forEach(child => {
      if (child.kind === 'dir') {
        this.writeFiles(writer, child, path.resolve(dir, child.relativeName), collector, incrementMap);
      } else {
        const childFile = path.resolve(dir, child.relativeName + '.html');
        if (this.opts.verbose) {
          console.error('Writing ' + childFile);
        }
        writer.writeFile(childFile, contentWriter => {
          this.writeDetailPage(contentWriter, child, collector.fileCoverageFor(child.fullPath()), incrementMap);
        });
      }
    });
  },

  standardLinkMapper() {
    return {
      fromParent: node => {
        const relativeName = cleanPath(node.relativeName);
        return node.kind === 'dir' ? relativeName + 'index.html' : relativeName + '.html';
      },
      ancestorHref(node, num) {
        let href = '';
        for (let i = 0; i < num; i += 1) {
          const separated = cleanPath(node.relativeName).split('/').filter(part => part !== '.');
          const levels = separated.length - 1;
          for (let j = 0; j < levels; j += 1) {
            href += '../';
          }
          node = node.parent;
        }
        return href;
      },
      ancestor(node, num) {
        return this.ancestorHref(node, num) + 'index.html';
      },
      asset(node, name) {
        let i = 0;
        let parent = node.parent;
        while (parent) {
          i += 1;
          parent = parent.parent;
        }
        return this.ancestorHref(node, i) + name;
      },
    };
  },

  writeReport(collector, writeOpts = {}) {
    const opts = this.opts;
    const dir = opts.dir;
    const summarizer = new TreeSummarizer();
    const incrementalSummarizer = new TreeSummarizer();
    const writer = opts.writer || new FileWriter(writeOpts.sync);
    this.writeOpts = writeOpts;

    collector.files().forEach(key => {
      const fileCoverage = collector.fileCoverageFor(key);
      summarizer.addFileCoverageSummary(key, utils.summarizeFileCoverage(fileCoverage));
      const { incrementalMap } = this.writeOpts;
      const incrementalFileCoverage = incrementalMap
        && incrementalMap[key]
        && incrementFileCoverageFor(fileCoverage, incrementalMap[key]);
      if (incrementalFileCoverage) {
        incrementalSummarizer.addFileCoverageSummary(key, utils.summarizeFileCoverage(incrementalFileCoverage));
      }
      summarizer.addFileCoverageSummary(key, utils.summarizeFileCoverage(collector.fileCoverageFor(key)));
    });

    const tree = summarizer.getTreeSummary();
    const incrementalTree = incrementalSummarizer.getTreeSummary(tree.prefix);

    writer.on('done', () => {
      this.emit('done');
    });
    if (opts.verbose) {
      console.log(JSON.stringify(tree.root, null, 2));
    }
    this.writeFiles(writer, tree.root, dir, collector, incrementalTree.map);
    writer.done();
  },
});

module.exports = HtmlReport;
