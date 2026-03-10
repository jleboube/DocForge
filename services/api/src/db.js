const { MongoClient, ObjectId } = require("mongodb");

const uri = process.env.MONGO_URI || "mongodb://mongodb:27017/docforge";
const dbName = (uri.split("/").pop() || "docforge").split("?")[0];

let client;
let database;

async function getDb() {
  if (database) {
    return database;
  }

  client = new MongoClient(uri);
  await client.connect();
  database = client.db(dbName);
  return database;
}

function toObjectId(id) {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  return new ObjectId(id);
}

module.exports = { getDb, toObjectId };
