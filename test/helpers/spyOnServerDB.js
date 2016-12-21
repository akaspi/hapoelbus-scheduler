const _ = require('lodash');
const serverDB = require('../../src/utils/serverDB');

beforeEach(() => {
  _.forOwn(serverDB, (v, key) => {
    spyOn(serverDB, key);
  });
});