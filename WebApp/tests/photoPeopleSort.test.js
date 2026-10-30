import test from 'node:test';
import assert from 'node:assert/strict';
import { photoPeopleScrollLabel, sortPhotoPeople } from '../src/photoPeopleSort.js';

const today = new Date(2026, 9, 30, 12);
const people = [
  { id: 'z', name: 'Zoe', birthDate: '1990-01-01', photoIds: ['a', 'b'] },
  { id: 'a', name: 'Álex', birthDate: '1990-10-30', photoIds: ['a', 'a', 'b'] },
  { id: 'l', name: 'Luis', birthDate: '1990-10-31', photoIds: ['a'] },
  { id: 'baby', name: 'Bebé', birthDate: '2026-10-30', photoIds: [] },
  { id: 'missing', name: 'Ana', photoIds: [] },
  { id: 'invalid', name: 'Bruno', birthDate: '2027-01-01', photoIds: ['a', 'b', 'c'] },
];
const order = (field, direction) => sortPhotoPeople(people, field, direction, 'es', today).map(person => person.name);

test('age sorts by completed years, keeps missing ages last in both directions, and breaks ties by name', () => {
  assert.deepEqual(order('age', 'asc'), ['Bebé', 'Luis', 'Álex', 'Zoe', 'Ana', 'Bruno']);
  assert.deepEqual(order('age', 'desc'), ['Álex', 'Zoe', 'Luis', 'Bebé', 'Ana', 'Bruno']);
});

test('photo counts include each photo once and break count ties alphabetically', () => {
  assert.deepEqual(order('photoCount', 'asc'), ['Ana', 'Bebé', 'Luis', 'Álex', 'Zoe', 'Bruno']);
  assert.deepEqual(order('photoCount', 'desc'), ['Bruno', 'Álex', 'Zoe', 'Luis', 'Ana', 'Bebé']);
  assert.deepEqual(order('name', 'asc'), ['Álex', 'Ana', 'Bebé', 'Bruno', 'Luis', 'Zoe']);
  assert.deepEqual(order('name', 'desc'), ['Zoe', 'Luis', 'Bruno', 'Bebé', 'Ana', 'Álex']);
});

test('duplicate names retain the most populated person first without mutating the library', () => {
  const input = [{ id: '1', name: 'Ana', photoIds: [] }, { id: '2', name: 'Ana', photoIds: ['a'] }];
  for (const direction of ['asc', 'desc']) assert.deepEqual(sortPhotoPeople(input, 'name', direction).map(person => person.id), ['2', '1']);
  assert.deepEqual(input.map(person => person.id), ['1', '2']);
});

test('slider labels match initials, photo counts and displayed ages, including zero and unknown', () => {
  assert.equal(photoPeopleScrollLabel(people[1]), 'A');
  assert.equal(photoPeopleScrollLabel(people[1], 'photoCount'), '2');
  assert.equal(photoPeopleScrollLabel(people[1], 'age', 'es', today), '36');
  assert.equal(photoPeopleScrollLabel(people[3], 'age', 'es', today), '0');
  assert.equal(photoPeopleScrollLabel(people[4], 'age', 'es', today), '—');
});
