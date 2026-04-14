const admin = require('firebase-admin');

let db;

function getFirestore() {
  if (!db) {
    db = admin.firestore();
  }
  return db;
}

module.exports = { admin, getFirestore };
