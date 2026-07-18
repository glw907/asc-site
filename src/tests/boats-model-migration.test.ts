// asc-club migration 0028 (docs/plans/2026-07-17-member-directory.md's T1, reshaped) is pure
// DDL with no application code of its own, and the repo's `fakeD1` double (`_fake-d1.ts`) never
// executes real SQL, so it cannot enforce a CHECK or a default the way a real SQLite engine
// would. This suite asserts what a fakeD1-shaped test CAN: that the migration text declares the
// reshaped boats constraints, so an edit that silently drops the model CHECK or the kept_on
// default fails immediately. Actual runtime enforcement (a NULL or empty model really rejected,
// the trailer default really applied) is proven separately against a real, local D1 replica in
// the migration's own scratch-prove transcript (see the task report and
// `migrations/asc-club/0028_boats_model/README.md`). The 0027 suite still guards 0027's frozen
// text (which keeps the old class picker); this suite guards the new single-model shape.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');
const migrationDir = path.join(repoRoot, 'migrations/asc-club/0028_boats_model');
const forward = readFileSync(path.join(migrationDir, 'forward.sql'), 'utf-8');
const rollback = readFileSync(path.join(migrationDir, 'rollback.sql'), 'utf-8');

const boatsCreate = (sql: string) => {
  const start = sql.indexOf('CREATE TABLE boats (');
  const end = sql.indexOf(');', start);
  return start >= 0 ? sql.slice(start, end) : '';
};

describe('0028_boats_model forward.sql', () => {
  it('recreates boats after dropping it (empty table, clean reshape)', () => {
    const dropIndex = forward.indexOf('DROP TABLE boats');
    const createIndex = forward.indexOf('CREATE TABLE boats (');
    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(dropIndex);
  });

  it('declares a single required model with a non-empty CHECK', () => {
    expect(forward).toMatch(/model TEXT NOT NULL CHECK \(model <> ''\)/);
  });

  it('drops the old class picker: the boats table no longer declares a class column', () => {
    expect(boatsCreate(forward)).not.toMatch(/class TEXT/);
  });

  it('keeps name nullable for legacy seed rows', () => {
    expect(boatsCreate(forward)).toMatch(/name TEXT,/);
  });

  it('keeps the kept_on CHECK and its trailer default', () => {
    expect(forward).toMatch(
      /kept_on TEXT NOT NULL DEFAULT 'trailer' CHECK \(kept_on IN \('trailer','mooring'\)\)/,
    );
  });

  it('keeps boats.member_id as a NOT NULL FK to members, owner not household', () => {
    expect(boatsCreate(forward)).toMatch(/member_id TEXT NOT NULL REFERENCES members\(id\)/);
    expect(boatsCreate(forward)).not.toContain('household_id');
  });

  it('recreates the member index', () => {
    expect(forward).toContain('CREATE INDEX idx_boats_member ON boats(member_id)');
  });
});

describe('0028_boats_model rollback.sql', () => {
  it('restores the 0027 class picker and the model-iff-Other CHECK', () => {
    expect(rollback).toMatch(/class TEXT NOT NULL CHECK \(class IN \('Buccaneer 18','Laser','Other'\)\)/);
    expect(rollback).toContain("(class = 'Other' AND model IS NOT NULL) OR");
    expect(rollback).toContain("(class <> 'Other' AND model IS NULL)");
  });

  it('recreates boats after dropping it', () => {
    const dropIndex = rollback.indexOf('DROP TABLE boats');
    const createIndex = rollback.indexOf('CREATE TABLE boats (');
    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(dropIndex);
  });
});
