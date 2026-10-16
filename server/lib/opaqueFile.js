// The name and type the server keeps for a file it can't read. They say nothing about it, so
// the database, the logs and the download headers can't either.
const opaqueFile = Object.freeze({ filename: 'encrypted', mime: 'application/octet-stream' });

export default opaqueFile;
