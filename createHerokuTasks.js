const _ = require('lodash');
const fs = require('fs');
const mkdirp = require('mkdirp');

const createSchedulerTaskTemplate = () => {
  const templateArr = [];
  templateArr.push('#!/usr/bin/env node');
  templateArr.push('const task = require(\'<%= fileName %>\');');
  templateArr.push('task.exec().then(() => process.exit());');
  return _.template(templateArr.join('\n'));
};

const removeFileExtension = fileName => fileName.replace(/\.[^/.]+$/, '');

const taskTemplate = createSchedulerTaskTemplate();
const fileNames = fs.readdirSync(__dirname + '/src/tasks');
const dist = 'app/';

mkdirp.sync(dist);

try {
  _.forEach(fileNames, fileName => {
    fs.writeFileSync(
      dist + removeFileExtension(fileName),
      taskTemplate({ fileName: '../src/tasks/' + fileName }),
      'utf-8'
    );
  });
} catch (e) {
  console.log('failed to create tasks', e.message);
  process.exit();
}


console.log(fileNames.length + ' scheduler tasks files were created successfully');