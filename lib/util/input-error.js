/*
 Copyright (c) 2012, Yahoo! Inc.  All rights reserved.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
'use strict';

module.exports.create = (message) => {
  const err = new Error(message);
  err.inputError = true;
  return err;
};
