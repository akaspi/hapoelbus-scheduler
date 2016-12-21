const config = require('../../config');
const firebaseAdmin = require("firebase-admin");

const initialize = (config) => {
    firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(config.credential),
        databaseURL: config.databaseURL
    });
};

const read = path => firebaseAdmin.database().ref(path).once('value').then(snapshot => snapshot.val());

const setIn = (path, data) => firebaseAdmin.database().ref(path).set(data);

const remove = path => firebaseAdmin.database().ref(path).remove();

module.exports = { initialize, read, setIn, remove };