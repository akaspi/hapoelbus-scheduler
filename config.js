const path = require('path');
require('dotenv').config({ silent: true, path: path.join(__dirname, '.env')});

const config = {
    firebase: {
        credential: {
            projectId: process.env.fb_projectId,
            clientEmail: process.env.fb_clientEmail,
            privateKey: process.env.fb_privateKey && process.env.fb_privateKey.replace(/@@@/g, '\n')
        },
        databaseURL: process.env.fb_databaseURL
    },
    sendGrid: {
        apiToken: process.env.sg_apiToken,
        fromAddress: process.env.sg_fromAddress
    },
    twilio: {
        account: process.env.twilio_account,
        token: process.env.twilio_token
    }
};

module.exports = config;