// Admin tým (V4.4.6): kdo smí měnit koho, popisky deníku správců.
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { userPermissions } = await import(web("admin.js"));
const { actionLabel, detailsSummary } = await import(web("admin-log.js"));

test("správce bez vlastnictví – běžné uživatele ano, jiné správce a roli ne", () => {
    const me = { selfId: "me", isOwner: false };
    assert.deepEqual(userPermissions({ id: "u", is_admin: false }, me), { manage: true, role: false });
    assert.deepEqual(userPermissions({ id: "a", is_admin: true }, me), { manage: false, role: false });
    assert.deepEqual(userPermissions({ id: "me", is_admin: true }, me), { manage: false, role: false });
});

test("vlastník – spravuje i správce a mění roli, sebe ani jiného vlastníka ne", () => {
    const owner = { selfId: "me", isOwner: true };
    assert.deepEqual(userPermissions({ id: "u", is_admin: false }, owner), { manage: true, role: true });
    assert.deepEqual(userPermissions({ id: "a", is_admin: true }, owner), { manage: true, role: true });
    assert.deepEqual(userPermissions({ id: "me", is_admin: true, is_owner: true }, owner), { manage: false, role: false });
    assert.deepEqual(userPermissions({ id: "o", is_admin: true, is_owner: true }, owner), { manage: false, role: false });
});

test("deník správců – popisek akce a shrnutí podrobností", () => {
    assert.equal(actionLabel("grant-admin"), "made admin");
    assert.equal(actionLabel("save-collection"), "edited collection");
    assert.equal(actionLabel("something-new"), "something-new");
    assert.equal(detailsSummary({ added: ["A", "B"], removed: [], name: "X", hidden: true, skip: false }), "added: A, B · name: X · hidden");
    assert.equal(detailsSummary({ films: ["1", "2", "3", "4", "5", "6", "7"] }), "films: 1, 2, 3, 4, 5 +2");
    assert.equal(detailsSummary(null), "");
});
