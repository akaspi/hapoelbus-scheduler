const config = require('../../config');
const firebaseAdmin = require("firebase-admin");

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(config.firebase.credential),
    databaseURL: config.firebase.databaseURL
});

const read = path => firebaseAdmin.database().ref(path).once('value').then(snapshot => snapshot.val());

const remove = path => firebaseAdmin.database().ref(path).remove();

module.exports = { read, remove };