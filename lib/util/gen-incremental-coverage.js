'use strict';

const _ = require('lodash');

const getDiffCoverageState = (code, diff) => {
  const [ codeStart, codeEnd ] = code;
  const [ diffStart, diffEnd ] = diff;
  if (codeStart > diffEnd || codeEnd < diffStart) {
    return null;
  }
  if (codeStart < diffStart && codeEnd > diffEnd) {
    return 'delete';
  }
  if (codeStart >= diffStart || codeEnd <= diffEnd) {
    return 'remain';
  }
};

const cleanS = (statementData, incrementalData) => {
  const { statementMap, s } = statementData;
  const newStatementMap = {};
  const newS = {};
  if (!statementMap || !s) {
    return {};
  }
  _.forEach(statementMap, (value, key) => {
    const fnStart = _.get(value, 'start.line');
    const fnEnd = _.get(value, 'end.line');
    let result = null;
    for (let i = 0; i < incrementalData.length; i++) {
      result = getDiffCoverageState([ fnStart, fnEnd ], incrementalData[i]);
      if (result === 'remain') {
        newStatementMap[key] = statementMap[key];
        newS[key] = s[key];
        break;
      }

    }
  });
  return { statementMap: newStatementMap, s: newS };
};

const cleanB = (branchData, incrementalData) => {
  const { branchMap, b } = branchData;
  if (!branchData || !b) {
    return {};
  }
  const newBranchMap = {};
  const newB = {};
  _.forEach(branchMap, (value, key) => {
    const fnStart = _.get(value, 'loc.start.line');
    const fnEnd = _.get(value, 'loc.end.line');
    let result = null;
    for (let i = 0; i < incrementalData.length; i++) {
      result = getDiffCoverageState([ fnStart, fnEnd ], incrementalData[i]);
      if (result === 'delete') {
        break;
      }
      if (result === 'remain') {
        newBranchMap[key] = branchMap[key];
        newB[key] = b[key];
        break;
      }
    }
  });
  return { branchMap: newBranchMap, b: newB };
};

const cleanF = (fnData, incrementalData) => {
  const { fnMap, f } = fnData;
  if (!fnMap || !f) {
    return {};
  }
  const newFnMap = {};
  const newF = {};
  _.forEach(fnMap, (value, key) => {
    const fnStart = _.get(value, 'loc.start.line');
    const fnEnd = _.get(value, 'loc.end.line');
    let result = null;
    for (let i = 0; i < incrementalData.length; i++) {
      result = getDiffCoverageState([ fnStart, fnEnd ], incrementalData[i]);
      if (result === 'delete') {
        break;
      }
      if (result === 'remain') {
        newFnMap[key] = fnMap[key];
        newF[key] = f[key];
        break;
      }

    }
  });
  return { fnMap: newFnMap, f: newF };
};

function genIncrementalFileCoverage(fileCoverage, incrementalData) {
  if (!incrementalData) {
    return;
  }
  return {
    ...fileCoverage,
    ...cleanS(fileCoverage, incrementalData),
    ...cleanF(fileCoverage, incrementalData),
    ...cleanB(fileCoverage, incrementalData),
  };

}

module.exports = genIncrementalFileCoverage;
