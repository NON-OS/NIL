// Calls going on belong to this server only while they go on: a backup, an encrypted capsule or
// a restored workspace never carries one, nor who was in it. Who blocked whom is a person's own
// choice and stays.
const TABLES = ['call_events', 'call_instances', 'call_people', 'calls'];

export default function dropCallRows(database, schema = 'main') {
  for (const table of TABLES) database.exec(`DELETE FROM ${schema}.${table}`);
}
