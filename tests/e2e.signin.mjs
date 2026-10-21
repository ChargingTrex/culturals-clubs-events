/**
 * End to end: signing in.
 *
 * Mirrors the backend's LoginView tests. The codes matter more than the messages —
 * a client branches on the code, and keeping these identical is what makes the
 * eventual switch to portal SSO a configuration change rather than a rewrite.
 */
import { describe, test, beforeEach, expect, refuses, world } from "./harness.mjs";
import { DEMO_ACCOUNTS, DEMO_MFA_CODE, signIn, signOut, currentSession,
         demoAccountList } from "../src/credentials.js";
import { db } from "../src/db.js";

const account = persona => DEMO_ACCOUNTS.find(a => a.persona === persona);

describe("Signing in with demo credentials", () => {
  beforeEach(async () => { await world(); signOut(); });

  test("a student signs in with just an email and password", async () => {
    const a = account("student");
    const session = await signIn({ email: a.email, password: a.password });
    expect(session.personaKey).toBe("student");
    expect(session.mfa).toBeFalsy();
  });

  test("the email is case- and space-insensitive", async () => {
    const a = account("treasurer");
    const session = await signIn({
      email: `  ${a.email.toUpperCase()}  `, password: a.password,
    });
    expect(session.personaKey).toBe("treasurer");
  });

  test("a wrong password is refused", async () => {
    const a = account("president");
    await refuses(() => signIn({ email: a.email, password: "nope" }),
      { code: "AUTH_INVALID_CREDENTIALS", status: 401 });
  });

  test("an unknown address is refused identically", async () => {
    // Telling the two apart would confirm which addresses exist.
    const unknown = await refuses(
      () => signIn({ email: "nobody@demo.college.edu", password: "nope" }),
      { code: "AUTH_INVALID_CREDENTIALS" });
    const wrong = await refuses(
      () => signIn({ email: account("president").email, password: "nope" }),
      { code: "AUTH_INVALID_CREDENTIALS" });
    expect(unknown.detail).toBe(wrong.detail);
    expect(unknown.status).toBe(wrong.status);
  });

  test("an empty password is refused rather than treated as a match", async () => {
    await refuses(() => signIn({ email: account("student").email, password: "" }),
      { code: "AUTH_INVALID_CREDENTIALS" });
  });

  test("a suspended account cannot sign in but keeps its records", async () => {
    const a = account("member");
    const user = db().users.find(u => u.loginEmail === a.email);
    const student = db().students.find(s => s.userId === user.id);
    const before = db().registrations.filter(r => r.studentId === student.id).length;
    user.status = "suspended";
    await refuses(() => signIn({ email: a.email, password: a.password }),
      { code: "AUTH_ACCOUNT_NOT_ACTIVE", status: 403 });
    expect(db().registrations.filter(r => r.studentId === student.id).length)
      .toBe(before);
  });
});

describe("The second factor is mandatory for staff", () => {
  beforeEach(async () => { await world(); signOut(); });

  for (const persona of ["dean", "vc", "society"]) {
    test(`${persona} cannot sign in without a code`, async () => {
      const a = account(persona);
      const err = await refuses(() => signIn({ email: a.email, password: a.password }),
        { code: "AUTH_MFA_REQUIRED", status: 401 });
      // The field is named, so the form can reveal exactly one input.
      expect(err.errors[0].field).toBe("mfaCode");
    });

    test(`${persona} signs in with the code, and the claim records it`, async () => {
      const a = account(persona);
      const session = await signIn({
        email: a.email, password: a.password, mfaCode: DEMO_MFA_CODE,
      });
      expect(session.personaKey).toBe(persona);
      // A sensitive action can demand a verified session independently of role.
      expect(session.mfa).toBeTruthy();
    });
  }

  test("a club role needs no code at all", async () => {
    const a = account("organiser");
    const session = await signIn({ email: a.email, password: a.password });
    expect(session.personaKey).toBe("organiser");
  });

  test("whitespace is not a second factor", async () => {
    const a = account("dean");
    await refuses(() => signIn({ email: a.email, password: a.password, mfaCode: "   " }),
      { code: "AUTH_MFA_REQUIRED" });
  });
});

describe("Sessions", () => {
  beforeEach(async () => { await world(); signOut(); });

  test("nobody is signed in to begin with", () => {
    expect(currentSession()).toBeNull();
  });

  test("a session survives a page load and carries the right claims", async () => {
    const a = account("treasurer");
    const signedIn = await signIn({ email: a.email, password: a.password });
    const restored = currentSession();
    expect(restored.sub).toBe(signedIn.sub);
    expect(restored.prn).toBe(signedIn.prn);
    expect(restored.roles).toEqual(signedIn.roles);
    expect(restored.capabilities().clubsCanPropose)
      .toEqual(signedIn.capabilities().clubsCanPropose);
  });

  test("signing out ends it", async () => {
    const a = account("dean");
    await signIn({ email: a.email, password: a.password, mfaCode: DEMO_MFA_CODE });
    expect(currentSession()).toBeTruthy();
    signOut();
    expect(currentSession()).toBeNull();
  });

  test("each account resolves to the role it claims to be", async () => {
    const expected = {
      student: { isStudent: true, clubs: 0 },
      member: { isStudent: true, clubs: 1 },
      treasurer: { budget: 1 },
      president: { assign: 1 },
      society: { stages: ["cultural_society"] },
      dean: { stages: ["dean"] },
      vc: { stages: ["vc"] },
    };
    for (const [persona, want] of Object.entries(expected)) {
      const a = account(persona);
      const session = await signIn({
        email: a.email, password: a.password, mfaCode: DEMO_MFA_CODE,
      });
      const caps = session.capabilities();
      if (want.isStudent !== undefined) expect(caps.isStudent).toBe(want.isStudent);
      if (want.clubs !== undefined) expect(caps.clubs.length).toBe(want.clubs);
      if (want.budget !== undefined) {
        expect(caps.clubsWithBudgetAccess.length).toBe(want.budget);
      }
      if (want.assign !== undefined) {
        expect(caps.clubsCanAssignRoles.length).toBe(want.assign);
      }
      if (want.stages !== undefined) expect(caps.approvalStages).toEqual(want.stages);
      signOut();
    }
  });

  test("no plaintext password is stored in the state document", async () => {
    const serialised = JSON.stringify(db());
    for (const a of DEMO_ACCOUNTS) {
      expect(serialised).notToContain(a.password);
    }
  });

  test("every documented account is installed on a real user", () => {
    const listed = demoAccountList();
    expect(listed).toHaveLength(DEMO_ACCOUNTS.length);
    for (const a of listed) {
      expect(a.available).toBeTruthy();
      expect(a.name).toBeTruthy();
    }
  });
});
