// A published key with the wallet signature behind it. Browsers rebuild the signed statement
// from these fields and check it themselves instead of taking the server's word for it.
export default function toEncryptionKey(row) {
  return {
    userId: row.user_id,
    publicKey: row.public_key,
    signingKey: row.signing_key,
    createdAt: row.created_at,
    address: row.address,
    signature: row.signature,
    // deactivated people can still be checked as authors, but nobody shares with them
    active: !row.deactivated,
  };
}
