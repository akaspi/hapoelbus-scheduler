const _ = require('lodash');
const config = require('../../config');
const Twilio = require('twilio')(config.twilio.account, config.twilio.token);
const serverDB = require('../utils/serverDB');
const Promise = require('bluebird');

const PENDING_SMS_PATH = 'pendingSMS';

const localizePhoneNumber = number => ('+972' + number.substr(1));
const fromLocalizePhoneNumber = number => number.replace('+972', '0');

const sendMessage = (to, message) => new Promise((resolve, reject) => {
  Twilio.messages.create({
    from: 'HapoelBus',
    to: localizePhoneNumber(to),
    body: message
  }, (err, data) => {
    if (err) {
      reject(to);
    } else {
      resolve(data.sid);
    }
  });
});

const sendPendingSMS = (smsDef, smsId) =>
  Promise.map(smsDef.to, number => sendMessage(number, smsDef.message).reflect())
    .then(inspections => {
      const failedInspections = _.reject(inspections, inspection => inspection.isFulfilled());
      if (failedInspections.length === 0) {
        return serverDB.remove(`${PENDING_SMS_PATH}/${smsId}`);
      }
      const failedNumbers = _.map(failedInspections, inspection => fromLocalizePhoneNumber(inspection.reason()));
      if (failedNumbers.length < inspections.length) {
        return serverDB.setIn(`${PENDING_SMS_PATH}/${smsId}/to`, failedNumbers);
      }
      return [];
    });

const exec = () =>
  serverDB.read(PENDING_SMS_PATH)
    .then(pendingSMS => Promise.all(_.map(pendingSMS, (smsDef, smsId) => sendPendingSMS(smsDef, smsId))));

module.exports = { exec };