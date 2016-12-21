const _ = require('lodash');
const config = require('../../config');
const sendGrid = require('sendgrid')(config.sendGrid.apiToken);
const serverDB = require('../utils/serverDB');
const Promise = require('bluebird');

const PENDING_TEMPLATE_EMAILS_PATH = 'pendingEmails/templates';
const PENDING_CUSTOM_EMAILS_PATH = 'pendingEmails/custom';

const isEmailValid = emailAddress => {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(emailAddress);
};

const getValidRecipients = recipients => _(recipients)
    .compact()
    .filter(isEmailValid)
    .value();

const send = request => new Promise((resolve, reject) => {
    sendGrid.API(request, (error, response) => { // eslint-disable-line new-cap
        if (error || response.statusCode !== 202) {
            return reject();
        }
        return resolve();
    });
});

const createCustomPersonalizations = (recipients, subject) => {
    const validRecipients = getValidRecipients(recipients);
    return _.map(validRecipients, email => ({
        to: [{ email }],
        subject
    }))
};

const createTemplatePersonalizations = (recipients, substitutions) => {
    const validRecipients = getValidRecipients(recipients);
    return _.map(validRecipients, email => ({
        to: [{ email }],
        substitutions
    }))
};

const sendCustomEmail = (recipients, subject, content) => {
    const request = sendGrid.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: {
            personalizations: createCustomPersonalizations(recipients, subject),
            from: {
                email: config.sendGrid.fromAddress
            },
            content: [
                {
                    type: 'text/html',
                    value: content
                }
            ]
        }
    });

    return send(request);
};

const sendTemplate = (recipients, templateId, substitutions) => {
    const request = sendGrid.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: {
            personalizations: createTemplatePersonalizations(recipients, substitutions || {}),
            from: {
                email: config.sendGrid.fromAddress
            },
            template_id: templateId
        }
    });

    return send(request);
};

const exec = () => {
    const readPromises = [serverDB.read(PENDING_TEMPLATE_EMAILS_PATH), serverDB.read(PENDING_CUSTOM_EMAILS_PATH)];
    return Promise.all(readPromises)
        .spread((pendingTemplates, pendingCustom) => {
            const templatePromises = _.map(pendingTemplates, (mailData, mailId) =>
                sendTemplate(mailData.recipients, mailData.templateId, mailData.substitutions)
                    .then(() => serverDB.remove(PENDING_TEMPLATE_EMAILS_PATH + '/' + mailId))
            );

            const customMailsPromises = _.map(pendingCustom, (mailData, mailId) =>
                sendCustomEmail(mailData.recipients, mailData.subject, mailData.content)
                    .then(() => serverDB.remove(PENDING_CUSTOM_EMAILS_PATH + '/' + mailId))
            );
            return Promise.all(templatePromises.concat(customMailsPromises));
        })
        .then(results => {
            if (results.length) {
                console.log(results.length + ' emails were sent successfully!');
            } else {
                console.log('No pending emails were found...');
            }
        })
        .catch(e => console.log('Failed to send pending emails!', e));
};

module.exports = { exec };