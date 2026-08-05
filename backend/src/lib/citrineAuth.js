// Real wallbox firmware follows the OCPP spec strictly: if StartTransaction's
// response carries idTagInfo.status != "Accepted", the charger stops the
// session it just started, immediately (confirmed against a real device's
// firmware log - it auto-stopped ~1s after starting because CitrineOS
// returned "Invalid" for an idTag nobody had registered). Our own test
// simulators never enforced that, so this was invisible until real hardware
// hit it. CitrineOS looks up the token in its own "Authorizations" table -
// this upserts an Accepted row there before every remote start, for
// whichever idTag we're about to use.
async function ensureAuthorized(pool, idToken) {
  await pool.query(
    `INSERT INTO "Authorizations" ("idToken", "idTokenType", status, "tenantId", "createdAt", "updatedAt")
     VALUES ($1, 'ISO14443', 'Accepted', 1, NOW(), NOW())
     ON CONFLICT ("idToken", "idTokenType") DO UPDATE SET status = 'Accepted', "updatedAt" = NOW()`,
    [idToken],
  );
}

module.exports = { ensureAuthorized };
